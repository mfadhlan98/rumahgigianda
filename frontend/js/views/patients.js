/* Master data pasien: daftar, tambah, ubah, aktif/nonaktif, riwayat kwitansi. */

import { api, auth } from '../api.js';
import {
  h, esc, fmtRupiah, fmtTanggal, fmtTanggalSingkat, todayISO, debounce,
  toastOk, toastErr, applyErrors, modal, confirmDialog, badgeStatus,
} from '../ui.js';
import { field, collect, emptyRow, pager } from './_shared.js';
import { previewReceipt } from '../print.js';

export default { mount };

async function mount(root, { actions }) {
  const state = { page: 1, q: '', include_inactive: '' };

  root.innerHTML = '';
  const tbody = h('tbody');
  const pagerSlot = h('div');

  const inputQ = h('input', { type: 'search', placeholder: 'Nama, no. rekam medis, atau telepon…' });
  const chkInactive = h('input', { type: 'checkbox', id: 'incInactive' });

  const apply = () => {
    state.q = inputQ.value.trim();
    state.include_inactive = chkInactive.checked ? '1' : '';
    state.page = 1;
    load();
  };
  inputQ.addEventListener('input', debounce(apply, 320));
  chkInactive.addEventListener('change', apply);

  root.append(h('div', { class: 'card' },
    h('div', { class: 'toolbar' },
      h('div', { class: 'field grow' }, h('label', {}, 'Cari pasien'), inputQ),
      h('div', { class: 'field' },
        h('label', { class: 'sr-only' }, 'Filter'),
        h('div', { class: 'check' }, chkInactive, h('label', { for: 'incInactive' }, 'Tampilkan pasien nonaktif')))),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'No. Rekam Medis'),
          h('th', {}, 'Nama Pasien'),
          h('th', {}, 'Tanggal Lahir'),
          h('th', {}, 'Telepon'),
          h('th', {}, 'Status'),
          h('th', {}, ''))),
        tbody)),
    pagerSlot));

  actions.append(h('button', { type: 'button', class: 'btn-primary', onClick: () => openForm(null) }, '+ Pasien Baru'));

  async function load() {
    tbody.innerHTML = '';
    tbody.append(h('tr', {}, h('td', { colspan: '6' }, h('div', { class: 'skeleton' }, 'Memuat…'))));
    try {
      const res = await api.get(`/patients${api.qs({ ...state, limit: 20 })}`);
      render(res);
    } catch (err) {
      tbody.innerHTML = '';
      tbody.append(h('tr', {}, h('td', { colspan: '6' }, h('div', { class: 'alert err' }, err.message))));
    }
  }

  function render(res) {
    const rows = res.data || [];
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.append(emptyRow(6, 'Belum ada data pasien', 'Tambahkan pasien lewat tombol “+ Pasien Baru”.'));
    } else {
      for (const p of rows) {
        tbody.append(h('tr', {},
          h('td', {}, h('span', { class: 'mono' }, p.medical_record_no)),
          h('td', {}, h('div', {}, p.name),
            p.address ? h('div', { class: 'muted small' }, p.address) : null),
          h('td', {}, p.birth_date ? fmtTanggalSingkat(p.birth_date) : h('span', { class: 'muted' }, '—')),
          h('td', {}, p.phone || h('span', { class: 'muted' }, '—')),
          h('td', { html: p.is_active ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>' }),
          h('td', { class: 'actions' },
            h('button', { type: 'button', class: 'btn-sm', onClick: () => openHistory(p) }, 'Riwayat'),
            ' ',
            h('button', { type: 'button', class: 'btn-sm', onClick: () => openForm(p) }, 'Ubah'),
            auth.isAdmin ? ' ' : null,
            auth.isAdmin
              ? h('button', {
                type: 'button', class: 'btn-sm',
                onClick: () => toggleStatus(p),
              }, p.is_active ? 'Nonaktifkan' : 'Aktifkan')
              : null)));
      }
    }

    pagerSlot.innerHTML = '';
    pagerSlot.append(pager(res.meta, (p) => { state.page = p; load(); }));
  }

  /* ---------------- Formulir tambah/ubah ---------------- */

  async function openForm(existing) {
    const isEdit = Boolean(existing);
    const suggested = isEdit ? existing.medical_record_no
      : await api.get('/patients/next-mr-no').then((r) => r.medical_record_no).catch(() => '');

    const saved = await modal({
      title: isEdit ? `Ubah Pasien — ${existing.name}` : 'Tambah Pasien Baru',
      wide: true,
      render: (body, close) => {
        body.append(
          h('div', { class: 'alert', 'data-form-alert': '' }),
          h('div', { class: 'grid cols-2' },
            field('No. Rekam Medis *', h('input', {
              type: 'text', name: 'medical_record_no', value: suggested,
            }), isEdit ? 'Mengubah nomor ini tidak memengaruhi kwitansi lama.' : 'Diusulkan otomatis, boleh diganti.'),
            field('Nama Lengkap *', h('input', { type: 'text', name: 'name', value: existing?.name || '' }))),
          h('div', { class: 'grid cols-2' },
            field('Tanggal Lahir', h('input', {
              type: 'date', name: 'birth_date', max: todayISO(),
              value: existing?.birth_date ? String(existing.birth_date).slice(0, 10) : '',
            })),
            field('Jenis Kelamin', h('select', { name: 'gender' },
              h('option', { value: '', selected: !existing?.gender || null }, '— pilih —'),
              h('option', { value: 'L', selected: existing?.gender === 'L' || null }, 'Laki-laki'),
              h('option', { value: 'P', selected: existing?.gender === 'P' || null }, 'Perempuan')))),
          field('Telepon', h('input', { type: 'text', name: 'phone', value: existing?.phone || '', placeholder: '08xx' })),
          field('Alamat', h('textarea', { name: 'address', rows: 2 }, existing?.address || '')),
          field('Catatan', h('textarea', { name: 'note', rows: 2 }, existing?.note || ''),
            'Catatan internal, tidak tercetak di kwitansi.'),
        );

        body._submit = async (allowDuplicate) => {
          const payload = collect(body);
          if (allowDuplicate) payload.allow_duplicate = true;
          try {
            const res = isEdit
              ? await api.put(`/patients/${existing.id}`, payload)
              : await api.post('/patients', payload);
            close(res);
          } catch (err) {
            if (err.status === 409 && err.details?.code === 'DUPLICATE_PATIENT' && !allowDuplicate) {
              const box = body.querySelector('[data-form-alert]');
              box.className = 'alert warn';
              box.innerHTML = `${esc(err.message)}<br><button type="button" class="btn-sm mt-1" id="forceDup">Tetap simpan sebagai pasien baru</button>`;
              box.querySelector('#forceDup').addEventListener('click', () => body._submit(true));
              return;
            }
            applyErrors(body, err);
          }
        };
      },
      footer: (foot, close) => {
        foot.append(
          h('button', { type: 'button', onClick: () => close(null) }, 'Batal'),
          h('button', {
            type: 'button', class: 'btn-primary',
            onClick: (e) => e.target.closest('.modal').querySelector('.modal-body')._submit(false),
          }, isEdit ? 'Simpan Perubahan' : 'Simpan Pasien'));
      },
    });

    if (saved) {
      toastOk(saved.message);
      load();
    }
  }

  async function toggleStatus(p) {
    const activate = !p.is_active;
    const ok = await confirmDialog({
      title: activate ? 'Aktifkan Pasien' : 'Nonaktifkan Pasien',
      message: activate
        ? `Aktifkan kembali ${p.name}? Pasien akan bisa dipilih saat membuat kwitansi.`
        : `Nonaktifkan ${p.name}? Riwayat kwitansinya tetap tersimpan untuk audit, tetapi pasien tidak bisa dipilih pada kwitansi baru.`,
      confirmLabel: activate ? 'Aktifkan' : 'Nonaktifkan',
      danger: !activate,
    });
    if (!ok) return;

    try {
      const res = await api.patch(`/patients/${p.id}/status`, { is_active: activate });
      toastOk(res.message);
      load();
    } catch (err) {
      toastErr(err.message);
    }
  }

  /* ---------------- Riwayat kwitansi pasien ---------------- */

  async function openHistory(p) {
    let detail;
    try {
      detail = await api.get(`/patients/${p.id}`);
    } catch (err) {
      toastErr(err.message);
      return;
    }
    const receipts = detail.data.receipts || [];

    await modal({
      title: `Riwayat — ${p.name}`,
      wide: true,
      render: (body) => {
        body.append(h('dl', { class: 'kv mb-2' },
          h('dt', {}, 'No. Rekam Medis'), h('dd', {}, p.medical_record_no),
          h('dt', {}, 'Tanggal Lahir'), h('dd', {}, p.birth_date ? fmtTanggal(p.birth_date) : '—'),
          h('dt', {}, 'Telepon'), h('dd', {}, p.phone || '—'),
          h('dt', {}, 'Alamat'), h('dd', {}, p.address || '—')));

        if (!receipts.length) {
          body.append(h('div', { class: 'empty' },
            h('strong', {}, 'Belum ada kwitansi'), 'Pasien ini belum pernah melakukan pembayaran.'));
          return;
        }

        const tb = h('tbody');
        for (const r of receipts) {
          tb.append(h('tr', {},
            h('td', {}, h('span', { class: 'mono' }, r.receipt_no)),
            h('td', {}, fmtTanggalSingkat(r.receipt_date)),
            h('td', { html: badgeStatus(r.status) }),
            h('td', { class: 'num' }, fmtRupiah(r.total)),
            h('td', { class: 'actions' }, h('button', {
              type: 'button', class: 'btn-sm',
              onClick: () => previewReceipt(r.id, r.receipt_no).catch((e) => toastErr(e.message)),
            }, 'Cetak'))));
        }

        body.append(h('div', { class: 'table-wrap' },
          h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Nomor'), h('th', {}, 'Tanggal'), h('th', {}, 'Status'),
              h('th', { class: 'num' }, 'Total'), h('th', {}, ''))),
            tb)),
        h('div', { class: 'help mt-1' }, 'Menampilkan maksimal 20 kwitansi terakhir.'));
      },
    });
  }

  load();
}
