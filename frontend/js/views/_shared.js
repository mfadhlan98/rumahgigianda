/* Pembantu tampilan yang dipakai bersama oleh beberapa halaman. */

import { h, els } from '../ui.js';

/** Kartu berjudul. `headExtra` diletakkan di kanan judul. */
export function card(title, sub, bodyNode, headExtra, bodyClass = 'card-body') {
  return h('div', { class: 'card' },
    title
      ? h('div', { class: 'card-head' },
        h('div', {}, h('h3', {}, title), sub ? h('div', { class: 'sub' }, sub) : null),
        h('div', { class: 'spacer' }),
        headExtra || null)
      : null,
    h('div', { class: bodyClass }, bodyNode));
}

/** Satu isian formulir lengkap dengan slot pesan kesalahan. */
export function field(label, input, help) {
  return h('div', { class: 'field' },
    h('label', {}, label),
    input,
    h('div', { class: 'err' }),
    help ? h('div', { class: 'help' }, help) : null);
}

/** Kumpulkan nilai seluruh input bernama di dalam sebuah root. */
export function collect(root) {
  const out = {};
  els('input, select, textarea', root).forEach((i) => {
    if (!i.name) return;
    out[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim();
  });
  return out;
}

/** Baris "tidak ada data" untuk tabel. */
export function emptyRow(colspan, title, hint) {
  return h('tr', {}, h('td', { colspan: String(colspan) },
    h('div', { class: 'empty' }, h('strong', {}, title), hint || '')));
}

/** Kontrol halaman sederhana. */
export function pager(meta, onGo) {
  const { page = 1, pages = 1, total = 0, limit = 20 } = meta || {};
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return h('div', { class: 'pager' },
    h('span', {}, `Menampilkan ${from}–${to} dari ${total} data`),
    h('div', { class: 'spacer' }),
    h('button', {
      type: 'button', class: 'btn-sm', disabled: page <= 1 || null,
      onClick: () => onGo(page - 1),
    }, '‹ Sebelumnya'),
    h('span', {}, `Hal. ${page} / ${pages}`),
    h('button', {
      type: 'button', class: 'btn-sm', disabled: page >= pages || null,
      onClick: () => onGo(page + 1),
    }, 'Berikutnya ›'));
}
