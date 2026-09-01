/* Pratinjau, cetak, dan unduh kwitansi.
   Berkas yang dicetak SAMA PERSIS dengan berkas yang diarsipkan:
   keduanya berasal dari endpoint PDF di server, sehingga tidak ada
   perbedaan tata letak antara layar, printer, dan arsip. */

import { api } from './api.js';
import { h, modal, toastErr, toastOk, downloadBlob } from './ui.js';

export const UKURAN = [
  { value: 'a5', label: 'A5 — kwitansi standar', hint: 'Printer inkjet/laser, hasil HD, arsip PDF/A' },
  { value: 'a4', label: 'A4 — dokumen penuh', hint: 'Untuk berkas klaim atau lampiran' },
  { value: 'thermal80', label: 'Struk termal 80 mm', hint: 'Printer kasir gulungan 80 mm' },
  { value: 'thermal58', label: 'Struk termal 58 mm', hint: 'Printer kasir gulungan 58 mm' },
];

const cache = new Map(); // `${id}:${size}` -> { blob, url }

async function loadPdf(id, size) {
  const key = `${id}:${size}`;
  if (cache.has(key)) return cache.get(key);

  const blob = await api.file(`/receipts/${id}/pdf?size=${size}`);
  const entry = { blob, url: URL.createObjectURL(blob) };
  cache.set(key, entry);
  return entry;
}

/** Lepaskan URL blob agar memori browser tidak menumpuk. */
function clearCache() {
  for (const { url } of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

/**
 * Kirim kwitansi langsung ke dialog cetak printer.
 * PDF dimuat pada iframe tersembunyi lalu dialog cetak dipanggil.
 */
export async function printReceipt(id, size = 'a5') {
  const { url } = await loadPdf(id, size);

  const frame = h('iframe', {
    style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden',
    src: url,
  });

  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      // Beberapa browser memblokir print lintas dokumen — buka tab baru sebagai cadangan.
      window.open(url, '_blank');
    }
    // Beri waktu dialog cetak muncul sebelum iframe dibuang.
    setTimeout(() => frame.remove(), 60_000);
  });

  document.body.append(frame);
}

export async function downloadReceipt(id, size, receiptNo) {
  const { blob } = await loadPdf(id, size);
  const safe = String(receiptNo || id).replace(/[^A-Za-z0-9]+/g, '-');
  downloadBlob(blob, `Kwitansi-${safe}-${size}.pdf`);
}

/**
 * Buka jendela pratinjau kwitansi lengkap dengan pilihan ukuran kertas
 * serta tombol cetak/unduh.
 */
export async function previewReceipt(id, receiptNo, defaultSize = 'a5') {
  let size = defaultSize;

  await modal({
    title: `Kwitansi ${receiptNo || ''}`.trim(),
    wide: true,
    render: (body) => {
      const picker = h('select', { name: 'size', 'aria-label': 'Ukuran kertas' },
        ...UKURAN.map((u) => h('option', { value: u.value, selected: u.value === size || null }, u.label)));

      const hint = h('div', { class: 'help' }, UKURAN.find((u) => u.value === size)?.hint || '');
      const stage = h('div', { class: 'preview-frame' }, h('div', { class: 'skeleton' }, 'Menyiapkan pratinjau…'));

      body.append(
        h('div', { class: 'field' }, h('label', {}, 'Ukuran kertas'), picker, hint),
        stage,
        h('div', { class: 'help mt-1' },
          'Berkas ini juga yang tersimpan di arsip — apa yang tampil di sini persis dengan hasil cetak.'),
      );

      const show = async () => {
        stage.innerHTML = '';
        stage.append(h('div', { class: 'skeleton' }, 'Menyiapkan pratinjau…'));
        hint.textContent = UKURAN.find((u) => u.value === size)?.hint || '';
        try {
          const { url } = await loadPdf(id, size);
          stage.innerHTML = '';
          stage.append(h('embed', {
            src: `${url}#toolbar=0&navpanes=0`,
            type: 'application/pdf',
            style: 'width:100%;height:56vh;display:block;background:#fff',
          }));
        } catch (err) {
          stage.innerHTML = '';
          stage.append(h('div', { class: 'alert err' }, err.message || 'Pratinjau gagal dimuat.'));
        }
      };

      picker.addEventListener('change', () => { size = picker.value; show(); });
      show();
    },
    footer: (foot, close) => {
      foot.append(
        h('button', { type: 'button', onClick: () => close() }, 'Tutup'),
        h('button', {
          type: 'button',
          onClick: async (e) => {
            e.target.disabled = true;
            try { await downloadReceipt(id, size, receiptNo); toastOk('Berkas PDF diunduh.'); }
            catch (err) { toastErr(err.message); }
            finally { e.target.disabled = false; }
          },
        }, 'Unduh PDF'),
        h('button', {
          type: 'button',
          class: 'btn-primary',
          onClick: async (e) => {
            e.target.disabled = true;
            try { await printReceipt(id, size); }
            catch (err) { toastErr(err.message); }
            finally { e.target.disabled = false; }
          },
        }, 'Cetak'),
      );
    },
  });
}

window.addEventListener('beforeunload', clearCache);
