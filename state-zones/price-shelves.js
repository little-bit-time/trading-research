'use strict';
// One implementation for the browser worker and the offline prefix verifier.
const PriceShelves = (() => {
 const horizons=[30,120,360,1440,10080];
 const med=a=>{a.sort((x,y)=>x-y);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null};
 function scan(data,n,first,limit=n){
  const get=(c,i)=>data[c*n+i],valid=i=>i>=0&&[0,1,2,3,7].every(c=>Number.isFinite(get(c,i)))&&[0,1,2,3].every(c=>get(c,i)>0)&&get(7,i)>=0&&get(1,i)>=Math.max(get(0,i),get(3,i))&&get(2,i)<=Math.min(get(0,i),get(3,i));
  const bars=[],out=[],slots=horizons.map(h=>({h,active:null,after:-1}));let run=0;
  function candidate(h,i){
   const count=h/5,w=bars.slice(-count);if(w.length<count||w.some(b=>!b.valid)||w[0].start<=slots.find(s=>s.h===h).after)return null;
   const top=Math.max(...w.map(b=>b.bodyHigh)),bottom=Math.min(...w.map(b=>b.bodyLow)),width=top-bottom;
   if(!(width>0))return null;
   // Two approaches to each edge, separated by a return through the middle.
   const middle=(top+bottom)/2,tolerance=width*.2;let upper=0,lower=0,upReady=true,downReady=true;
   for(const b of w){if(b.bodyHigh>=top-tolerance&&upReady){upper++;upReady=false}if(b.bodyLow<=bottom+tolerance&&downReady){lower++;downReady=false}if(b.bodyHigh<middle)upReady=true;if(b.bodyLow>middle)downReady=true;}
   if(upper<2||lower<2||Math.abs(w.at(-1).close-w[0].open)>width*.5)return null;
   // Require the final close still inside the range, away from either edge.
   if(w.at(-1).close<=bottom+tolerance||w.at(-1).close>=top-tolerance)return null;
   const start=w[0].start,v=[],r=[];for(let k=start;k<=i;k++){v.push(get(7,k));r.push(get(1,k)-get(2,k));}
   return {id:`${h}-${i}`,h,start,known:i,top,bottom,wickTop:Math.max(...w.map(b=>b.high)),wickBottom:Math.min(...w.map(b=>b.low)),upper,lower,base1:med(v),base5:med(w.map(b=>b.volume)),range1:med(r),volume:w.reduce((s,b)=>s+b.volume,0),end:null,status:'open',breakout:null};
  }
  function impulse(s,i){
   let v5=0;for(let k=i-4;k<=i;k++)v5+=get(7,k);
   const close=get(3,i),r=get(1,i)-get(2,i),vol=get(7,i);
   return {minute:i,close,excess:100*(close/s.top-1),return1:100*(close/get(3,i-1)-1),return5:100*(close/get(3,i-5)-1),volume:vol,volume5:v5,fold1:s.base1>0?vol/s.base1:null,fold5:s.base5>0?v5/s.base5:null,rangeFold:s.range1>0?r/s.range1:null,body:r>0?(close-get(0,i))/r:null,closePosition:r>0?(close-get(2,i))/r:null,aboveWick:close>s.wickTop};
  }
  for(let i=0;i<limit;i++){
   const ok=valid(i);run=ok?run+1:0;
   for(const slot of slots){const s=slot.active;if(!s)continue;
    let status=null;if(!ok)status='gap';else if(get(3,i)>s.top){status='up';s.breakout=impulse(s,i)}else if(get(3,i)<s.bottom)status='down';else if(i-s.known>=slot.h)status='expired';
    if(status){s.end=i;s.status=status;slot.after=i;slot.active=null;}
   }
   if((Math.floor(first/60)+i+1)%5!==0||i<4)continue;
   const b={start:i-4,end:i,valid:run>=5};if(b.valid){b.open=get(0,i-4);b.close=get(3,i);b.high=-Infinity;b.low=Infinity;b.volume=0;b.bodyHigh=-Infinity;b.bodyLow=Infinity;for(let k=i-4;k<=i;k++){b.high=Math.max(b.high,get(1,k));b.low=Math.min(b.low,get(2,k));b.bodyHigh=Math.max(b.bodyHigh,get(0,k),get(3,k));b.bodyLow=Math.min(b.bodyLow,get(0,k),get(3,k));b.volume+=get(7,k)}}bars.push(b);
   for(const slot of slots)if(!slot.active){const s=candidate(slot.h,i);if(s){out.push(s);slot.active=s}}
  }
  return out;
 }
 return {scan,horizons};
})();
if(typeof module!=='undefined')module.exports=PriceShelves;
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope)self.onmessage=e=>{try{const {data,n,first}=e.data;self.postMessage({shelves:PriceShelves.scan(data,n,first)})}catch(error){self.postMessage({error:String(error)})}};
