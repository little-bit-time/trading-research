(() => {
  const events = window.PUMP_ATLAS_DATA.events;
  const universe = window.PUMP_ATLAS_DATA.universe;
  const latestGroups = universe.latestGroups;
  const sectionOrder = ['≤1 млн','1–5 млн','5–10 млн','10–25 млн','25–50 млн','50–100 млн','>100 млн'];
  const colors = ['#5cdeed','#87f1c2','#c2eb72','#ffcf66','#ff9c5c','#ff6b77','#c49aff'];
  const colorOf = section => colors[sectionOrder.indexOf(section)] ?? '#fff';
  const exchanges = ['Binance','Bybit','Gate','KuCoin','MEXC'];
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtMoney = value => value >= 1e9 ? `${(value/1e9).toFixed(2)} млрд` : value >= 1e6 ? `${(value/1e6).toFixed(2)} млн` : value >= 1e3 ? `${Math.round(value/1e3)} тыс.` : `${Math.round(value)}`;
  const fmtX = value => `${value.toFixed(value >= 10 ? 1 : 2)}x`;
  const fmtPct = value => value == null ? '—' : `${(100*value).toFixed(1)}%`;
  const fmtDuration = hours => hours < 48 ? `${hours.toFixed(1)} ч` : `${(hours/24).toFixed(1)} д`;
  const fmtDate = value => new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(value)).replace(',',' ·')+' UTC';
  const quantile = (values,q) => { const a=[...values].filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null; const p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p); return a[l]+(a[h]-a[l])*(p-l); };

  $('exchangeChecks').innerHTML = exchanges.map(x=>`<label class="exchange-chip"><input type="checkbox" value="${x}"><span>${x}</span></label>`).join('');
  $('legend').innerHTML = sectionOrder.map((x,i)=>`<span class="legend-item"><i class="dot" style="background:${colors[i]}"></i>${x}</span>`).join('');
  $('heroFacts').innerHTML = [
    ['163','подтверждённых x2'],['145','production-групп'],['2,36x','медиана max 14d'],['23,5%','групп дали x2 за период']
  ].map(([v,l])=>`<div class="fact"><strong>${v}</strong><span>${l}</span></div>`).join('');

  const state = {search:'',minVolume:0,maxVolume:Infinity,exchanges:new Set(),exchangeMode:'all',strength:2,horizon:14,sort:'volume'};
  const volumeMatches = value => value >= state.minVolume && value <= state.maxVolume;
  const exchangesMatch = values => {
    if (!state.exchanges.size) return true;
    const present = values instanceof Array ? new Set(values) : new Set(Object.keys(values));
    const selected = [...state.exchanges];
    return state.exchangeMode === 'all' ? selected.every(x => present.has(x)) : selected.some(x => present.has(x));
  };
  function value(event){ return state.horizon===30 ? event.max30 : event.max14; }
  function duration(event){ return state.horizon===30 ? event.hoursToHigh30 : event.hoursToHigh14; }
  function filtered(){
    let rows=events.filter(e => (!state.search || e.coin.toLowerCase().includes(state.search))
      && volumeMatches(e.totalVolume)
      && exchangesMatch(e.byExchange)
      && value(e)>=state.strength
      && (state.horizon!==30 || e.followupComplete));
    const compare={volume:(a,b)=>a.totalVolume-b.totalVolume,strength:(a,b)=>value(b)-value(a),duration:(a,b)=>duration(a)-duration(b),date:(a,b)=>Date.parse(b.baseTime)-Date.parse(a.baseTime)}[state.sort];
    return rows.sort(compare);
  }

  function filteredPool(){
    return latestGroups.filter(group => (!state.search || group.coin.toLowerCase().includes(state.search))
      && volumeMatches(group.totalVolume)
      && exchangesMatch(group.exchanges));
  }

  function renderSummary(rows, pool){
    const complete=rows.filter(x=>x.followupComplete);
    const byGroup = new Set(rows.map(x => x.id.split('-').slice(0, -1).join('-')));
    const values=rows.map(value);
    $('summaryStrip').innerHTML=[
      [rows.length,'памп-событий в фильтре'],[byGroup.size,'групп с пампами'],[`${pool.length} / ${universe.latestEligibleGroupCount}`,`групп на срезе ${universe.latestDate.slice(5).split('-').reverse().join('.')}`],
      [fmtPct(rows.length/events.length),'сохранено всех пампов'],[values.length?fmtX(quantile(values,.5)):'—',`медиана max ${state.horizon}d`],[complete.length,'полных 30d окон']
    ].map(([v,l])=>`<div class="metric"><strong>${v}</strong><span>${l}</span></div>`).join('');
    $('tableTitle').textContent=`${rows.length} ${rows.length===1?'памп':'пампов'}`;
    const selected=[...state.exchanges];
    const exchangeText=!selected.length?'без ограничения по биржам':selected.length===1?`присутствует ${selected[0]}`:state.exchangeMode==='all'?`присутствуют все: ${selected.join(', ')}`:`присутствует хотя бы одна: ${selected.join(', ')}`;
    const min=fmtMoney(state.minVolume),max=Number.isFinite(state.maxVolume)?fmtMoney(state.maxVolume):'∞';
    const missing=universe.groupCount-universe.latestEligibleGroupCount;
    $('poolNote').innerHTML=`<strong>Знаменатель:</strong> ${pool.length} production-групп на срезе ${universe.latestDate}, оборот ${min}–${max} USDT/сутки, ${exchangeText}. Сила и горизонт пампа на этот счётчик не влияют. Из ${universe.groupCount} production-групп сопоставимый latest-профиль spot+futures есть у ${universe.latestEligibleGroupCount}; ещё ${missing} не вошли из-за неполных данных на эту дату. Это размер пула на одну дату, а не вероятность: пампы собраны за весь трёхмесячный период.`;
  }

  function renderScatter(rows){
    const svg=$('scatter'), W=1200,H=480, pad={l:78,r:24,t:20,b:58};
    const xMin=4.5,xMax=9.5,yMin=Math.log10(1.9),yMax=Math.log10(42);
    const x=v=>pad.l+(Math.log10(v)-xMin)/(xMax-xMin)*(W-pad.l-pad.r);
    const y=v=>H-pad.b-(Math.log10(v)-yMin)/(yMax-yMin)*(H-pad.t-pad.b);
    const xTicks=[1e5,1e6,1e7,1e8,1e9], yTicks=[2,3,5,10,20,40];
    let html=xTicks.map(v=>`<line class="grid-line" x1="${x(v)}" y1="${pad.t}" x2="${x(v)}" y2="${H-pad.b}"/><text class="axis-text" x="${x(v)}" y="${H-pad.b+24}" text-anchor="middle">${fmtMoney(v)}</text>`).join('');
    html+=yTicks.map(v=>`<line class="grid-line" x1="${pad.l}" y1="${y(v)}" x2="${W-pad.r}" y2="${y(v)}"/><text class="axis-text" x="${pad.l-12}" y="${y(v)+4}" text-anchor="end">${v}x</text>`).join('');
    html+=`<text class="axis-title" x="${(pad.l+W-pad.r)/2}" y="${H-8}" text-anchor="middle">Суммарный оборот группы до старта, USDT/сутки</text><text class="axis-title" transform="translate(18 ${(pad.t+H-pad.b)/2}) rotate(-90)" text-anchor="middle">Максимальное движение</text>`;
    const medians=sectionOrder.map(s=>{const r=rows.filter(e=>e.section===s);return r.length?[quantile(r.map(e=>e.totalVolume),.5),quantile(r.map(value),.5)]:null}).filter(Boolean);
    if(medians.length>1) html+=`<path class="trend" d="${medians.map((p,i)=>`${i?'L':'M'}${x(p[0])},${y(p[1])}`).join(' ')}"/>`;
    html+=rows.map(e=>{const r=Math.min(12,4+Math.sqrt(Math.max(0,duration(e)))/5);return `<circle class="plot-dot" tabindex="0" data-id="${e.id}" cx="${x(e.totalVolume)}" cy="${y(value(e))}" r="${r}" fill="${colorOf(e.section)}"><title>${e.coin} · ${fmtMoney(e.totalVolume)} · ${fmtX(value(e))} · до high ${fmtDuration(duration(e))}</title></circle>`}).join('');
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.innerHTML=html;
    svg.querySelectorAll('.plot-dot').forEach(el=>{el.addEventListener('click',()=>openDetail(el.dataset.id));el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' ')openDetail(el.dataset.id)})});
  }

  function renderCards(rows){
    $('eventGrid').innerHTML=rows.length?rows.map(e=>{
      const c=colorOf(e.section),spot=e.totalVolume?100*e.spotVolume/e.totalVolume:0;
      return `<button class="event-card" data-id="${e.id}" style="--card-color:${c}"><div class="card-top"><span class="coin">${esc(e.coin)}</span><span class="multiple">${fmtX(value(e))}</span></div><div class="card-meta">${fmtDate(e.baseTime)} · ${esc(e.section)}</div><div class="volume-bar" title="spot ${spot.toFixed(1)}%, futures ${(100-spot).toFixed(1)}%"><i style="width:${spot}%;background:#5cdeed"></i><i style="width:${100-spot}%;background:#c49aff"></i></div><div class="card-stats"><div><strong>${fmtMoney(e.totalVolume)}</strong>оборот/сутки</div><div><strong>${fmtDuration(duration(e))}</strong>до high</div><div><strong>${e.availableMarkets}/${e.marketCount}</strong>рынков с историей</div><div><strong>${fmtPct(e.futuresShare)}</strong>доля futures</div></div></button>`;
    }).join(''):`<div class="empty">По этим фильтрам событий нет.</div>`;
    $('eventGrid').querySelectorAll('.event-card').forEach(el=>el.addEventListener('click',()=>openDetail(el.dataset.id)));
  }

  function insight(e){
    const concentration=e.largestExchangeShare>=.7?'оборот сильно сконцентрирован на одной бирже':e.largestExchangeShare>=.45?'одна биржа доминирует, но не монопольно':'оборот распределён между биржами';
    const speed=e.hoursToHigh14<=24?'резкий памп менее чем за сутки':e.hoursToHigh14<=168?'волна развивалась до недели':'медленная волна дольше недели';
    const extension=e.followupComplete?(e.extension>=1.2?`после 14-го дня high вырос ещё в ${e.extension.toFixed(2)} раза`:'основной high сформирован в первые 14 дней'):'30-дневное окно цензурировано концом архива';
    return `${speed}; ${concentration}; ${extension}.`;
  }

  function openDetail(id){
    const e=events.find(x=>x.id===id); if(!e)return;
    const exchangeRows=exchanges.filter(x=>Object.hasOwn(e.byExchange,x)).map(exchange=>{
      const total=e.byExchange[exchange],spot=e.byExchangeType[`${exchange}/spot`]??0,futures=e.byExchangeType[`${exchange}/futures`]??0;
      return `<div class="exchange-row"><strong>${exchange}</strong><div class="exchange-track"><i title="spot" style="width:${100*spot/e.totalVolume}%;background:#5cdeed"></i><i title="futures" style="width:${100*futures/e.totalVolume}%;background:#c49aff"></i></div><span class="exchange-value">${fmtMoney(total)}</span></div>`;
    }).join('');
    const marketRows=[...e.markets].sort((a,b)=>(b.dailyMedian??-1)-(a.dailyMedian??-1)).map(m=>`<tr class="${m.available?'':'unavailable'}"><td>${esc(m.exchange)}</td><td>${esc(m.type)}</td><td>${esc(m.symbol)}</td><td>${esc(m.quote)}</td><td>${m.available?fmtMoney(m.dailyMedian):'нет 5/7 дней'}</td><td>${m.dailyMean==null?'—':fmtMoney(m.dailyMean)}</td><td>${m.minuteMedian==null?'—':fmtMoney(m.minuteMedian)}</td><td>${fmtPct(m.coverage)}</td></tr>`).join('');
    $('detailContent').innerHTML=`<article class="detail"><div class="detail-title"><h2>${esc(e.coin)}</h2><span class="badge">${esc(e.section)}</span><span class="badge">${fmtDate(e.baseTime)}</span></div><div class="detail-kpis"><div class="metric"><strong>${fmtX(e.max14)}</strong><span>max за 14 дней</span></div><div class="metric"><strong>${e.followupComplete?fmtX(e.max30):fmtX(e.max30)+'*'}</strong><span>max за 30 дней</span></div><div class="metric"><strong>${fmtDuration(e.hoursToHigh14)}</strong><span>от основания до high 14d</span></div><div class="metric"><strong>${fmtMoney(e.totalVolume)}</strong><span>суммарно до пампа/сутки</span></div><div class="metric"><strong>${fmtDuration(e.hoursTo2x)}</strong><span>до первого касания 2x</span></div><div class="metric"><strong>${fmtPct(e.futuresShare)}</strong><span>доля futures</span></div><div class="metric"><strong>${fmtPct(e.largestExchangeShare)}</strong><span>крупнейшая биржа</span></div><div class="metric"><strong>${e.availableMarkets}/${e.marketCount}</strong><span>рынков с 5/7 днями</span></div></div><section class="detail-section"><div class="insight">${insight(e)}</div></section><section class="detail-section"><h3>Хронология</h3><div class="card-stats"><div><strong>${fmtDate(e.baseTime)}</strong>основание</div><div><strong>${fmtDate(e.first2xTime)}</strong>первое 2x</div><div><strong>${fmtDate(e.max14Time)}</strong>high 14d</div><div><strong>${fmtDate(e.max30Time)}</strong>high 30d${e.followupComplete?'':' · окно неполное'}</div></div></section><section class="detail-section"><h3>Предпамповый оборот по биржам · spot / futures</h3>${exchangeRows}<div class="chart-note">Биржевые полосы имеют общий масштаб относительно total группы. Голубой — spot, фиолетовый — futures.</div></section><section class="detail-section"><h3>Каждый рынок отдельно</h3><table class="markets"><thead><tr><th>Биржа</th><th>Тип</th><th>Рынок</th><th>Quote</th><th>Медиана/сутки</th><th>Среднее/сутки</th><th>Медиана/мин</th><th>Покрытие</th></tr></thead><tbody>${marketRows}</tbody></table></section></article>`;
    $('detail').showModal(); history.replaceState(null,'',`#event=${encodeURIComponent(e.id)}`);
  }

  function render(){const rows=filtered(),pool=filteredPool();renderSummary(rows,pool);renderScatter(rows);renderCards(rows)}
  [['search','search'],['strength','strength'],['horizon','horizon'],['sort','sort'],['exchangeMode','exchangeMode']].forEach(([id,key])=>$(id).addEventListener(id==='search'?'input':'change',ev=>{state[key]=['strength','horizon'].includes(key)?Number(ev.target.value):(key==='search'?ev.target.value.toLowerCase():ev.target.value);render()}));
  [['minVolume','minVolume',0],['maxVolume','maxVolume',Infinity]].forEach(([id,key,fallback])=>$(id).addEventListener('input',ev=>{const value=ev.target.value.trim()===''?fallback:Number(ev.target.value)*1e6;state[key]=Number.isFinite(value)?value:fallback;render()}));
  $('exchangeChecks').addEventListener('change',ev=>{if(!ev.target.matches('input[type=checkbox]'))return;ev.target.checked?state.exchanges.add(ev.target.value):state.exchanges.delete(ev.target.value);render()});
  $('reset').addEventListener('click',()=>{Object.assign(state,{search:'',minVolume:0,maxVolume:Infinity,exchanges:new Set(),exchangeMode:'all',strength:2,horizon:14,sort:'volume'});['search','minVolume','maxVolume'].forEach(id=>$(id).value='');$('exchangeChecks').querySelectorAll('input').forEach(x=>x.checked=false);$('exchangeMode').value='all';$('strength').value='2';$('horizon').value='14';$('sort').value='volume';render()});
  $('closeDetail').addEventListener('click',()=>{$('detail').close();history.replaceState(null,'',location.pathname)});$('detail').addEventListener('click',ev=>{if(ev.target===$('detail'))$('closeDetail').click()});
  render();
  const hash=new URLSearchParams(location.hash.slice(1)); if(hash.get('event'))openDetail(hash.get('event'));
})();
