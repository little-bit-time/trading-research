'use strict';
const Shelves={
 rows:[],signals:[],worker:null,selected:null,signal:null,hits:[],ready:false,pending:null,
 price(p){return p==null?'—':Number(p.toPrecision(6)).toLocaleString('ru-RU',{maximumFractionDigits:12})},
 load(){
  this.worker?.terminate();this.rows=[];this.signals=[];this.selected=null;this.signal=null;this.ready=false;this.hits=[];this.pending=null;$('shelfStatus').textContent='Восстанавливаем память уровней и минутные серии объёмов…';
  const worker=this.worker=new Worker('global-levels.js?v=levels2-20261110');
  worker.onmessage=async e=>{if(worker!==this.worker)return;if(e.data.error){$('shelfStatus').textContent='Ошибка: '+e.data.error;worker.terminate();return}this.rows=e.data.levels;this.signals=e.data.signals;this.ready=true;worker.terminate();if(this.pending){const p=this.pending;this.pending=null;await this.focus(p.level,p.minute);return}this.refresh();drawChart()};
  worker.onerror=e=>{$('shelfStatus').textContent='Ошибка загрузки уровней: '+e.message;worker.terminate()};
  worker.postMessage({data,n:oldcat.minutes,first:catalog.first});
 },
 stats(s,at){return GlobalLevels.at(s,at)},
 visible(){const [,hi]=bounds(),local=$('shelfScale').value==='all';return this.rows.filter(s=>s.known<=hi&&(local?s.localQualified!==null&&s.localQualified<=hi:s.qualified!==null&&s.qualified<=hi)||s.id===this.selected&&s.known<=hi)},
 events(lo,hi){return this.signals.filter(s=>s.minute>=lo&&s.minute<=hi&&($('levelRepeats').checked||s.primary))},
 drawRows(){
  const rows=this.visible();if($('shelfDensity').value==='all')return rows;
  const [lo,hi]=bounds(),at=Math.min(hi,this.signal?.minute??hi),price=data[3*oldcat.minutes+at],rank=s=>s.stays.reduce((sum,v)=>sum+Math.max(0,Math.min(v.end,at)-Math.max(lo,v.start)+1),0);
  const available=rows.filter(s=>(s.qualified??s.localQualified)<=at),ordered=available.slice().sort((a,b)=>b.center-a.center),near=[ordered.find(s=>s.top<price),ordered.slice().reverse().find(s=>s.bottom>price)],chosen=[];
  for(const s of [rows.find(s=>s.id===this.selected),...near,...available.slice().sort((a,b)=>rank(b)-rank(a)||a.center-b.center)])if(s&&!chosen.includes(s)&&chosen.length<8)chosen.push(s);
  return chosen;
 },
 refresh(){
  if(!this.ready)return;const rows=this.visible(),[lo,hi]=bounds(),events=this.events(lo,hi);
  $('shelfStatus').textContent=`${rows.length} известных уровней, показано ${this.drawRows().length} · ${events.length} событий в участке. Уровни продолжаются после выходов и возвратов. Пунктир — прошлый участок до подтверждения, сплошная полоса — уровень уже известен. Оранжевый ◆: приближение с серией объёмов; зелёный ▲: выход с серией. UTC.`;
  const select=$('shelfEvents');select.innerHTML='<option value="">Выберите ценовой уровень</option>'+rows.slice().sort((a,b)=>a.center-b.center).map(s=>{const a=this.stats(s,hi);return `<option value="${s.id}">${this.price(s.bottom)}–${this.price(s.top)} · история ${duration(a.age/60)} · внутри ${duration(a.inside/60)}</option>`}).join('');select.value=this.selected===null?'':String(this.selected);
  $('levelSignals').innerHTML='<option value="">События у уровней в этом участке</option>'+events.map(s=>`<option value="${s.level}:${s.minute}">${utc(stamp(s.minute))} · ${s.kind==='exit'?'▲ выход':'◆ приближение'} · ≥${fmt(s.fold,1)}× каждую из 3 минут${s.primary?'':' · продолжение'}</option>`).join('');$('levelSignals').value=this.signal?`${this.signal.level}:${this.signal.minute}`:'';
  $('shelfDetail').textContent=this.selected!==null?this.describe(this.rows[this.selected],this.signal?.minute??hi):'Ключевые полосы: выбранная, ближайшие снизу/сверху и области с наибольшим временем закрытий внутри показанной предыстории; переключатель раскрывает все. Выберите полосу уровня или событие. В карточке будут вся доступная история посещений, время внутри области, прежние выходы и серия минутных объёмов. Никакие будущие касания не учитываются в прошлом сигнале.';
 },
 describe(s,at){
  if(!s||s.known>at)return '';const a=this.stats(s,at),major=s.major.filter(p=>p.known<=at),known=s.qualified!==null&&s.qualified<=at?s.qualified:s.localQualified;
  let text=`Уровень ${this.price(s.bottom)}–${this.price(s.top)} · центр ${this.price(s.center)}. Срез ${utc(stamp(at))} UTC.\nПервое известное взаимодействие ${utc(stamp(s.start))}; кандидат доступен ${utc(stamp(s.known))}, подтверждён ${known!==null&&known<=at?utc(stamp(known)):'ещё не подтверждён'}. Календарная история ${duration(a.age/60)}; суммарно закрытия внутри узкой полосы ${duration(a.inside/60)}. Посещений ${a.visits}; возвратов в полосу ${a.returns}; независимых разворотов ${a.pivots.length}, из них подтверждений масштаба ≥6ч: ${major.length}. Последнее посещение ${a.last===null?'нет':utc(stamp(a.last))}. Это оборот и история цены, не глубина стакана.`;
  const e=this.signals.find(e=>e.level===s.id&&e.minute===at);
  if(e){const vols=Array.from({length:5},(_,k)=>data[7*oldcat.minutes+at-4+k]);text+=`\n${e.kind==='exit'?'▲ Выход':'◆ Приближение'}: ${utc(stamp(at))} · цена ${this.price(e.close)}; относительно верхнего края ${fmt(e.excess,2)}%; ход 5м ${fmt(e.return5,2)}%.\nПоследние 5 минут по отдельности: ${vols.map(v=>'$'+fmt(v,0)).join(' → ')}. Последние 3 подряд ≥${fmt(e.fold,2)}×; минимум 4 из 5 ≥2×. База $${fmt(e.base.median,2)}/мин, ${utc(stamp(e.base.from))} — ${utc(stamp(e.base.at-1))}; заморожена с начала серии ${utc(stamp(e.base.start))}. Истории ${fmt(e.base.minutes/1440,1)} сут${e.base.minutes<10080?' · предварительная':''}.`;
   if(e.floor!==null){const floor=this.rows[e.floor];let count=0,valid=0,last=0,best=0;const start=Math.max(s.start,floor.start);for(let k=start;k<at;k++){const c=data[3*oldcat.minutes+k],v=data[7*oldcat.minutes+k];if(!Number.isFinite(c)||!Number.isFinite(v)||c<=0){last=0;continue}valid++;if(c>=floor.bottom&&c<=s.top){count++;best=Math.max(best,++last)}else last=0}text+=`\nСоседний подтверждённый уровень снизу ${this.price(floor.center)}. Между ${this.price(floor.bottom)} и ${this.price(s.top)} до сигнала: ${duration(count/60)} (${fmt(valid?100*count/valid:0,1)}% доступных минут с ${utc(stamp(start))}); самый длинный непрерывный участок ${duration(best/60)}. Это диапазон соседних уровней, не вручную заданная полка.`;}
  }
  const transitions=s.transitions.filter(t=>t.minute<=at).slice(-8);text+='\nПоследние взаимодействия: '+transitions.map(t=>`${utc(stamp(t.minute))} ${t.side===0?'внутри':t.side>0?'выше':'ниже'}`).join(' · ');
  return text;
 },
 select(id,zoom=false){this.signal=null;this.selected=id===''||id===null?null:Number(id);const s=this.rows[this.selected];if(s&&zoom){const [,hi]=bounds();customRange=[Math.max(0,s.start-360),hi];drawChart()}else{this.refresh();drawOverlay()}},
 async focus(level,minute){if(!this.ready){this.pending={level,minute};return}const e=this.signals.find(e=>e.level===Number(level)&&e.minute===Number(minute));if(!e){$('shelfDetail').textContent='Событие отсутствует в текущей версии. Обновите страницу.';return}const coin=ci;asof=Math.max(0,findAnchor(stamp(e.minute)));$('asof').value=date(catalog.snapshots[asof].time);await choose(null);if(ci!==coin)return;this.selected=e.level;this.signal=e;SignalMap.activeFocus={ci,minute:e.minute,dateOnly:true};customRange=[Math.max(0,e.minute-10080),Math.min(oldcat.minutes-1,e.minute+360)];$('earlyMethod').value='off';$('oldDiagnostics').checked=false;Turnover.card(ci,e.minute);$('before').value='10080';$('after').value='360';drawChart();$('mapHover').textContent='Открыт '+catalog.coins[ci]+' · '+utc(stamp(e.minute))+' UTC';history.replaceState(null,'','#'+new URLSearchParams({coin:ci,level:e.level,focus:e.minute}));},
 markers(plot,lo,hi){if(!$('showShelves').checked)return [];return this.events(lo,hi).map(s=>{const b=plot.find(b=>b.end>=s.minute);return b?{time:b.time,position:'belowBar',color:s.kind==='exit'?'#008265':'#cb8419',shape:s.kind==='exit'?'arrowUp':'circle',text:s.kind==='exit'?'Выход + серия':'Подход + серия'}:null}).filter(Boolean)},
 draw(ctx,x,height,bound){
  this.hits=[];if(!$('showShelves').checked)return;const [lo,hi]=bounds();ctx.save();ctx.beginPath();ctx.rect(0,0,bound,height-10);ctx.clip();ctx.font='11px system-ui';const labels=[];
  for(const s of this.drawRows()){
   const known=s.qualified!==null&&s.qualified<=hi?s.qualified:s.localQualified,l=x(Math.max(lo,s.start)),k=x(Math.max(lo,known??s.known)),r=x(hi),yt=series.priceToCoordinate(s.top),yb=series.priceToCoordinate(s.bottom);if([l,k,r,yt,yb].some(v=>v===null||!Number.isFinite(v))||yt>height||yb<0)continue;
   const chosen=s.id===this.selected,color=chosen?'#115f80':'rgba(72,112,130,.55)';ctx.strokeStyle=color;ctx.lineWidth=chosen?2:.6;ctx.setLineDash([3,5]);ctx.strokeRect(l,yt,Math.max(1,k-l),yb-yt);ctx.setLineDash([]);ctx.fillStyle=chosen?'rgba(31,132,174,.25)':'rgba(76,134,162,.055)';ctx.fillRect(k,yt,Math.max(1,r-k),Math.max(1,yb-yt));ctx.strokeRect(k,yt,Math.max(1,r-k),Math.max(1,yb-yt));
   const y=Math.max(14,yt-4);if(chosen||labels.every(v=>Math.abs(v-y)>16)){const a=this.stats(s,hi);ctx.fillStyle=color;ctx.fillText(`${this.price(s.center)} · внутри ${duration(a.inside/60)}`,Math.max(4,Math.min(bound-230,k+4)),y);labels.push(y)}this.hits.push({s,l:Math.max(0,l),r:bound,top:yt,bottom:yb});
  }
  for(const e of this.events(lo,hi)){const bx=x(e.minute),by=series.priceToCoordinate(e.close);if(bx===null||by===null)continue;ctx.fillStyle=e.kind==='exit'?'#008265':'#cb8419';ctx.beginPath();ctx.arc(bx,by,4,0,Math.PI*2);ctx.fill();this.hits.push({s:this.rows[e.level],e,l:bx-9,r:bx+9,top:by-9,bottom:by+9,marker:true});}ctx.restore();
 },
 hover(time){if(!$('showShelves').checked)return '';const at=Math.round((time-catalog.first)/60),bar=plot.find(b=>b.end===at),e=this.events(bar?.start??at,at).at(-1);return e?this.describe(this.rows[e.level],e.minute):this.selected!==null?this.describe(this.rows[this.selected],at):''},
 bind(){
  $('showShelves').onchange=()=>drawChart();$('shelfScale').onchange=()=>drawChart();$('shelfDensity').onchange=()=>drawChart();$('levelRepeats').onchange=()=>drawChart();$('shelfEvents').onchange=()=>this.select($('shelfEvents').value);$('shelfZoom').onclick=()=>this.select(this.selected,true);
  $('levelSignals').onchange=()=>{const [l,m]=$('levelSignals').value.split(':').map(Number);if(Number.isFinite(m))this.focus(l,m)};
  for(const [id,delta] of [['shelfPrev',-1],['shelfNext',1]])$(id).onclick=()=>{const rows=this.visible().sort((a,b)=>a.center-b.center);if(!rows.length)return;const k=rows.findIndex(s=>s.id===this.selected);this.select(rows[(k+delta+rows.length)%rows.length].id)};
  $('chart').addEventListener('mouseleave',()=>this.refresh());$('chart').addEventListener('pointermove',event=>{if(event.buttons)requestAnimationFrame(drawOverlay)});$('chart').addEventListener('wheel',()=>requestAnimationFrame(drawOverlay),{passive:true});
  $('chart').addEventListener('click',event=>{const rect=$('chart').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,hit=this.hits.slice().reverse().find(h=>x>=h.l&&x<=h.r&&(h.marker?y>=h.top&&y<=h.bottom:Math.min(Math.abs(y-h.top),Math.abs(y-h.bottom))<9));if(hit){if(hit.e)this.focus(hit.s.id,hit.e.minute);else this.select(hit.s.id)}});
 }
};
