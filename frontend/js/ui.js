/* Utilitas antarmuka: format, notifikasi, modal, dan pembantu DOM. */

/* ---------------- Format ---------------- */

export const fmtRupiah = (n) => `Rp${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
export const fmtAngka = (n) => (Math.round(Number(n) || 0)).toLocaleString('id-ID');

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function fmtTanggal(iso) {
  const s = String(iso ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s || '-';
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
}

export function fmtTanggalSingkat(iso) {
  const s = String(iso ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '-');
}

export function todayISO() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function firstOfMonthISO() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

/** Ubah teks bebas ("Rp 1.250.000", "1250000") menjadi bilangan bulat rupiah. */
export function parseUang(v) {
  const digits = String(v ?? '').replace(/[^\d-]/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------- DOM ---------------- */

export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape teks agar aman dimasukkan ke innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ---------------- Notifikasi ---------------- */

function toastHost() {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts' });
    document.body.append(host);
  }
  return host;
}

export function toast(message, kind = 'ok', title = null, ms = 4200) {
  const node = h('div', { class: `toast ${kind}` },
    h('div', { class: 'msg' },
      title ? h('strong', {}, title) : null,
      message),
  );
  toastHost().append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ms);
  return node;
}

export const toastOk = (m, t) => toast(m, 'ok', t);
export const toastErr = (m, t) => toast(m, 'err', t ?? 'Gagal');
export const toastWarn = (m, t) => toast(m, 'warn', t);

/* ---------------- Kesalahan formulir ---------------- */

/** Bersihkan penanda kesalahan pada seluruh field di dalam sebuah root. */
export function clearErrors(root) {
  els('.field.invalid', root).forEach((f) => {
    f.classList.remove('invalid');
    const e = f.querySelector('.err');
    if (e) e.textContent = '';
  });
  const box = root.querySelector('[data-form-alert]');
  if (box) { box.textContent = ''; box.className = 'alert'; }
}

/**
 * Terapkan peta kesalahan dari API ({field: pesan}) ke formulir.
 * Kesalahan yang tidak punya field pasangan ditampilkan di kotak ringkasan.
 */
export function applyErrors(root, err) {
  clearErrors(root);
  const details = err?.details && typeof err.details === 'object' ? err.details : {};
  const leftovers = [];

  for (const [field, message] of Object.entries(details)) {
    const input = root.querySelector(`[name="${CSS.escape(field)}"]`);
    const wrap = input?.closest('.field');
    if (wrap) {
      wrap.classList.add('invalid');
      const e = wrap.querySelector('.err');
      if (e) e.textContent = message;
    } else if (typeof message === 'string') {
      leftovers.push(message);
    }
  }

  const box = root.querySelector('[data-form-alert]');
  const summary = [err?.message, ...leftovers].filter(Boolean).join(' ');
  if (box && summary) {
    box.className = 'alert err';
    box.textContent = summary;
  }
  return summary;
}

/* ---------------- Modal ---------------- */

/**
 * Tampilkan modal. `render(body, close)` mengisi isi modal.
 * Mengembalikan Promise yang selesai saat modal ditutup.
 */
export function modal({ title, wide = false, render, footer }) {
  return new Promise((resolve) => {
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };

    const body = h('div', { class: 'modal-body' });
    const foot = h('div', { class: 'modal-foot' });
    const box = h('div', { class: `modal${wide ? ' wide' : ''}` },
      h('div', { class: 'modal-head' },
        h('h3', {}, title),
        h('button', { class: 'x-close', type: 'button', 'aria-label': 'Tutup', onClick: () => close(undefined) }, '×')),
      body, foot);

    const backdrop = h('div', {
      class: 'modal-backdrop',
      onClick: (e) => { if (e.target === backdrop) close(undefined); },
    }, box);

    render(body, close);
    if (footer) footer(foot, close);
    else foot.append(h('button', { type: 'button', onClick: () => close(undefined) }, 'Tutup'));

    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    setTimeout(() => body.querySelector('input, select, textarea, button')?.focus(), 30);
  });
}

/** Dialog konfirmasi; mengembalikan true bila pengguna menyetujui. */
export function confirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', danger = false }) {
  return modal({
    title,
    render: (body) => body.append(h('p', { class: 'mb-0' }, message)),
    footer: (foot, close) => {
      foot.append(
        h('button', { type: 'button', onClick: () => close(false) }, 'Batal'),
        h('button', {
          type: 'button',
          class: danger ? 'btn-danger' : 'btn-primary',
          onClick: () => close(true),
        }, confirmLabel),
      );
    },
  }).then((v) => v === true);
}

/** Dialog dengan satu isian teks; mengembalikan string atau null. */
export function promptDialog({ title, label, placeholder = '', confirmLabel = 'Simpan', danger = false, minLength = 0, multiline = false }) {
  return modal({
    title,
    render: (body, close) => {
      const input = multiline
        ? h('textarea', { name: 'value', placeholder, rows: 3 })
        : h('input', { type: 'text', name: 'value', placeholder });
      const errBox = h('div', { class: 'err' });
      const field = h('div', { class: 'field' }, h('label', {}, label), input, errBox);
      body.append(field);
      body.dataset.validate = '1';
      body._get = () => {
        const val = input.value.trim();
        if (val.length < minLength) {
          field.classList.add('invalid');
          errBox.textContent = `Minimal ${minLength} karakter.`;
          input.focus();
          return undefined;
        }
        return val;
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiline) {
          const v = body._get();
          if (v !== undefined) close(v);
        }
      });
    },
    footer: (foot, close) => {
      foot.append(
        h('button', { type: 'button', onClick: () => close(null) }, 'Batal'),
        h('button', {
          type: 'button',
          class: danger ? 'btn-danger' : 'btn-primary',
          onClick: (e) => {
            const body = e.target.closest('.modal').querySelector('.modal-body');
            const v = body._get();
            if (v !== undefined) close(v);
          },
        }, confirmLabel),
      );
    },
  }).then((v) => (typeof v === 'string' ? v : null));
}

/* ---------------- Lain-lain ---------------- */

export function debounce(fn, ms = 280) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Unduh blob sebagai berkas dengan nama tertentu. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return win;
}

export const badgeMetode = (m) => ({
  tunai: '<span class="badge ok">Tunai</span>',
  transfer: '<span class="badge brand">Transfer</span>',
  kartu: '<span class="badge">Kartu</span>',
}[m] || `<span class="badge">${esc(m)}</span>`);

export const badgeStatus = (s) => (s === 'void'
  ? '<span class="badge danger">Dibatalkan</span>'
  : '<span class="badge ok">Sah</span>');

export const KATEGORI_LABEL = {
  tindakan: 'Tindakan',
  obat: 'Obat',
  konsultasi: 'Konsultasi',
  lainnya: 'Lainnya',
};
