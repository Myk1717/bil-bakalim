import { APP } from '../app.config.js';
import './style.css';

/* ---------- temel yardımcılar ---------- */
const EVENTS_URL = (import.meta.env.VITE_EVENTS_URL || '').trim();
const $app = document.getElementById('app');

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('bb:' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('bb:' + k, JSON.stringify(v));
    } catch {}
  },
};

const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
      });

let deviceId = store.get('device', null);
if (!deviceId) {
  deviceId = uuid();
  store.set('device', deviceId);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// tarihe bağlı sabit rastgelelik (herkese aynı günlük set)
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const todayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const shareUrl = () => location.origin + location.pathname;

/* ---------- seri (streak) ---------- */
function streakNow() {
  const s = store.get('streak', null);
  if (!s || !s.last) return 0;
  return dayDiff(s.last, todayStr()) <= 1 ? s.count : 0;
}
function bumpStreak() {
  const t = todayStr();
  const s = store.get('streak', { count: 0, last: null, best: 0 });
  if (s.last === t) return s.count;
  const count = s.last && dayDiff(s.last, t) === 1 ? s.count + 1 : 1;
  store.set('streak', { count, last: t, best: Math.max(count, s.best || 0) });
  return count;
}

/* ---------- anonim olay kaydı (çevrimdışı kuyruk) ---------- */
let queue = store.get('queue', []);
let flushing = false;
let flushTimer = null;

function track(type, data = {}) {
  const ev = { event_id: uuid(), ts: new Date().toISOString(), device_id: deviceId, type, app_v: APP.version };
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null && v !== '') ev[k] = v;
  queue.push(ev);
  if (queue.length > 1000) queue = queue.slice(-1000);
  store.set('queue', queue);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1200);
}

async function flush() {
  if (!EVENTS_URL || flushing || !queue.length || navigator.onLine === false) return;
  flushing = true;
  const batch = queue.slice(0, 100);
  let ok = false;
  try {
    // text/plain → tarayıcı ön kontrol (preflight) yapmaz, Apps Script ile sorunsuz çalışır
    const r = await fetch(EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ events: batch }),
    });
    if (r.ok) {
      const j = await r.json().catch(() => ({ ok: true }));
      ok = j.ok !== false;
    }
  } catch {}
  if (ok) {
    const sent = new Set(batch.map((e) => e.event_id));
    queue = queue.filter((e) => !sent.has(e.event_id));
    store.set('queue', queue);
  }
  flushing = false;
  if (ok && queue.length) flush();
}
window.addEventListener('online', flush);
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());

/* ---------- topluluk istatistikleri ---------- */
let stats = store.get('stats', { at: 0, q: {} });
async function loadStats() {
  if (!EVENTS_URL || Date.now() - stats.at < 10 * 60 * 1000) return;
  try {
    const r = await fetch(EVENTS_URL + (EVENTS_URL.includes('?') ? '&' : '?') + 'action=stats');
    const j = await r.json();
    if (j && j.q) {
      stats = { at: Date.now(), q: j.q };
      store.set('stats', stats);
    }
  } catch {}
}
// yalnızca yeterli cevap varsa döner; yoksa null (sahte yüzde yok)
const qStats = (id) => {
  const s = stats.q && stats.q[id];
  return s && s.n >= APP.statsMinAnswers ? s : null;
};

/* ---------- sorular ---------- */
let QUESTIONS = [];
const validQ = (q) =>
  q && q.id && q.q && Array.isArray(q.options) && q.options.length >= 2 &&
  Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length;

async function loadQuestions() {
  const r = await fetch('./questions.json', { cache: 'no-cache' });
  const data = await r.json();
  const list = Array.isArray(data) ? data : data.questions || [];
  const seen = new Set();
  QUESTIONS = list.filter((q) => validQ(q) && !seen.has(q.id) && seen.add(q.id));
}

function dailySet(date) {
  const sorted = QUESTIONS.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const chosen = shuffle(sorted, seeded('gunluk:' + date)).slice(0, Math.min(APP.dailyCount, sorted.length));
  return chosen.sort((a, b) => (a.level || 0) - (b.level || 0)).map((q) => q.id);
}

/* ---------- merdiven ---------- */
const LADDER_STEPS = 10;
const SAFE_STEPS = [3, 7];
const STEP_TITLES = ['Stajyer', 'Stajyer', 'Uzman Yardımcısı', 'Uzman Yardımcısı', 'Uzman', 'Uzman', 'Müdür', 'Müdür', 'Müdür', 'CEO'];
const TITLE_ORDER = ['Stajyer', 'Uzman Yardımcısı', 'Uzman', 'Müdür', 'CEO'];
const TITLE_EMOJI = { Stajyer: '🧃', 'Uzman Yardımcısı': '📎', Uzman: '🧠', Müdür: '💼', CEO: '👑' };

function ladderTitle(done, failed) {
  if (!failed) return done ? STEP_TITLES[done - 1] : 'Stajyer';
  const safe = SAFE_STEPS.filter((s) => s <= done).pop();
  return safe ? STEP_TITLES[safe - 1] : 'Stajyer';
}

function ladderPick(step) {
  let pool = QUESTIONS.filter((q) => !R.used.has(q.id));
  // havuz biterse önce atlanmış sorulara dön, sonra tekrar et — ama ekrandakini değil
  const curId = R.cur && R.cur.q.id;
  if (!pool.length) pool = QUESTIONS.filter((q) => R.skipped && R.skipped.has(q.id) && q.id !== curId);
  if (!pool.length) pool = QUESTIONS.filter((q) => q.id !== curId);
  if (!pool.length) pool = QUESTIONS;
  const dist = (q) => Math.abs((q.level || 1) - step);
  const best = Math.min(...pool.map(dist));
  return pick(pool.filter((q) => dist(q) === best));
}

/* ---------- tepkiler ---------- */
const GOOD = ['Bildin! 🎯', 'Vay be, tam isabet.', 'Helal olsun ✨', 'İşte bu! 🔥', 'Tık diye bildin.'];
const BAD = [
  'Çoğu kişi buna takılıyor.',
  'Bu soru çok kişiyi şaşırtıyor.',
  'Tuzak bir soruydu, takılman çok normal.',
  'Beyin kestirme yolu sever. Herkesinki.',
];

/* ---------- durum ---------- */
let screen = 'home';
let R = null; // aktif tur
let lastResult = null;

function startDaily() {
  const t = todayStr();
  const done = store.get('daily', null);
  if (done && done.date === t) {
    lastResult = { mode: 'gunluk', ...done };
    screen = 'dailyResult';
    return render();
  }
  const ids = dailySet(t);
  const prog = store.get('dailyProgress', null);
  const resume = prog && prog.date === t && prog.idx < ids.length;
  R = {
    mode: 'gunluk',
    ids,
    idx: resume ? prog.idx : 0,
    score: resume ? prog.score : 0,
    marks: resume ? prog.marks : [],
    used: new Set(),
    cur: null,
  };
  if (!resume) track('tur_basladi', { mode: 'gunluk' });
  present(QUESTIONS.find((q) => q.id === ids[R.idx]));
}

function startLadder() {
  R = { mode: 'merdiven', done: 0, over: false, used: new Set(), jokers: { fifty: true, crowd: true, skip: true }, cur: null };
  track('tur_basladi', { mode: 'merdiven' });
  present(ladderPick(1));
}

function present(q) {
  R.cur = {
    q,
    order: shuffle(q.options.map((_, i) => i)),
    shownAt: performance.now(),
    answered: null,
    removed: new Set(),
    crowd: false,
    jokers: [],
    voted: null,
    animated: false,
  };
  R.used.add(q.id);
  screen = 'question';
  render();
  window.scrollTo(0, 0);
}

function answer(displayIdx) {
  const c = R.cur;
  if (!c || c.answered) return;
  const orig = c.order[displayIdx];
  if (orig === undefined || c.removed.has(orig)) return;
  const ok = orig === c.q.answer;
  const ms = Math.round(performance.now() - c.shownAt);
  c.answered = { orig, ok, ms, msg: ok ? pick(GOOD) : pick(BAD) };
  track('cevap', {
    mode: R.mode,
    question_id: c.q.id,
    correct: ok,
    selected_option: orig,
    selected_text: c.q.options[orig],
    time_ms: ms,
    step: R.mode === 'merdiven' ? R.done + 1 : R.idx + 1,
    joker: c.jokers.join(','),
  });
  if (R.mode === 'gunluk') {
    if (ok) R.score++;
    R.marks.push(ok);
    store.set('dailyProgress', { date: todayStr(), idx: R.idx + 1, score: R.score, marks: R.marks });
  } else if (ok) R.done++;
  else R.over = true;
  render();
  requestAnimationFrame(() => document.querySelector('.fb')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function next() {
  if (R.mode === 'gunluk') {
    R.idx++;
    if (R.idx >= R.ids.length) return finishDaily();
    present(QUESTIONS.find((q) => q.id === R.ids[R.idx]));
  } else {
    if (R.over || R.done >= LADDER_STEPS) return finishLadder();
    present(ladderPick(R.done + 1));
  }
}

function useJoker(kind) {
  const c = R.cur;
  if (R.mode !== 'merdiven' || !R.jokers[kind] || c.answered) return;
  if (kind === 'fifty') {
    const wrong = c.order.filter((o) => o !== c.q.answer && !c.removed.has(o));
    shuffle(wrong).slice(0, Math.min(2, wrong.length - 1)).forEach((o) => c.removed.add(o));
  } else if (kind === 'crowd') {
    if (!qStats(c.q.id)) return;
    c.crowd = true;
  }
  R.jokers[kind] = false;
  track('joker', { mode: 'merdiven', question_id: c.q.id, joker: kind, step: R.done + 1 });
  if (kind === 'skip') {
    track('atla', { mode: 'merdiven', question_id: c.q.id, step: R.done + 1, time_ms: Math.round(performance.now() - c.shownAt) });
    (R.skipped || (R.skipped = new Set())).add(c.q.id);
    return present(ladderPick(R.done + 1));
  }
  c.jokers.push(kind);
  c.animated = true;
  render();
}

function finishDaily() {
  const t = todayStr();
  const streak = bumpStreak();
  const res = { date: t, score: R.score, total: R.ids.length, marks: R.marks };
  store.set('daily', res);
  store.set('dailyProgress', null);
  track('tur_bitti', { mode: 'gunluk', score: R.score });
  lastResult = { mode: 'gunluk', ...res, streak, roundId: 'gunluk:' + t };
  R = null;
  screen = 'dailyResult';
  render();
  window.scrollTo(0, 0);
}

function finishLadder() {
  const failed = R.over;
  const title = ladderTitle(R.done, failed);
  const best = store.get('ladderBest', null);
  if (!best || TITLE_ORDER.indexOf(title) > TITLE_ORDER.indexOf(best.title) || (best.title === title && R.done > best.done))
    store.set('ladderBest', { title, done: R.done });
  track('tur_bitti', { mode: 'merdiven', score: R.done });
  lastResult = { mode: 'merdiven', done: R.done, failed, title, roundId: uuid() };
  R = null;
  screen = 'ladderResult';
  render();
  window.scrollTo(0, 0);
}

/* ---------- ekranlar ---------- */
const topbar = (left) => `
  <header class="top">
    ${left}
    <div class="streak" title="Günlük tur serin">🔥 <b>${streakNow()}</b></div>
  </header>`;
const privacy = `<p class="privacy">Anonim istatistik topluyoruz, kişisel veri toplamıyoruz.</p>`;

function renderHome() {
  const t = todayStr();
  const done = store.get('daily', null);
  const playedToday = done && done.date === t;
  const prog = store.get('dailyProgress', null);
  const inProgress = !playedToday && prog && prog.date === t && prog.idx > 0;
  const best = store.get('ladderBest', null);
  const s = streakNow();
  return `
  ${topbar(`<div class="brand">${esc(APP.name)}</div>`)}
  <main class="home">
    <p class="tagline">${esc(APP.tagline)}</p>
    <button class="card card-daily ${playedToday ? 'is-done' : ''}" data-act="daily">
      <span class="card-emoji">📅</span>
      <span class="card-body">
        <span class="card-title">Günlük Tur</span>
        <span class="card-sub">${
          playedToday
            ? `Bugün ${done.score}/${done.total} yaptın ✓ · Sonucu gör`
            : inProgress
              ? `Kaldığın yerden devam: ${prog.idx}/${APP.dailyCount}`
              : `Bugünün ${APP.dailyCount} sorusu seni bekliyor`
        }</span>
      </span>
    </button>
    <button class="card card-ladder" data-act="ladder">
      <span class="card-emoji">🪜</span>
      <span class="card-body">
        <span class="card-title">Merdiven</span>
        <span class="card-sub">10 basamak, 3 joker. Stajyerden CEO'ya.${best ? ` · En iyin: ${esc(best.title)}` : ''}</span>
      </span>
    </button>
    <div class="streak-card">
      <span class="streak-big">🔥 ${s}</span>
      <span>${
        s === 0 ? 'Seri yok. Bugünkü turu bitir, seriyi başlat.' : playedToday ? `${s} günlük seri. Yarın da gel, sönmesin.` : `${s} günlük seri. Bugünkü turu bitir, devam etsin.`
      }</span>
    </div>
  </main>
  ${privacy}`;
}

function ladderBar() {
  // cevaplandıktan sonra da "Devam"a basılana kadar aynı basamağı göster
  const cur = R.cur.answered && R.cur.answered.ok ? R.done : R.done + 1;
  const cells = Array.from({ length: LADDER_STEPS }, (_, i) => {
    const n = i + 1;
    const cls = [n <= R.done ? 'ok' : '', n === cur ? 'cur' : '', SAFE_STEPS.includes(n) ? 'safe' : ''].join(' ');
    return `<span class="lad ${cls}">${SAFE_STEPS.includes(n) ? '★' : ''}</span>`;
  }).join('');
  return `<div class="prog">${cells}</div>
    <div class="meta">Basamak ${cur}/${LADDER_STEPS} · <b>${esc(STEP_TITLES[cur - 1])}</b>${SAFE_STEPS.includes(cur) ? ' · güvenli basamak' : ''}</div>`;
}

function renderQuestion() {
  const c = R.cur;
  const q = c.q;
  const a = c.answered;
  const st = qStats(q.id);
  const anim = !c.animated;

  const progress =
    R.mode === 'gunluk'
      ? `<div class="prog">${R.ids
          .map((_, i) => `<span class="dot ${i < R.marks.length ? (R.marks[i] ? 'ok' : 'no') : i === R.idx ? 'cur' : ''}"></span>`)
          .join('')}</div><div class="meta">Soru ${R.idx + 1}/${R.ids.length}</div>`
      : ladderBar();

  const jokers =
    R.mode === 'merdiven' && !a
      ? `<div class="jokers">
        <button class="joker" data-act="joker" data-k="fifty" ${R.jokers.fifty ? '' : 'disabled'}>✂️ Şıkları azalt</button>
        ${st || c.crowd ? `<button class="joker" data-act="joker" data-k="crowd" ${R.jokers.crowd ? '' : 'disabled'}>👥 Oyuncular ne dedi?</button>` : ''}
        <button class="joker" data-act="joker" data-k="skip" ${R.jokers.skip ? '' : 'disabled'}>🃏 Kartımı kullan</button>
      </div>`
      : '';

  const opts = c.order
    .map((orig, di) => {
      if (c.removed.has(orig)) return '';
      let cls = 'opt';
      if (a) {
        if (orig === q.answer) cls += ' correct' + (anim && a.ok ? ' pulse' : '');
        else if (orig === a.orig) cls += ' wrong' + (anim ? ' shake' : '');
        else cls += ' dim';
      }
      const pct = c.crowd && st ? Math.round(((st.o && st.o[orig]) || 0) * 100 / st.n) : null;
      return `<button class="${cls}" data-act="answer" data-i="${di}" ${a ? 'disabled' : ''}>
        <span class="opt-txt">${esc(q.options[orig])}</span>${pct !== null ? `<span class="pct">%${pct}</span>` : ''}
      </button>`;
    })
    .join('');

  let fb = '';
  if (a) {
    const last = R.mode === 'gunluk' ? R.idx + 1 >= R.ids.length : R.over || R.done >= LADDER_STEPS;
    const nextLabel = !last ? 'Sonraki soru →' : R.mode === 'merdiven' && !R.over ? 'Zirveye çık 🏆' : 'Sonucu gör →';
    fb = `<section class="fb ${a.ok ? 'good' : 'bad'}">
      <div class="fb-h">${esc(a.msg)}</div>
      ${!a.ok ? `<div class="fb-ans">Doğrusu: <b>${esc(q.options[q.answer])}</b></div>` : ''}
      ${q.info ? `<div class="info"><span>💡</span><p>${esc(q.info)}</p></div>` : ''}
      ${st ? `<div class="know">Bunu bilenlerin oranı: <b>%${Math.round((st.c * 100) / st.n)}</b></div>` : ''}
      <div class="vote" id="vote">${voteHtml(c)}</div>
      <button class="primary" data-act="next">${nextLabel}</button>
    </section>`;
  }

  c.animated = true;
  return `
  ${topbar(`<button class="icon-btn" data-act="exit" aria-label="Çık">✕</button>`)}
  <main class="qscreen">
    ${progress}
    <div class="cat">${esc(q.cat || 'Genel Merak')}</div>
    <h1 class="q">${esc(q.q)}</h1>
    ${jokers}
    <div class="opts">${opts}</div>
    ${fb}
  </main>`;
}

function voteHtml(c) {
  if (c.voted) return `<span class="vote-thanks">Not aldık, sağ ol ${c.voted === 'eglenceli' ? '👍' : '👎'}</span>`;
  return `<span>Bu soru nasıldı?</span>
    <button class="chip" data-act="vote" data-v="eglenceli">👍 Eğlenceli</button>
    <button class="chip" data-act="vote" data-v="sikici">👎 Sıkıcı</button>`;
}

function surveyHtml(res) {
  const key = 'survey:' + res.roundId;
  if (store.get(key, false)) return `<section class="survey"><p class="vote-thanks">Geri bildirimin geldi, çok sağ ol 🙌</p></section>`;
  return `<section class="survey" id="survey">
    <h2>Bu oyunu tekrar oynar mıydın?</h2>
    <div class="seg">
      <button class="chip" data-act="replay" data-v="kesinlikle">Kesinlikle</button>
      <button class="chip" data-act="replay" data-v="belki">Belki</button>
      <button class="chip" data-act="replay" data-v="hayir">Hayır</button>
    </div>
    <textarea id="comment" maxlength="1000" rows="3" placeholder="Aklına takılan ne olursa"></textarea>
    <button class="secondary" data-act="survey" disabled>Gönder</button>
  </section>`;
}

function dailyShareText(res) {
  const emoji = res.score >= 4 ? '🔥' : res.score >= 2 ? '😎' : '🙃';
  const grid = (res.marks || []).map((m) => (m ? '🟩' : '🟥')).join('');
  return `Bugün ${res.score}/${res.total} yaptım ${emoji}${grid ? '\n' + grid : ''}\nSen kaç yaparsın? ${shareUrl()}`;
}
function ladderShareText(res) {
  return `Merdivende ${res.title} oldum ${TITLE_EMOJI[res.title] || '🪜'} (${res.done}/10)\nSen nereye kadar çıkarsın? ${shareUrl()}`;
}

function shareBlock(text) {
  return `<div class="share">
    <pre class="share-txt">${esc(text)}</pre>
    <div class="row">
      <button class="primary" data-act="copy">Kopyala</button>
      ${navigator.share ? `<button class="secondary" data-act="share">Paylaş</button>` : ''}
    </div>
  </div>`;
}

function renderDailyResult() {
  const res = lastResult;
  if (!res.roundId) res.roundId = 'gunluk:' + res.date;
  const msg =
    res.score === res.total ? 'Kusursuz! Bugün beynin formda.' : res.score >= 3 ? 'Fena değil, hiç fena değil.' : 'Bugün sorular sinsiydi. Yarın rövanş.';
  return `
  ${topbar(`<button class="icon-btn" data-act="home" aria-label="Ana sayfa">←</button>`)}
  <main class="result">
    <div class="big-score">${res.score}<small>/${res.total}</small></div>
    <div class="grid">${(res.marks || []).map((m) => (m ? '🟩' : '🟥')).join('')}</div>
    <p class="result-msg">${msg}</p>
    <p class="muted">🔥 ${streakNow()} günlük seri · Yarın yeni ${APP.dailyCount} soru.</p>
    ${shareBlock(dailyShareText(res))}
    ${surveyHtml(res)}
    <div class="row">
      <button class="secondary" data-act="ladder">🪜 Merdiveni dene</button>
      <button class="ghost" data-act="home">Ana sayfa</button>
    </div>
  </main>
  ${privacy}`;
}

function renderLadderResult() {
  const res = lastResult;
  const top = res.done >= LADDER_STEPS;
  const steps = Array.from({ length: LADDER_STEPS }, (_, i) => LADDER_STEPS - i)
    .map((n) => {
      const cls = [n <= res.done ? 'ok' : '', SAFE_STEPS.includes(n) ? 'safe' : '', n === res.done + 1 && res.failed ? 'fail' : ''].join(' ');
      return `<li class="${cls}"><span>${n}</span><span>${esc(STEP_TITLES[n - 1])}${SAFE_STEPS.includes(n) ? ' ★' : ''}</span></li>`;
    })
    .join('');
  const msg = top
    ? 'Zirvedesin. Koltuk senin.'
    : res.failed && res.done >= 3
      ? 'Güvenli basamak seni tuttu, unvan cepte.'
      : 'Her CEO bir yerden başladı.';
  return `
  ${topbar(`<button class="icon-btn" data-act="home" aria-label="Ana sayfa">←</button>`)}
  <main class="result">
    <div class="title-emoji">${TITLE_EMOJI[res.title] || '🪜'}</div>
    <div class="title-name">${esc(res.title)}</div>
    <p class="result-msg">${msg}</p>
    <p class="muted">${res.done}/${LADDER_STEPS} basamak çıktın.</p>
    <ol class="ladder-list">${steps}</ol>
    ${shareBlock(ladderShareText(res))}
    ${surveyHtml(res)}
    <div class="row">
      <button class="primary" data-act="ladder">Tekrar dene</button>
      <button class="ghost" data-act="home">Ana sayfa</button>
    </div>
  </main>
  ${privacy}`;
}

function render() {
  $app.innerHTML =
    screen === 'question' && R
      ? renderQuestion()
      : screen === 'dailyResult'
        ? renderDailyResult()
        : screen === 'ladderResult'
          ? renderLadderResult()
          : renderHome();
}

/* ---------- paylaşım ---------- */
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}
const currentShareText = () => (lastResult.mode === 'gunluk' ? dailyShareText(lastResult) : ladderShareText(lastResult));

/* ---------- olay dinleyici ---------- */
let surveyChoice = null;
$app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  switch (act) {
    case 'daily':
      return startDaily();
    case 'ladder':
      return startLadder();
    case 'home':
      screen = 'home';
      R = null;
      surveyChoice = null;
      render();
      return window.scrollTo(0, 0);
    case 'exit':
      if (R && R.mode === 'merdiven') {
        if (R.over || R.done >= LADDER_STEPS) return finishLadder();
        if (R.done > 0 && !confirm('Merdivenden çıkarsan bu tur sayılmaz. Emin misin?')) return;
        track('tur_birakildi', { mode: 'merdiven', score: R.done });
      }
      // günlük turda ilerleme kayıtlı; son soru cevaplandıysa turu kapat
      if (R && R.mode === 'gunluk' && R.cur.answered && R.idx + 1 >= R.ids.length) return finishDaily();
      screen = 'home';
      R = null;
      return render();
    case 'answer':
      return answer(+b.dataset.i);
    case 'next':
      return next();
    case 'joker':
      return useJoker(b.dataset.k);
    case 'vote': {
      const c = R && R.cur;
      if (!c || c.voted) return;
      c.voted = b.dataset.v;
      track('oy', { mode: R.mode, question_id: c.q.id, vote: c.voted });
      document.getElementById('vote').innerHTML = voteHtml(c);
      return;
    }
    case 'copy': {
      const ok = await copyText(currentShareText());
      b.textContent = ok ? 'Kopyalandı ✓' : 'Kopyalanamadı';
      track('paylasim', { mode: lastResult.mode, joker: 'kopyala' });
      return setTimeout(() => (b.textContent = 'Kopyala'), 1800);
    }
    case 'share':
      try {
        await navigator.share({ text: currentShareText() });
        track('paylasim', { mode: lastResult.mode, joker: 'paylas' });
      } catch {}
      return;
    case 'replay':
      surveyChoice = b.dataset.v;
      document.querySelectorAll('[data-act="replay"]').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelector('[data-act="survey"]').disabled = false;
      return;
    case 'survey': {
      const comment = (document.getElementById('comment')?.value || '').trim();
      if (!surveyChoice && !comment) return;
      track('anket', {
        mode: lastResult.mode,
        replay: surveyChoice,
        comment,
        score: lastResult.mode === 'gunluk' ? lastResult.score : lastResult.done,
      });
      store.set('survey:' + lastResult.roundId, true);
      surveyChoice = null;
      document.getElementById('survey').outerHTML = surveyHtml(lastResult);
      return;
    }
  }
});
$app.addEventListener('input', (e) => {
  if (e.target.id === 'comment') {
    const btn = document.querySelector('[data-act="survey"]');
    if (btn) btn.disabled = !surveyChoice && !e.target.value.trim();
  }
});

/* ---------- açılış ---------- */
(async function boot() {
  try {
    await loadQuestions();
  } catch {
    $app.innerHTML = `<p class="loading">Sorular yüklenemedi. İnternetini kontrol edip sayfayı yenile.</p>`;
    return;
  }
  if (!QUESTIONS.length) {
    $app.innerHTML = `<p class="loading">Henüz soru yok.</p>`;
    return;
  }
  render();
  loadStats();
  flush();
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
