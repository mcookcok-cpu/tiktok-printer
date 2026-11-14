// Hanya localhost dan jaringan tailnet (100.64.0.0/10) yang boleh membuka server. Tambahan lewat PRINTER_ALLOW.
export function boleh(ip, tambahan = []) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m && +m[1] === 100 && +m[2] >= 64 && +m[2] <= 127) return true;
  return tambahan.includes(ip);
}
