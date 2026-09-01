/* Dasbor: ringkasan hari ini dan kwitansi terakhir. */

import { api, auth } from '../api.js';
import {
  h, fmtRupiah, fmtAngka, fmtTanggal, todayISO, firstOfMonthISO,
  badgeMetode, badgeStatus, toastErr,
} from '../ui.js';
import { card, emptyRow } from './_shared.js';
import { previewReceipt } from '../print.js';

export default { mount };

async function mount(root, { actions }) {
  const today = todayISO();

  const [hariIni, bulanIni, terakhir] = await Promise.all([
    api.get(`/reports/summary${api.qs({ date_from: today, date_to: today })}`),
    api.get(`/reports/summary${api.qs({ date_from: firstOfMonthISO(), date_to: today })}`),
    api.get(`/receipts${api.qs({ limit: 8 })}`),
  ]);

  actions.append(h('a', { class: 'btn btn-primary', href: '#/kwitansi/baru' }, '+ Kwitansi Baru'));

  root.innerHTML = '';

  /* ---------------- Kartu statistik ---------------- */

  root.append(h('div', { class: 'grid cols-4 mb-2' },
    stat('Pendapatan Hari Ini', fmtRupiah(hariIni.totals.pendapatan),
      `${fmtAngka(hariIni.totals.jumlah_kwitansi)} kwitansi diterbitkan`, true),
    stat('Pendapatan Bulan Ini', fmtRupiah(bulanIni.totals.pendapatan),
      `${fmtAngka(bulanIni.totals.jumlah_kwitansi)} kwitansi sejak ${fmtTanggal(firstOfMonthISO())}`),
    stat('Rata-rata per Kwitansi',
      fmtRupiah(bulanIni.totals.jumlah_kwitansi > 0
        ? bulanIni.totals.pendapatan / bulanIni.totals.jumlah_kwitansi : 0),
      'Bulan berjalan'),
    stat('Kwitansi Dibatalkan', fmtAngka(bulanIni.totals.kwitansi_batal),
      'Bulan berjalan · tidak dihitung sebagai pendapatan'),
  ));

  /* ---------------- Metode pembayaran + kategori ---------------- */

  const byMethod = bulanIni.by_method || [];
  const byCategory = bulanIni.by_category || [];

  root.append(h('div', { class: 'grid cols-2' },
    card('Metode Pembayaran', 'Bulan berjalan',
      byMethod.length ? bars(byMethod, (r) => labelMetode(r.payment_method), (r) => Number(r.nilai))
        : h('div', { class: 'empty' }, 'Belum ada transaksi bulan ini.')),
    card('Komposisi Layanan', 'Bulan berjalan',
      byCategory.length ? bars(byCategory, (r) => labelKategori(r.category), (r) => Number(r.nilai))
        : h('div', { class: 'empty' }, 'Belum ada transaksi bulan ini.')),
  ));

  /* ---------------- Kwitansi terakhir ---------------- */

  const tbody = h('tbody');
  const rows = terakhir.data || [];

  if (!rows.length) {
    tbody.append(emptyRow(6, 'Belum ada kwitansi',
      'Kwitansi yang Anda buat akan muncul di sini.'));
  } else {
    for (const r of rows) {
      tbody.append(h('tr', {},
        h('td', {}, h('div', { class: 'mono' }, r.receipt_no),
          h('div', { class: 'muted' }, fmtTanggal(r.receipt_date))),
        h('td', {}, h('div', {}, r.patient_name), h('div', { class: 'muted' }, r.patient_mr_no)),
        h('td', { html: badgeMetode(r.payment_method) }),
        h('td', { html: badgeStatus(r.status) }),
        h('td', { class: 'num' }, fmtRupiah(r.total)),
        h('td', { class: 'actions' },
          h('button', {
            type: 'button', class: 'btn-sm',
            onClick: () => previewReceipt(r.id, r.receipt_no).catch((e) => toastErr(e.message)),
          }, 'Lihat & Cetak'))));
    }
  }

  root.append(card('Kwitansi Terakhir', `Masuk sebagai ${auth.user?.full_name || '-'}`,
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Nomor & Tanggal'),
          h('th', {}, 'Pasien'),
          h('th', {}, 'Metode'),
          h('th', {}, 'Status'),
          h('th', { class: 'num' }, 'Total'),
          h('th', {}, ''))),
        tbody)),
    h('a', { class: 'btn btn-sm', href: '#/arsip' }, 'Lihat Semua Arsip'),
    'card-body tight'));
}

/* ---------------- Pembantu ---------------- */

function stat(label, value, foot, accent = false) {
  return h('div', { class: `stat${accent ? ' accent' : ''}` },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value' }, value),
    h('div', { class: 'foot' }, foot));
}

/** Diagram batang horizontal sederhana — cukup untuk membaca proporsi sekilas. */
function bars(rows, labelOf, valueOf) {
  const max = Math.max(...rows.map(valueOf), 1);
  const total = rows.reduce((s, r) => s + valueOf(r), 0) || 1;

  return h('div', {}, ...rows.map((r) => {
    const v = valueOf(r);
    return h('div', { style: 'margin-bottom:12px' },
      h('div', { style: 'display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px' },
        h('span', {}, labelOf(r)),
        h('span', { class: 'nowrap' },
          h('strong', {}, fmtRupiah(v)),
          h('span', { class: 'muted small' }, ` · ${Math.round((v / total) * 100)}%`))),
      h('div', { style: 'height:8px;background:var(--line-soft);border-radius:6px;overflow:hidden' },
        h('div', {
          style: `height:100%;width:${Math.max(3, (v / max) * 100)}%;background:var(--brand-500);border-radius:6px`,
        })));
  }));
}

const labelMetode = (m) => ({ tunai: 'Tunai', transfer: 'Transfer Bank', kartu: 'Kartu Debit/Kredit' }[m] || m);
const labelKategori = (c) => ({ tindakan: 'Tindakan', obat: 'Obat', konsultasi: 'Konsultasi', lainnya: 'Lainnya' }[c] || c);
