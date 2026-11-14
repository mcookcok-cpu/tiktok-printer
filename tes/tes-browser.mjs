import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/agentuser/browser-test/package.json')('playwright-core');
let lulus = 0; const ok = (c, n) => { if (!c) console.log('GAGAL:', n); assert.ok(c, n); lulus++; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-b-'));
fs.copyFileSync(new URL('../config.json', import.meta.url), path.join(T, 'config.json'));
const proc = spawn('node', ['server.mjs'], { cwd: path.resolve('.'), env: { ...process.env, PORT: '0', PRINTER_DIR: T, NO_TIKTOK: '1' } });
const port = await new Promise((res, rej) => { let b = ''; proc.stdout.on('data', d => { b += d; const m = b.match(/port (\d+)/); if (m) res(+m[1]); }); setTimeout(() => rej(new Error('server tidak start')), 5000); });
const token = fs.readFileSync(path.join(T, '.token'), 'utf8').trim();
const kirim = body => new Promise((res, rej) => { const r = http.request({ agent: false, host: '127.0.0.1', port, path: '/api/print', method: 'POST', headers: { 'content-type': 'application/json', 'x-token': token } }, x => { x.resume(); x.on('end', res); }); r.on('error', rej); r.end(JSON.stringify(body)); });
const exe = process.env.CHROME || undefined;
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 740 } });
  const galat = []; page.on('pageerror', e => galat.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) galat.push('console: ' + m.text()); });
  let dialog = false; page.on('dialog', d => { dialog = true; d.dismiss(); });
  await page.goto(`http://127.0.0.1:${port}/?cepat=5`);
  await page.waitForFunction(() => window.__printer);
  await page.waitForTimeout(1200);

  const ukur = () => page.evaluate(() => { const rs = document.getElementById('stage').getBoundingClientRect(), o = {}; for (const k of ['b', 'l', 'r']) { const r = document.querySelector('.lembar:last-child .slot.' + k).getBoundingClientRect(); o[k] = { x: Math.round(r.left - rs.left), y: Math.round(r.top - rs.top), w: Math.round(r.width), h: Math.round(r.height) }; } const k = document.querySelector('.lembar:last-child .kertas').getBoundingClientRect(); o.kertas = { x: Math.round(k.left - rs.left), y: Math.round(k.top - rs.top), w: Math.round(k.width), h: Math.round(k.height) }; return o; });
  const m = await ukur(); console.log('UKURAN slot (stage px):', JSON.stringify(m));
  ok(m.b.y < m.l.y && m.l.x < m.r.x, 'susunan: besar di atas, kiri sebelum kanan');
  ok(m.b.w > m.l.w, 'slot besar lebih lebar dari slot kecil');
  ok(m.l.x >= 0 && m.r.x + m.r.w <= 720, 'slot kecil di dalam lebar layar');
  ok(m.l.y + m.l.h <= 760, 'slot bawah tidak jauh keluar layar');
  ok(m.b.y >= 185 && m.b.y <= 235 && m.b.w >= 290 && m.b.w <= 350, 'slot besar mirip referensi (y~210, lebar~320)');
  ok(m.l.w >= 215 && m.l.w <= 270 && m.l.y + m.l.h <= 720 && m.l.y >= 440, 'slot kecil mirip referensi (lebar~240, bawah<=720)');
  ok(m.kertas.y >= 50 && m.kertas.y <= 85, 'tepi jauh kertas dekat rel (y~67)');

  // rose -> slot kiri, pantau posisi kepala
  const sampel = [];
  const pantau = setInterval(() => page.evaluate(() => window.__printer.keadaan().kepalaX).then(x => sampel.push(x)).catch(() => {}), 40);
  await kirim({ nama: 'Adi A', gift: 'Rose', avatar: 'https://avatar.invalid/x.png' });
  await page.waitForFunction(() => window.__printer.keadaan().terpakai.includes('l') && document.querySelector('.slot.l .nama').textContent.includes('Adi A'), null, { timeout: 15000 });
  clearInterval(pantau);
  const xl = m.l.x + m.l.w / 2;
  ok(sampel.some(x => Math.abs(x - xl) < 40), 'kepala printer bergeser ke slot kiri saat mencetak');
  ok(Math.max(...sampel) - Math.min(...sampel) > 100, 'kepala bergerak (sway/pindah)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.slot.l img')).display === 'none'), 'avatar gagal dimuat: placeholder dipakai, cetak tetap selesai');
  ok(await page.evaluate(() => document.querySelector('.slot.l .ph').textContent === 'A'), 'placeholder berisi inisial');

  // donut -> besar, rose ke-2 -> kanan
  await kirim({ nama: 'Starling', gift: 'Donut' });
  await page.waitForFunction(() => document.querySelector('.slot.b .nama').textContent.includes('Starling'), null, { timeout: 15000 });
  ok(await page.evaluate(() => document.querySelector('.slot.b').classList.contains('t-big') && document.querySelector('.slot.b .pita').textContent === 'BIG'), 'donut: slot besar bertanda BIG');
  await kirim({ nama: 'Gabriel Silva', gift: 'Rose', jumlah: 3 });
  await page.waitForFunction(() => document.querySelector('.slot.r .nama').textContent.includes('Gabriel'), null, { timeout: 15000 });
  ok(await page.evaluate(() => document.querySelector('.slot.r .jml').textContent === 'x3'), 'jumlah gift ditampilkan');

  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve('public/contoh.png') });
  console.log('screenshot contoh.png tersimpan');

  // lembar penuh -> kertas baru; legendary; XSS
  await kirim({ nama: '<img src=x onerror=alert(1)>', gift: 'Rose' });
  await page.waitForFunction(() => { const k = window.__printer.keadaan(); return k.terpakai.length === 1 && document.querySelectorAll('.lembar').length >= 1 && document.querySelector('.lembar:last-child .slot.l .nama').textContent.includes('<img'); }, null, { timeout: 20000 });
  ok(true, 'lembar penuh: kertas baru dimulai');
  ok(await page.evaluate(() => document.querySelectorAll('.nama img').length === 0 && !document.body.innerHTML.includes('<img src="x"')), 'XSS: nama jadi teks, bukan elemen');
  ok(!dialog, 'tidak ada dialog alert');
  await kirim({ nama: 'Sultan', gift: 'Galaxy', diamonds: 1000 });
  await page.waitForFunction(() => document.querySelector('.lembar:last-child .slot.b .nama').textContent.includes('Sultan'), null, { timeout: 20000 });
  ok(await page.evaluate(() => { const b = document.querySelector('.lembar:last-child .slot.b'); return b.classList.contains('t-legendary') && b.querySelectorAll('.kilau').length === 12 && b.querySelector('.pita').textContent === 'LEGENDARY'; }), 'legendary: bingkai emas, pita, kilau');
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => document.querySelectorAll('.lembar').length === 1), 'kertas lama dibuang setelah keluar');

  // antrean: 6 sekaligus, semua harus selesai berurutan
  for (let i = 1; i <= 6; i++) await kirim({ nama: 'Q' + i, gift: 'Rose' });
  await page.waitForFunction(() => window.__printer.keadaan().antre === 0 && !window.__printer.keadaan().sibuk, null, { timeout: 40000 });
  const nm = await page.evaluate(() => [...document.querySelectorAll('.nama')].map(n => n.textContent).join('|'));
  ok(nm.includes('Q6') && await page.evaluate(() => document.querySelectorAll('.lembar').length) <= 2, 'antrean 6 cetak habis diproses (cetakan terakhir Q6 ada di kertas aktif)');

  // skala: viewport lain
  await page.setViewportSize({ width: 1080, height: 1920 }); await page.waitForTimeout(200);
  ok(await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return Math.abs(r.width - 1080) < 2 && r.top >= 0 && r.bottom <= 1920; }), 'skala otomatis memenuhi layar 1080x1920');
  ok(galat.length === 0, 'tanpa galat halaman/konsol: ' + galat.join(' || '));
} finally { await browser.close(); proc.kill(); }
console.log(`printer-browser: ${lulus} lulus, 0 gagal`);
