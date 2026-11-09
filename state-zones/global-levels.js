'use strict';
// Shared causal replay: browser Worker and complete offline catalogue.
const GlobalLevels = (() => {
 const protocol={version:'levels2b-20261110',bar:15,pivotRadii:[4,24,96],minSpan:360,volumeDays:7,minHistory:1440,volumeMultiple:2,consecutive:3,activeOfFive:4,resetMinutes:30};
 const quant=(sorted,q)=>sorted.length?sorted[Math.floor((sorted.length-1)*q)]:null;
 const median=a=>quant(a.sort((a,b)=>a-b),.5);
 function scan(data,n,first,limit=n){
  limit=Math.min(n,limit);const get=(c,i)=>data[c*n+i],valid=i=>i>=0&&[0,1,2,3,7].every(c=>Number.isFinite(get(c,i)))&&get(7,i)>=0&&get(2,i)>0&&get(1,i)>=Math.max(get(0,i),get(3,i))&&get(2,i)<=Math.min(get(0,i),get(3,i));
  const levels=[],sorted=[],signals=[],bars=[],runtime=new Map(),active=new Set();let run=0,base=null,episode=null,quiet=0,lastDay=null,tolerance=.003,previous=new Set();
  const lower=p=>{let a=0,b=sorted.length;while(a<b){const k=(a+b)>>1;if(sorted[k].center<p)a=k+1;else b=k}return a};
  function neighbourhood(lo,hi){return sorted.slice(lower(lo),lower(hi)+1).filter(s=>s.center<=hi)}
  function relation(s,p){return p<s.bottom?-1:p>s.top?1:0}
  function visit(s,i,p){const state=relation(s,p),last=s.transitions.at(-1);if(!last||last.side!==state)s.transitions.push({minute:i,side:state});if(state===0){const a=s.stays.at(-1);if(a&&a.end===i-1)a.end=i;else s.stays.push({start:i,end:i})}}
  function pivot(price,minute,known,scale,kind){
   // Centres and widths never move. New evidence appends to the same identity.
   let s=neighbourhood(price/(1+.03),price/(1-.03)).filter(s=>Math.abs(s.center-price)<=s.radius+price*tolerance).sort((a,b)=>Math.abs(a.center-price)-Math.abs(b.center-price))[0];
   if(!s){const radius=price*tolerance;s={id:levels.length,center:price,radius,bottom:price-radius,top:price+radius,start:minute,pivotStart:minute,known,qualified:null,localQualified:null,pivots:[],major:[],stays:[],transitions:[]};levels.push(s);sorted.splice(lower(price),0,s);runtime.set(s.id,{approach:false,exit:false,away:null,cycle:0,attempt:null,lastSide:relation(s,get(3,known)),armed:get(3,known)<s.bottom});let start=0;while(start<known&&(!valid(start)||relation(s,get(3,start))!==0))start++;s.start=start;for(let k=start;k<=known;k++)if(valid(k))visit(s,k,get(3,k));}
   const old=s.pivots.at(-1);
   if(scale>=360){const prior=s.major.at(-1);let independent=!prior;if(prior&&minute-prior.minute>=protocol.minSpan){for(let k=prior.minute+1;k<minute;k++)if(valid(k)&&Math.abs(get(3,k)-s.center)>2*s.radius){independent=true;break}}if(independent){s.major.push({minute,known,scale,kind});if(s.qualified===null&&s.major.length>=2)s.qualified=known;}}
   if(s.pivots.some(p=>p.minute===minute))return;
   // Adjacent candles do not count as independent tests: price must depart.
   if(old){if(minute<=old.minute||minute-old.minute<60)return;let departed=false;for(let k=old.minute+1;k<minute;k++)if(valid(k)&&Math.abs(get(3,k)-s.center)>2*s.radius){departed=true;break}if(!departed)return;}
   s.pivots.push({minute,known,scale,kind});
   if(s.localQualified===null&&s.pivots.length>=2&&minute-s.pivots[0].minute>=protocol.minSpan)s.localQualified=known;
  }
  for(let i=0;i<limit;i++){
   const ok=valid(i);run=ok?run+1:0;
   const day=Math.floor((first/60+i)/1440);
   if(day!==lastDay){
    lastDay=day;const start=Math.max(0,i-10080),v=[];for(let k=start;k<i;k++)if(valid(k))v.push(get(7,k));v.sort((a,b)=>a-b);
    base=v.length>=protocol.minHistory&&v.length>=.95*(i-start)?{at:i,from:start,median:quant(v,.5),q90:quant(v,.9),q99:quant(v,.99),minutes:v.length}:null;
    const r=bars.slice(-672).filter(b=>b.valid).map(b=>(b.high-b.low)/b.close);if(r.length>=16)tolerance=Math.max(.0015,Math.min(.015,median(r)*.5));
   }
   if(!ok){episode=null;quiet=0;previous=new Set();for(const s of levels){const r=runtime.get(s.id);r.armed=false;r.approach=false;r.exit=false;r.away=null;r.lastSide=null;}active.clear();if((Math.floor(first/60)+i+1)%15===0&&i>=14)bars.push({start:i-14,end:i,valid:false});continue}
   const close=get(3,i),volume=get(7,i);
   if(!episode&&base?.median>0&&volume>=protocol.volumeMultiple*base.median)episode={...base,start:i};
   if(episode){quiet=volume<=1.5*episode.median?quiet+1:0;if(quiet>=10){episode=null;quiet=0}}
   let sustained=false,min3=null,fold=null,strength=0;
   if(run>=5&&episode){const vols=[];for(let k=i-4;k<=i;k++)vols.push(get(7,k));min3=Math.min(...vols.slice(-3));sustained=min3>=2*episode.median&&vols.filter(v=>v>=2*episode.median).length>=4;fold=min3/episode.median;strength=min3>episode.q99?3:min3>episode.q90?2:1;}
   const candidates=[];
   const nearby=neighbourhood(close/1.06,close/.94),todo=new Set([...nearby.map(s=>s.id),...previous,...active]);previous=new Set(nearby.map(s=>s.id));
   for(const id of todo){const s=levels[id],r=runtime.get(id);visit(s,i,close);const side=relation(s,close),farBelow=close<s.bottom-s.radius;
    if(farBelow){if(r.away===null)r.away=i;if(i-r.away>=protocol.resetMinutes){if(r.approach||r.exit)r.cycle++;r.approach=false;r.exit=false;r.armed=true;active.delete(id)}}else r.away=null;
    // A level already above price can be approached; a level discovered below it
    // cannot manufacture an earlier breakout. Gaps require a fresh re-arming.
    if(r.lastSide===-1&&side>=-1)r.armed=true;
    const near=close>=s.bottom-s.radius&&close<=s.top+3*s.radius;
    if(r.armed&&!r.exit&&(near&&!active.has(id)||r.lastSide!==1&&side===1)){active.add(id);r.attempt=i;}
    if(r.attempt!==null&&i-r.attempt>60)active.delete(id);
    if(s.qualified!==null&&s.qualified<i&&r.armed&&sustained&&run>=6&&close>get(3,i-5)&&close>get(0,i)&&(near||active.has(id)&&side===1)){
     const kind=side===1?'exit':'approach';
     if(!(kind==='exit'?r.exit:r.approach||r.exit)){
      const floor=sorted.slice(0,lower(s.center)).findLast(l=>l.qualified!==null&&l.qualified<i&&l.top<s.bottom);
      candidates.push({minute:i,level:id,kind,cycle:r.cycle,close,excess:100*(close/s.top-1),return5:100*(close/get(3,i-5)-1),fold,min3,strength,base:{at:episode.at,from:episode.from,median:episode.median,q90:episode.q90,q99:episode.q99,minutes:episode.minutes,start:episode.start},floor:floor?.id??null,activeMinutes:3,attempt:r.attempt});
      if(kind==='exit'){r.exit=true;active.delete(id)}else r.approach=true;
     }
    }
    r.lastSide=side;
   }
   candidates.sort((a,b)=>Math.abs(a.excess)-Math.abs(b.excess)||a.level-b.level);
   for(const e of candidates){e.primary=false;if(episode.primary===undefined){episode.primary=e.level;episode.primaryKind=e.kind;e.primary=true;}else if(episode.primary===e.level&&episode.primaryKind==='approach'&&e.kind==='exit'){e.primary=true;episode.primaryKind='exit';}signals.push(e);}
   if((Math.floor(first/60)+i+1)%15!==0||i<14)continue;
   const b={start:i-14,end:i,valid:run>=15};if(b.valid){b.high=-Infinity;b.low=Infinity;for(let k=i-14;k<=i;k++){b.high=Math.max(b.high,get(3,k));b.low=Math.min(b.low,get(3,k))}b.close=close;}bars.push(b);
   const end=bars.length-1;
   for(const radius of protocol.pivotRadii){if(end<2*radius)continue;const middle=end-radius,w=bars.slice(end-2*radius,end+1);if(w.some(b=>!b.valid))continue;const high=Math.max(...w.map(b=>b.high)),low=Math.min(...w.map(b=>b.low)),p=bars[middle];if(!(high>low))continue;
    for(const kind of ['high','low'])if(p[kind]===(kind==='high'?high:low)&&!bars.slice(end-2*radius,middle).some(b=>b[kind]===p[kind])){let minute=p.start;while(minute<p.end&&get(3,minute)!==p[kind])minute++;pivot(p[kind],minute,i,radius*15,kind)}
   }
  }
  return {protocol,levels,signals};
 }
 function at(s,cut){const pivots=s.pivots.filter(p=>p.known<=cut),stays=s.stays.filter(v=>v.start<=cut),inside=stays.reduce((n,v)=>n+Math.min(v.end,cut)-v.start+1,0),transitions=s.transitions.filter(t=>t.minute<=cut);return {pivots,inside,visits:stays.length,age:Math.max(0,cut-s.start),last:stays.length?Math.min(stays.at(-1).end,cut):null,returns:transitions.filter((t,k)=>k>0&&t.side===0).length,qualified:s.qualified!==null&&s.qualified<=cut};}
 return {scan,at,protocol};
})();
if(typeof module!=='undefined')module.exports=GlobalLevels;
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope)self.onmessage=e=>{try{const {data,n,first}=e.data;self.postMessage(GlobalLevels.scan(data,n,first))}catch(error){self.postMessage({error:String(error)})}};
