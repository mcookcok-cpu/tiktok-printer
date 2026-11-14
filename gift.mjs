// Fungsi murni: ubah event gift TikTok menjadi event cetak, dan tentukan tingkat (print / big / legendary).
export const bersih = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const namaBersih = s => bersih(s, 24);
export const avatarAman = u => { u = String(u ?? '').trim(); return /^https:\/\/[^\s"'<>]{4,480}$/.test(u) ? u : ''; };

export function tentukanTier(giftNama, diamondsSatuan, cfg) {
  const n = bersih(giftNama, 60).toLowerCase();
  const dalam = a => (a || []).map(x => String(x).toLowerCase()).includes(n);
  if (dalam(cfg.legendary)) return 'legendary';
  if (dalam(cfg.big)) return 'big';
  if (dalam(cfg.print)) return 'print';
  const d = Number(diamondsSatuan) || 0;
  if (d >= cfg.batasLegendary) return 'legendary';
  if (d >= cfg.batasBig) return 'big';
  return 'print';
}

// Mengembalikan null bila event harus diabaikan (gift beruntun yang belum selesai).
export function dariGift(d, cfg) {
  if (d?.giftDetails?.giftType === 1 && !d?.repeatEnd) return null;
  const jumlah = Math.max(1, Math.min(9999, Number(d?.repeatCount) || 1));
  const gift = bersih(d?.giftDetails?.giftName, 60) || 'Gift';
  const nama = namaBersih(d?.user?.nickname || d?.user?.uniqueId) || 'penonton';
  const pic = d?.user?.profilePicture;
  const avatar = avatarAman(pic?.urls?.[0] || pic?.url || '');
  return { nama, avatar, gift, jumlah, tier: tentukanTier(gift, d?.giftDetails?.diamondCount, cfg) };
}
