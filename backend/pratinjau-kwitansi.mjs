/**
 * Membuat pratinjau kwitansi memakai profil klinik yang tersimpan,
 * TANPA menulis apa pun ke database.
 *
 * Berguna untuk memeriksa hasil cetak setelah mengganti logo, warna merek,
 * atau data klinik — tanpa perlu menerbitkan kwitansi sungguhan yang nanti
 * harus dibatalkan.
 *
 *   node pratinjau-kwitansi.mjs                 -> pratinjau-a5.pdf
 *   node pratinjau-kwitansi.mjs a5land a4 thermal80  -> beberapa ukuran sekaligus
 */

import fs from 'node:fs';
import { buildReceiptPdf, UKURAN_CETAK } from './src/services/pdf.js';
import { db } from './src/db/index.js';

/* Data contoh sengaja fiktif — berkas ini ikut disertakan ke mana pun aplikasi
   dipasang, jadi tidak boleh memuat identitas klinik atau pasien sungguhan.
   Profil klinik pada hasil cetak tetap diambil dari pengaturan yang tersimpan. */
const CONTOH = {
  id: 0,
  receipt_no: 'CTH/202601/0001',
  receipt_date: '2026-01-15',
  patient_name: 'Nama Pasien Contoh',
  patient_mr_no: 'RM-000001',
  patient_phone: '0800 0000 0000',
  treatment_type: 'Pembersihan karang gigi & konsultasi',
  doctor_name: 'drg. Nama Dokter',
  created_by_name: 'Petugas Kasir',
  payment_method: 'transfer',
  payment_ref: 'TRF-NAGARI-20260901-0088',
  subtotal: 400000,
  discount: 0,
  tax: 0,
  total: 400000,
  amount_paid: 400000,
  change_amount: 0,
  notes: 'Kontrol ulang 6 bulan lagi.',
  status: 'issued',
  patient_id: 0,
  items: [
    { description: 'Konsultasi Dokter Gigi', category: 'konsultasi', qty: 1, unit_price: 50000, line_total: 50000 },
    { description: 'Pembersihan Karang Gigi (Scaling) Rahang Atas & Bawah', category: 'tindakan', qty: 1, unit_price: 350000, line_total: 350000 },
  ],
};

const ukuran = process.argv.slice(2).filter((a) => UKURAN_CETAK.includes(a));
const dipakai = ukuran.length ? ukuran : ['a5land'];

for (const size of dipakai) {
  const doc = await buildReceiptPdf(CONTOH, size);
  const out = fs.createWriteStream(`pratinjau-${size}.pdf`);
  doc.pipe(out);
  await new Promise((r) => out.on('finish', r));
  console.log(`  pratinjau-${size}.pdf  (${(fs.statSync(`pratinjau-${size}.pdf`).size / 1024).toFixed(0)} KB)`);
}

await db.close();
console.log('\n  Pratinjau memakai profil klinik yang tersimpan. Tidak ada data yang ditulis.');
