import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/env.js';

/**
 * Penyedia font untuk kwitansi PDF.
 *
 * PDF/A mewajibkan SELURUH font tertanam di dalam berkas, sehingga font bawaan
 * PDF (Helvetica) tidak boleh dipakai bila ingin keluaran memenuhi standar arsip.
 * Urutan pencarian: font kustom klinik -> Inter (SIL OFL, ikut terpasang) -> font sistem.
 */
const CUSTOM_DIR = path.join(ROOT, 'assets', 'fonts');
const INTER_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'inter', 'files');

const EXTS = ['.ttf', '.otf', '.woff'];

function firstExisting(candidates) {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function customFont(base) {
  return firstExisting(EXTS.flatMap((e) => [
    path.join(CUSTOM_DIR, `${base}${e}`),
    path.join(CUSTOM_DIR, `${base.toLowerCase()}${e}`),
  ]));
}

const SYSTEM_SETS = [
  // Windows
  { regular: 'C:/Windows/Fonts/segoeui.ttf', bold: 'C:/Windows/Fonts/segoeuib.ttf', italic: 'C:/Windows/Fonts/segoeuii.ttf' },
  { regular: 'C:/Windows/Fonts/calibri.ttf', bold: 'C:/Windows/Fonts/calibrib.ttf', italic: 'C:/Windows/Fonts/calibrii.ttf' },
  { regular: 'C:/Windows/Fonts/arial.ttf', bold: 'C:/Windows/Fonts/arialbd.ttf', italic: 'C:/Windows/Fonts/ariali.ttf' },
  // Linux
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    italic: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf',
  },
  // macOS
  { regular: '/Library/Fonts/Arial.ttf', bold: '/Library/Fonts/Arial Bold.ttf', italic: '/Library/Fonts/Arial Italic.ttf' },
];

let resolved = null;

/**
 * @returns {{name:string, embedded:boolean, regular:string|null, medium:string|null,
 *            bold:string|null, italic:string|null}}
 */
export function resolveFonts() {
  if (resolved) return resolved;

  // 1) Font kustom milik klinik
  const cRegular = customFont('Regular');
  if (cRegular) {
    resolved = {
      name: 'Kustom (assets/fonts)',
      embedded: true,
      regular: cRegular,
      medium: customFont('Medium') || cRegular,
      bold: customFont('Bold') || cRegular,
      italic: customFont('Italic') || cRegular,
    };
    return resolved;
  }

  // 2) Inter — terpasang bersama proyek, lisensi SIL OFL, sangat terbaca saat dicetak
  const interRegular = path.join(INTER_DIR, 'inter-latin-400-normal.woff');
  if (fs.existsSync(interRegular)) {
    resolved = {
      name: 'Inter',
      embedded: true,
      regular: interRegular,
      medium: firstExisting([path.join(INTER_DIR, 'inter-latin-500-normal.woff')]) || interRegular,
      bold: firstExisting([
        path.join(INTER_DIR, 'inter-latin-700-normal.woff'),
        path.join(INTER_DIR, 'inter-latin-600-normal.woff'),
      ]) || interRegular,
      italic: firstExisting([path.join(INTER_DIR, 'inter-latin-400-italic.woff')]) || interRegular,
    };
    return resolved;
  }

  // 3) Font sistem
  for (const set of SYSTEM_SETS) {
    if (fs.existsSync(set.regular)) {
      resolved = {
        name: path.basename(set.regular, path.extname(set.regular)),
        embedded: true,
        regular: set.regular,
        medium: firstExisting([set.bold]) || set.regular,
        bold: firstExisting([set.bold]) || set.regular,
        italic: firstExisting([set.italic]) || set.regular,
      };
      return resolved;
    }
  }

  // 4) Terakhir: font bawaan PDF. Cetakan tetap jalan, tapi PDF/A dimatikan.
  console.warn('[FONT] Tidak ada font yang bisa ditanam — PDF/A dinonaktifkan, memakai Helvetica bawaan.');
  resolved = { name: 'Helvetica (bawaan)', embedded: false, regular: null, medium: null, bold: null, italic: null };
  return resolved;
}

/** Daftarkan font ke dokumen PDFKit dan kembalikan nama alias yang bisa dipakai. */
export function registerFonts(doc) {
  const f = resolveFonts();
  if (!f.embedded) {
    return { regular: 'Helvetica', medium: 'Helvetica-Bold', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' };
  }
  doc.registerFont('body', f.regular);
  doc.registerFont('medium', f.medium);
  doc.registerFont('bold', f.bold);
  doc.registerFont('italic', f.italic);
  return { regular: 'body', medium: 'medium', bold: 'bold', italic: 'italic' };
}
