/**
 * Pengolahan warna merek.
 *
 * Klinik hanya diminta memberi dua warna dari logonya. Turunan yang dibutuhkan
 * kwitansi dan antarmuka — versi muda untuk latar, versi tua untuk teks —
 * dihitung di sini agar pemilik tidak perlu menentukan tujuh kode warna.
 */

const HEX = /^#([0-9a-f]{6})$/i;

export function isHex(value) {
  return HEX.test(String(value || '').trim());
}

/** "#70544D" -> [112, 84, 77]. Mengembalikan null bila bukan hex sah. */
export function toRgb(hex) {
  const m = HEX.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Campur warna dengan putih. ratio 0 = warna asli, 1 = putih. */
export function lighten(hex, ratio) {
  const rgb = toRgb(hex);
  if (!rgb) return hex;
  return toHex(rgb.map((v) => v + (255 - v) * ratio));
}

/** Campur warna dengan hitam. ratio 0 = warna asli, 1 = hitam. */
export function darken(hex, ratio) {
  const rgb = toRgb(hex);
  if (!rgb) return hex;
  return toHex(rgb.map((v) => v * (1 - ratio)));
}

/** Luminansi relatif menurut WCAG. */
export function luminance(hex) {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Pilih warna teks yang terbaca di atas latar tertentu.
 * Dipakai agar tulisan pada bidang berwarna merek tidak pernah hilang,
 * berapa pun terang-gelapnya warna yang dipilih klinik.
 */
export function readableOn(background) {
  return contrast(background, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1a1a';
}

/**
 * Bangun seluruh palet dari dua warna merek.
 * `strong` dipakai untuk bidang berteks; `accent` hanya untuk garis dan
 * bidang dekoratif — warna aksen logo umumnya terlalu muda untuk teks.
 */
export function buildPalette(strongInput, accentInput) {
  const strong = isHex(strongInput) ? strongInput.trim() : '#0f3d3e';
  const accent = isHex(accentInput) ? accentInput.trim() : lighten(strong, 0.45);

  return {
    strong,                                 // kop, bidang judul, baris total
    strongInk: readableOn(strong),          // teks di atas bidang `strong`
    accent,                                 // garis dan hiasan
    // Bila warna aksen terlalu muda untuk teks, pakai versi lebih tua.
    accentInk: contrast(accent, '#ffffff') >= 4.5 ? accent : darken(accent, 0.32),
    wash: lighten(strong, 0.9),             // latar baris total
    line: lighten(accent, 0.55),
    lineSoft: lighten(accent, 0.78),
    zebra: lighten(accent, 0.88),           // baris selang-seling tabel
  };
}
