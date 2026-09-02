/* Halaman "Kwitansi Baru" — alur utama kasir:
   pilih pasien -> isi rincian biaya -> pembayaran -> simpan & cetak. */

import { api, ApiError } from '../api.js';
import {
  h, el, els, esc, fmtRupiah, parseUang, todayISO, debounce,
  toastOk, applyErrors, clearErrors, modal, KATEGORI_LABEL,
} from '../ui.js';
import { terbilangRupiah } from '../terbilang.js';
import { previewReceipt } from '../print.js';
import { card, field, collect } from './_shared.js';

export default { mount };

async function mount(root, { actions }) {
  const tarif = await api.get('/service-items');
  const layanan = tarif.data || [];

  let pasien = null;          // pasien terpilih
  let rows = [];              // baris rincian biaya
  let saving = false;

  /* ---------------- Kerangka halaman ---------------- */

  root.innerHTML = '';
  const alertBox = h('div', { class: 'alert', 'data-form-alert': '' });

  const patientSlot = h('div');
  const itemsBody = h('tbody');
  const totalsSlot = h('div', { class: 'total-panel' });

  const form = h('form', { class: 'grid split', novalidate: '' },
    h('div', {},
      card('Pasien', 'Cari berdasarkan nama, nomor rekam medis, atau telepon.', patientSlot,
        h('button', { type: 'button', class: 'btn-sm', onClick: quickAddPatient }, '+ Pasien Baru')),

      card('Detail Kunjungan', null, h('div', { class: 'grid cols-3' },
        field('Tanggal Kwitansi', h('input', { type: 'date', name: 'receipt_date', value: todayISO(), max: todayISO() })),
        field('Jenis Perawatan', h('input', { type: 'text', name: 'treatment_type', placeholder: 'mis. Perawatan gigi rutin' }), 'Ringkasan singkat, tercetak di kwitansi.'),
        field('Dokter Pemeriksa', h('input', { type: 'text', name: 'doctor_name', placeholder: 'mis. drg. Manda Prasetyo' })),
      )),

      card('Rincian Biaya', 'Tindakan, obat, dan konsultasi yang ditagihkan.',
        h('div', {},
          h('div', { class: 'table-wrap' },
            h('table', { class: 'items-table' },
              h('thead', {}, h('tr', {},
                h('th', { class: 'col-no' }, '#'),
                h('th', {}, 'Keterangan'),
                h('th', { style: 'width:120px' }, 'Kategori'),
                h('th', { class: 'col-qty' }, 'Qty'),
                h('th', { class: 'col-price' }, 'Harga Satuan'),
                h('th', { class: 'col-total' }, 'Jumlah'),
                h('th', { class: 'col-del' }, ''))),
              itemsBody)),
          h('div', { class: 'btn-row mt-2' },
            h('button', { type: 'button', class: 'btn-sm', onClick: () => { addRow(); renderRows(); } }, '+ Baris Kosong'),
            h('button', { type: 'button', class: 'btn-sm', onClick: pickFromTarif }, '+ Pilih dari Daftar Tarif')))),
    ),

    h('div', {},
      card('Pembayaran', null, h('div', {},
        field('Metode Pembayaran', h('select', { name: 'payment_method' },
          h('option', { value: 'tunai' }, 'Tunai'),
          h('option', { value: 'transfer' }, 'Transfer Bank'),
          h('option', { value: 'kartu' }, 'Kartu Debit/Kredit'))),
        h('div', { id: 'refWrap', class: 'hidden' },
          field('Nomor Referensi', h('input', { type: 'text', name: 'payment_ref', placeholder: 'No. transaksi / 4 digit akhir kartu' }),
            'Wajib untuk transfer dan kartu, agar mudah dicocokkan saat rekonsiliasi.')),
        h('div', { class: 'grid cols-2' },
          field('Diskon', h('input', { type: 'text', name: 'discount', class: 'money', inputmode: 'numeric', value: '0' })),
          field('Pajak / Biaya Lain', h('input', { type: 'text', name: 'tax', class: 'money', inputmode: 'numeric', value: '0' }))),
        h('div', { id: 'paidWrap' },
          field('Uang Diterima', h('input', { type: 'text', name: 'amount_paid', class: 'money', inputmode: 'numeric', value: '0' }),
            'Isi nominal uang yang diserahkan pasien.')),
        field('Catatan', h('textarea', { name: 'notes', rows: 2, placeholder: 'mis. kontrol ulang 2 minggu lagi' })),
        totalsSlot,
        alertBox,
        h('div', { class: 'btn-row mt-2' },
          h('button', { type: 'submit', class: 'btn-primary btn-block btn-lg', id: 'saveBtn' }, 'Simpan & Cetak Kwitansi')),
        h('div', { class: 'help mt-1' },
          'Nomor kwitansi dibuat otomatis oleh sistem saat disimpan.'))),
    ),
  );

  root.append(form);

  actions.append(h('button', {
    type: 'button',
    onClick: () => { if (confirmReset()) resetForm(); },
  }, 'Kosongkan Formulir'));

  /* ---------------- Pasien ---------------- */

  function renderPatient() {
    patientSlot.innerHTML = '';
    if (!pasien) {
      patientSlot.append(buildPatientSearch());
      return;
    }
    patientSlot.append(h('div', { class: 'picked' },
      h('div', { class: 'who' },
        h('strong', {}, pasien.name),
        h('span', {}, `${pasien.medical_record_no}${pasien.phone ? ` · ${pasien.phone}` : ''}`)),
      h('button', {
        type: 'button', class: 'btn-sm',
        onClick: () => { pasien = null; renderPatient(); },
      }, 'Ganti')));
    // Field tersembunyi supaya pemetaan error dari server tetap menemukan sasaran.
    patientSlot.append(h('div', { class: 'field hidden' },
      h('input', { type: 'hidden', name: 'patient_id', value: pasien.id }), h('div', { class: 'err' })));
  }

  function buildPatientSearch() {
    const input = h('input', {
      type: 'search', name: 'patient_id', autocomplete: 'off',
      placeholder: 'Ketik nama, no. rekam medis, atau telepon…',
    });
    const list = h('div', { class: 'combo-list' });
    const wrap = h('div', { class: 'field' },
      h('label', {}, 'Cari Pasien ', h('span', { class: 'req' }, '*')),
      h('div', { class: 'combo' }, input, list),
      h('div', { class: 'err' }));

    let hits = [];
    let cursor = -1;

    const paint = () => {
      list.innerHTML = '';
      if (!hits.length) {
        list.append(h('div', { class: 'none' }, 'Tidak ada pasien yang cocok. Gunakan tombol “+ Pasien Baru”.'));
      } else {
        hits.forEach((p, i) => list.append(h('button', {
          type: 'button', class: i === cursor ? 'hi' : '',
          onClick: () => choose(p),
        },
        h('div', { class: 'name' }, p.name),
        h('div', { class: 'meta' }, `${p.medical_record_no}${p.phone ? ` · ${p.phone}` : ''}`))));
      }
      list.classList.add('open');
    };

    const choose = (p) => {
      pasien = p;
      list.classList.remove('open');
      renderPatient();
    };

    const search = debounce(async (q) => {
      if (q.length < 2) { list.classList.remove('open'); return; }
      try {
        const res = await api.get(`/patients${api.qs({ q, limit: 8 })}`);
        hits = res.data || [];
        cursor = -1;
        paint();
      } catch { /* pencarian gagal: biarkan daftar tertutup */ }
    });

    input.addEventListener('input', () => search(input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (!list.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, hits.length - 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); paint(); }
      else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); choose(hits[cursor]); }
      else if (e.key === 'Escape') list.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) list.classList.remove('open');
    });

    return wrap;
  }

  async function quickAddPatient() {
    const suggested = await api.get('/patients/next-mr-no').then((r) => r.medical_record_no).catch(() => '');

    const created = await modal({
      title: 'Tambah Pasien Baru',
      render: (body, close) => {
        body.append(
          h('div', { class: 'alert', 'data-form-alert': '' }),
          h('div', { class: 'grid cols-2' },
            field('No. Rekam Medis *', h('input', { type: 'text', name: 'medical_record_no', value: suggested })),
            field('Nama Lengkap *', h('input', { type: 'text', name: 'name' }))),
          h('div', { class: 'grid cols-2' },
            field('Tanggal Lahir', h('input', { type: 'date', name: 'birth_date', max: todayISO() })),
            field('Jenis Kelamin', h('select', { name: 'gender' },
              h('option', { value: '' }, '— pilih —'),
              h('option', { value: 'L' }, 'Laki-laki'),
              h('option', { value: 'P' }, 'Perempuan')))),
          field('Telepon', h('input', { type: 'text', name: 'phone', placeholder: '08xx' })),
          field('Alamat', h('textarea', { name: 'address', rows: 2 })),
        );
        body._submit = async (allowDuplicate) => {
          const payload = collect(body);
          if (allowDuplicate) payload.allow_duplicate = true;
          try {
            const res = await api.post('/patients', payload);
            close(res.data);
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
          }, 'Simpan Pasien'));
      },
    });

    if (created) {
      pasien = created;
      renderPatient();
      toastOk(`Pasien ${created.name} ditambahkan.`);
    }
  }

  /* ---------------- Baris rincian ---------------- */

  /** Baris dianggap kosong bila belum ada keterangan maupun harga. */
  const isRowEmpty = (r) => !String(r.description || '').trim() && !r.unit_price;

  function addRow(preset = {}) {
    rows.push({
      service_item_id: preset.service_item_id ?? null,
      description: tanpaRentang(preset.description),
      category: preset.category ?? 'tindakan',
      qty: preset.qty ?? 1,
      unit_price: preset.unit_price ?? 0,
    });
  }

  /**
   * Isikan layanan ke baris kosong pertama bila ada, baru tambah baris baru.
   * Tanpa ini, baris kosong bawaan akan tertinggal di atas dan harus
   * dihapus manual oleh kasir.
   */
  /**
   * Buang keterangan rentang harga dari nama tarif sebelum masuk ke kwitansi.
   *
   * Tarif yang harganya berupa rentang diberi nama seperti
   * "Penambalan Sederhana Gigi Belakang — 250–350rb". Rentang itu ada untuk
   * kasir: mengingatkan bahwa harganya harus disesuaikan, bukan diterima apa
   * adanya. Pasien tidak perlu melihatnya — dan tidak boleh, karena membaca
   * "250–350rb" di sebelah tagihan Rp300.000 hanya menimbulkan pertanyaan.
   *
   * Yang dibuang hanya potongan di ujung yang benar-benar berbentuk rentang
   * harga, sehingga nama seperti "Behel Luar — Kontrol" tetap utuh.
   */
  const RENTANG_DI_UJUNG = /\s+—\s+[\d.,]+(?:rb|jt)?\s*[–-]\s*[\d.,]+(?:rb|jt)\s*$/;
  const tanpaRentang = (nama) => String(nama || '').replace(RENTANG_DI_UJUNG, '');

  function fillOrAddRow(preset) {
    const slot = rows.findIndex(isRowEmpty);
    if (slot === -1) {
      addRow(preset);
      return;
    }
    rows[slot] = {
      service_item_id: preset.service_item_id ?? null,
      description: tanpaRentang(preset.description),
      category: preset.category ?? 'tindakan',
      qty: preset.qty ?? 1,
      unit_price: preset.unit_price ?? 0,
    };
  }

  function renderRows() {
    itemsBody.innerHTML = '';

    if (!rows.length) {
      itemsBody.append(h('tr', {}, h('td', { colspan: '7' },
        h('div', { class: 'empty' },
          h('strong', {}, 'Belum ada rincian biaya'),
          'Tambahkan tindakan, obat, atau konsultasi yang ditagihkan.'))));
      renderTotals();
      return;
    }

    rows.forEach((row, i) => {
      const desc = h('input', {
        type: 'text', name: `items.${i}.description`, value: row.description,
        placeholder: 'Nama tindakan / obat', list: 'tarifList',
      });
      desc.addEventListener('input', () => {
        row.description = desc.value;
        // Isi harga otomatis bila kasir mengetik persis nama layanan dari daftar tarif.
        // Cocokkan dengan nama penuh maupun nama yang sudah dibersihkan dari
        // rentang, supaya pengisian otomatis tetap jalan setelah pembersihan.
        const match = layanan.find((s) => s.name === desc.value || tanpaRentang(s.name) === desc.value);
        if (match) {
          row.service_item_id = match.id;
          row.category = match.category;
          row.unit_price = match.default_price;
          renderRows();
        } else {
          row.service_item_id = null;
        }
      });

      const cat = h('select', { name: `items.${i}.category` },
        ...Object.entries(KATEGORI_LABEL).map(([v, l]) =>
          h('option', { value: v, selected: v === row.category || null }, l)));
      cat.addEventListener('change', () => { row.category = cat.value; });

      const qty = h('input', {
        type: 'text', class: 'money', inputmode: 'numeric',
        name: `items.${i}.qty`, value: String(row.qty),
      });
      qty.addEventListener('input', () => { row.qty = parseUang(qty.value); renderTotals(); syncLine(i); });

      const price = h('input', {
        type: 'text', class: 'money', inputmode: 'numeric',
        name: `items.${i}.unit_price`, value: row.unit_price ? row.unit_price.toLocaleString('id-ID') : '',
        placeholder: '0',
      });
      price.addEventListener('input', () => { row.unit_price = parseUang(price.value); renderTotals(); syncLine(i); });
      price.addEventListener('blur', () => {
        price.value = row.unit_price ? row.unit_price.toLocaleString('id-ID') : '';
      });

      const lineCell = h('td', { class: 'col-total' }, fmtRupiah(row.qty * row.unit_price));

      itemsBody.append(h('tr', {},
        h('td', { class: 'col-no' }, String(i + 1)),
        h('td', {}, wrapField(desc, `items.${i}.description`)),
        h('td', {}, cat),
        h('td', { class: 'col-qty' }, wrapField(qty, `items.${i}.qty`)),
        h('td', { class: 'col-price' }, wrapField(price, `items.${i}.unit_price`)),
        lineCell,
        h('td', { class: 'col-del' }, h('button', {
          type: 'button', class: 'row-del', title: 'Hapus baris',
          onClick: () => { rows.splice(i, 1); renderRows(); },
        }, '✕'))));
    });

    renderTotals();
  }

  function syncLine(i) {
    const cell = itemsBody.querySelectorAll('tr')[i]?.querySelector('.col-total');
    if (cell) cell.textContent = fmtRupiah(rows[i].qty * rows[i].unit_price);
  }

  /** Bungkus input dalam .field agar pesan error per baris punya tempat tampil. */
  function wrapField(input, name) {
    return h('div', { class: 'field', 'data-field': name }, input, h('div', { class: 'err' }));
  }

  async function pickFromTarif() {
    const chosen = await modal({
      title: 'Pilih dari Daftar Tarif',
      wide: true,
      render: (body, close) => {
        const search = h('input', { type: 'search', placeholder: 'Cari layanan…' });
        const list = h('div', { class: 'table-wrap', style: 'max-height:52vh;overflow-y:auto' });
        body.append(h('div', { class: 'field' }, search), list);

        const paint = (q = '') => {
          const term = q.toLowerCase();
          const hits = layanan.filter((s) =>
            s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term));
          list.innerHTML = '';
          if (!hits.length) {
            // Bedakan "belum ada tarif sama sekali" dari "kata kunci tidak cocok",
            // karena daftar tarif memang kosong sampai klinik mengisinya.
            list.append(layanan.length === 0
              ? h('div', { class: 'empty' },
                h('strong', {}, 'Daftar tarif masih kosong'),
                'Isi tarif resmi klinik lewat menu Tarif Layanan, atau ketik keterangan dan harganya langsung pada baris rincian.')
              : h('div', { class: 'empty' }, 'Tidak ada layanan yang cocok dengan kata kunci itu.'));
            return;
          }
          const tbody = h('tbody');
          hits.forEach((s) => tbody.append(h('tr', {},
            h('td', {}, h('div', {}, s.name), h('div', { class: 'muted small' }, `${s.code} · ${KATEGORI_LABEL[s.category] || s.category}`)),
            h('td', { class: 'num' }, fmtRupiah(s.default_price)),
            h('td', { class: 'actions' }, h('button', {
              type: 'button', class: 'btn-sm btn-primary',
              onClick: () => close(s),
            }, 'Tambah')))));
          list.append(h('table', {}, tbody));
        };

        search.addEventListener('input', () => paint(search.value.trim()));
        paint();
      },
      footer: (foot, close) => foot.append(h('button', { type: 'button', onClick: () => close(null) }, 'Tutup')),
    });

    if (chosen) {
      fillOrAddRow({
        service_item_id: chosen.id,
        description: tanpaRentang(chosen.name),
        category: chosen.category,
        unit_price: chosen.default_price,
      });
      renderRows();
    }
  }

  /* ---------------- Total ---------------- */

  function currentTotals() {
    const subtotal = rows.reduce((sum, r) => sum + (r.qty * r.unit_price), 0);
    const discount = parseUang(el('[name=discount]', form)?.value);
    const tax = parseUang(el('[name=tax]', form)?.value);
    const method = el('[name=payment_method]', form)?.value || 'tunai';
    const total = Math.max(0, subtotal - discount + tax);
    const paid = method === 'tunai' ? parseUang(el('[name=amount_paid]', form)?.value) : total;
    return { subtotal, discount, tax, total, paid, change: paid - total, method };
  }

  function renderTotals() {
    const t = currentTotals();
    totalsSlot.innerHTML = '';
    // Saring null lebih dulu: Node.append() mengubah null menjadi teks "null".
    totalsSlot.append(...[
      totalRow('Subtotal', fmtRupiah(t.subtotal)),
      t.discount > 0 ? totalRow('Diskon', `- ${fmtRupiah(t.discount)}`) : null,
      t.tax > 0 ? totalRow('Pajak / biaya lain', fmtRupiah(t.tax)) : null,
      totalRow('Total Dibayar', fmtRupiah(t.total), 'grand'),
      t.method === 'tunai' ? totalRow('Uang diterima', fmtRupiah(t.paid)) : null,
      t.method === 'tunai'
        ? totalRow('Kembalian', t.change >= 0 ? fmtRupiah(t.change) : 'Uang kurang', t.change >= 0 ? 'change' : 'kurang')
        : null,
      h('div', { class: 'terbilang' }, terbilangRupiah(t.total)),
    ].filter(Boolean));
    if (t.discount > t.subtotal) {
      totalsSlot.append(h('div', { class: 'alert warn mt-1 mb-0' }, 'Diskon melebihi subtotal.'));
    }
  }

  function totalRow(label, value, kind = '') {
    return h('div', { class: `total-row ${kind}` }, h('span', {}, label), h('span', { class: 'v' }, value));
  }

  /* ---------------- Reaksi formulir ---------------- */

  const methodSel = el('[name=payment_method]', form);
  const refWrap = el('#refWrap', form);
  const paidWrap = el('#paidWrap', form);

  const syncMethod = () => {
    const nonTunai = methodSel.value !== 'tunai';
    refWrap.classList.toggle('hidden', !nonTunai);
    paidWrap.classList.toggle('hidden', nonTunai);
    renderTotals();
  };
  methodSel.addEventListener('change', syncMethod);
  ['discount', 'tax', 'amount_paid'].forEach((name) => {
    el(`[name=${name}]`, form).addEventListener('input', renderTotals);
  });

  /* ---------------- Simpan ---------------- */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    clearErrors(form);
    els('.field[data-field]', form).forEach((f) => {
      f.classList.remove('invalid');
      f.querySelector('.err').textContent = '';
    });

    if (!pasien) {
      showAlert('Pilih pasien terlebih dahulu.');
      return;
    }
    if (!rows.length) {
      showAlert('Tambahkan minimal satu rincian biaya.');
      return;
    }

    // Buang baris yang benar-benar kosong agar kasir tidak tertahan pesan galat
    // hanya karena ada satu baris sisa yang belum diisi.
    if (rows.some(isRowEmpty) && rows.some((r) => !isRowEmpty(r))) {
      rows = rows.filter((r) => !isRowEmpty(r));
      renderRows();
    }
    if (rows.every(isRowEmpty)) {
      showAlert('Rincian biaya masih kosong. Isi keterangan dan harganya terlebih dahulu.');
      return;
    }

    const t = currentTotals();
    const payload = {
      patient_id: pasien.id,
      receipt_date: el('[name=receipt_date]', form).value,
      treatment_type: el('[name=treatment_type]', form).value.trim(),
      doctor_name: el('[name=doctor_name]', form).value.trim(),
      payment_method: methodSel.value,
      payment_ref: el('[name=payment_ref]', form).value.trim(),
      discount: t.discount,
      tax: t.tax,
      amount_paid: t.method === 'tunai' ? t.paid : 0,
      notes: el('[name=notes]', form).value.trim(),
      items: rows.map((r) => ({
        service_item_id: r.service_item_id,
        description: r.description,
        category: r.category,
        qty: r.qty,
        unit_price: r.unit_price,
      })),
    };

    const btn = el('#saveBtn', form);
    saving = true;
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';

    try {
      const res = await api.post('/receipts', payload);
      toastOk(res.message, 'Tersimpan');
      const saved = res.data;
      resetForm();
      await previewReceipt(saved.id, saved.receipt_no);
    } catch (err) {
      handleSaveError(err);
    } finally {
      saving = false;
      btn.disabled = false;
      btn.textContent = 'Simpan & Cetak Kwitansi';
    }
  });

  /** Petakan error server, termasuk error per baris rincian (items.N.field). */
  function handleSaveError(err) {
    if (!(err instanceof ApiError)) { showAlert('Terjadi kesalahan tak terduga.'); return; }
    const details = err.details && typeof err.details === 'object' ? err.details : {};
    let mappedAny = false;

    for (const [key, message] of Object.entries(details)) {
      const wrap = form.querySelector(`.field[data-field="${CSS.escape(key)}"]`)
        || form.querySelector(`[name="${CSS.escape(key)}"]`)?.closest('.field');
      if (wrap) {
        wrap.classList.add('invalid');
        const box = wrap.querySelector('.err');
        if (box) box.textContent = message;
        mappedAny = true;
      }
    }
    showAlert(mappedAny ? err.message : [err.message, ...Object.values(details).filter((v) => typeof v === 'string')].join(' '));
  }

  function showAlert(text) {
    alertBox.className = 'alert err';
    alertBox.textContent = text;
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function confirmReset() {
    return !rows.length && !pasien ? true : window.confirm('Kosongkan formulir? Data yang belum disimpan akan hilang.');
  }

  function resetForm() {
    pasien = null;
    rows = [];
    addRow(); // mulai dengan satu baris kosong, sama seperti halaman baru dibuka
    form.reset();
    el('[name=receipt_date]', form).value = todayISO();
    ['discount', 'tax', 'amount_paid'].forEach((n) => { el(`[name=${n}]`, form).value = '0'; });
    clearErrors(form);
    alertBox.className = 'alert';
    alertBox.textContent = '';
    renderPatient();
    renderRows();
    syncMethod();
  }

  /* ---------------- Pemasangan awal ---------------- */

  root.append(h('datalist', { id: 'tarifList' },
    ...layanan.map((s) => h('option', { value: s.name }))));

  renderPatient();
  addRow();
  renderRows();
  syncMethod();

  // Pintasan: Ctrl+Enter menyimpan kwitansi dari mana pun di formulir.
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit();
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
