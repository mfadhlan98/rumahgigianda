/* Kerangka aplikasi: penjaga sesi, navigasi, dan router berbasis hash. */

import { api, auth } from './api.js';
import { el, h, toastErr } from './ui.js';
import { applyBrand, applyLogo } from './brand.js';

import dashboard from './views/dashboard.js';
import receiptNew from './views/receipt-new.js';
import archive from './views/archive.js';
import patients from './views/patients.js';
import services from './views/services.js';
import reports from './views/reports.js';
import users from './views/users.js';
import settings from './views/settings.js';

if (!auth.token) location.replace('index.html');

/** Konteks bersama yang dioper ke setiap view. */
export const ctx = {
  clinic: null,
  async refreshClinic() {
    try {
      const res = await api.get('/settings');
      ctx.clinic = res.data;
      applyBrand(res.data);
      applyLogo(res.data);
      const name = res.data?.clinic_name;
      if (name) {
        el('#brandName').textContent = name;
        document.title = `Sistem Kwitansi — ${name}`;
      }
    } catch { /* profil klinik opsional untuk tampilan */ }
  },
};

const ICON = {
  dashboard: 'M3 12h6V3H3v9Zm0 9h6v-6H3v6Zm9 0h9v-9h-9v9Zm0-18v6h9V3h-9Z',
  plus: 'M12 5v14M5 12h14',
  archive: 'M3 7h18M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M9 11h6M4 7l1.5-3h13L20 7',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-1.5a4 4 0 0 0-3-3.87M16 3.6a4 4 0 0 1 0 7.75',
  tag: 'M3 11V4a1 1 0 0 1 1-1h7l9 9-8 8-9-9Zm4-4h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  shield: 'M12 22s8-3.5 8-10V5.5L12 2 4 5.5V12c0 6.5 8 10 8 10Z',
  cog: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
};

const ROUTES = [
  { path: '/', title: 'Dasbor', crumb: 'Ringkasan aktivitas klinik hari ini', icon: 'dashboard', group: 'Utama', view: dashboard },
  { path: '/kwitansi/baru', title: 'Kwitansi Baru', crumb: 'Buat dan cetak kwitansi pembayaran', icon: 'plus', group: 'Utama', view: receiptNew },
  { path: '/arsip', title: 'Arsip Kwitansi', crumb: 'Cari, lihat ulang, dan cetak kwitansi lama', icon: 'archive', group: 'Utama', view: archive },

  { path: '/pasien', title: 'Data Pasien', crumb: 'Kelola identitas dan rekam medis pasien', icon: 'users', group: 'Master Data', view: patients },
  { path: '/tarif', title: 'Tarif Layanan', crumb: 'Daftar tindakan, obat, dan konsultasi', icon: 'tag', group: 'Master Data', view: services },

  { path: '/laporan', title: 'Laporan Keuangan', crumb: 'Rekap pendapatan dan ekspor data', icon: 'chart', group: 'Laporan', view: reports },

  { path: '/pengguna', title: 'Pengguna & Hak Akses', crumb: 'Akun admin, kasir, dan jejak audit', icon: 'shield', group: 'Administrasi', view: users, adminOnly: true },
  { path: '/pengaturan', title: 'Pengaturan', crumb: 'Profil klinik, logo, dan format kwitansi', icon: 'cog', group: 'Administrasi', view: settings },
];

/* ---------------- Navigasi ---------------- */

function buildNav() {
  const nav = el('#nav');
  nav.innerHTML = '';
  let lastGroup = null;

  for (const r of ROUTES) {
    if (r.adminOnly && !auth.isAdmin) continue;
    if (r.group !== lastGroup) {
      nav.append(h('div', { class: 'nav-label' }, r.group));
      lastGroup = r.group;
    }
    nav.append(h('a', { href: `#${r.path}`, 'data-path': r.path },
      svgIcon(ICON[r.icon]),
      r.title));
  }
}

function svgIcon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

/* ---------------- Router ---------------- */

let currentCleanup = null;

async function render() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];

  if (route.adminOnly && !auth.isAdmin) {
    location.hash = '#/';
    toastErr('Halaman tersebut hanya untuk administrator.');
    return;
  }

  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.path === route.path);
  });
  el('#pageTitle').textContent = route.title;
  el('#pageCrumb').textContent = route.crumb;
  el('#pageActions').innerHTML = '';
  el('#sidebar').classList.remove('open');
  document.querySelector('.scrim')?.remove();

  const view = el('#view');
  view.innerHTML = '<div class="skeleton">Memuat…</div>';

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch { /* abaikan galat pembersihan */ }
    currentCleanup = null;
  }

  try {
    currentCleanup = await route.view.mount(view, { actions: el('#pageActions'), ctx });
  } catch (err) {
    view.innerHTML = '';
    view.append(h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('div', { class: 'alert err' }, err?.message || 'Halaman gagal dimuat.'),
        h('button', { class: 'btn-primary', onClick: () => render() }, 'Coba lagi'))));
  }
}

/* ---------------- Inisialisasi ---------------- */

el('#whoName').textContent = auth.user?.full_name || auth.user?.username || '—';
el('#whoRole').textContent = auth.user?.role === 'admin' ? 'Administrator' : 'Kasir';

el('#logoutBtn').addEventListener('click', () => {
  auth.clear();
  location.replace('index.html');
});

el('#menuToggle').addEventListener('click', () => {
  const bar = el('#sidebar');
  bar.classList.add('open');
  const scrim = h('div', { class: 'scrim', onClick: () => { bar.classList.remove('open'); scrim.remove(); } });
  document.body.append(scrim);
});

window.addEventListener('hashchange', render);

buildNav();
await ctx.refreshClinic();
await render();
