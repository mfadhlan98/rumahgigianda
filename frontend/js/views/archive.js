/* Arsip kwitansi: pencarian, penyaringan, pratinjau/cetak ulang, pembatalan. */

import { api, auth } from '../api.js';
import {
  h, fmtRupiah, fmtTanggal, fmtTanggalSingkat, debounce,
  badgeMetode, badgeStatus, toastOk, toastErr, promptDialog, modal, KATEGORI_LABEL,
} from '../ui.js';
import { emptyRow, pager } from './_shared.js';
import { previewReceipt } from '../print.js';

export default { mount };

async function mount(root, { actions }) {
  const state = { page: 1, q: '', date_from: '', date_to: '', payment_method: '', status: '' };

  root.innerHTML = '';

  const tbody = h('tbody');
  const pagerSlot = h('div');
  const summarySlot = h('div', { class: 'muted small' });

  const inputQ = h('input', {
    type: 'search', placeholder: 'Nomor kwitansi, nama pasien, atau no. rekam medis…',
  });
  const inputFrom = h('input', { type: 'date' });
  const inputTo = h('input', { type: 'date' });
  const inputMethod = h('select', {},
    h('option', { value: '' }, 'Semua metode'),
    h('option', { value: 'tunai' }, 'Tunai'),
    h('option', { value: 'transfer' }, 'Transfer'),
    h('option', { value: 'kartu' }, 'Kartu'));
  const inputStatus = h('select', {},
    h('option', { value: '' }, 'Semua status'),
    h('option', { value: 'issued' }, 'Sah'),
    h('option', { value: 'void' }, 'Dibatalkan'));

  const apply = () => {
    state.q = inputQ.value.trim();
    state.date_from = inputFrom.value;
    state.date_to = inputTo.value;
    state.payment_method = inputMethod.value;
    state.status = inputStatus.value;
    state.page = 1;
    load();
  };

  inputQ.addEventListener('input', debounce(apply, 320));
  [inputFrom, inputTo, inputMethod, inputStatus].forEach((i) => i.addEventListener('change', apply));

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'field grow' }, h('label', {}, 'Cari'), inputQ),
    h('div', { class: 'field' }, h('label', {}, 'Dari tanggal'), inputFrom),
    h('div', { class: 'field' }, h('label', {}, 'Sampai tanggal'), inputTo),
    h('div', { class: 'field' }, h('label', {}, 'Metode'), inputMethod),
    h('div', { class: 'field' }, h('label', {}, 'Status'), inputStatus),
    h('div', { class: 'field' }, h('label', { class: 'sr-only' }, 'Aksi'),
      h('button', {
        type: 'button',
        onClick: () => {
          [inputQ, inputFrom, inputTo].forEach((i) => { i.value = ''; });
          inputMethod.value = ''; inputStatus.value = '';
          apply();
        },
      }, 'Reset')));

  root.append(h('div', { class: 'card' },
    toolbar,
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Nomor Kwitansi'),
          h('th', {}, 'Tanggal'),
          h('th', {}, 'Pasien'),
          h('th', {}, 'Perawatan'),
          h('th', {}, 'Metode'),
          h('th', {}, 'Status'),
          h('th', { class: 'num' }, 'Total'),
          h('th', {}, ''))),
        tbody)),
    pagerSlot));

  actions.append(summarySlot);

  async function load() {
    tbody.innerHTML = '';
    tbody.append(h('tr', {}, h('td', { colspan: '8' }, h('div', { class: 'skeleton' }, 'Memuat…'))));

    try {
      const res = await api.get(`/receipts${api.qs({ ...state, limit: 20 })}`);
      render(res);
    } catch (err) {
      tbody.innerHTML = '';
      tbody.append(h('tr', {}, h('td', { colspan: '8' },
        h('div', { class: 'alert err' }, err.message))));
    }
  }

  function render(res) {
    const rows = res.data || [];
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.append(emptyRow(8, 'Tidak ada kwitansi yang cocok',
        'Coba ubah kata kunci atau rentang tanggalnya.'));
    } else {
      for (const r of rows) {
        tbody.append(h('tr', {},
          h('td', {}, h('span', { class: 'mono' }, r.receipt_no)),
          h('td', { class: 'nowrap' }, fmtTanggalSingkat(r.receipt_date)),
          h('td', {}, h('div', {}, r.patient_name), h('div', { class: 'muted' }, r.patient_mr_no)),
          h('td', {}, r.treatment_type || h('span', { class: 'muted' }, '—')),
          h('td', { html: badgeMetode(r.payment_method) }),
          h('td', { html: badgeStatus(r.status) }),
          h('td', { class: 'num' }, fmtRupiah(r.total)),
          h('td', { class: 'actions' },
            h('button', { type: 'button', class: 'btn-sm', onClick: () => openDetail(r) }, 'Rincian'),
            ' ',
            h('button', {
              type: 'button', class: 'btn-sm btn-primary',
              onClick: () => previewReceipt(r.id, r.receipt_no).catch((e) => toastErr(e.message)),
            }, 'Cetak'))));
      }
    }

    summarySlot.textContent = `Total nilai (kwitansi sah): ${fmtRupiah(res.meta?.sum_total || 0)}`;

    pagerSlot.innerHTML = '';
    pagerSlot.append(pager(res.meta, (p) => { state.page = p; load(); }));
  }

  /* ---------------- Rincian & pembatalan ---------------- */

  async function openDetail(row) {
    let full;
    try {
      full = await api.get(`/receipts/${row.id}`);
    } catch (err) {
      toastErr(err.message);
      return;
    }
    const r = full.data;

    await modal({
      title: `Kwitansi ${r.receipt_no}`,
      wide: true,
      render: (body, close) => {
        if (r.status === 'void') {
          body.append(h('div', { class: 'alert err' },
            `Kwitansi ini dibatalkan oleh ${r.voided_by_name || '-'} pada ${r.voided_at || '-'}. Alasan: ${r.void_reason || '-'}`));
        }

        body.append(h('div', { class: 'grid cols-2 mb-2' },
          h('dl', { class: 'kv' },
            dt('Pasien'), dd(r.patient_name),
            dt('No. Rekam Medis'), dd(r.patient_mr_no),
            dt('Telepon'), dd(r.patient_phone || '—'),
            dt('Tanggal'), dd(fmtTanggal(r.receipt_date))),
          h('dl', { class: 'kv' },
            dt('Jenis Perawatan'), dd(r.treatment_type || '—'),
            dt('Dokter'), dd(r.doctor_name || '—'),
            dt('Kasir'), dd(r.created_by_name || '—'),
            dt('Kode Verifikasi'), dd(full.verification?.signature || '—'))));

        const tb = h('tbody');
        (r.items || []).forEach((it, i) => tb.append(h('tr', {},
          h('td', {}, String(i + 1)),
          h('td', {}, h('div', {}, it.description),
            h('div', { class: 'muted small' }, KATEGORI_LABEL[it.category] || it.category)),
          h('td', { class: 'mid' }, String(it.qty)),
          h('td', { class: 'num' }, fmtRupiah(it.unit_price)),
          h('td', { class: 'num' }, fmtRupiah(it.line_total)))));

        body.append(h('div', { class: 'table-wrap mb-2' },
          h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, '#'), h('th', {}, 'Keterangan'), h('th', { class: 'mid' }, 'Qty'),
              h('th', { class: 'num' }, 'Harga'), h('th', { class: 'num' }, 'Jumlah'))),
            tb)));

        body.append(h('div', { class: 'total-panel' },
          row2('Subtotal', fmtRupiah(r.subtotal)),
          r.discount > 0 ? row2('Diskon', `- ${fmtRupiah(r.discount)}`) : null,
          r.tax > 0 ? row2('Pajak', fmtRupiah(r.tax)) : null,
          row2('Total', fmtRupiah(r.total), 'grand'),
          row2('Uang diterima', fmtRupiah(r.amount_paid)),
          row2('Kembalian', fmtRupiah(r.change_amount)),
          h('div', { class: 'terbilang' }, full.terbilang)));

        if (r.notes) body.append(h('div', { class: 'alert info mt-2' }, `Catatan: ${r.notes}`));

        body._close = close;
      },
      footer: (foot, close) => {
        foot.append(h('button', { type: 'button', onClick: () => close() }, 'Tutup'));

        if (auth.isAdmin && r.status !== 'void') {
          foot.append(h('button', {
            type: 'button', class: 'btn-danger',
            onClick: async () => {
              const reason = await promptDialog({
                title: 'Batalkan Kwitansi',
                label: `Alasan pembatalan ${r.receipt_no}`,
                placeholder: 'mis. salah input tindakan',
                confirmLabel: 'Batalkan Kwitansi',
                danger: true,
                minLength: 5,
                multiline: true,
              });
              if (!reason) return;
              try {
                const res = await api.post(`/receipts/${r.id}/void`, { reason });
                toastOk(res.message, 'Dibatalkan');
                close();
                load();
              } catch (err) {
                toastErr(err.message);
              }
            },
          }, 'Batalkan Kwitansi'));
        }

        foot.append(h('button', {
          type: 'button', class: 'btn-primary',
          onClick: () => previewReceipt(r.id, r.receipt_no).catch((e) => toastErr(e.message)),
        }, 'Cetak / Unduh'));
      },
    });
  }

  load();
}

const dt = (t) => h('dt', {}, t);
const dd = (t) => h('dd', {}, t);
const row2 = (label, value, kind = '') =>
  h('div', { class: `total-row ${kind}` }, h('span', {}, label), h('span', { class: 'v' }, value));
