import { api, auth, ApiError } from './api.js';
import { el, applyErrors, clearErrors, toast } from './ui.js';
import { applyBrand, applyLogo } from './brand.js';

const form = el('#loginForm');
const btn = el('#submitBtn');

/**
 * Ambil identitas klinik sebelum login supaya halaman ini memakai nama,
 * warna, dan logo klinik — bukan nama bawaan sistem.
 */
(async () => {
  try {
    const b = await api.get('/branding', { skipAuthRedirect: true });
    if (b.clinic_name) {
      el('#clinicName').textContent = b.clinic_name;
      document.title = `Masuk — Sistem Kwitansi ${b.clinic_name}`;
    }
    applyBrand(b);

    // Petunjuk akun bawaan hanya relevan selama passwordnya memang belum diganti.
    if (!b.default_admin) el('#firstRunHint').remove();

    applyLogo(b);
  } catch {
    /* Identitas klinik hanya mempercantik; kegagalan tidak boleh
       menghalangi siapa pun untuk login. */
  }
})();

// Sudah punya sesi aktif? Langsung ke aplikasi.
if (auth.token) location.replace('app.html');

if (new URLSearchParams(location.search).get('expired')) {
  toast('Sesi Anda telah berakhir. Silakan masuk kembali.', 'warn', 'Sesi berakhir');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(document.body);

  const username = el('#username').value.trim();
  const password = el('#password').value;

  // Validasi sisi klien supaya tidak menembak server tanpa perlu.
  let bad = false;
  if (!username) { markError('#username', 'Username wajib diisi.'); bad = true; }
  if (!password) { markError('#password', 'Password wajib diisi.'); bad = true; }
  if (bad) return;

  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    const res = await api.post('/auth/login', { username, password }, { skipAuthRedirect: true });
    auth.save(res.token, res.user);
    location.replace('app.html');
  } catch (err) {
    applyErrors(document.body, err instanceof ApiError ? err : new ApiError(0, 'Terjadi kesalahan tak terduga.'));
    el('#password').value = '';
    el('#password').focus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
});

function markError(sel, message) {
  const field = el(sel).closest('.field');
  field.classList.add('invalid');
  field.querySelector('.err').textContent = message;
}
