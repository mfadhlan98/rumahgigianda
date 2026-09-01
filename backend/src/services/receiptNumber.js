import { env } from '../config/env.js';

/**
 * Nomor kwitansi unik: PREFIX/YYYYMM/NNNN, contoh KGM/202608/0001.
 * Nomor urut di-reset tiap bulan dan dijamin unik oleh index UNIQUE(period, seq)
 * — pemanggil harus menjalankan ini di dalam transaksi.
 */
export function periodOf(isoDate) {
  return String(isoDate).slice(0, 10).replace(/-/g, '').slice(0, 6);
}

export function formatReceiptNo(period, seq, prefix) {
  const p = String(prefix || env.receipt.prefix).trim() || env.receipt.prefix;
  return `${p}/${period}/${String(seq).padStart(env.receipt.seqPad, '0')}`;
}

/** Ambil nomor urut berikutnya untuk periode tertentu (dipanggil dalam transaksi). */
export async function nextSequence(conn, period) {
  const lock = conn.dialect === 'mysql' ? ' FOR UPDATE' : '';
  const row = await conn.get(
    `SELECT COALESCE(MAX(seq), 0) AS max_seq FROM receipts WHERE period = ?${lock}`,
    [period],
  );
  return Number(row?.max_seq || 0) + 1;
}
