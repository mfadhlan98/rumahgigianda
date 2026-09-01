import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { logAudit } from '../services/audit.js';
import { periodOf, formatReceiptNo, nextSequence } from '../services/receiptNumber.js';
import { buildReceiptPdf, UKURAN_CETAK } from '../services/pdf.js';
import { getSettings } from '../services/settings.js';
import { qrPayload } from '../services/verification.js';
import { badRequest, notFound, conflict } from '../utils/httpError.js';
import { v } from '../utils/validate.js';
import { terbilangRupiah } from '../utils/terbilang.js';
import { todayLocal, nowLocal } from '../utils/format.js';
import { CATEGORIES } from './serviceItems.controller.js';

const PAYMENT_METHODS = ['tunai', 'transfer', 'kartu'];

/* ------------------------------------------------------------------ */
/* Validasi                                                            */
/* ------------------------------------------------------------------ */

/** Validasi baris rincian biaya; melempar 400 dengan peta error per baris. */
function validateItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw badRequest('Rincian biaya wajib diisi minimal satu baris.', {
      items: 'Tambahkan minimal satu rincian biaya.',
    });
  }
  if (rawItems.length > 50) {
    throw badRequest('Rincian biaya maksimal 50 baris.', { items: 'Maksimal 50 baris.' });
  }

  const errors = {};
  const items = [];

  rawItems.forEach((raw, i) => {
    const desc = String(raw?.description ?? '').trim();
    const qty = Number(raw?.qty);
    const price = Number(raw?.unit_price);
    const category = String(raw?.category ?? 'tindakan').trim();

    if (!desc) errors[`items.${i}.description`] = `Baris ${i + 1}: nama tindakan/obat wajib diisi.`;
    else if (desc.length > 255) errors[`items.${i}.description`] = `Baris ${i + 1}: keterangan maksimal 255 karakter.`;

    if (!Number.isInteger(qty) || qty < 1) errors[`items.${i}.qty`] = `Baris ${i + 1}: jumlah minimal 1.`;
    else if (qty > 9999) errors[`items.${i}.qty`] = `Baris ${i + 1}: jumlah maksimal 9999.`;

    if (!Number.isInteger(price) || price < 0) errors[`items.${i}.unit_price`] = `Baris ${i + 1}: harga satuan harus bilangan bulat minimal 0.`;
    else if (price > 999999999) errors[`items.${i}.unit_price`] = `Baris ${i + 1}: harga satuan terlalu besar.`;

    if (!CATEGORIES.includes(category)) errors[`items.${i}.category`] = `Baris ${i + 1}: kategori tidak dikenali.`;

    items.push({
      service_item_id:
        Number.isInteger(Number(raw?.service_item_id)) && Number(raw?.service_item_id) > 0
          ? Number(raw.service_item_id)
          : null,
      description: desc,
      category,
      qty,
      unit_price: price,
      line_total: qty * price,
      position: i,
    });
  });

  if (Object.keys(errors).length) {
    throw badRequest('Ada rincian biaya yang belum valid.', errors);
  }
  return items;
}

/** Hitung ulang seluruh nilai uang di server — angka dari klien tidak dipercaya. */
function computeTotals(items, discount, tax, amountPaid, paymentMethod) {
  const subtotal = items.reduce((sum, it) => sum + it.line_total, 0);
  const errors = {};

  if (discount > subtotal) errors.discount = 'Diskon tidak boleh melebihi subtotal.';
  const total = subtotal - discount + tax;
  if (total < 0) errors.total = 'Total tidak boleh negatif.';

  // Untuk tunai, uang diterima harus menutup total. Non-tunai dianggap lunas sebesar total.
  const paid = paymentMethod === 'tunai' ? amountPaid : total;
  if (paymentMethod === 'tunai' && paid < total) {
    errors.amount_paid = 'Uang diterima kurang dari total tagihan.';
  }

  if (Object.keys(errors).length) throw badRequest('Perhitungan pembayaran belum valid.', errors);

  return { subtotal, total, amount_paid: paid, change_amount: paid - total };
}

/* ------------------------------------------------------------------ */
/* Pembacaan                                                           */
/* ------------------------------------------------------------------ */

const SELECT_RECEIPT = `
  SELECT r.*,
         p.name              AS patient_name,
         p.medical_record_no AS patient_mr_no,
         p.phone             AS patient_phone,
         p.address           AS patient_address,
         u.full_name         AS created_by_name,
         uv.full_name        AS voided_by_name
    FROM receipts r
    JOIN patients p ON p.id = r.patient_id
    JOIN users    u ON u.id = r.created_by
    LEFT JOIN users uv ON uv.id = r.voided_by
`;

export async function list(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  const q = String(req.query.q || '').trim();
  if (q) {
    where.push('(r.receipt_no LIKE ? OR p.name LIKE ? OR p.medical_record_no LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date_from || ''))) {
    where.push('r.receipt_date >= ?');
    params.push(req.query.date_from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date_to || ''))) {
    where.push('r.receipt_date <= ?');
    params.push(req.query.date_to);
  }
  if (PAYMENT_METHODS.includes(String(req.query.payment_method || ''))) {
    where.push('r.payment_method = ?');
    params.push(req.query.payment_method);
  }
  if (['issued', 'void'].includes(String(req.query.status || ''))) {
    where.push('r.status = ?');
    params.push(req.query.status);
  }
  if (Number.parseInt(req.query.patient_id, 10) > 0) {
    where.push('r.patient_id = ?');
    params.push(Number.parseInt(req.query.patient_id, 10));
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const summary = await db.get(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN r.status = 'issued' THEN r.total ELSE 0 END), 0) AS sum_total
       FROM receipts r JOIN patients p ON p.id = r.patient_id ${clause}`,
    params,
  );

  const rows = await db.query(
    `${SELECT_RECEIPT} ${clause} ORDER BY r.receipt_date DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  res.json({
    data: rows,
    meta: {
      page,
      limit,
      total: Number(summary.total),
      pages: Math.ceil(Number(summary.total) / limit) || 1,
      sum_total: Number(summary.sum_total),
    },
  });
}

async function loadFull(id) {
  const receipt = await db.get(`${SELECT_RECEIPT} WHERE r.id = ?`, [id]);
  if (!receipt) throw notFound('Kwitansi tidak ditemukan.');
  receipt.items = await db.query(
    'SELECT * FROM receipt_items WHERE receipt_id = ? ORDER BY position ASC, id ASC',
    [id],
  );
  return receipt;
}

export async function detail(req, res) {
  const receipt = await loadFull(req.params.id);
  const settings = await getSettings();
  const { text, signature } = await qrPayload(receipt);

  res.json({
    data: receipt,
    terbilang: terbilangRupiah(receipt.total),
    clinic: settings,
    verification: {
      signature,
      // Data URL agar pratinjau cetak di browser tidak perlu permintaan tambahan.
      qr: settings.qr_enabled === '1'
        ? await QRCode.toDataURL(text, { width: 600, margin: 0, errorCorrectionLevel: 'M' })
        : null,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Penulisan                                                           */
/* ------------------------------------------------------------------ */

export async function create(req, res) {
  const head = v(req.body)
    .int('patient_id', { required: true, min: 1, label: 'Pasien' })
    .date('receipt_date', { label: 'Tanggal kwitansi' })
    .string('treatment_type', { max: 200, label: 'Jenis perawatan' })
    .string('doctor_name', { max: 150, label: 'Nama dokter' })
    .string('payment_method', { required: true, allow: PAYMENT_METHODS, label: 'Metode pembayaran' })
    .string('payment_ref', { max: 100, label: 'Nomor referensi' })
    .int('discount', { min: 0, max: 999999999, default: 0, label: 'Diskon' })
    .int('tax', { min: 0, max: 999999999, default: 0, label: 'Pajak' })
    .int('amount_paid', { min: 0, max: 999999999, default: 0, label: 'Uang diterima' })
    .string('notes', { max: 500, label: 'Catatan' })
    .done();

  const receiptDate = head.receipt_date || todayLocal();
  if (receiptDate > todayLocal()) {
    throw badRequest('Tanggal kwitansi tidak boleh di masa depan.', {
      receipt_date: 'Tanggal melebihi hari ini.',
    });
  }
  if (head.payment_method !== 'tunai' && !head.payment_ref) {
    throw badRequest('Nomor referensi wajib diisi untuk pembayaran non-tunai.', {
      payment_ref: 'Wajib diisi untuk transfer/kartu.',
    });
  }

  const patient = await db.get('SELECT * FROM patients WHERE id = ?', [head.patient_id]);
  if (!patient) throw badRequest('Pasien tidak ditemukan.', { patient_id: 'Pilih pasien yang valid.' });
  if (!patient.is_active) throw badRequest('Pasien tersebut berstatus nonaktif.', { patient_id: 'Pasien nonaktif.' });

  const items = validateItems(req.body.items);
  const money = computeTotals(items, head.discount, head.tax, head.amount_paid, head.payment_method);
  const period = periodOf(receiptDate);
  const settings = await getSettings();

  // Nomor urut rawan tabrakan saat dua kasir menyimpan bersamaan;
  // index UNIQUE(period, seq) menangkapnya, lalu kita ulang percobaannya.
  let receiptId = null;
  let receiptNo = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const result = await db.transaction(async (tx) => {
        const seq = await nextSequence(tx, period);
        const no = formatReceiptNo(period, seq, settings.receipt_prefix);

        const { insertId } = await tx.run(
          `INSERT INTO receipts
             (receipt_no, patient_id, receipt_date, period, seq, treatment_type, doctor_name,
              payment_method, payment_ref, subtotal, discount, tax, total, amount_paid, change_amount,
              notes, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`,
          [
            no, patient.id, receiptDate, period, seq, head.treatment_type, head.doctor_name,
            head.payment_method, head.payment_ref, money.subtotal, head.discount, head.tax,
            money.total, money.amount_paid, money.change_amount, head.notes, req.user.id,
          ],
        );

        for (const it of items) {
          await tx.run(
            `INSERT INTO receipt_items
               (receipt_id, service_item_id, description, category, qty, unit_price, line_total, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [insertId, it.service_item_id, it.description, it.category, it.qty, it.unit_price, it.line_total, it.position],
          );
        }
        return { insertId, no };
      });

      receiptId = result.insertId;
      receiptNo = result.no;
      break;
    } catch (err) {
      const dup = err?.code === 'ER_DUP_ENTRY' || /UNIQUE constraint failed/i.test(String(err?.message));
      if (dup && attempt < 5) continue;
      throw err;
    }
  }

  await logAudit(req, {
    action: 'create',
    entity: 'receipt',
    entityId: receiptId,
    detail: { receipt_no: receiptNo, total: money.total, patient_id: patient.id },
  });

  const full = await loadFull(receiptId);
  res.status(201).json({
    data: full,
    terbilang: terbilangRupiah(full.total),
    message: `Kwitansi ${receiptNo} berhasil dibuat.`,
  });
}

/** Batalkan kwitansi. Data tidak dihapus agar jejak audit tetap lengkap. */
export async function voidReceipt(req, res) {
  const receipt = await db.get('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
  if (!receipt) throw notFound('Kwitansi tidak ditemukan.');
  if (receipt.status === 'void') throw conflict('Kwitansi ini sudah dibatalkan sebelumnya.');

  const data = v(req.body)
    .string('reason', { required: true, min: 5, max: 300, label: 'Alasan pembatalan' })
    .done();

  await db.run(
    "UPDATE receipts SET status = 'void', void_reason = ?, voided_at = ?, voided_by = ? WHERE id = ?",
    [data.reason, nowLocal(), req.user.id, receipt.id],
  );
  await logAudit(req, {
    action: 'void',
    entity: 'receipt',
    entityId: receipt.id,
    detail: { receipt_no: receipt.receipt_no, reason: data.reason },
  });

  res.json({ message: `Kwitansi ${receipt.receipt_no} dibatalkan.`, data: await loadFull(receipt.id) });
}

/* ------------------------------------------------------------------ */
/* Cetak                                                               */
/* ------------------------------------------------------------------ */

export async function pdf(req, res) {
  const receipt = await loadFull(req.params.id);
  const settings = await getSettings();
  const requested = String(req.query.size || settings.default_print_size || 'a5land').toLowerCase();
  const size = UKURAN_CETAK.includes(requested) ? requested : 'a5land';
  const filename = `Kwitansi-${receipt.receipt_no.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

  await logAudit(req, { action: 'print', entity: 'receipt', entityId: receipt.id, detail: { size } });
  const stream = await buildReceiptPdf(receipt, size);
  stream.pipe(res);
}
