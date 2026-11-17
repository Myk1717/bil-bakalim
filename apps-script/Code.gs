/**
 * Bil Bakalım — anonim olay kaydı + istatistik ucu (Google Apps Script)
 * POST  → { events: [...] } satır satır "olaylar" sayfasına yazar
 * GET   → ?action=stats  her soru için { n, c, o:[şık sayıları] } döner
 */
const SHEET_NAME = 'olaylar';
const HEADERS = [
  'sunucu_zamani', 'olay_id', 'istemci_zamani', 'cihaz_id', 'olay', 'mod', 'soru_id',
  'dogru_mu', 'secilen_sik', 'secilen_metin', 'sure_ms', 'basamak', 'oy',
  'tekrar_oynar', 'yorum', 'skor', 'joker', 'surum',
];
const MAX_EVENTS_PER_REQUEST = 200;

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
    if (!events.length) return json_({ ok: true, n: 0 });
    const now = new Date();
    const rows = events.map(function (ev) {
      return [
        now,
        txt_(ev.event_id, 64),
        txt_(ev.ts, 40),
        txt_(ev.device_id, 64),
        txt_(ev.type, 30),
        txt_(ev.mode, 20),
        txt_(ev.question_id, 40),
        ev.correct === true ? 1 : ev.correct === false ? 0 : '',
        num_(ev.selected_option),
        txt_(ev.selected_text, 200),
        num_(ev.time_ms),
        num_(ev.step),
        txt_(ev.vote, 20),
        txt_(ev.replay, 20),
        txt_(ev.comment, 1000),
        num_(ev.score),
        txt_(ev.joker, 40),
        txt_(ev.app_v, 20),
      ];
    });
    lock.waitLock(20000);
    const sh = sheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    return json_({ ok: true, n: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'stats';
  if (action !== 'stats') return json_({ ok: false, error: 'bilinmeyen istek' });
  const cache = CacheService.getScriptCache();
  const hit = cache.get('stats');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const out = JSON.stringify({ ok: true, updated: new Date().toISOString(), q: computeStats_() });
  try { cache.put('stats', out, 300); } catch (x) {} // 5 dk önbellek
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function computeStats_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const q = {};
  if (last < 2) return q;
  // E..I sütunları: olay, mod, soru_id, dogru_mu, secilen_sik
  const vals = sh.getRange(2, 5, last - 1, 5).getValues();
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (r[0] !== 'cevap' || !r[2]) continue;
    const id = String(r[2]);
    const s = q[id] || (q[id] = { n: 0, c: 0, o: [0, 0, 0, 0] });
    s.n++;
    if (Number(r[3]) === 1) s.c++;
    const opt = Number(r[4]);
    if (r[4] !== '' && opt >= 0 && opt < 10) {
      while (s.o.length <= opt) s.o.push(0);
      s.o[opt]++;
    }
  }
  return q;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

// Formül enjeksiyonunu önle (=, +, -, @ ile başlayan metinler)
function txt_(v, max) {
  if (v === undefined || v === null) return '';
  let s = String(v).slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function num_(v) {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !isFinite(n) ? '' : n;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Kurulumdan sonra bir kez çalıştır: başlık satırını oluşturur ve izinleri ister. */
function kurulum() {
  sheet_();
}
