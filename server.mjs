// server.mjs — TikTok Printer: overlay LIVE yang "mencetak" foto profil + nama penghadiah di kertas.
// Halaman: GET /  | Event: GET /events (SSE) | Uji/manual: POST /api/print (x-token) | Status: GET /api/status
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boleh } from './akses.mjs';
import { dariGift, namaBersih, avatarAman, bersih, tentukanTier } from './gift.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const DATA = process.env.PRINTER_DIR || DIR;
const PORT = process.env.PORT === undefined ? 4300 : +process.env.PORT;
const LIB = process.env.TIKTOK_LIB || '/home/agentuser/mao-vtuber-studio/node_modules/tiktok-live-connector/dist/index.js';
const EXTRA = (process.env.PRINTER_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean);
const DEF = { tiktokUsername: '', print: ['rose', 'mawar'], big: ['donut'], legendary: [], batasBig: 30, batasLegendary: 500, legenda: [] };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const TF = path.join(DATA, '.token');
const TOKEN = fs.existsSync(TF) ? fs.readFileSync(TF, 'utf8').trim() : (() => { const t = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(TF, t, { mode: 0o600 }); return t; })();
const tokenOk = h => { const a = Buffer.from(String(h || '')), b = Buffer.from(TOKEN); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const cfg = () => { try { return { ...DEF, ...JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8')) }; } catch { return DEF; } };

const klien = new Set();
let total = 0, terakhir = null;
function siar(obj) { const s = `data: ${JSON.stringify(obj)}\n\n`; for (const r of klien) { try { r.write(s); } catch { klien.delete(r); } } }
function cetak(ev) {
  const e = { id: crypto.randomBytes(4).toString('hex'), waktu: Date.now(), ...ev };
  total++; terakhir = { nama: e.nama, tier: e.tier, gift: e.gift, waktu: e.waktu };
  siar({ type: 'print', ...e });
  log(`cetak ${e.tier} ${e.nama} (${e.gift} x${e.jumlah})`);
  return e;
}
setInterval(() => { for (const r of klien) { try { r.write(': ping\n\n'); } catch { klien.delete(r); } } }, 15000).unref();

// ---- Konektor TikTok LIVE (memakai pustaka yang sudah terpasang untuk Mao Studio) ----
let tt = { state: 'mati', username: '', attempts: 0, lastError: null, diterima: 0 };
let conn = null, gen = 0, timer = null;
function akhiriTikTok() { gen++; clearTimeout(timer); if (conn) { try { conn.disconnect(); } catch {} conn = null; } tt = { ...tt, state: 'mati' }; }
function jadwal(g, pesan) {
  if (conn) { try { conn.disconnect(); } catch {} conn = null; }
  tt.attempts = Math.max(1, tt.attempts); tt.state = 'menunggu ulang'; tt.lastError = pesan;
  const d = Math.min(120000, 15000 * 2 ** Math.min(tt.attempts - 1, 3));
  log(`TikTok: ${pesan}; coba lagi ${Math.round(d / 1000)} dtk`);
  timer = setTimeout(() => coba(g), d); timer.unref?.();
}
async function coba(g) {
  if (g !== gen) return;
  tt.attempts++; tt.state = 'menghubungkan';
  try {
    const { TikTokLiveConnection } = await import(pathToFileURL(LIB).href);
    const c = new TikTokLiveConnection(tt.username, { processInitialData: false, fetchRoomInfoOnConnect: true, enableExtendedGiftInfo: false });
    conn = c;
    c.on('gift', d => { if (g !== gen) return; try { const e = dariGift(d, cfg()); if (e) { tt.diterima++; cetak(e); } } catch {} });
    c.on('disconnected', () => { if (g !== gen) return; conn = null; jadwal(g, 'koneksi terputus'); });
    c.on('error', () => {});
    await c.connect();
    if (g !== gen) { try { c.disconnect(); } catch {} return; }
    tt.state = 'terhubung'; tt.attempts = 0; tt.lastError = null;
    log(`TikTok: terhubung ke @${tt.username}`);
  } catch (e) {
    if (g !== gen) return;
    const raw = e instanceof Error ? e.message : String(e);
    jadwal(g, /offline|not live|isn't live/i.test(raw + (e?.constructor?.name || '')) ? `@${tt.username} belum/tidak sedang LIVE` : raw.slice(0, 160));
  }
}
function mulaiTikTok(user) {
  if (!/^[A-Za-z0-9._]{2,24}$/.test(user)) throw new Error('username tidak valid');
  akhiriTikTok();
  tt = { state: 'menghubungkan', username: user, attempts: 0, lastError: null, diterima: 0 };
  coba(++gen);
}

// ---- HTTP ----
const AMAN = { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' };
const CSP = "default-src 'self'; img-src https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' blob: data:; frame-ancestors *";
function send(r, kode, b, tipe = 'application/json') { r.writeHead(kode, { ...AMAN, 'content-type': tipe + '; charset=utf-8' }); r.end(typeof b === 'string' ? b : JSON.stringify(b)); }
function badan(q, r, cb) {
  let b = '', mati = false;
  q.on('data', c => { if (mati) return; b += c; if (b.length > 4096) { mati = true; send(r, 413, { error: 'terlalu besar' }); q.destroy(); } });
  q.on('end', () => { if (mati) return; try { cb(JSON.parse(b || '{}')); } catch (e) { send(r, 400, { error: String(e.message).slice(0, 100) }); } });
}
const butuhToken = (q, r) => { if (tokenOk(q.headers['x-token'])) return true; send(r, 401, { error: 'token' }); return false; };

// ---- berkas statis untuk karakter 3D: /karakter3d.js, /vendor/*, /model/* ----
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.vrm': 'application/octet-stream', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
function statik(r, p) {
  let rel; try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return send(r, 400, { error: 'path' }); }
  const root = path.resolve(DIR, 'public'), full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep) || !/^(karakter3d\.js|vendor\/|model\/)/.test(rel) || !MIME[path.extname(full).toLowerCase()]) return send(r, 404, { error: 'tidak ditemukan' });
  fs.stat(full, (e, st) => {
    if (e || !st.isFile()) return send(r, 404, { error: 'tidak ditemukan' });
    r.writeHead(200, { ...AMAN, 'cache-control': rel.startsWith('model/') ? 'no-cache' : 'public, max-age=300', 'content-type': MIME[path.extname(full).toLowerCase()], 'content-length': st.size });
    fs.createReadStream(full).on('error', () => r.destroy()).pipe(r);
  });
}
const daftarModel = () => { try { return fs.readdirSync(path.join(DIR, 'public/model')).filter(f => /\.(vrm|glb)$/i.test(f)).sort(); } catch { return []; } };

const srv = http.createServer((q, r) => {
  if (!boleh(q.socket.remoteAddress, EXTRA)) { r.writeHead(403); return r.end('forbidden'); }
  const u = new URL(q.url, 'http://x'), p = u.pathname;
  if (q.method === 'GET' && (p === '/' || p === '/index.html')) {
    try { r.writeHead(200, { ...AMAN, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP }); return r.end(fs.readFileSync(path.join(DIR, 'public/index.html'))); }
    catch { return send(r, 500, { error: 'index.html tidak ada' }); }
  }
  if (q.method === 'GET' && (p === '/galeri' || p === '/galeri.html')) {
    try { r.writeHead(200, { ...AMAN, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP }); return r.end(fs.readFileSync(path.join(DIR, 'public/galeri.html'))); }
    catch { return send(r, 500, { error: 'galeri.html tidak ada' }); }
  }
  if (q.method === 'GET' && p === '/contoh.png') {
    try { r.writeHead(200, { ...AMAN, 'content-type': 'image/png' }); return r.end(fs.readFileSync(path.join(DIR, 'public/contoh.png'))); } catch { return send(r, 404, { error: 'belum ada' }); }
  }
  if (q.method === 'GET' && (p === '/karakter3d.js' || p.startsWith('/vendor/') || p.startsWith('/model/'))) return statik(r, p);
  if (q.method === 'GET' && p === '/api/model') return send(r, 200, { files: daftarModel() });
  if (q.method === 'GET' && p === '/events') {
    if (klien.size >= 20) return send(r, 503, { error: 'penuh' });
    r.writeHead(200, { ...AMAN, 'content-type': 'text/event-stream', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    r.write(`data: ${JSON.stringify({ type: 'hello', tiktok: tt.state })}\n\n`);
    klien.add(r); q.on('close', () => klien.delete(r)); return;
  }
  if (q.method === 'GET' && p === '/api/status') return send(r, 200, { port: srv.address().port, tiktok: tt, klien: klien.size, total, terakhir });
  if (q.method === 'GET' && p === '/api/config') { const c = cfg(); return send(r, 200, { legenda: c.legenda, print: c.print, big: c.big, legendary: c.legendary }); }
  if (q.method === 'POST' && p === '/api/print') {
    if (!butuhToken(q, r)) return;
    return badan(q, r, d => {
      const nama = namaBersih(d.nama); if (!nama) return send(r, 400, { error: 'nama wajib diisi' });
      const gift = bersih(d.gift, 60) || 'Gift';
      const tier = ['print', 'big', 'legendary'].includes(d.tier) ? d.tier : tentukanTier(gift, Number(d.diamonds) || 0, cfg());
      const e = cetak({ nama, avatar: avatarAman(d.avatar), gift, jumlah: Math.max(1, Math.min(9999, Number(d.jumlah) || 1)), tier });
      send(r, 200, { ok: true, id: e.id, tier });
    });
  }
  if (q.method === 'POST' && p === '/api/reset') { if (!butuhToken(q, r)) return; siar({ type: 'reset' }); return send(r, 200, { ok: true }); }
  if (q.method === 'POST' && p === '/api/connect') {
    if (!butuhToken(q, r)) return;
    return badan(q, r, d => { try { mulaiTikTok(String(d.username || '').replace(/^@/, '').trim()); send(r, 200, { ok: true }); } catch (e) { send(r, 400, { error: e.message }); } });
  }
  if (q.method === 'POST' && p === '/api/disconnect') { if (!butuhToken(q, r)) return; akhiriTikTok(); return send(r, 200, { ok: true }); }
  send(r, 404, { error: 'tidak ditemukan' });
});

srv.listen(PORT, '0.0.0.0', () => {
  log(`printer jalan di port ${srv.address().port}`);
  const u = String(cfg().tiktokUsername || '').replace(/^@/, '').trim();
  if (u && process.env.NO_TIKTOK !== '1') { try { mulaiTikTok(u); } catch (e) { log('username config tidak valid:', e.message); } }
});
