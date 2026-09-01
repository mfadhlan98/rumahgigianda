import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getSettings } from './settings.js';

/**
 * Kode verifikasi kwitansi: HMAC-SHA256 atas data kunci kwitansi,
 * dipotong 12 karakter agar muat dicetak namun tetap sulit dipalsukan.
 */
export function signatureFor(receipt) {
  const payload = [
    receipt.receipt_no,
    String(receipt.receipt_date).slice(0, 10),
    String(receipt.total),
    String(receipt.patient_id),
  ].join('|');

  return crypto.createHmac('sha256', env.jwtSecret).update(payload).digest('hex').slice(0, 12).toUpperCase();
}

export function verifySignature(receipt, code) {
  const expected = signatureFor(receipt);
  const given = String(code || '').toUpperCase();
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

/**
 * Isi QR code. Bila URL verifikasi diisi di Pengaturan, QR berupa tautan
 * yang bisa dibuka langsung; bila kosong, QR berisi payload teks terstruktur
 * yang tetap terbaca mesin (parser sederhana / OCR).
 */
export async function qrPayload(receipt) {
  const s = await getSettings();
  const sig = signatureFor(receipt);
  const base = String(s.qr_base_url || '').trim().replace(/\/+$/, '');

  if (base) {
    const url = new URL(`${base}/verify.html`);
    url.searchParams.set('no', receipt.receipt_no);
    url.searchParams.set('sig', sig);
    return { text: url.toString(), signature: sig };
  }

  const text = [
    'KWITANSI',
    `NO=${receipt.receipt_no}`,
    `TGL=${String(receipt.receipt_date).slice(0, 10)}`,
    `RM=${receipt.patient_mr_no || ''}`,
    `TOTAL=${receipt.total}`,
    `SIG=${sig}`,
  ].join('\n');

  return { text, signature: sig };
}
