/* Menerapkan warna merek klinik ke antarmuka.
   Palet dasar tetap ada di style.css; berkas ini hanya menimpa variabel
   warna merek bila klinik sudah mengisinya di halaman Pengaturan. */

const HEX = /^#([0-9a-f]{6})$/i;

const toRgb = (hex) => {
  const m = HEX.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = ([r, g, b]) => {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
};

const lighten = (hex, ratio) => {
  const rgb = toRgb(hex);
  return rgb ? toHex(rgb.map((v) => v + (255 - v) * ratio)) : hex;
};

const darken = (hex, ratio) => {
  const rgb = toRgb(hex);
  return rgb ? toHex(rgb.map((v) => v * (1 - ratio))) : hex;
};

const luminance = (hex) => {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Terapkan warna merek. Nilai yang bukan hex sah diabaikan diam-diam
 * supaya antarmuka tidak pernah rusak hanya karena pengaturan salah isi.
 */
export function applyBrand(settings) {
  const utama = settings?.brand_color;
  if (!HEX.test(String(utama || '').trim())) return;

  const aksenMentah = settings?.brand_accent;
  const aksen = HEX.test(String(aksenMentah || '').trim()) ? aksenMentah.trim() : lighten(utama, 0.4);

  // Warna aksen logo sering terlalu muda untuk teks; tuakan bila perlu.
  const aksenTeks = contrast(aksen, '#ffffff') >= 4.5 ? aksen : darken(aksen, 0.32);

  const root = document.documentElement.style;
  root.setProperty('--brand', utama);
  root.setProperty('--brand-600', aksenTeks);
  root.setProperty('--brand-500', aksen);
  root.setProperty('--brand-soft', lighten(utama, 0.86));
  root.setProperty('--brand-softer', lighten(utama, 0.94));

  // Sidebar memakai teks terang di atas warna merek — pastikan tetap terbaca
  // bila klinik memilih warna yang muda.
  root.setProperty('--on-brand', contrast(utama, '#ffffff') >= 4.5 ? '#ffffff' : '#16181a');
}

/**
 * Pasang logo klinik di setiap tempat yang menampilkannya, plus ikon tab peramban.
 *
 * Elemen penampung ditandai `data-logo-slot`; bila klinik belum mengunggah logo,
 * lambang bawaan sistem dibiarkan apa adanya.
 */
export function applyLogo(settings) {
  if (!settings?.has_logo) return;

  const sumber = '/api/branding/logo';

  // Ikon tab peramban
  const ikon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  ikon.rel = 'icon';
  ikon.type = 'image/png';
  ikon.href = sumber;
  if (!ikon.parentNode) document.head.append(ikon);

  for (const kotak of document.querySelectorAll('[data-logo-slot]')) {
    const jenis = kotak.dataset.logoSlot;
    const img = new Image();
    img.src = sumber;
    img.alt = settings.clinic_name || 'Logo klinik';

    if (jenis === 'sidebar') {
      // Logo klinik umumnya berwarna gelap; sidebar berlatar warna merek yang
      // juga gelap. Diberi alas terang agar lambangnya tidak lenyap.
      kotak.style.cssText = 'width:38px;height:38px;flex:none;display:grid;place-items:center;'
        + 'background:#fff;border-radius:9px;padding:3px;overflow:hidden';
      img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
    } else {
      kotak.style.cssText = 'width:auto;height:76px;background:transparent;'
        + 'display:flex;align-items:center;margin-bottom:16px';
      img.style.cssText = 'max-height:76px;max-width:190px;object-fit:contain';
    }

    kotak.innerHTML = '';
    kotak.removeAttribute('aria-hidden');
    kotak.append(img);
  }
}
