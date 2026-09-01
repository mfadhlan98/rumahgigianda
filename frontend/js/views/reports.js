/* Laporan keuangan: rekap per rentang tanggal, rincian harian, dan ekspor CSV. */

import { api, auth } from '../api.js';
import {
  h, fmtRupiah, fmtAngka, fmtTanggal, fmtTanggalSingkat, todayISO, firstOfMonthISO,
  downloadBlob, toastOk, toastErr,
} from '../ui.js';
import { card, emptyRow } from './_shared.js';

export default { mount };

async function mount(root, { actions }) {
  const state = { date_from: firstOfMonthISO(), date_to: todayISO() };

  root.innerHTML = '';

  const inputFrom = h('input', { type: 'date', value: state.date_from, max: todayISO() });
  const inputTo = h('input', { type: 'date', value: state.date_to, max: todayISO() });
  const body = h('div');

  const apply = () => {
    if (inputFrom.value) state.date_from = inputFrom.value;
    if (inputTo.value) state.date_to = inputTo.value;
    if (state.date_from > state.date_to) {
      [state.date_from, state.date_to] = [state.date_to, state.date_from];
      inputFrom.value = state.date_from;
      inputTo.value = state.date_to;
    }
    load();
  };
  inputFrom.addEventListener('change', apply);
  inputTo.addEventListener('change', apply);

  const preset = (label, from, to) => h('button', {
    type: 'button', class: 'btn-sm',
    onClick: () => { inputFrom.value = from; inputTo.value = to; apply(); },
  }, label);

  root.append(h('div', { class: 'card' },
    h('div', { class: 'toolbar' },
      h('div', { class: 'field' }, h('label', {}, 'Dari tanggal'), inputFrom),
      h('div', { class: 'field' }, h('label', {}, 'Sampai tanggal'), inputTo),
      h('div', { class: 'field' },
        h('label', {}, 'Pintasan'),
        h('div', { class: 'btn-row' },
          preset('Hari ini', todayISO(), todayISO()),
          preset('Bulan ini', firstOfMonthISO(), todayISO()),
          preset('Bulan lalu', ...bulanLalu()),
          preset('Tahun ini', `${new Date().getFullYear()}-01-01`, todayISO()))),
      h('div', { class: 'spacer' }))));

  root.append(body);

  actions.append(h('button', {
    type: 'button',
    onClick: async (e) => {
      e.target.disabled = true;
      try {
        const blob = await api.file(`/reports/export.csv${api.qs(state)}`);
        downloadBlob(blob, `Laporan-Kwitansi-${state.date_from}_sd_${state.date_to}.csv`);
        toastOk('Berkas CSV diunduh. Buka dengan Excel atau LibreOffice.');
      } catch (err) {
        toastErr(err.message);
      } finally {
        e.target.disabled = false;
      }
    },
  }, 'Ekspor CSV'));

  async function load() {
    body.innerHTML = '<div class="skeleton">Menghitung…</div>';
    try {
      const res = await api.get(`/reports/summary${api.qs(state)}`);
      render(res);
    } catch (err) {
      body.innerHTML = '';
      body.append(h('div', { class: 'alert err' }, err.message));
    }
  }

  function render(res) {
    const t = res.totals;
    const hari = res.daily || [];
    const rentangHari = hari.length || 1;

    body.innerHTML = '';

    body.append(h('div', { class: 'grid cols-4 mb-2' },
      stat('Total Pendapatan', fmtRupiah(t.pendapatan), `${fmtTanggal(res.range.from)} – ${fmtTanggal(res.range.to)}`, true),
      stat('Jumlah Kwitansi', fmtAngka(t.jumlah_kwitansi), `${fmtAngka(t.kwitansi_batal)} dibatalkan`),
      stat('Rata-rata per Hari', fmtRupiah(t.pendapatan / rentangHari), `${rentangHari} hari ada transaksi`),
      stat('Total Diskon', fmtRupiah(t.total_diskon), t.total_pajak > 0 ? `Pajak: ${fmtRupiah(t.total_pajak)}` : 'Tidak ada pajak tercatat')));

    body.append(h('div', { class: 'grid cols-2' },
      card('Rekap per Metode Pembayaran', null,
        tableOf(['Metode', 'Jumlah', 'Nilai'], res.by_method, (r) => [
          labelMetode(r.payment_method), fmtAngka(r.jumlah), fmtRupiah(r.nilai),
        ], 'Belum ada transaksi pada rentang ini.'), null, 'card-body tight'),
      card('Rekap per Kategori Layanan', null,
        tableOf(['Kategori', 'Baris', 'Nilai'], res.by_category, (r) => [
          labelKategori(r.category), fmtAngka(r.jumlah_baris), fmtRupiah(r.nilai),
        ], 'Belum ada transaksi pada rentang ini.'), null, 'card-body tight')));

    body.append(card('Layanan Terlaris', 'Diurutkan berdasarkan nilai penjualan',
      tableOf(['Layanan', 'Qty', 'Nilai'], res.top_services, (r) => [
        r.description, fmtAngka(r.total_qty), fmtRupiah(r.nilai),
      ], 'Belum ada layanan tercatat pada rentang ini.'), null, 'card-body tight'));

    body.append(card('Rincian Harian', null,
      tableOf(['Tanggal', 'Jumlah Kwitansi', 'Pendapatan'], hari, (r) => [
        fmtTanggalSingkat(r.receipt_date), fmtAngka(r.jumlah), fmtRupiah(r.nilai),
      ], 'Belum ada transaksi pada rentang ini.'), null, 'card-body tight'));

    if (!auth.isAdmin) {
      body.append(h('div', { class: 'alert info' },
        'Laporan ini mencakup seluruh transaksi klinik, bukan hanya yang Anda buat.'));
    }
  }

  load();
}

/* ---------------- Pembantu ---------------- */

function stat(label, value, foot, accent = false) {
  return h('div', { class: `stat${accent ? ' accent' : ''}` },
    h('div', { class: 'label' }, label),
    h('div', { class: 'value' }, value),
    h('div', { class: 'foot' }, foot));
}

function tableOf(headers, rows, mapRow, emptyText) {
  const tb = h('tbody');
  if (!rows || !rows.length) {
    tb.append(emptyRow(headers.length, emptyText));
  } else {
    for (const r of rows) {
      const cells = mapRow(r);
      tb.append(h('tr', {}, ...cells.map((c, i) =>
        h('td', { class: i === 0 ? '' : 'num' }, String(c)))));
    }
  }
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {}, ...headers.map((x, i) =>
        h('th', { class: i === 0 ? '' : 'num' }, x)))),
      tb));
}

function bulanLalu() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const p = (x) => String(x).padStart(2, '0');
  const from = `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())}`;
  return [from, to];
}

const labelMetode = (m) => ({ tunai: 'Tunai', transfer: 'Transfer Bank', kartu: 'Kartu Debit/Kredit' }[m] || m);
const labelKategori = (c) => ({ tindakan: 'Tindakan', obat: 'Obat', konsultasi: 'Konsultasi', lainnya: 'Lainnya' }[c] || c);
