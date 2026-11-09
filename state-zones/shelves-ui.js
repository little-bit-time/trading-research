'use strict';
const Shelves={
 rows:[],worker:null,selected:null,hits:[],ready:false,
 price(p){return p==null?'—':Number(p.toPrecision(6)).toLocaleString('ru-RU',{maximumFractionDigits:12})},
 load(){
  this.worker?.terminate();this.rows=[];this.selected=null;this.ready=false;this.hits=[];$('shelfStatus').textContent='Ищем полки по закрытым свечам всей истории…';
  const worker=this.worker=new Worker('price-shelves.js?v=shelves1-20261110');
  worker.onmessage=e=>{if(worker!==this.worker)return;if(e.data.error){$('shelfStatus').textContent='Ошибка расчёта полок: '+e.data.error;worker.terminate();return}this.rows=e.data.shelves;this.ready=true;worker.terminate();this.refresh();drawChart()};
  worker.onerror=e=>{$('shelfStatus').textContent='Не удалось рассчитать полки: '+e.message;worker.terminate()};
  worker.postMessage({data,n:oldcat.minutes,first:catalog.first});
 },
 visible(){const h=Number($('shelfScale').value),[lo,hi]=bounds();return this.rows.filter(s=>s.h===h&&s.known<=hi&&(s.end??oldcat.minutes-1)>=lo)},
 refresh(){
  if(!this.ready)return;const rows=this.visible(),[lo,hi]=bounds(),up=rows.filter(s=>s.status==='up'&&s.end<=hi&&s.end>=lo);
  $('shelfStatus').textContent=`${rows.length} полок в окне · ${up.length} первых пробоев вверх. Пунктир: история формирования, ещё не сигнал. Голубая заливка: границы уже известны. ▲: первое закрытие над потолком тел; внешний край теней — серый пунктир. Время UTC.`;
  const select=$('shelfEvents');select.innerHTML='<option value="">Выберите полку в показанном окне</option>'+rows.map(s=>`<option value="${s.id}">${utc(stamp(s.known))} · ${s.end!==null&&s.end<=hi?({up:'↑ пробой '+utc(stamp(s.end)),down:'выход вниз',expired:'истёк срок',gap:'разрыв данных'}[s.status]):'наблюдение'} · ${this.price(s.bottom)}–${this.price(s.top)}</option>`).join('');select.value=this.selected||'';
  if(this.selected&&!rows.some(s=>s.id===this.selected))this.selected=null;
  $('shelfDetail').textContent=this.selected?this.describe(this.rows.find(s=>s.id===this.selected),hi):'Выберите полку в списке или нажмите на её границу / стрелку. Пробой пока не оценён по будущим результатам: это первая версия разметки для визуальной проверки.';
 },
 describe(s,at){
  if(!s)return '';let text=`Полка ${s.h<1440?s.h+'м':s.h/1440+'д'} · сформирована ${utc(stamp(s.start))} → ${utc(stamp(s.known))} UTC. Доступна только после закрытия ${utc(stamp(s.known))}.\nПол ${this.price(s.bottom)} · потолок тел ${this.price(s.top)} · край теней ${this.price(s.wickTop)} · ширина ${fmt(100*(s.top/s.bottom-1),2)}%. Подходов к верху / низу: ${s.upper} / ${s.lower}. Оборот внутри: $${fmt(s.volume,0)}; обычная 1м / 5м свеча: $${fmt(s.base1,0)} / $${fmt(s.base5,0)} (медианы до обнаружения, заморожены).`;
  const e=s.breakout;if(e&&e.minute<=at)text+=`\n▲ Первое закрытие выше потолка: ${utc(stamp(e.minute))} UTC · ${this.price(e.close)}. Выход ${fmt(e.excess,2)}% · ход за 1м / 5м: ${fmt(e.return1,2)}% / ${fmt(e.return5,2)}%. Объём 1м ${fmt(e.fold1,2)}× / скользящие 5м ${fmt(e.fold5,2)}× базы полки. Размах 1м ${fmt(e.rangeFold,2)}×. ${e.aboveWick?'Закрытие также выше края теней.':'Край теней ещё не пробит.'}`;
  else if(s.end!==null&&s.end<=at)text+=`\nКонец ${utc(stamp(s.end))}: ${{down:'закрытие ниже пола',gap:'разрыв исходных данных',expired:'за один срок полки пробоя не произошло'}[s.status]||s.status}.`;
  else text+='\nНа этот момент пробоя нет; будущий исход здесь не используется.';
  return text;
 },
 select(id,zoom=false){this.selected=id||null;const s=this.rows.find(s=>s.id===id);if(s&&zoom){const [lo,hi]=bounds(),focus=s.end!==null&&s.end<=hi?s.end:s.known;customRange=[Math.max(0,s.start-Math.round(s.h*.25)),Math.min(oldcat.minutes-1,focus+Math.max(60,Math.round(s.h*.5)))];drawChart()}else{this.refresh();drawOverlay()}},
 markers(plot,lo,hi){if(!$('showShelves').checked)return [];return this.visible().filter(s=>s.breakout&&s.end>=lo&&s.end<=hi).map(s=>{const b=plot.find(b=>b.end>=s.end);return b?{time:b.time,position:'belowBar',color:'#1973b8',shape:'arrowUp',text:'Пробой полки'}:null}).filter(Boolean)},
 draw(ctx,x,height,bound){
  this.hits=[];if(!$('showShelves').checked)return;const [lo,hi]=bounds();ctx.save();ctx.beginPath();ctx.rect(0,0,bound,height-10);ctx.clip();ctx.font='11px system-ui';
  for(const s of this.visible()){
   const l=x(s.start),k=x(s.known),r=x(Math.min(hi,s.end??hi)),yt=series.priceToCoordinate(s.top),yb=series.priceToCoordinate(s.bottom),yw=series.priceToCoordinate(s.wickTop);if([l,k,r,yt,yb].some(v=>v===null||!Number.isFinite(v)))continue;
   if(r<0||l>bound)continue;const chosen=s.id===this.selected,color=chosen?'#124980':'#277eb3';
   ctx.strokeStyle=color;ctx.lineWidth=chosen?2:1;ctx.setLineDash([4,4]);ctx.strokeRect(l,yt,k-l,yb-yt);ctx.setLineDash([]);ctx.fillStyle=chosen?'rgba(45,132,196,.20)':'rgba(45,132,196,.08)';ctx.fillRect(k,yt,Math.max(1,r-k),yb-yt);ctx.strokeRect(k,yt,Math.max(1,r-k),yb-yt);
   if(yw!==null){ctx.strokeStyle='#8b9ca8';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(k,yw);ctx.lineTo(r,yw);ctx.stroke();ctx.setLineDash([])}
   ctx.fillStyle=color;if(r-Math.max(0,l)>65)ctx.fillText('Полка '+(s.h<1440?s.h+'м':s.h/1440+'д'),Math.max(3,l+3),Math.max(13,yt-5));
   this.hits.push({s,l:Math.max(0,l),r:Math.min(bound,r),top:yt,bottom:yb});
   if(s.breakout&&s.end<=hi){const bx=x(s.end),by=series.priceToCoordinate(s.breakout.close);if(bx!==null&&by!==null){ctx.beginPath();ctx.arc(bx,by,3,0,Math.PI*2);ctx.fill();this.hits.push({s,l:bx-10,r:bx+10,top:by-12,bottom:by+12,marker:true})}}
  }ctx.restore();
 },
 hover(time){if(!$('showShelves').checked)return '';const at=Math.round((time-catalog.first)/60),bar=plot.find(b=>b.end===at),rows=this.visible(),s=rows.find(s=>s.breakout&&s.end<=at&&s.end>=(bar?.start??at))||rows.filter(s=>s.known<=at&&(s.end??Infinity)>=at).at(-1);return s?this.describe(s,at):''},
 bind(){
  $('showShelves').onchange=()=>drawChart();$('shelfScale').onchange=()=>{this.selected=null;drawChart()};$('shelfEvents').onchange=()=>this.select($('shelfEvents').value);$('shelfZoom').onclick=()=>this.select(this.selected,true);
  for(const [id,delta] of [['shelfPrev',-1],['shelfNext',1]])$(id).onclick=()=>{const rows=this.visible();if(!rows.length)return;const k=rows.findIndex(s=>s.id===this.selected);this.select(rows[(k+delta+rows.length)%rows.length].id)};
  $('chart').addEventListener('mouseleave',()=>this.refresh());
  $('chart').addEventListener('pointermove',event=>{if(event.buttons)requestAnimationFrame(drawOverlay)});
  $('chart').addEventListener('wheel',()=>requestAnimationFrame(drawOverlay),{passive:true});
  $('chart').addEventListener('click',event=>{const rect=$('chart').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=this.hits.slice().reverse().find(h=>x>=h.l&&x<=h.r&&(h.marker?y>=h.top&&y<=h.bottom:Math.min(Math.abs(y-h.top),Math.abs(y-h.bottom))<9));if(hit)this.select(hit.s.id)});
 }
};
