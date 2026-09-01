/* Master tarif layanan: tindakan, obat, konsultasi, dan lainnya. */

import { api, auth } from '../api.js';
import {
  h, fmtRupiah, parseUang, debounce, toastOk, toastErr,
  applyErrors, modal, confirmDialog, KATEGORI_LABEL,
} from '../ui.js';
import { field, collect, emptyRow } from './_shared.js';

export default { mount };

async function mount(root, { actions }) {
  const state = { q: '', category: '', include_inactive: '' };

  root.innerHTML = '';
  const tbody = h('tbody');

  const inputQ = h('input', { type: 'search', placeholder: 'Nama atau kode layanan…' });
  const inputCat = h('select', {},
    h('option', { value: '' }, 'Semua kategori'),
    ...Object.entries(KATEGORI_LABEL).map(([v, l]) => h('option', { value: v }, l)));
  const chkInactive = h('input', { type: 'checkbox', id: 'svcInactive' });

  const apply = () => {
    state.q = inputQ.value.trim();
    state.category = inputCat.value;
    state.include_inactive = chkInactive.checked ? '1' : '';
    load();
  };
  inputQ.addEventListener('input', debounce(apply, 300));
  inputCat.addEventListener('change', apply);
  chkInactive.addEventListener('change', apply);

  root.append(h('div', { class: 'card' },
    h('div', { class: 'toolbar' },
      h('div', { class: 'field grow' }, h('label', {}, 'Cari layanan'), inputQ),
      h('div', { class: 'field' }, h('label', {}, 'Kategori'), inputCat),
      h('div', { class: 'field' },
        h('label', { class: 'sr-only' }, 'Filter'),
        h('div', { class: 'check' }, chkInactive, h('label', { for: 'svcInactive' }, 'Tampilkan yang nonaktif')))),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Kode'),
          h('th', {}, 'Nama Layanan'),
          h('th', {}, 'Kategori'),
          h('th', { class: 'num' }, 'Tarif Standar'),
          h('th', {}, 'Status'),
          h('th', {}, ''))),
        tbody))));

  root.append(h('div', { class: 'alert info' },
    'Tarif di sini hanya menjadi nilai awal saat membuat kwitansi. Kasir tetap bisa menyesuaikan harga per transaksi bila diperlukan.'));

  if (auth.isAdmin) {
    actions.append(h('button', { type: 'button', class: 'btn-primary', onClick: () => openForm(null) }, '+ Layanan Baru'));
  }

  async function load() {
    tbody.innerHTML = '';
    tbody.append(h('tr', {}, h('td', { colspan: '6' }, h('div', { class: 'skeleton' }, 'Memuat…'))));
    try {
      const res = await api.get(`/service-items${api.qs(state)}`);
      render(res.data || []);
    } catch (err) {
      tbody.innerHTML = '';
      tbody.append(h('tr', {}, h('td', { colspan: '6' }, h('div', { class: 'alert err' }, err.message))));
    }
  }

  function render(rows) {
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.append(emptyRow(6, 'Belum ada layanan',
        auth.isAdmin ? 'Tambahkan lewat tombol “+ Layanan Baru”.' : 'Hubungi administrator untuk menambah tarif.'));
      return;
    }

    for (const s of rows) {
      tbody.append(h('tr', {},
        h('td', {}, h('span', { class: 'mono' }, s.code)),
        h('td', {}, s.name),
        h('td', {}, h('span', { class: 'badge' }, KATEGORI_LABEL[s.category] || s.category)),
        h('td', { class: 'num' }, fmtRupiah(s.default_price)),
        h('td', { html: s.is_active ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>' }),
        h('td', { class: 'actions' },
          auth.isAdmin
            ? h('button', { type: 'button', class: 'btn-sm', onClick: () => openForm(s) }, 'Ubah')
            : h('span', { class: 'muted small' }, 'hanya admin'),
          auth.isAdmin ? ' ' : null,
          auth.isAdmin
            ? h('button', { type: 'button', class: 'btn-sm', onClick: () => toggleStatus(s) },
              s.is_active ? 'Nonaktifkan' : 'Aktifkan')
            : null)));
    }
  }

  async function openForm(existing) {
    const isEdit = Boolean(existing);

    const saved = await modal({
      title: isEdit ? `Ubah Layanan — ${existing.name}` : 'Tambah Layanan Baru',
      render: (body, close) => {
        const price = h('input', {
          type: 'text', name: 'default_price', class: 'money', inputmode: 'numeric',
          value: existing ? String(existing.default_price) : '0',
        });
        price.addEventListener('blur', () => { price.value = String(parseUang(price.value)); });

        body.append(
          h('div', { class: 'alert', 'data-form-alert': '' }),
          h('div', { class: 'grid cols-2' },
            field('Kode *', h('input', { type: 'text', name: 'code', value: existing?.code || '' }),
              'mis. TIN-01, OBT-02'),
            field('Kategori *', h('select', { name: 'category' },
              ...Object.entries(KATEGORI_LABEL).map(([v, l]) =>
                h('option', { value: v, selected: (existing?.category || 'tindakan') === v || null }, l))))),
          field('Nama Layanan *', h('input', { type: 'text', name: 'name', value: existing?.name || '' })),
          field('Tarif Standar (Rp) *', price, 'Isi angka saja, tanpa titik atau "Rp".'),
        );

        body._submit = async () => {
          const payload = collect(body);
          payload.default_price = parseUang(payload.default_price);
          try {
            const res = isEdit
              ? await api.put(`/service-items/${existing.id}`, payload)
              : await api.post('/service-items', payload);
            close(res);
          } catch (err) {
            applyErrors(body, err);
          }
        };
      },
      footer: (foot, close) => {
        foot.append(
          h('button', { type: 'button', onClick: () => close(null) }, 'Batal'),
          h('button', {
            type: 'button', class: 'btn-primary',
            onClick: (e) => e.target.closest('.modal').querySelector('.modal-body')._submit(),
          }, isEdit ? 'Simpan Perubahan' : 'Simpan Layanan'));
      },
    });

    if (saved) {
      toastOk(saved.message);
      load();
    }
  }

  async function toggleStatus(s) {
    const activate = !s.is_active;
    const ok = await confirmDialog({
      title: activate ? 'Aktifkan Layanan' : 'Nonaktifkan Layanan',
      message: activate
        ? `Aktifkan kembali "${s.name}"?`
        : `Nonaktifkan "${s.name}"? Layanan tidak lagi muncul saat membuat kwitansi baru, tetapi kwitansi lama tetap utuh.`,
      confirmLabel: activate ? 'Aktifkan' : 'Nonaktifkan',
      danger: !activate,
    });
    if (!ok) return;

    try {
      const res = await api.patch(`/service-items/${s.id}/status`, { is_active: activate });
      toastOk(res.message);
      load();
    } catch (err) {
      toastErr(err.message);
    }
  }

  load();
}
