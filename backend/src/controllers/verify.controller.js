import { db } from '../db/index.js';
import { getSettings } from '../services/settings.js';
import { verifySignature } from '../services/verification.js';
import { badRequest } from '../utils/httpError.js';

/**
 * Endpoint publik untuk memindai QR pada kwitansi.
 * Sengaja hanya mengembalikan data minimum (tanpa alamat/telepon pasien)
 * karena tautan ini bisa dibuka siapa pun yang memegang kertas kwitansi.
 */
export async function verify(req, res) {
  const no = String(req.query.no || '').trim();
  const sig = String(req.query.sig || '').trim();
  if (!no || !sig) throw badRequest('Parameter "no" dan "sig" wajib diisi.');

  const receipt = await db.get(
    `SELECT r.id, r.receipt_no, r.receipt_date, r.total, r.status, r.patient_id, r.treatment_type,
            p.name AS patient_name, p.medical_record_no AS patient_mr_no
       FROM receipts r JOIN patients p ON p.id = r.patient_id
      WHERE r.receipt_no = ?`,
    [no],
  );

  if (!receipt || !verifySignature(receipt, sig)) {
    return res.status(404).json({ valid: false, message: 'Kwitansi tidak ditemukan atau kode verifikasi tidak cocok.' });
  }

  const settings = await getSettings();
  const maskedName = String(receipt.patient_name || '')
    .split(' ')
    .map((part, i) => (i === 0 ? part : `${part.charAt(0)}${'*'.repeat(Math.max(0, part.length - 1))}`))
    .join(' ');

  res.json({
    valid: true,
    status: receipt.status,
    message: receipt.status === 'void'
      ? 'Kwitansi ASLI namun sudah DIBATALKAN oleh klinik.'
      : 'Kwitansi asli dan tercatat di sistem klinik.',
    data: {
      clinic_name: settings.clinic_name,
      receipt_no: receipt.receipt_no,
      receipt_date: String(receipt.receipt_date).slice(0, 10),
      patient_name: maskedName,
      medical_record_no: receipt.patient_mr_no,
      treatment_type: receipt.treatment_type,
      total: Number(receipt.total),
    },
  });
}
