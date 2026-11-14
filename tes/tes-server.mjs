process.on('uncaughtException', e => { console.log('UNCAUGHT setelah', globalThis.__n, 'assert:', e.message); process.exit(1); });
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { boleh } from '../akses.mjs';
import { dariGift, tentukanTier, avatarAman } from '../gift.mjs';
let lulus = 0; const ok = (c, n) => { assert.ok(c, n); lulus++; globalThis.__n = n; };
const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

// --- akses ---
ok(boleh('127.0.0.1') && boleh('::1') && boleh('::ffff:127.0.0.1'), 'localhost boleh');
ok(boleh('100.106.213.94') && boleh('100.64.0.1') && boleh('100.127.255.254'), 'tailnet boleh');
ok(!boleh('100.63.0.1') && !boleh('100.128.0.1') && !boleh('192.168.1.5') && !boleh('8.8.8.8') && !boleh(''), 'selain itu ditolak');
ok(boleh('10.0.0.9', ['10.0.0.9']), 'tambahan eksplisit boleh');

// --- gift ---
ok(tentukanTier('Rose', 1, cfg) === 'print' && tentukanTier('Mawar', 1, cfg) === 'print', 'Rose/Mawar = print');
ok(tentukanTier('Donut', 30, cfg) === 'big' && tentukanTier(' DONUT ', 0, cfg) === 'big', 'Donut = big (nama tak peka huruf besar)');
ok(tentukanTier('Galaxy', 1000, cfg) === 'legendary' && tentukanTier('X', 600, cfg) === 'legendary', 'nilai besar = legendary');
ok(tentukanTier('Sesuatu', 50, cfg) === 'big' && tentukanTier('Sesuatu', 5, cfg) === 'print', 'ambang big dan print');
const base = { giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 1 }, repeatCount: 3, repeatEnd: false, user: { nickname: 'Adi A', profilePicture: { urls: ['https://p16.tiktokcdn.com/a.jpeg'] } } };
ok(dariGift(base, cfg) === null, 'gift beruntun belum selesai diabaikan');
const e = dariGift({ ...base, repeatEnd: true }, cfg);
ok(e.nama === 'Adi A' && e.jumlah === 3 && e.tier === 'print' && e.avatar.startsWith('https://'), 'gift beruntun selesai diproses');
ok(dariGift({ giftDetails: { giftName: 'Donut', giftType: 2, diamondCount: 30 }, user: { uniqueId: 'budi' } }, cfg).tier === 'big', 'gift tunggal langsung diproses');
ok(dariGift({ giftDetails: {}, user: {} }, cfg).nama === 'penonton', 'tanpa nama jadi penonton');
ok(avatarAman('http://x.com/a.png') === '' && avatarAman('javascript:alert(1)') === '' && avatarAman('https://a.b/"onerror="x') === '' && avatarAman('https://ok.example/a.png') !== '', 'avatar hanya https bersih');
ok(dariGift({ giftDetails: { giftName: 'Rose' }, repeatCount: 99999, user: { nickname: 'x'.repeat(100) } }, cfg).nama.length === 24, 'nama dipotong 24');

// --- integrasi server ---
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-'));
fs.copyFileSync(new URL('../config.json', import.meta.url), path.join(T, 'config.json'));
const proc = spawn('node', ['server.mjs'], { cwd: path.resolve('.'), env: { ...process.env, PORT: '0', PRINTER_DIR: T, NO_TIKTOK: '1' } });
const port = await new Promise((res, rej) => { let b = ''; proc.stdout.on('data', d => { b += d; const m = b.match(/port (\d+)/); if (m) res(+m[1]); }); setTimeout(() => rej(new Error('server tidak start')), 5000); });
const token = fs.readFileSync(path.join(T, '.token'), 'utf8').trim();
const req = (method, p, body, headers = {}) => new Promise((res, rej) => {
  const r = http.request({ agent: false, host: '127.0.0.1', port, path: p, method, headers: { 'content-type': 'application/json', ...headers } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ s: x.statusCode, h: x.headers, b })); });
  r.on('error', rej); if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body)); r.end();
});
try {
  let r = await req('GET', '/'); ok(r.s === 200 && r.b.includes('TikTok Printer') && /default-src 'self'/.test(r.h['content-security-policy']), 'halaman dengan CSP');
  r = await req('GET', '/api/status'); ok(r.s === 200 && JSON.parse(r.b).tiktok.state === 'mati', 'status');
  ok(!r.b.includes(token), 'token tidak bocor di status');
  r = await req('GET', '/api/config'); ok(JSON.parse(r.b).legenda.length === 3, 'config legenda');
  r = await req('POST', '/api/print', { nama: 'x' }); ok(r.s === 401, 'print tanpa token 401');
  r = await req('POST', '/api/print', { nama: 'x' }, { 'x-token': 'salah' }); ok(r.s === 401, 'token salah 401');
  r = await req('POST', '/api/print', { nama: '  ' }, { 'x-token': token }); ok(r.s === 400, 'nama kosong 400');
  r = await req('POST', '/api/print', '{rusak', { 'x-token': token }); ok(r.s === 400, 'JSON rusak 400');
  r = await req('POST', '/api/print', 'x'.repeat(5000), { 'x-token': token }).catch(() => ({ s: 413 })); ok(r.s === 413, 'badan besar ditolak');
  r = await req('GET', '/tidak-ada'); ok(r.s === 404, '404');
  r = await req('POST', '/api/connect', { username: '../x' }, { 'x-token': token }); ok(r.s === 400, 'username tidak valid ditolak');

  const sse = await new Promise(res => { const ev = []; const rq = http.get({ host: '127.0.0.1', port, path: '/events' }, x => { x.setEncoding('utf8'); x.on('data', d => { for (const l of d.split('\n')) if (l.startsWith('data: ')) ev.push(JSON.parse(l.slice(6))); }); res({ ev, tutup: () => rq.destroy() }); }); rq.on('error', () => {}); });
  await new Promise(r => setTimeout(r, 200)); ok(sse.ev[0]?.type === 'hello', 'SSE hello');
  r = await req('POST', '/api/print', { nama: '<img src=x onerror=alert(1)>', avatar: 'http://jahat/x.png', gift: 'Donut', jumlah: 2 }, { 'x-token': token }); ok(r.s === 200 && JSON.parse(r.b).tier === 'big', 'print donut = big');
  r = await req('POST', '/api/print', { nama: 'Bu\nbi', gift: 'Rose', tier: 'legendary' }, { 'x-token': token }); ok(JSON.parse(r.b).tier === 'legendary', 'tier eksplisit dihormati');
  r = await req('POST', '/api/print', { nama: 'Z', tier: 'ngawur', gift: 'Rose' }, { 'x-token': token }); ok(JSON.parse(r.b).tier === 'print', 'tier ngawur dihitung ulang');
  await new Promise(r => setTimeout(r, 300));
  const pr = sse.ev.filter(x => x.type === 'print');
  ok(pr.length === 3, '3 event print lewat SSE');
  ok(pr[0].avatar === '' && pr[0].jumlah === 2 && pr[0].tier === 'big', 'avatar http dibuang, jumlah dan tier benar');
  ok(pr[1].nama === 'Bu bi', 'karakter kontrol dibersihkan');
  r = await req('GET', '/api/status'); const st = JSON.parse(r.b); ok(st.total === 3 && st.klien === 1 && st.terakhir.nama === 'Z', 'status menghitung cetakan dan klien');
  r = await req('POST', '/api/reset', {}, { 'x-token': token }); await new Promise(r => setTimeout(r, 150)); ok(sse.ev.some(x => x.type === 'reset'), 'reset disiarkan');
  sse.tutup(); await new Promise(r => setTimeout(r, 200)); r = await req('GET', '/api/status'); ok(JSON.parse(r.b).klien === 0, 'klien SSE dilepas saat putus');
} finally { proc.kill(); }
console.log(`printer-server: ${lulus} lulus, 0 gagal`);
