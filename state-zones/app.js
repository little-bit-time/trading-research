'use strict';
const $=id=>document.getElementById(id),KEY='state-zones-review-v1';
let catalog,ci=null,data=null,zones=[],visibleZones=[],selected=null,chart=null,bars=[],priceSeries,volumeSeries,request=0;
let notes={};try{notes=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{notes={}}
const fmt=(x,n=2)=>x==null||!Number.isFinite(x)?'—':x.toLocaleString('ru-RU',{maximumFractionDigits:n});
const utc=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
const time=i=>catalog.first+i*60;
const modeName=k=>k==='fast'?'Быстрая':'Длительная';
const statusName=k=>({quiet:'Затихла',gap:'Дыра в данных',open:'Открыта на конце данных'}[k]);
const verdictName=k=>({yes:'Это то',no:'Не то',unsure:'Сомневаюсь'}[k]||'Без оценки');
const matches=z=>$('mode').value==='both'||z.profile===$('mode').value;
const fail=e=>{$('error').textContent=String(e);console.error(e)};
async function gz(url,binary=false){const r=await fetch(url);if(!r.ok)throw Error(url+': HTTP '+r.status);const body=new Response(r.body.pipeThrough(new DecompressionStream('gzip')));return binary?new Float32Array(await body.arrayBuffer()):body.json()}
function reviewed(coin,mode){return Object.values(notes).filter(n=>n.ci===coin&&(mode==='both'||n.profile===mode)&&n.verdict).length}
function drawCoins(){
 const mode=$('mode').value,q=$('search').value.trim().toUpperCase();
 let rows=catalog.items.map(c=>({...c,count:mode==='both'?c.counts.fast+c.counts.long:c.counts[mode]}));
 rows=rows.filter(c=>c.coin.toUpperCase().includes(q)&&($('coinFilter').value==='any'||c.count>0)&&($('coinFilter').value!=='unreviewed'||reviewed(c.ci,mode)<c.count));
 rows.sort((a,b)=>$('coinSort').value==='count'?b.count-a.count||a.coin.localeCompare(b.coin):a.coin.localeCompare(b.coin));
 $('coinRows').replaceChildren(...rows.map(c=>{const tr=document.createElement('tr');tr.className='pick'+(c.ci===ci?' selected':'');tr.innerHTML=`<td></td><td>${c.counts.fast}</td><td>${c.counts.long}</td><td>${reviewed(c.ci,mode)}</td><td>${c.statuses.gap} / ${c.statuses.open}</td>`;tr.children[0].textContent=c.coin;tr.onclick=()=>loadCoin(c.ci);return tr}));
}
function drawZones(){
 const filter=$('verdictFilter').value;
 visibleZones=zones.filter(z=>matches(z)&&(filter==='all'||(filter==='unreviewed'?!notes[z.id]?.verdict:notes[z.id]?.verdict===filter)));
 const future=$('outcomes').checked;
 $('zoneHead').innerHTML='<tr><th>Начало · UTC</th><th>Масштаб</th><th>Длительность</th><th>Состояние</th><th>Оценка</th>'+(future?'<th>Close +24ч</th><th>High +7д</th>':'')+'</tr>';
 $('zoneRows').replaceChildren(...visibleZones.map(z=>{const tr=document.createElement('tr');tr.className='pick'+(selected?.id===z.id?' selected':'');tr.innerHTML=`<td>${utc(time(z.start))}</td><td>${modeName(z.profile)}</td><td>${duration(z.duration)}</td><td>${statusName(z.status)}</td><td>${verdictName(notes[z.id]?.verdict)}</td>${future?`<td>${fmt(z.outcomes['24h']?.[0])}%</td><td>${fmt(z.outcomes['7d']?.[1])}%</td>`:''}`;tr.onclick=()=>choose(z);return tr}));
 $('zoneCount').textContent=`Показано ${visibleZones.length} из ${zones.length} зон монеты. Порядок хронологический; длительность и завершение известны позднее старта. Быстрые и длительные могут пересекаться.`;
 $('prevZone').disabled=!visibleZones.length;$('nextZone').disabled=!visibleZones.length;
}
function duration(n){return n>=1440?fmt(n/1440,1)+' сут':n>=60?fmt(n/60,1)+' ч':n+' мин'}
async function loadCoin(next,wanted=null){
 const token=++request;$('error').textContent='';$('coinTitle').textContent=catalog.coins[next]+' · загрузка…';
 try{const result=await Promise.all([gz('coins/'+next+'.json.gz'),gz('../minute-replay/coins/'+next+'.f32.gz',true)]);if(token!==request)return;
 [zones,data]=result;ci=next;selected=null;$('coinTitle').textContent=catalog.coins[ci]+' · найденные зоны';
 const c=catalog.items[ci];$('coinFacts').textContent=`Быстрых: ${c.counts.fast}; длительных: ${c.counts.long}. Полные пригодные свечи: ${fmt(c.coverage.fast.eligible,0)} минут / ${fmt(c.coverage.long.eligible,0)} пятиминуток после прогрева.`;
 drawCoins();drawZones();const z=zones.find(z=>z.id===wanted)||visibleZones[0];if(z)choose(z);else{selected=null;$('chartTitle').textContent=catalog.coins[ci]+' · зон по выбранному фильтру нет';drawChart();drawReview()}
 }catch(e){fail(e)}
}
function choose(z){selected=z;history.replaceState(null,'','#coin='+ci+'&zone='+encodeURIComponent(z.id));drawZones();drawReview();drawChart()}
function moveZone(delta){if(!visibleZones.length)return;const at=visibleZones.findIndex(z=>z.id===selected?.id);choose(visibleZones[(at+delta+visibleZones.length)%visibleZones.length])}
function drawReview(){
 $('reviewLabel').textContent=selected?catalog.coins[ci]+' · '+modeName(selected.profile)+' · '+utc(time(selected.start))+' UTC':'Нет выбранной зоны';
 $('note').value=selected?notes[selected.id]?.note||'':'';$('note').disabled=!selected;
 document.querySelectorAll('[data-verdict]').forEach(b=>b.disabled=!selected);
}
function saveReview(verdict){if(!selected)return;const prior=notes[selected.id]||{};notes[selected.id]={ci,coin:catalog.coins[ci],profile:selected.profile,start:selected.start,verdict:verdict===undefined?prior.verdict||'':verdict,note:$('note').value,updated:new Date().toISOString()};try{localStorage.setItem(KEY,JSON.stringify(notes));$('saved').textContent='Сохранено локально: '+verdictName(notes[selected.id].verdict);drawCoins();drawZones()}catch(e){fail('Не удалось сохранить оценки: '+e)}}
function exportNotes(){const blob=new Blob([JSON.stringify({format:KEY,protocol:catalog.protocol_sha256,notes},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='state-zones-reviews.json';a.click();URL.revokeObjectURL(url)}
async function importNotes(event){
 try{const file=event.target.files[0];if(!file)return;const value=JSON.parse(await file.text());if(value.format!==KEY||!value.notes||typeof value.notes!=='object')throw Error('Неизвестный формат оценок');
 let count=0;for(const [id,n] of Object.entries(value.notes)){if(!/^\d+-(fast|long)-\d+$/.test(id)||!n||!Number.isInteger(n.ci)||n.ci<0||n.ci>=catalog.coins.length||!['fast','long'].includes(n.profile)||!Number.isInteger(n.start)||id!==`${n.ci}-${n.profile}-${n.start}`||!['','yes','no','unsure'].includes(n.verdict))continue;
 notes[id]={ci:n.ci,coin:catalog.coins[n.ci],profile:n.profile,start:n.start,verdict:n.verdict,note:String(n.note||''),updated:String(n.updated||'')};count++}
 localStorage.setItem(KEY,JSON.stringify(notes));drawCoins();drawZones();drawReview();$('saved').textContent=`Загружено ${count} оценок; совпадающие ID заменены.`
 }catch(e){fail(e)}event.target.value='';
}
function bounds(){
 const at=selected?.start??0,p=$('period').value;
 let lo,hi;if(p==='all'){lo=0;hi=catalog.minutes-1}else if(p==='zone'){lo=at-1440;hi=(selected?.end??at)+720}else{const n=Number(p);lo=at-Math.floor(n*.25);hi=lo+n-1}
 if(!$('future').checked)hi=Math.min(hi,at);
 return [Math.max(0,lo),Math.min(catalog.minutes-1,hi)];
}
function aggregate(lo,hi,step){
 const v=(c,i)=>data[c*catalog.minutes+i],offset=Math.floor(catalog.first/60),out=[];let i=lo;
 while(i<=hi){const bucket=Math.floor((offset+i)/step)*step-offset,end=Math.min(hi,bucket+step-1);let high=-Infinity,low=Infinity,volume=0,so=-Infinity,sc=Infinity,valid=true,vok=true,sok=true;
 for(let j=i;j<=end;j++){valid&&=[0,1,2,3].every(c=>Number.isFinite(v(c,j))&&v(c,j)>0);high=Math.max(high,v(1,j));low=Math.min(low,v(2,j));vok&&=Number.isFinite(v(7,j));volume+=v(7,j);sok&&=Number.isFinite(v(5,j))&&Number.isFinite(v(6,j));so=Math.max(so,v(5,j));sc=Math.min(sc,v(6,j))}
 const open=v(0,i),close=v(3,end);out.push({time:time(bucket),start:i,end,valid,open,close,high,low,volume:vok?volume:null,range:valid?high-low:null,rangePct:valid?100*(high-low)/open:null,spreadOpen:sok?100*(so-1):null,spreadClose:sok?100*(sc-1):null,complete:i===bucket&&end===bucket+step-1});i=end+1}
 return out;
}
function drawChart(){
 if(!data)return;const [lo,hi]=bounds();let step=Number($('interval').value);
 if((hi-lo)/step>24000){step=5;$('interval').value='5'}
 bars=aggregate(lo,hi,step);if(chart)chart.remove();
 const height=$('chart').clientHeight;chart=LightweightCharts.createChart($('chart'),{width:$('chart').clientWidth,height,layout:{background:{color:'#fff'},textColor:'#34506a',panes:{separatorColor:'#c0ccda'}},grid:{vertLines:{color:'#eef2f6'},horzLines:{color:'#eef2f6'}},timeScale:{timeVisible:true,secondsVisible:false,minBarSpacing:.01},rightPriceScale:{minimumWidth:100},crosshair:{mode:0},localization:{locale:'ru-RU'}});
 const closes=bars.filter(b=>b.valid).map(b=>b.close),min=closes.length?Math.min(...closes):1,precision=Math.min(10,Math.max(2,Math.ceil(-Math.log10(min))+4));
 priceSeries=chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#078f74',downColor:'#b5a3ae',wickUpColor:'#078f74',wickDownColor:'#b5a3ae',borderVisible:false,priceLineVisible:false,priceFormat:{type:'price',precision,minMove:10**-precision}},0);
 priceSeries.setData(bars.map(b=>b.valid?{time:b.time,open:b.open,high:b.high,low:b.low,close:b.close}:{time:b.time}));
 const range=chart.addSeries(LightweightCharts.HistogramSeries,{title:$('rangeUnit').value==='pct'?'Размах %':'High−low',priceLineVisible:false},1);
 range.setData(bars.map(b=>({time:b.time,...(b.valid?{value:$('rangeUnit').value==='pct'?b.rangePct:b.range,color:b.close>b.open?'#27a48a':'#cec0c8'}:{})})));
 volumeSeries=chart.addSeries(LightweightCharts.HistogramSeries,{title:'USDT / свеча',base:1,priceLineVisible:false,priceFormat:{type:'volume'}},2);
 volumeSeries.setData(bars.map(b=>({time:b.time,...(b.volume!==null?{value:b.volume,color:b.close>b.open?'#078f74':'#b5a3ae'}:{})})));volumeSeries.priceScale().applyOptions({mode:Number($('volScale').value)});
 for(const [key,title,color] of [['spreadOpen','open_market %','#386dc2'],['spreadClose','close_market %','#b17389']]){const s=chart.addSeries(LightweightCharts.LineSeries,{title,color,lineWidth:1,priceLineVisible:false},3);s.setData(bars.map(b=>({time:b.time,...(b[key]!==null?{value:b[key]}:{})})))}
 chart.panes().forEach((p,j)=>p.setStretchFactor([390,230,250,180][j]));chart.timeScale().fitContent();
 const byTime=new Map(bars.map(b=>[b.time,b]));chart.subscribeCrosshairMove(p=>{const b=byTime.get(p.time);if(!b)return;$('hover').textContent=`${utc(time(b.start))} — ${utc(time(b.end))} UTC · ${b.close>b.open?'РАСТУЩАЯ':b.close<b.open?'падающая':'нейтральная'} · C ${fmt(b.close,precision)} · размах ${fmt(b.rangePct,3)}% · тело ${fmt(100*(b.close/b.open-1),3)}% · ${fmt(b.volume,0)} USDT · ${b.complete?'полная свеча':'частичная свеча окна'} · спреды ${fmt(b.spreadOpen,3)} / ${fmt(b.spreadClose,3)}%`});
 chart.timeScale().subscribeVisibleTimeRangeChange(drawOverlay);chart.timeScale().subscribeSizeChange(drawOverlay);drawChartFacts(lo,hi,step);requestAnimationFrame(drawOverlay);
}
function drawChartFacts(lo,hi,step){
 $('chartTitle').textContent=catalog.coins[ci]+' · '+(selected?modeName(selected.profile)+' зона с '+utc(time(selected.start))+' UTC':'вся история');
 $('zoneFacts').textContent=selected?`Старт: ${selected.trigger==='burst'?'одна сильная растущая свеча':'серия с суммарным движением вверх'}. Amount ${fmt(selected.start_volume,0)} USDT, граница ${fmt(selected.volume_threshold,0)}; размах ${fmt(selected.start_range,3)}%, граница ${fmt(selected.range_threshold,3)}%. Предшествующие ${selected.profile==='fast'?'6':'24'}ч: ${fmt(selected.prior_return)}%. Границы фиксированы на время зоны.`:'';
 $('chartStatus').textContent=`${utc(time(lo))} → ${utc(time(hi))} UTC · ${bars.length} свечей по ${step} мин. Фон не сглаживается. При смене свечи суммируется только её собственный оборот.`;
 const valid=bars.filter(b=>b.spreadOpen!==null&&b.spreadClose!==null);$('spreadCoverage').textContent=valid.length?`Спреды полные в ${valid.length} из ${bars.length} свечей окна; первая полная: ${utc(time(valid[0].start))} UTC. Пропуски не означают нулевой спред.`:'В этом окне спредов нет. По ним нельзя подтвердить раннюю смену состояния.';
 $('hover').textContent='Наведите курсор на свечу. График: цена → размах → USDT → спреды.';drawFuture();
}
function drawFuture(){
 if(!selected||!$('outcomes').checked||!$('future').checked){$('futureFacts').replaceChildren();return}
 $('futureFacts').innerHTML='<p><b>Будущее после обнаружения, не критерий отбора.</b> High/low — экскурсии, не прибыль сделки. База сравнения — close уже закрытой свечи обнаружения.</p><table><thead><tr><th>Через</th><th>Close USDT</th><th>Максимум</th><th>Минимум</th><th>Close / BTC+ETH</th></tr></thead><tbody>'+Object.entries(selected.outcomes).map(([k,v])=>`<tr><td>${k}</td>${[0,1,2,3].map(i=>`<td>${fmt(v?.[i])}%</td>`).join('')}</tr>`).join('')+'</tbody></table>';
}
function drawOverlay(){
 if(!chart||!bars.length)return;const canvas=$('zonesLayer'),width=$('chart').clientWidth,height=chart.panes()[0].getHeight(),dpr=window.devicePixelRatio||1;
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
 const step=Number($('interval').value),base=bars[0].time,limit=$('future').checked?Infinity:selected?.start??0;
 // This chart build accepts integer logical indices only; interpolate minute boundaries.
 const x=i=>{const logical=(time(i)-base)/(step*60),whole=Math.floor(logical),scale=chart.timeScale(),a=scale.logicalToCoordinate(whole),b=scale.logicalToCoordinate(whole+1);return a===null||b===null?null:a+(b-a)*(logical-whole)};
 const colors={watch:'#dba12f',active:'#178e73',pause:'#7f8c9d'};
 for(const z of zones){if(!matches(z)||z.start>limit||z.end<bars[0].start||z.start>bars[bars.length-1].end)continue;
  const y=z.profile==='fast'?5:27,chosen=z.id===selected?.id,end=Math.min(z.end,limit),left=x(z.start),right=x(end+1);if(left===null||right===null||right<0||left>width-100)continue;
  for(let j=0;j<z.phases.length;j++){const [start,phase]=z.phases[j],stop=Math.min(end+1,z.phases[j+1]?.[0]??end+1);if(start>=stop)continue;const a=Math.max(0,x(start)),b=Math.min(width-100,x(stop));if(b<=a)continue;ctx.fillStyle=colors[phase];ctx.globalAlpha=chosen?.14:.045;ctx.fillRect(a,50,b-a,height-50);ctx.globalAlpha=chosen?.9:.6;ctx.fillRect(a,y,Math.max(1,b-a),17)}
  ctx.globalAlpha=1;if(chosen){ctx.strokeStyle='#254d75';ctx.lineWidth=2;ctx.strokeRect(Math.max(0,left),y,Math.max(2,Math.min(width-100,right)-Math.max(0,left)),17)}
 }
 ctx.globalAlpha=1;
}
function changeMode(){drawCoins();drawZones();if(selected&&!matches(selected)){if(visibleZones.length)choose(visibleZones[0]);else{selected=null;drawReview();drawChart()}}else drawOverlay()}
function bind(){
 $('search').oninput=drawCoins;for(const id of ['coinFilter','coinSort'])$(id).onchange=drawCoins;$('mode').onchange=changeMode;$('verdictFilter').onchange=drawZones;
 $('prevZone').onclick=()=>moveZone(-1);$('nextZone').onclick=()=>moveZone(1);
 for(const id of ['period','interval','rangeUnit','future'])$(id).onchange=drawChart;
 $('volScale').onchange=()=>volumeSeries?.priceScale().applyOptions({mode:Number($('volScale').value)});
 $('outcomes').onchange=()=>{drawZones();drawFuture()};$('note').oninput=()=>saveReview();
 document.querySelectorAll('[data-verdict]').forEach(b=>b.onclick=()=>saveReview(b.dataset.verdict));$('export').onclick=exportNotes;$('import').onchange=importNotes;
 new ResizeObserver(()=>{if(chart){const visible=chart.timeScale().getVisibleRange();chart.resize($('chart').clientWidth,$('chart').clientHeight);if(visible)chart.timeScale().setVisibleRange(visible);drawOverlay()}}).observe($('chart'));
}
(async()=>{try{const r=await fetch('catalog.json');if(!r.ok)throw Error('catalog HTTP '+r.status);catalog=await r.json();bind();const total=catalog.items.reduce((s,c)=>s+c.counts.fast+c.counts.long,0);$('totals').textContent=`${catalog.coins.length} монет · ${fmt(total,0)} зон · ${utc(catalog.first)} — ${utc(catalog.last)} UTC. Все найденные случаи, включая затихшие и незавершённые.`;drawCoins();
 const hash=new URLSearchParams(location.hash.slice(1)),requested=Number(hash.get('coin')),initial=hash.has('coin')&&Number.isInteger(requested)&&requested>=0&&requested<catalog.coins.length?requested:catalog.coins.indexOf('G');
 const wanted=hash.get('zone');if(wanted?.includes('-fast-'))$('mode').value='fast';await loadCoin(initial,wanted);
 }catch(e){fail(e)}})();
