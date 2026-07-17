// ============================================================
// Firebase (optional shared backend). Firestore makes signals and
// subscribers visible to every visitor instead of just the current
// browser. Until FIREBASE_CONFIG below is filled in with a real
// project, the app runs entirely on localStorage + seed data.
//
// To enable it:
//   1. console.firebase.google.com -> Add project (free Spark plan).
//   2. Build > Firestore Database -> Create database -> production
//      mode (any region).
//   3. Rules tab, paste (demo-only; a real deployment needs proper
//      auth-scoped rules instead of wide-open access):
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /{document=**} { allow read, write: if true; }
//          }
//        }
//   4. Project settings -> General -> Your apps -> Web app -> copy
//      the firebaseConfig object into FIREBASE_CONFIG below.
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

let db = null;
async function initFirebase(){
  if(!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) return;
  try{
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
  }catch(e){ db = null; }
}

// ---------------- seed data (from the real desk history) ----------------
const SEED_SIGNALS = [
  { sno:1, underlying:'BANKNIFTY', category:'INTRADAY', strike:'76800', type:'PE', above:145, sl:135, targets:[155,170], now:140, sell:135, createdAt:'2026-07-15T14:56:00.000Z' },
  { sno:2, underlying:'BANKNIFTY', category:'INTRADAY', strike:'77300', type:'CE', above:150, sl:145, targets:[170], now:145, sell:170, createdAt:'2026-07-15T15:06:00.000Z' },
  { sno:3, underlying:'BANKNIFTY', category:'INTRADAY', strike:'77300', type:'CE', above:150, sl:145, targets:[170], now:145, sell:160, createdAt:'2026-07-15T15:06:00.000Z' },
  { sno:4, underlying:'BANKNIFTY', category:'INTRADAY', strike:'77300', type:'CE', above:182, sl:170, targets:[200,215], now:176, sell:200, createdAt:'2026-07-15T15:06:00.000Z' },
  { sno:5, underlying:'BANKNIFTY', category:'INTRADAY', strike:'77200', type:'PE', above:160, sl:150, targets:[175], now:156, sell:170, createdAt:'2026-07-15T15:06:00.000Z' },
  { sno:6, underlying:'BANKNIFTY', category:'INTRADAY', strike:'77700', type:'CE', above:185, sl:170, targets:[200,230,250], now:175, sell:255, createdAt:'2026-07-15T15:06:00.000Z' },
];

// ---------------- storage: Firestore -> localStorage -> seed ----------------
// Every call is wrapped so a network hiccup or missing config can never
// throw past this layer -- callers always get back an array.
async function loadSignals(){
  if(db){
    try{
      const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      const snap = await getDocs(collection(db, 'signals'));
      if(!snap.empty){
        const list = snap.docs.map(d => d.data());
        list.sort((a,b) => a.sno - b.sno);
        try{ localStorage.setItem('thc_signals', JSON.stringify(list)); }catch(e){}
        return list;
      }
    }catch(e){ /* fall through to local cache / seed */ }
  }
  try{
    const raw = localStorage.getItem('thc_signals');
    if(raw){ const list = JSON.parse(raw); if(Array.isArray(list) && list.length) return list; }
  }catch(e){}
  // first run anywhere (empty Firestore + empty localStorage): seed with desk history
  try{ for(const s of SEED_SIGNALS) await saveSignal(s); }catch(e){}
  return SEED_SIGNALS;
}

async function saveSignal(signal){
  try{
    const raw = localStorage.getItem('thc_signals');
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(s => s.sno === signal.sno);
    if(idx === -1) list.push(signal); else list[idx] = signal;
    localStorage.setItem('thc_signals', JSON.stringify(list));
  }catch(e){}
  if(db){
    try{
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      await setDoc(doc(db, 'signals', String(signal.sno)), signal);
    }catch(e){}
  }
  return true;
}

async function loadSubscribers(){
  if(db){
    try{
      const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      const snap = await getDocs(collection(db, 'subscribers'));
      const list = snap.docs.map(d => d.data());
      try{ localStorage.setItem('thc_subscribers', JSON.stringify(list)); }catch(e){}
      return list;
    }catch(e){ /* fall through */ }
  }
  try{
    const raw = localStorage.getItem('thc_subscribers');
    if(raw){ const list = JSON.parse(raw); if(Array.isArray(list)) return list; }
  }catch(e){}
  return [];
}

async function saveSubscriber(sub){
  try{
    const raw = localStorage.getItem('thc_subscribers');
    const list = raw ? JSON.parse(raw) : [];
    if(!list.find(s => s.contact === sub.contact)) list.push(sub);
    localStorage.setItem('thc_subscribers', JSON.stringify(list));
  }catch(e){}
  if(db){
    try{
      const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      await setDoc(doc(db, 'subscribers', sub.contact), sub);
    }catch(e){}
  }
}

// ---------------- parsing ----------------
function parseSignalText(text){
  const t = text;
  const result = { targets: [] };
  let m;
  m = t.match(/(\d{3,6})\s*(ce|pe)/i);
  if(m){ result.strike = m[1]; result.type = m[2].toUpperCase(); }
  m = t.match(/above\D{0,3}(\d+(\.\d+)?)/i);
  if(m) result.above = parseFloat(m[1]);
  m = t.match(/\bsl\D{0,3}(\d+(\.\d+)?)/i);
  if(m) result.sl = parseFloat(m[1]);
  m = t.match(/\bnow\D{0,3}(\d+(\.\d+)?)/i);
  if(m) result.now = parseFloat(m[1]);
  m = t.match(/(?:trgt|target)s?\D{0,3}([\d.,\s]+)/i);
  if(m){ result.targets = m[1].split(/[,\s]+/).map(x => parseFloat(x)).filter(x => !isNaN(x)).slice(0,3); }
  m = t.match(/sell(?:ing)?\s*price\D{0,3}(\d+(\.\d+)?)/i);
  if(m) result.sell = parseFloat(m[1]);
  return result;
}

// ---------------- stats ----------------
function computeStats(signals){
  const closed = signals.filter(s => s.sell !== undefined && s.sell !== null);
  const wins = closed.filter(s => s.sell >= s.above);
  const losses = closed.filter(s => s.sell < s.above);
  const open = signals.length - closed.length;
  const plList = closed.map(s => (s.sell - s.above) / s.above);
  const totalPl = plList.reduce((a,b) => a+b, 0);
  const avgPl = plList.length ? totalPl/plList.length : 0;
  const winRate = closed.length ? wins.length/closed.length : 0;
  return { total: signals.length, wins: wins.length, losses: losses.length, open, winRate, totalPl, avgPl, plList };
}
function fmtPct(x){ return (x*100).toFixed(1)+'%'; }
function exchangeFor(underlying){ return underlying === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO'; }
function displayName(s){
  const typeWord = s.type === 'CE' ? 'CALL' : 'PUT';
  return `${s.underlying || 'BANKNIFTY'} ${s.strike} ${typeWord}`;
}
function escapeHtml(str){ return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ---------------- card rendering ----------------
function signalCardHTML(s){
  const closed = s.sell !== undefined && s.sell !== null;
  const above = s.above, now = s.now, sell = s.sell;
  const target1 = (s.targets && s.targets[0]) || above;
  const exch = exchangeFor(s.underlying);

  if(!closed){
    const potential = above ? ((target1 - above)/above)*100 : 0;
    const inLoss = now < above;
    const chgPct = above ? ((now - above) / above) * 100 : 0;
    const range = target1 - (s.sl || (above*0.9));
    let pos = range !== 0 ? ((now - (s.sl || above*0.9)) / range) * 100 : 50;
    pos = Math.max(5, Math.min(95, pos));
    return `
    <div class="signal-card">
      <div class="tagrow">
        <span class="tag tag-intraday">${s.category || 'INTRADAY'}</span>
        <span class="tag tag-exchange">${exch}</span>
      </div>
      <div class="sig-head">
        <div class="sig-head-l">
          <div class="sig-avatar">${(s.underlying||'B')[0]}</div>
          <div class="sig-name">${displayName(s)}</div>
        </div>
        <div class="sig-price">
          <div class="p mono">₹${now ?? '—'}</div>
          <div class="chg ${inLoss?'down':'up'}">${inLoss?'▼':'▲'} ${Math.abs(chgPct).toFixed(2)}%</div>
        </div>
      </div>
      <div class="livebadge"><span class="d"></span>Live</div>
      <div class="track"><div class="node" style="left:${pos}%;background:${inLoss?'var(--red)':'var(--gold)'};"></div></div>
      <div class="tracklbls">
        <div>SL<div class="t">${s.sl ?? '—'}</div></div>
        <div class="mid">Entry<div class="t">${above}</div></div>
        <div style="text-align:right;">Target<div class="t">${(s.targets||[]).join(', ') || '—'}</div></div>
      </div>
      <div class="statgrid">
        <div><div class="lbl">Potential Profit</div><div class="val gold">${potential.toFixed(2)}%</div></div>
        <div><div class="lbl">Status</div><div class="val ${inLoss?'red':'gold'}">${inLoss?'In Loss':'In Profit'}</div></div>
        <div><div class="lbl">Entry Price</div><div class="val mono">₹${above}</div></div>
        <div><div class="lbl">Now Price</div><div class="val mono">₹${now ?? '—'}</div></div>
      </div>
    </div>`;
  }

  const win = sell >= above;
  const gainLoss = ((sell-above)/above)*100;
  const rr = (s.sl && target1 !== above) ? Math.abs((target1-above)/(above-s.sl)) : null;
  const statusLabel = win ? 'Closed In Profit' : (gainLoss > -1 ? 'Closed In Partial Loss' : 'Closed In Loss');
  const statusClass = win ? 'status-profit' : (gainLoss > -1 ? 'status-partial' : 'status-loss');
  return `
  <div class="signal-card closed">
    <div class="tagrow">
      <span class="tag tag-intraday">${s.category || 'INTRADAY'}</span>
      <span class="tag tag-exchange">${exch}</span>
    </div>
    <div class="sig-head">
      <div class="sig-head-l">
        <div class="sig-avatar">${(s.underlying||'B')[0]}</div>
        <div class="sig-name">${displayName(s)}</div>
      </div>
    </div>
    <div class="status-banner ${statusClass}">Trade Status: ${statusLabel}</div>
    <div class="statgrid">
      <div><div class="lbl">Gain/Loss</div><div class="val ${win?'gold':'red'}">${gainLoss.toFixed(2)}%</div></div>
      <div><div class="lbl">R/R Ratio</div><div class="val">${rr ? '1:'+rr.toFixed(2) : '—'}</div></div>
      <div><div class="lbl">Entry</div><div class="val mono">₹${above}</div></div>
      <div><div class="lbl">Exit</div><div class="val mono">₹${sell}</div></div>
    </div>
  </div>`;
}

function compactClosedRowHTML(s){
  const win = s.sell >= s.above;
  const gainLoss = ((s.sell - s.above) / s.above) * 100;
  return `
  <div class="compact-row">
    <div class="c-col c-name">${s.underlying||'BANKNIFTY'} ${s.strike}<span class="c-type">${s.type}</span></div>
    <div class="c-col c-num">₹${s.above}</div>
    <div class="c-col c-num">₹${s.sell}</div>
    <div class="c-col c-num ${win?'gold':'red'}">${gainLoss>=0?'+':''}${gainLoss.toFixed(1)}%</div>
    <div class="c-col c-pill"><span class="pill-mini ${win?'pill-mini-win':'pill-mini-loss'}">${win?'WIN':'LOSS'}</span></div>
  </div>`;
}

// ---------------- state ----------------
let signalsCache = [];
let subscribersCache = [];
let subscriberSession = null;
let adminSession = false;
let pieChart, lineChart;

async function refreshData(){
  signalsCache = await loadSignals();
  subscribersCache = await loadSubscribers();
}

// ---------------- render ----------------
function renderCompactList(elId, closedSignals, emptyMsg){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML = closedSignals.length
    ? '<div class="compact-list"><div class="compact-header"><div class="c-col c-name">Instrument</div><div class="c-col">Entry</div><div class="c-col">Exit</div><div class="c-col">P&amp;L %</div><div class="c-col c-pill">Result</div></div>' + closedSignals.map(compactClosedRowHTML).join('') + '</div>'
    : `<div class="miniempty">${emptyMsg}</div>`;
}

function renderCardFeed(elId, list, emptyMsg){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML = list.length ? list.map(signalCardHTML).join('') : `<div class="miniempty">${emptyMsg}</div>`;
}

function renderAll(){
  const stats = computeStats(signalsCache);

  document.getElementById('heroWinRate').textContent = fmtPct(stats.winRate);
  document.getElementById('heroTotalSignals').textContent = stats.total;
  const heroPlEl = document.getElementById('heroTotalPl');
  heroPlEl.textContent = fmtPct(stats.totalPl);
  heroPlEl.style.color = stats.totalPl >= 0 ? 'var(--gold-bright)' : 'var(--red)';

  const promo = document.getElementById('homePromo');
  if(subscriberSession){
    promo.innerHTML = `<div class="h">✅ You're on the live list</div><div class="s">Signed in as ${escapeHtml(subscriberSession.name)}. New signals appear here the moment the desk calls them.</div>`;
  } else {
    promo.innerHTML = `<div class="h">🔔 Get every signal, the moment it's called</div><div class="s">Register Premium to unlock the live feed and desk performance.</div><button class="cta" data-goto="settings">Register Premium →</button>`;
  }

  const openSignals = signalsCache.filter(s => s.sell === undefined || s.sell === null);
  const closedSignals = signalsCache.filter(s => s.sell !== undefined && s.sell !== null).slice().reverse();

  // Home: a handful of recent results as proof of the accuracy claim above
  renderCompactList('homeRecent', closedSignals.slice(0,4), 'No closed calls yet.');

  // Signals: ongoing on top as full cards, past below as a plain list -- no tabs
  renderCardFeed('sigOngoingFeed', openSignals, 'No ongoing signals yet.');
  renderCompactList('sigPastList', closedSignals, 'No closed signals yet.');

  // Past Signals: the full track record with stats + charts
  renderCompactList('pastFeed', closedSignals, 'No closed signals yet.');

  document.getElementById('pfTotal').textContent = stats.total;
  document.getElementById('pfWinRate').textContent = fmtPct(stats.winRate);
  document.getElementById('pfTotalPl').textContent = fmtPct(stats.totalPl);
  document.getElementById('pfAvg').textContent = fmtPct(stats.avgPl);

  document.getElementById('subCount').textContent = subscribersCache.length;
  document.getElementById('subTableBody').innerHTML = subscribersCache.map(s =>
    `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.contact)}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="miniempty">No subscribers yet</td></tr>';

  renderCharts(stats);
}

function renderCharts(stats){
  const pieCtx = document.getElementById('pieChart');
  const lineCtx = document.getElementById('lineChart');
  if(!pieCtx || !lineCtx || typeof Chart === 'undefined') return;
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: { labels: ['Win','Loss','Open'], datasets: [{ data: [stats.wins, stats.losses, stats.open], backgroundColor: ['#D4AF37','#E5484D','#2A2617'], borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#9C917A', font: { size: 11 } } } } }
  });
  let cum = 0;
  const cumData = stats.plList.map(x => (cum += x) * 100);
  if(lineChart) lineChart.destroy();
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: { labels: cumData.map((_,i) => 'T'+(i+1)), datasets: [{ data: cumData, borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,.1)', fill: true, tension: .25, pointRadius: 3 }] },
    options: { plugins: { legend: { display: false } }, scales: {
      x: { ticks: { color: '#9C917A', font: { size: 10 } }, grid: { color: '#2E2712' } },
      y: { ticks: { color: '#9C917A', font: { size: 10 }, callback: v => v+'%' }, grid: { color: '#2E2712' } }
    } }
  });
}

// ---------------- actions ----------------
async function registerSubscriber(){
  const name = document.getElementById('regName').value.trim();
  const contact = document.getElementById('regContact').value.trim();
  const msg = document.getElementById('regMsg');
  if(!name || !contact){ msg.className = 'msg err'; msg.textContent = 'Enter your name and contact.'; return; }
  let existing = subscribersCache.find(s => s.contact === contact);
  if(!existing){
    existing = { name, contact, joinedAt: new Date().toISOString() };
    subscribersCache.push(existing);
    await saveSubscriber(existing);
  }
  subscriberSession = existing;
  msg.className = 'msg'; msg.textContent = 'Signed in!';
  updateAuthUI();
  renderAll();
}
function subscriberLogout(){ subscriberSession = null; updateAuthUI(); renderAll(); }

function updateAuthUI(){
  document.getElementById('settingsLoggedOut').style.display = subscriberSession ? 'none' : 'block';
  document.getElementById('settingsLoggedIn').style.display = subscriberSession ? 'block' : 'none';
  if(subscriberSession){
    document.getElementById('profName').textContent = subscriberSession.name;
    document.getElementById('profContact').textContent = subscriberSession.contact;
  }
}

async function addSignal(){
  const text = document.getElementById('signalText').value;
  const msg = document.getElementById('addMsg');
  const parsed = parseSignalText(text);
  if(!parsed.strike || !parsed.type || parsed.above === undefined){
    msg.className = 'msg err'; msg.textContent = 'Could not read that — check instrument, CE/PE, Above and Now are present.'; return;
  }
  const category = 'INTRADAY';
  const underlying = parseInt(parsed.strike,10) < 30000 ? 'NIFTY' : 'BANKNIFTY';
  const sno = signalsCache.length ? Math.max(...signalsCache.map(s => s.sno))+1 : 1;
  const signal = {
    sno, underlying, category, strike: parsed.strike, type: parsed.type, above: parsed.above,
    sl: parsed.sl ?? null, targets: parsed.targets, now: parsed.now ?? null,
    sell: parsed.sell !== undefined ? parsed.sell : null,
    createdAt: new Date().toISOString()
  };
  signalsCache.push(signal);
  await saveSignal(signal);
  msg.className = 'msg'; msg.textContent = `Added ${underlying} ${parsed.strike} as signal #${sno}.`;
  document.getElementById('signalText').value = '';
  renderAll();
}

async function recordExit(){
  const sno = parseInt(document.getElementById('exitSno').value,10);
  const price = parseFloat(document.getElementById('exitPrice').value);
  const msg = document.getElementById('exitMsg');
  if(isNaN(sno) || isNaN(price)){ msg.className = 'msg err'; msg.textContent = 'Enter a valid S.No and price.'; return; }
  const idx = signalsCache.findIndex(s => s.sno === sno);
  if(idx === -1){ msg.className = 'msg err'; msg.textContent = 'No signal with that S.No.'; return; }
  signalsCache[idx].sell = price;
  await saveSignal(signalsCache[idx]);
  msg.className = 'msg'; msg.textContent = `Signal #${sno} updated with exit price ${price}.`;
  document.getElementById('exitSno').value = ''; document.getElementById('exitPrice').value = '';
  renderAll();
}

function adminLogin(){
  const pass = document.getElementById('adminPass').value;
  const msg = document.getElementById('adminMsg');
  if(pass === 'desk2026'){
    adminSession = true;
    document.getElementById('adminLoggedOut').style.display = 'none';
    document.getElementById('adminLoggedIn').style.display = 'block';
  } else { msg.textContent = 'Incorrect password.'; }
}
function adminLogout(){
  adminSession = false;
  document.getElementById('adminLoggedOut').style.display = 'block';
  document.getElementById('adminLoggedIn').style.display = 'none';
}

// ---------------- nav ----------------
const pageTitles = { home: 'Home', signals: 'Signals', pastsignals: 'Past Signals', settings: 'Settings' };

function goTo(page){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.bottom-nav button, .top-nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.bottom-nav button[data-page="${page}"], .top-nav button[data-page="${page}"]`).forEach(b => b.classList.add('active'));
  document.getElementById('topTitle').textContent = pageTitles[page] || 'Home';
  window.scrollTo(0,0);
}

function wireEvents(){
  // delegated: covers both the static nav/icon buttons present at load time
  // and buttons re-created later via innerHTML (e.g. the home promo CTA)
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('.bottom-nav [data-page], .top-nav [data-page]');
    if(navBtn){ goTo(navBtn.getAttribute('data-page')); return; }
    const gotoBtn = e.target.closest('[data-goto]');
    if(gotoBtn){ goTo(gotoBtn.getAttribute('data-goto')); return; }
  });
  document.getElementById('registerBtn').addEventListener('click', registerSubscriber);
  document.getElementById('subscriberLogoutBtn').addEventListener('click', subscriberLogout);
  document.getElementById('adminLoginBtn').addEventListener('click', adminLogin);
  document.getElementById('adminLogoutBtn').addEventListener('click', adminLogout);
  document.getElementById('addSignalBtn').addEventListener('click', addSignal);
  document.getElementById('recordExitBtn').addEventListener('click', recordExit);
}

// ---------------- init ----------------
(async function init(){
  try{ await initFirebase(); }catch(e){ db = null; }
  wireEvents();
  updateAuthUI();
  try{ await refreshData(); }catch(e){ signalsCache = SEED_SIGNALS; subscribersCache = []; }
  renderAll();
})();
