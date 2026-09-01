/* Pengguna & hak akses (khusus admin) + jejak audit. */

import { api, auth } from '../api.js';
import {
  el, h, toastOk, toastErr, applyErrors, modal, promptDialog,
} from '../ui.js';
import { card, field, collect, emptyRow } from './_shared.js';

export default { mount };

const ROLE_LABEL = { admin: 'Administrator', kasir: 'Kasir' };

const AKSI_LABEL = {
  login: 'Masuk', login_blocked: 'Login diblokir', create: 'Tambah data', update: 'Ubah data', void: 'Batalkan kwitansi',
  print: 'Cetak kwitansi', deactivate: 'Nonaktifkan', activate: 'Aktifkan',
  change_password: 'Ganti password', reset_password: 'Reset password',
  upload_logo: 'Unggah logo', delete_logo: 'Hapus logo',
};

const ENTITAS_LABEL = {
  user: 'Pengguna', patient: 'Pasien', receipt: 'Kwitansi',
  service_item: 'Tarif layanan', settings: 'Pengaturan',
};

async function mount(root, { actions }) {
  root.innerHTML = '';

  const usersBody = h('tbody');
  const auditBody = h('tbody');

  root.append(card('Akun Pengguna',
    'Admin dapat mengelola seluruh data; kasir hanya membuat kwitansi dan melihat laporan.',
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Username'),
          h('th', {}, 'Nama Lengkap'),
          h('th', {}, 'Peran'),
          h('th', {}, 'Status'),
          h('th', {}, ''))),
        usersBody)),
    null, 'card-body tight'));

  root.append(card('Jejak Audit', '100 aktivitas terakhir — dipakai saat penelusuran atau pemeriksaan.',
    h('div', { class: 'table-wrap', style: 'max-height:440px;overflow-y:auto' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Waktu'),
          h('th', {}, 'Pengguna'),
          h('th', {}, 'Aktivitas'),
          h('th', {}, 'Objek'),
          h('th', {}, 'Rincian'))),
        auditBody)),
    null, 'card-body tight'));

  actions.append(h('button', { type: 'button', class: 'btn-primary', onClick: () => openForm(null) }, '+ Pengguna Baru'));

  async function loadUsers() {
    usersBody.innerHTML = '';
    usersBody.append(h('tr', {}, h('td', { colspan: '5' }, h('div', { class: 'skeleton' }, 'Memuat…'))));
    try {
      const res = await api.get('/users');
      renderUsers(res.data || []);
    } catch (err) {
      usersBody.innerHTML = '';
      usersBody.append(h('tr', {}, h('td', { colspan: '5' }, h('div', { class: 'alert err' }, err.message))));
    }
  }

  function renderUsers(rows) {
    usersBody.innerHTML = '';
    if (!rows.length) {
      usersBody.append(emptyRow(5, 'Belum ada pengguna'));
      return;
    }

    for (const u of rows) {
      const isSelf = u.id === auth.user?.id;
      usersBody.append(h('tr', {},
        h('td', {}, h('span', { class: 'mono' }, u.username),
          isSelf ? h('span', { class: 'badge brand', style: 'margin-left:6px' }, 'Anda') : null),
        h('td', {}, u.full_name),
        h('td', {}, h('span', { class: u.role === 'admin' ? 'badge brand' : 'badge' }, ROLE_LABEL[u.role] || u.role)),
        h('td', { html: u.is_active ? '<span class="badge ok">Aktif</span>' : '<span class="badge">Nonaktif</span>' }),
        h('td', { class: 'actions' },
          h('button', { type: 'button', class: 'btn-sm', onClick: () => openForm(u) }, 'Ubah'),
          ' ',
          h('button', { type: 'button', class: 'btn-sm', onClick: () => resetPassword(u) }, 'Reset Password'))));
    }
  }

  async function loadAudit() {
    auditBody.innerHTML = '';
    auditBody.append(h('tr', {}, h('td', { colspan: '5' }, h('div', { class: 'skeleton' }, 'Memuat…'))));
    try {
      const res = await api.get('/users/audit/logs?limit=100');
      const rows = res.data || [];
      auditBody.innerHTML = '';
      if (!rows.length) {
        auditBody.append(emptyRow(5, 'Belum ada aktivitas tercatat'));
        return;
      }
      for (const a of rows) {
        auditBody.append(h('tr', {},
          h('td', { class: 'nowrap muted small' }, String(a.created_at || '').replace('T', ' ').slice(0, 19)),
          h('td', {}, a.username || h('span', { class: 'muted' }, 'sistem')),
          h('td', {}, AKSI_LABEL[a.action] || a.action),
          h('td', {}, `${ENTITAS_LABEL[a.entity] || a.entity}${a.entity_id ? ` #${a.entity_id}` : ''}`),
          h('td', { class: 'muted small' }, ringkasDetail(a.detail))));
      }
    } catch (err) {
      auditBody.innerHTML = '';
      auditBody.append(h('tr', {}, h('td', { colspan: '5' }, h('div', { class: 'alert err' }, err.message))));
    }
  }

  async function openForm(existing) {
    const isEdit = Boolean(existing);

    const saved = await modal({
      title: isEdit ? `Ubah Pengguna — ${existing.username}` : 'Tambah Pengguna Baru',
      render: (body, close) => {
        body.append(h('div', { class: 'alert', 'data-form-alert': '' }));

        if (!isEdit) {
          body.append(field('Username *', h('input', { type: 'text', name: 'username', autocomplete: 'off' }),
            'Huruf, angka, titik, garis bawah, dan strip. Tidak bisa diubah setelah dibuat.'));
        }

        body.append(
          field('Nama Lengkap *', h('input', { type: 'text', name: 'full_name', value: existing?.full_name || '' })),
          field('Peran *', h('select', { name: 'role' },
            h('option', { value: 'kasir', selected: (existing?.role || 'kasir') === 'kasir' || null }, 'Kasir — buat kwitansi & lihat laporan'),
            h('option', { value: 'admin', selected: existing?.role === 'admin' || null }, 'Administrator — akses penuh'))),
        );

        if (!isEdit) {
          body.append(field('Password Awal *', h('input', { type: 'text', name: 'password', autocomplete: 'new-password' }),
            'Minimal 6 karakter. Minta pengguna menggantinya setelah login pertama.'));
        } else {
          const chk = h('input', {
            type: 'checkbox', id: 'uActive', name: 'is_active',
            checked: existing.is_active ? '' : null,
          });
          body.append(h('div', { class: 'field' },
            h('div', { class: 'check' }, chk, h('label', { for: 'uActive' }, 'Akun aktif')),
            h('div', { class: 'err' }),
            h('div', { class: 'help' }, 'Akun nonaktif tidak bisa login, tetapi kwitansi yang pernah dibuatnya tetap tersimpan.')));
        }

        body._submit = async () => {
          const payload = collect(body);
          try {
            const res = isEdit
              ? await api.put(`/users/${existing.id}`, payload)
              : await api.post('/users', payload);
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
          }, isEdit ? 'Simpan Perubahan' : 'Buat Pengguna'));
      },
    });

    if (saved) {
      toastOk(saved.message);

      // Mengubah data diri sendiri harus ikut menyegarkan identitas di sidebar,
      // bukan menunggu pengguna keluar lalu masuk lagi.
      if (saved.data && saved.data.id === auth.user?.id) {
        auth.updateUser({ full_name: saved.data.full_name, role: saved.data.role });
        const nama = el('#whoName');
        const peran = el('#whoRole');
        if (nama) nama.textContent = saved.data.full_name || saved.data.username || '—';
        if (peran) peran.textContent = saved.data.role === 'admin' ? 'Administrator' : 'Kasir';
      }

      loadUsers();
      loadAudit();
    }
  }

  async function resetPassword(u) {
    const pwd = await promptDialog({
      title: `Reset Password — ${u.username}`,
      label: 'Password baru',
      placeholder: 'Minimal 6 karakter',
      confirmLabel: 'Reset Password',
      minLength: 6,
      danger: true,
    });
    if (!pwd) return;

    try {
      const res = await api.post(`/users/${u.id}/reset-password`, { new_password: pwd });
      toastOk(`${res.message} Sampaikan password baru ini secara langsung kepada yang bersangkutan.`);
      loadAudit();
    } catch (err) {
      toastErr(err.message);
    }
  }

  await Promise.all([loadUsers(), loadAudit()]);
}

/** Ringkas kolom detail JSON menjadi teks pendek yang mudah dibaca. */
function ringkasDetail(detail) {
  if (!detail) return '—';
  try {
    const o = JSON.parse(detail);
    if (o.receipt_no) return `${o.receipt_no}${o.reason ? ` — ${o.reason}` : ''}`;
    if (o.name) return o.name;
    if (o.username) return `${o.username}${o.role ? ` (${o.role})` : ''}`;
    if (o.size) return `ukuran ${o.size}`;
    return Object.entries(o).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ');
  } catch {
    return String(detail).slice(0, 80);
  }
}
