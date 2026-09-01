/* Pengaturan: profil klinik, logo HD, format kwitansi, QR verifikasi,
   dan ganti password akun sendiri. */

import { api, auth } from '../api.js';
import {
  h, el, toastOk, toastErr, applyErrors, clearErrors, confirmDialog,
} from '../ui.js';
import { card, field } from './_shared.js';
import { UKURAN } from '../print.js';

export default { mount };

const MAX_LOGO_MB = 3;

async function mount(root, { ctx }) {
  const res = await api.get('/settings');
  const s = res.data;
  const admin = auth.isAdmin;

  root.innerHTML = '';

  if (!admin) {
    root.append(h('div', { class: 'alert info' },
      'Profil klinik hanya dapat diubah oleh administrator. Anda tetap dapat mengganti password akun sendiri di bawah.'));
  }

  /* ---------------- Profil klinik ---------------- */

  const profileForm = h('form', { novalidate: '' },
    h('div', { class: 'alert', 'data-form-alert': '' }),
    h('div', { class: 'grid cols-2' },
      field('Nama Klinik *', input('clinic_name', s.clinic_name, admin)),
      field('Tagline', input('clinic_tagline', s.clinic_tagline, admin), 'Baris kecil di bawah nama klinik.')),
    field('Alamat', textarea('clinic_address', s.clinic_address, admin)),
    h('div', { class: 'grid cols-3' },
      field('Telepon', input('clinic_phone', s.clinic_phone, admin)),
      field('Email', input('clinic_email', s.clinic_email, admin)),
      field('Website', input('clinic_website', s.clinic_website, admin))),
    field('NPWP', input('clinic_npwp', s.clinic_npwp, admin), 'Kosongkan bila tidak perlu dicetak.'),

    h('fieldset', {}, h('legend', {}, 'Rekening & Tujuan Pembayaran'),
      field('Daftar rekening',
        h('textarea', {
          name: 'payment_accounts', rows: 5, disabled: admin ? null : true,
          placeholder: 'Bank Nagari 0701021009xxxx a.n. Nama Pemilik\nBNI 172437xxxx a.n. Nama Pemilik\nDANA 08137451xxxx',
        }, s.payment_accounts || ''),
        'Satu baris untuk satu rekening. Boleh lebih dari satu bank, termasuk dompet digital seperti DANA atau OVO. Seluruhnya dicetak pada kwitansi bila pembayarannya non-tunai.')),

    h('fieldset', {}, h('legend', {}, 'Warna Merek'),
      h('div', { class: 'grid cols-2' },
        colorField('Warna utama', 'brand_color', s.brand_color, admin,
          'Dipakai pada kop kwitansi, kepala tabel, dan baris total.'),
        colorField('Warna aksen', 'brand_accent', s.brand_accent, admin,
          'Hanya untuk garis dan bidang dekoratif, bukan teks.')),
      h('div', { class: 'help' },
        'Ambil dari logo klinik. Warna teks di atas bidang berwarna dihitung otomatis agar tetap terbaca.')),

    h('fieldset', {}, h('legend', {}, 'Format Kwitansi'),
      h('div', { class: 'grid cols-3' },
        field('Awalan Nomor', input('receipt_prefix', s.receipt_prefix, admin),
          `Contoh hasil: ${s.receipt_prefix || 'KGM'}/202608/0001`),
        field('Ukuran Cetak Default', h('select', { name: 'default_print_size', disabled: !admin || null },
          ...UKURAN.map((u) => h('option', {
            value: u.value, selected: u.value === s.default_print_size || null,
          }, u.label)))),
        field('QR Verifikasi', h('select', { name: 'qr_enabled', disabled: !admin || null },
          h('option', { value: '1', selected: s.qr_enabled === '1' || null }, 'Tampilkan di kwitansi'),
          h('option', { value: '0', selected: s.qr_enabled !== '1' || null }, 'Sembunyikan')))),
      field('URL Dasar Verifikasi QR', input('qr_base_url', s.qr_base_url, admin),
        'Contoh: https://klinikgigimanda.id. Bila diisi, QR berisi tautan halaman verifikasi. Bila kosong, QR berisi data kwitansi dalam bentuk teks.'),
      h('div', { class: 'grid cols-2' },
        field('Nama Penanda Tangan', input('signer_name', s.signer_name, admin),
          'Kosongkan untuk memakai nama kasir yang menerbitkan.'),
        field('Jabatan Penanda Tangan', input('signer_title', s.signer_title, admin))),
      field('Catatan Kaki Kwitansi', textarea('receipt_footer_note', s.receipt_footer_note, admin))),

    admin ? h('div', { class: 'btn-row end' },
      h('button', { type: 'submit', class: 'btn-primary' }, 'Simpan Pengaturan')) : null,
  );

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(profileForm);

    const payload = {};
    profileForm.querySelectorAll('input[name], select[name], textarea[name]').forEach((i) => {
      payload[i.name] = i.value.trim();
    });

    const btn = profileForm.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      const saved = await api.put('/settings', payload);
      Object.assign(s, saved.data);
      toastOk(saved.message);
      await ctx.refreshClinic();
    } catch (err) {
      applyErrors(profileForm, err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan Pengaturan';
    }
  });

  root.append(card('Profil Klinik',
    'Data ini tercetak pada setiap kwitansi — pastikan sesuai dokumen resmi klinik.',
    profileForm));

  /* ---------------- Logo ---------------- */

  const logoBox = h('div', { class: 'logo-preview' }, h('span', {}, 'Memuat…'));
  const fileInput = h('input', {
    type: 'file', accept: 'image/png,image/jpeg', disabled: !admin || null,
  });

  async function paintLogo() {
    logoBox.innerHTML = '';
    if (!s.has_logo) {
      logoBox.append(h('span', {}, 'Belum ada logo'));
      return;
    }
    try {
      const blob = await api.file('/settings/logo');
      const url = URL.createObjectURL(blob);
      const img = h('img', { src: url, alt: 'Logo klinik' });
      img.addEventListener('load', () => URL.revokeObjectURL(url));
      logoBox.append(img);
    } catch {
      logoBox.append(h('span', {}, 'Logo gagal dimuat'));
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      toastErr(`Ukuran logo maksimal ${MAX_LOGO_MB} MB. Berkas Anda ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      fileInput.value = '';
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      const out = await api.post('/settings/logo', { data: dataUrl });
      s.has_logo = true;
      toastOk(`${out.message} Ukuran ${(out.size / 1024).toFixed(0)} KB.`);
      await paintLogo();
    } catch (err) {
      toastErr(err.message);
    } finally {
      fileInput.value = '';
    }
  });

  const logoPanel = h('div', { style: 'display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap' },
    logoBox,
    h('div', { style: 'flex:1;min-width:240px' },
      h('div', { class: 'field' },
        h('label', {}, 'Unggah logo baru'),
        fileInput,
        h('div', { class: 'help' },
          `Format PNG atau JPG, maksimal ${MAX_LOGO_MB} MB. Untuk hasil cetak tajam, gunakan PNG minimal 600×600 piksel dengan latar transparan atau putih.`)),
      admin
        ? h('button', {
          type: 'button', class: 'btn-sm',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Hapus Logo',
              message: 'Hapus logo klinik? Kwitansi berikutnya akan dicetak tanpa logo.',
              confirmLabel: 'Hapus Logo',
              danger: true,
            });
            if (!ok) return;
            try {
              const out = await api.del('/settings/logo');
              s.has_logo = false;
              toastOk(out.message);
              await paintLogo();
            } catch (err) { toastErr(err.message); }
          },
        }, 'Hapus Logo')
        : null));

  root.append(card('Logo Klinik', 'Dicetak pada kop kwitansi dan struk termal.', logoPanel));
  paintLogo();

  /* ---------------- Ganti password ---------------- */

  const pwForm = h('form', { novalidate: '' },
    h('div', { class: 'alert', 'data-form-alert': '' }),
    h('div', { class: 'grid cols-3' },
      field('Password Saat Ini *', h('input', { type: 'password', name: 'current_password', autocomplete: 'current-password' })),
      field('Password Baru *', h('input', { type: 'password', name: 'new_password', autocomplete: 'new-password' }), 'Minimal 6 karakter.'),
      field('Ulangi Password Baru *', h('input', { type: 'password', name: 'confirm_password', autocomplete: 'new-password' }))),
    h('div', { class: 'btn-row end' }, h('button', { type: 'submit', class: 'btn-primary' }, 'Ganti Password')));

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(pwForm);

    const cur = el('[name=current_password]', pwForm).value;
    const next = el('[name=new_password]', pwForm).value;
    const confirm = el('[name=confirm_password]', pwForm).value;

    if (next !== confirm) {
      const wrap = el('[name=confirm_password]', pwForm).closest('.field');
      wrap.classList.add('invalid');
      wrap.querySelector('.err').textContent = 'Ulangan password tidak sama.';
      return;
    }

    const btn = pwForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const out = await api.post('/auth/change-password', { current_password: cur, new_password: next });
      toastOk(out.message);
      pwForm.reset();
    } catch (err) {
      applyErrors(pwForm, err);
    } finally {
      btn.disabled = false;
    }
  });

  root.append(card('Ganti Password', `Akun: ${auth.user?.username || '-'}`, pwForm));

  /* ---------------- Informasi teknis ---------------- */

  root.append(card('Tentang Sistem', null, h('dl', { class: 'kv' },
    h('dt', {}, 'Format kwitansi'), h('dd', {}, 'PDF/A-3b — standar arsip jangka panjang, font tertanam penuh'),
    h('dt', {}, 'Ukuran didukung'), h('dd', {}, 'A5, A4, struk termal 58 mm & 80 mm'),
    h('dt', {}, 'Verifikasi'), h('dd', {}, 'QR + kode HMAC pada tiap kwitansi, dapat diperiksa di halaman verifikasi publik'),
    h('dt', {}, 'Keterbacaan mesin'), h('dd', {}, 'Teks PDF dapat disalin/dicari; baris data ringkas tercetak di kaki kwitansi untuk OCR'),
  )));
}

/* ---------------- Pembantu ---------------- */

function input(name, value, enabled) {
  return h('input', { type: 'text', name, value: value || '', disabled: enabled ? null : true });
}

/**
 * Isian warna: pemilih warna dan kotak teks hex yang saling menyalin.
 * Pemilik biasanya punya kode hex dari desainer, tetapi bila tidak,
 * pemilih warna tetap memungkinkan mencocokkannya dengan mata.
 */
function colorField(label, name, value, enabled, help) {
  const hex = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#000000';

  const teks = h('input', {
    type: 'text', name, value: value || '', disabled: enabled ? null : true,
    placeholder: '#70544D', style: 'font-family:var(--mono)',
  });
  const pilih = h('input', {
    type: 'color', value: hex, disabled: enabled ? null : true,
    'aria-label': `Pilih ${label}`,
    style: 'width:44px;height:38px;padding:2px;flex:none;cursor:pointer',
  });

  pilih.addEventListener('input', () => { teks.value = pilih.value.toUpperCase(); });
  teks.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(teks.value.trim())) pilih.value = teks.value.trim();
  });

  return h('div', { class: 'field' },
    h('label', {}, label),
    h('div', { style: 'display:flex;gap:8px;align-items:center' }, pilih, teks),
    h('div', { class: 'err' }),
    help ? h('div', { class: 'help' }, help) : null);
}

function textarea(name, value, enabled) {
  return h('textarea', { name, rows: 2, disabled: enabled ? null : true }, value || '');
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Berkas gagal dibaca.'));
    fr.readAsDataURL(file);
  });
}
