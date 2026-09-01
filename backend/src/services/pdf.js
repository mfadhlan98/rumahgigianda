import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { registerFonts, resolveFonts } from './fonts.js';
import { getSettings } from './settings.js';
import { qrPayload } from './verification.js';
import { rupiah, tanggalIndo } from '../utils/format.js';
import { terbilangRupiah } from '../utils/terbilang.js';
import { buildPalette } from '../utils/color.js';

const MM = 72 / 25.4; // 1 mm dalam point PDF

/**
 * Palet cetak. Warna netral tetap, warna merek diturunkan dari pengaturan
 * klinik supaya kwitansi memakai warna logonya sendiri.
 */
function paletteFrom(settings) {
  const p = buildPalette(settings.brand_color, settings.brand_accent);
  return {
    ink: '#111827',
    muted: '#5b6b7a',
    danger: '#b42318',
    paper: '#ffffff',

    brand: p.strong,        // kop, kepala tabel, baris total
    brandInk: p.strongInk,  // teks di atas bidang brand — dihitung agar selalu terbaca
    brandSoft: p.wash,
    accent: p.accentInk,
    line: p.line,
    lineSoft: p.lineSoft,
    zebra: p.zebra,
  };
}

const PAGE_PRESETS = {
  a4: { size: 'A4', margin: 42, thermal: false, scale: 1.0 },
  a5: { size: 'A5', margin: 26, thermal: false, scale: 0.88 },
  thermal58: { size: [58 * MM, 400 * MM], margin: 7, thermal: true },
  thermal80: { size: [80 * MM, 400 * MM], margin: 10, thermal: true },
};

const METHOD_LABEL = {
  tunai: 'Tunai',
  transfer: 'Transfer Bank',
  kartu: 'Kartu Debit/Kredit',
};

/**
 * Bangun PDF kwitansi resolusi tinggi.
 *
 * Semua teks ditulis sebagai teks sungguhan (bukan gambar) sehingga bisa
 * dicari, disalin, dan dibaca OCR/parser. Font ditanam penuh agar keluaran
 * memenuhi PDF/A-3b — standar arsip jangka panjang.
 *
 * @param {object} receipt hasil query kwitansi lengkap beserta `items`
 * @param {'a4'|'a5'|'thermal58'|'thermal80'} size
 * @param {{archival?: boolean}} opts
 * @returns {Promise<PDFDocument>} stream PDF siap di-pipe
 */
export async function buildReceiptPdf(receipt, size = 'a5', opts = {}) {
  const preset = PAGE_PRESETS[size] || PAGE_PRESETS.a5;
  const settings = await getSettings();
  const fonts = resolveFonts();

  // PDF/A menuntut font tertanam; struk termal tidak diarsipkan sehingga dikecualikan.
  const archival = opts.archival !== false && fonts.embedded && !preset.thermal;

  const doc = new PDFDocument({
    size: preset.size,
    margin: preset.margin,
    pdfVersion: archival ? '1.7' : '1.3',
    subset: archival ? 'PDF/A-3b' : undefined,
    autoFirstPage: true,
    info: {
      Title: `Kwitansi ${receipt.receipt_no}`,
      Author: settings.clinic_name,
      Subject: `Kwitansi pembayaran a.n. ${receipt.patient_name}`,
      Keywords: `kwitansi,klinik gigi,${receipt.receipt_no},${receipt.patient_mr_no}`,
      Creator: `Sistem Kwitansi ${settings.clinic_name}`,
      Producer: `Sistem Kwitansi ${settings.clinic_name}`,
      CreationDate: new Date(),
    },
  });

  const F = registerFonts(doc);
  const qr = settings.qr_enabled === '1' ? await makeQr(receipt) : null;

  const C = paletteFrom(settings);

  if (preset.thermal) drawThermal(doc, receipt, settings, F, qr);
  else drawPaper(doc, receipt, settings, F, preset, qr, C);

  doc.end();
  return doc;
}

/** QR beresolusi tinggi (600 px) supaya tetap tajam saat dicetak kecil. */
async function makeQr(receipt) {
  const { text, signature } = await qrPayload(receipt);
  const png = await QRCode.toBuffer(text, {
    type: 'png',
    width: 600,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000ff', light: '#ffffffff' }, // opaque: PDF/A melarang transparansi
  });
  return { png, text, signature };
}

/* ================================================================== */
/* Format kertas A4 / A5 — tata letak grid                            */
/* ================================================================== */

function drawPaper(doc, r, s, F, preset, qr, C) {
  const M = preset.margin;
  const left = M;
  const right = doc.page.width - M;
  const W = right - left;
  const k = preset.scale; // faktor skala agar A5 & A4 proporsional
  const fs_ = (pt) => pt * k;

  const voided = r.status === 'void';

  /* ---------- Kop surat ---------- */
  const logoBox = 54 * k;
  const hasLogo = Boolean(s.logo_path && fs.existsSync(s.logo_path));
  let textX = left;

  if (hasLogo) {
    try {
      doc.image(s.logo_path, left, M, { fit: [logoBox, logoBox], align: 'left', valign: 'top' });
      textX = left + logoBox + 12 * k;
    } catch {
      textX = left; // berkas logo tidak terbaca — tampilkan tanpa logo
    }
  }

  const headTextW = W - (textX - left) - 150 * k;
  doc.font(F.bold).fontSize(fs_(17)).fillColor(C.brand)
    .text(s.clinic_name, textX, M, { width: headTextW, lineGap: 0 });

  doc.font(F.regular).fontSize(fs_(8)).fillColor(C.muted);
  if (s.clinic_tagline) doc.text(s.clinic_tagline, textX, doc.y + 1, { width: headTextW });
  if (s.clinic_address) doc.text(s.clinic_address, textX, doc.y + 2, { width: headTextW });
  const contact = [s.clinic_phone, s.clinic_email, s.clinic_website].filter(Boolean).join('  ·  ');
  if (contact) doc.text(contact, textX, doc.y + 1, { width: headTextW });
  if (s.clinic_npwp) doc.text(`NPWP: ${s.clinic_npwp}`, textX, doc.y + 1, { width: headTextW });

  // Simpan batas bawah kolom kiri sebelum menulis kolom kanan,
  // karena menulis di kanan akan memindahkan doc.y ke atas lagi.
  const headerLeftBottom = doc.y;

  /* ---------- Blok judul di kanan atas ---------- */
  const titleW = 148 * k;
  const titleX = right - titleW;
  doc.font(F.bold).fontSize(fs_(15)).fillColor(C.brand)
    .text('KWITANSI', titleX, M, { width: titleW, align: 'right' });
  doc.font(F.medium).fontSize(fs_(9)).fillColor(C.ink)
    .text(r.receipt_no, titleX, doc.y + 1, { width: titleW, align: 'right' });
  doc.font(F.regular).fontSize(fs_(8)).fillColor(C.muted)
    .text(tanggalIndo(r.receipt_date), titleX, doc.y + 1, { width: titleW, align: 'right' });

  let y = Math.max(headerLeftBottom, doc.y, M + (hasLogo ? logoBox : 0)) + 9 * k;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1.4).strokeColor(C.brand).stroke();
  y += 3;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(C.brand).stroke();
  y += 12 * k;

  if (voided) {
    doc.rect(left, y, W, 20 * k).fill(C.danger);
    doc.font(F.bold).fontSize(fs_(10)).fillColor(C.paper)
      .text('KWITANSI INI TELAH DIBATALKAN — TIDAK BERLAKU', left, y + 6 * k, { width: W, align: 'center' });
    y += 30 * k;
  }

  /* ---------- Grid identitas: 2 kolom ---------- */
  const gap = 14 * k;
  const colW = (W - gap) / 2;
  const infoTop = y;

  const leftEnd = drawInfoCard(doc, F, k, left, infoTop, colW, 'DATA PASIEN', [
    ['Nama', r.patient_name],
    ['No. Rekam Medis', r.patient_mr_no],
    ['Telepon', r.patient_phone || '-'],
  ], C);
  const rightEnd = drawInfoCard(doc, F, k, left + colW + gap, infoTop, colW, 'DATA TRANSAKSI', [
    ['Jenis Perawatan', r.treatment_type || '-'],
    ['Dokter', r.doctor_name || '-'],
    ['Kasir', r.created_by_name || '-'],
  ], C);

  y = Math.max(leftEnd, rightEnd) + 14 * k;

  /* ---------- Tabel rincian biaya ---------- */
  const wQty = 34 * k;
  const wPrice = 88 * k;
  const wTotal = 96 * k;
  const wNo = 24 * k;
  const cols = [
    { label: 'NO', w: wNo, align: 'left' },
    { label: 'KETERANGAN', w: W - wNo - wQty - wPrice - wTotal, align: 'left' },
    { label: 'QTY', w: wQty, align: 'center' },
    { label: 'HARGA', w: wPrice, align: 'right' },
    { label: 'JUMLAH', w: wTotal, align: 'right' },
  ];

  const headerH = 19 * k;
  const drawTableHead = (ty) => {
    doc.rect(left, ty, W, headerH).fill(C.brand);
    doc.font(F.bold).fontSize(fs_(7.6)).fillColor(C.brandInk);
    let cx = left;
    for (const c of cols) {
      doc.text(c.label, cx + 5 * k, ty + 5.5 * k, { width: c.w - 10 * k, align: c.align, characterSpacing: 0.4 });
      cx += c.w;
    }
    return ty + headerH;
  };

  y = drawTableHead(y);
  const bottomLimit = doc.page.height - M - 150 * k;

  (r.items || []).forEach((it, i) => {
    const label = it.description;
    const sub = it.category && it.category !== 'tindakan' ? String(it.category).toUpperCase() : null;

    doc.font(F.regular).fontSize(fs_(8.6));
    const textH = doc.heightOfString(label, { width: cols[1].w - 10 * k });
    const rowH = Math.max(17 * k, textH + (sub ? 12 * k : 8 * k));

    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = drawTableHead(M);
    }
    if (i % 2 === 1) doc.rect(left, y, W, rowH).fill(C.zebra);

    const values = [String(i + 1), null, String(it.qty), rupiah(it.unit_price), rupiah(it.line_total)];
    let cx = left;
    cols.forEach((c, ci) => {
      if (ci === 1) {
        doc.font(F.medium).fontSize(fs_(8.6)).fillColor(C.ink)
          .text(label, cx + 5 * k, y + 4 * k, { width: c.w - 10 * k });
        if (sub) {
          doc.font(F.regular).fontSize(fs_(6.4)).fillColor(C.muted)
            .text(sub, cx + 5 * k, doc.y + 0.5, { width: c.w - 10 * k, characterSpacing: 0.6 });
        }
      } else {
        doc.font(F.regular).fontSize(fs_(8.6)).fillColor(C.ink)
          .text(values[ci], cx + 5 * k, y + 4.6 * k, { width: c.w - 10 * k, align: c.align });
      }
      cx += c.w;
    });

    y += rowH;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(C.lineSoft).stroke();
  });

  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.9).strokeColor(C.line).stroke();
  y += 12 * k;

  /* ---------- Ringkasan uang (kanan) + terbilang (kiri) ---------- */
  const sumW = 210 * k;
  const sumX = right - sumW;
  const sumTop = y;

  const rows = [
    ['Subtotal', rupiah(r.subtotal), false],
    ...(r.discount > 0 ? [['Diskon', `- ${rupiah(r.discount)}`, false]] : []),
    ...(r.tax > 0 ? [['Pajak', rupiah(r.tax), false]] : []),
    ['TOTAL DIBAYAR', rupiah(r.total), true],
    ['Uang Diterima', rupiah(r.amount_paid), false],
    ['Kembalian', rupiah(r.change_amount), false],
  ];

  let sy = sumTop;
  for (const [label, value, strong] of rows) {
    const h = strong ? 22 * k : 15 * k;
    if (strong) doc.rect(sumX, sy, sumW, h).fill(C.brandSoft);
    doc.font(strong ? F.bold : F.regular).fontSize(fs_(strong ? 10.5 : 8.6))
      .fillColor(strong ? C.brand : C.ink);
    doc.text(label, sumX + 8 * k, sy + (strong ? 6 * k : 3 * k), { width: sumW * 0.52, align: 'left' });
    doc.text(value, sumX + sumW * 0.42, sy + (strong ? 6 * k : 3 * k), { width: sumW * 0.58 - 8 * k, align: 'right' });
    sy += h;
  }

  const noteW = sumX - left - 14 * k;
  doc.font(F.regular).fontSize(fs_(7.4)).fillColor(C.muted)
    .text('TERBILANG', left, sumTop, { width: noteW, characterSpacing: 0.6 });
  doc.font(F.italic).fontSize(fs_(9)).fillColor(C.ink)
    .text(terbilangRupiah(r.total), left, doc.y + 1, { width: noteW });

  doc.font(F.regular).fontSize(fs_(7.4)).fillColor(C.muted)
    .text('METODE PEMBAYARAN', left, doc.y + 7 * k, { width: noteW, characterSpacing: 0.6 });
  doc.font(F.medium).fontSize(fs_(9)).fillColor(C.ink)
    .text(`${METHOD_LABEL[r.payment_method] || r.payment_method}${r.payment_ref ? ` — ${r.payment_ref}` : ''}`,
      left, doc.y + 1, { width: noteW });

  // Klinik lazim menerima beberapa rekening sekaligus; seluruhnya dicetak
  // agar pasien tidak perlu bertanya nomor mana yang dipakai.
  if (r.payment_method !== 'tunai' && s.payment_accounts) {
    doc.font(F.regular).fontSize(fs_(7.4)).fillColor(C.muted)
      .text(String(s.payment_accounts).trim(), left, doc.y + 3, { width: noteW, lineGap: 0.5 });
  }
  if (r.notes) {
    doc.font(F.regular).fontSize(fs_(7.6)).fillColor(C.muted)
      .text(`Catatan: ${r.notes}`, left, doc.y + 5 * k, { width: noteW });
  }

  y = Math.max(sy, doc.y) + 16 * k;

  /* ---------- QR verifikasi + tanda tangan ---------- */
  const blockH = 96 * k;
  if (y + blockH > doc.page.height - M) {
    doc.addPage();
    y = M;
  }

  if (qr) {
    const qrSize = 62 * k;
    doc.image(qr.png, left, y, { fit: [qrSize, qrSize] });
    doc.font(F.regular).fontSize(fs_(6.6)).fillColor(C.muted)
      .text('Pindai untuk verifikasi keaslian', left, y + qrSize + 3, { width: 120 * k });
    doc.font(F.medium).fontSize(fs_(7.2)).fillColor(C.ink)
      .text(`Kode: ${qr.signature}`, left, doc.y + 1, { width: 120 * k });
  }

  const signW = 170 * k;
  const signX = right - signW;
  doc.font(F.regular).fontSize(fs_(8.6)).fillColor(C.ink)
    .text(tanggalIndo(r.receipt_date), signX, y, { width: signW, align: 'center' });
  doc.text(s.signer_title || 'Penerima', signX, doc.y + 2, { width: signW, align: 'center' });

  const lineY = y + 62 * k;
  doc.moveTo(signX + 18 * k, lineY).lineTo(right - 18 * k, lineY).lineWidth(0.7).strokeColor(C.ink).stroke();
  doc.font(F.medium).fontSize(fs_(8.8)).fillColor(C.ink)
    .text(s.signer_name || r.created_by_name || '-', signX, lineY + 4, { width: signW, align: 'center' });

  y = Math.max(doc.y, lineY + 20 * k) + 8 * k;

  if (voided) {
    doc.font(F.medium).fontSize(fs_(7.6)).fillColor(C.danger)
      .text(`Dibatalkan oleh ${r.voided_by_name || '-'} pada ${r.voided_at || '-'}. Alasan: ${r.void_reason || '-'}`,
        left, y, { width: W });
    y = doc.y + 4;
  }

  /* ---------- Kaki halaman + baris terbaca mesin ---------- */
  const footY = doc.page.height - M - 22 * k;
  doc.moveTo(left, footY - 6 * k).lineTo(right, footY - 6 * k).lineWidth(0.4).strokeColor(C.lineSoft).stroke();

  if (s.receipt_footer_note) {
    doc.font(F.regular).fontSize(fs_(6.8)).fillColor(C.muted)
      .text(s.receipt_footer_note, left, footY, { width: W, align: 'center' });
  }

  // Baris data terstruktur: memudahkan OCR/parser saat audit tanpa membuka database.
  doc.font(F.regular).fontSize(fs_(6.2)).fillColor(C.muted)
    .text(machineLine(r, qr), left, footY + 9 * k, { width: W, align: 'center', characterSpacing: 0.3 });
}

/** Satu baris ringkas berformat tetap, mudah dipindai OCR maupun regex. */
function machineLine(r, qr) {
  return [
    '#KWT',
    r.receipt_no,
    String(r.receipt_date).slice(0, 10),
    r.patient_mr_no || '-',
    `TOTAL=${r.total}`,
    `SIG=${qr?.signature || '-'}`,
    r.status === 'void' ? 'VOID' : 'OK',
    '#',
  ].join('|');
}

/** Kartu informasi berlabel; mengembalikan koordinat Y bawah kartu. */
function drawInfoCard(doc, F, k, x, y, w, title, pairs, C) {
  const padX = 8 * k;
  const padY = 6 * k;

  doc.font(F.bold).fontSize(7.4 * k).fillColor(C.muted);
  const titleH = 11 * k;

  let cy = y + padY + titleH;
  const labelW = w * 0.38;

  // Ukur dulu tinggi isi agar bingkai kartu pas.
  const lineHeights = pairs.map(([, value]) => {
    doc.font(F.medium).fontSize(8.6 * k);
    return Math.max(11 * k, doc.heightOfString(String(value ?? '-'), { width: w - labelW - padX * 2 })) + 3 * k;
  });
  const contentH = lineHeights.reduce((a, b) => a + b, 0);
  const cardH = padY * 2 + titleH + contentH;

  doc.rect(x, y, w, cardH).fillAndStroke('#fbfdfd', C.line);
  doc.lineWidth(0.6);
  doc.rect(x, y, 3 * k, cardH).fill(C.brand);

  doc.font(F.bold).fontSize(7.4 * k).fillColor(C.muted)
    .text(title, x + padX, y + padY, { width: w - padX * 2, characterSpacing: 0.7 });

  pairs.forEach(([label, value], i) => {
    doc.font(F.regular).fontSize(8 * k).fillColor(C.muted)
      .text(label, x + padX, cy, { width: labelW - 4 * k });
    doc.font(F.medium).fontSize(8.6 * k).fillColor(C.ink)
      .text(String(value ?? '-'), x + labelW, cy, { width: w - labelW - padX });
    cy += lineHeights[i];
  });

  return y + cardH;
}

/* ================================================================== */
/* Struk termal 58 mm / 80 mm                                          */
/* ================================================================== */

// Struk termal selalu monokrom, jadi tidak memakai palet warna merek.
function drawThermal(doc, r, s, F, qr) {
  const M = doc.options.margin;
  const w = doc.page.width - M * 2;
  const center = { width: w, align: 'center' };

  const rule = (dash = false) => {
    doc.moveTo(M, doc.y + 2).lineTo(doc.page.width - M, doc.y + 2).lineWidth(0.6).strokeColor('#000000');
    if (dash) doc.dash(1.5, { space: 1.5 });
    doc.stroke().undash();
    doc.y += 6;
  };

  if (s.logo_path && fs.existsSync(s.logo_path)) {
    try {
      const size = Math.min(w * 0.42, 60);
      doc.image(s.logo_path, M + (w - size) / 2, doc.y, { fit: [size, size] });
      doc.y += size + 4;
    } catch { /* lewati logo bila berkas rusak */ }
  }

  doc.font(F.bold).fontSize(10).fillColor('#000000').text(s.clinic_name, center);
  doc.font(F.regular).fontSize(6.4);
  if (s.clinic_address) doc.text(s.clinic_address, center);
  if (s.clinic_phone) doc.text(s.clinic_phone, center);
  rule();

  doc.font(F.regular).fontSize(7);
  /**
   * Baris "label — nilai" pada struk sempit.
   * Kedua sisi ditulis pada koordinat tetap, bukan dengan `continued`,
   * karena teks lanjutan menghitung lebarnya dari posisi kursor sehingga
   * nilai yang agak panjang (tanggal, nama dokter) ikut terpotong ke baris baru.
   */
  const kv = (label, value) => {
    const baris = doc.y;
    const wLabel = w * 0.3;
    doc.font(F.regular).fontSize(7).fillColor('#000000')
      .text(label, M, baris, { width: wLabel, lineBreak: false });
    doc.font(F.medium).fontSize(7)
      .text(String(value ?? '-'), M + wLabel, baris, { width: w - wLabel, align: 'right' });
    // Menulis dengan koordinat eksplisit menggeser kursor; kembalikan ke tepi
    // kiri agar baris-baris berikutnya tidak ikut menjorok dan terpotong.
    doc.x = M;
  };
  kv('No.', r.receipt_no);
  kv('Tanggal', tanggalIndo(r.receipt_date));
  kv('Pasien', r.patient_name);
  kv('No. RM', r.patient_mr_no);
  if (r.doctor_name) kv('Dokter', r.doctor_name);
  rule(true);

  (r.items || []).forEach((it) => {
    doc.font(F.medium).fontSize(7).fillColor('#000000').text(it.description, { width: w });
    doc.font(F.regular).fontSize(6.8)
      .text(`  ${it.qty} x ${rupiah(it.unit_price)}`, { width: w * 0.55, continued: true });
    doc.text(rupiah(it.line_total), { width: w * 0.45, align: 'right' });
  });
  rule(true);

  const pair = (label, value, strong = false) => {
    doc.font(strong ? F.bold : F.regular).fontSize(strong ? 8.5 : 7);
    doc.text(label, { width: w * 0.5, continued: true });
    doc.text(value, { width: w * 0.5, align: 'right' });
  };
  pair('Subtotal', rupiah(r.subtotal));
  if (r.discount > 0) pair('Diskon', `-${rupiah(r.discount)}`);
  if (r.tax > 0) pair('Pajak', rupiah(r.tax));
  pair('TOTAL', rupiah(r.total), true);
  pair('Bayar', rupiah(r.amount_paid));
  pair('Kembali', rupiah(r.change_amount));
  rule();

  doc.font(F.regular).fontSize(6.4).fillColor('#000000')
    .text(`Metode: ${METHOD_LABEL[r.payment_method] || r.payment_method}${r.payment_ref ? ` / ${r.payment_ref}` : ''}`, { width: w });
  doc.font(F.italic).fontSize(6.2).text(terbilangRupiah(r.total), { width: w });

  if (r.status === 'void') {
    doc.moveDown(0.3);
    doc.font(F.bold).fontSize(9).text('*** DIBATALKAN ***', center);
  }

  if (qr) {
    doc.moveDown(0.5);
    const size = Math.min(w * 0.5, 70);
    doc.image(qr.png, M + (w - size) / 2, doc.y, { fit: [size, size] });
    doc.y += size + 3;
    doc.font(F.regular).fontSize(5.8).text(`Kode verifikasi: ${qr.signature}`, center);
  }

  doc.moveDown(0.4);
  doc.font(F.regular).fontSize(6.2).text(`Kasir: ${r.created_by_name || '-'}`, center);
  doc.text('Terima kasih atas kunjungan Anda', center);
  doc.moveDown(0.3);
  doc.fontSize(5.4).text(machineLine(r, qr), center);
}
