import { db } from '../db/index.js';
import { todayLocal } from '../utils/format.js';

function range(query) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date_from || '')) ? query.date_from : todayLocal();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date_to || '')) ? query.date_to : from;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Ringkasan pendapatan untuk dashboard & laporan keuangan. */
export async function summary(req, res) {
  const { from, to } = range(req.query);
  const params = [from, to];
  const issued = "r.status = 'issued' AND r.receipt_date BETWEEN ? AND ?";

  const totals = await db.get(
    `SELECT COUNT(*) AS jumlah_kwitansi,
            COALESCE(SUM(r.total), 0)    AS pendapatan,
            COALESCE(SUM(r.discount), 0) AS total_diskon,
            COALESCE(SUM(r.tax), 0)      AS total_pajak
       FROM receipts r WHERE ${issued}`,
    params,
  );

  const voided = await db.get(
    `SELECT COUNT(*) AS jumlah FROM receipts r
      WHERE r.status = 'void' AND r.receipt_date BETWEEN ? AND ?`,
    params,
  );

  const byMethod = await db.query(
    `SELECT r.payment_method, COUNT(*) AS jumlah, COALESCE(SUM(r.total), 0) AS nilai
       FROM receipts r WHERE ${issued}
      GROUP BY r.payment_method ORDER BY nilai DESC`,
    params,
  );

  const byCategory = await db.query(
    `SELECT i.category, COUNT(*) AS jumlah_baris, COALESCE(SUM(i.line_total), 0) AS nilai
       FROM receipt_items i JOIN receipts r ON r.id = i.receipt_id
      WHERE ${issued}
      GROUP BY i.category ORDER BY nilai DESC`,
    params,
  );

  const topServices = await db.query(
    `SELECT i.description, SUM(i.qty) AS total_qty, COALESCE(SUM(i.line_total), 0) AS nilai
       FROM receipt_items i JOIN receipts r ON r.id = i.receipt_id
      WHERE ${issued}
      GROUP BY i.description ORDER BY nilai DESC LIMIT 10`,
    params,
  );

  const daily = await db.query(
    `SELECT r.receipt_date, COUNT(*) AS jumlah, COALESCE(SUM(r.total), 0) AS nilai
       FROM receipts r WHERE ${issued}
      GROUP BY r.receipt_date ORDER BY r.receipt_date ASC`,
    params,
  );

  res.json({
    range: { from, to },
    totals: { ...totals, kwitansi_batal: Number(voided.jumlah) },
    by_method: byMethod,
    by_category: byCategory,
    top_services: topServices,
    daily,
  });
}

/** Ekspor CSV untuk keperluan audit / pembukuan. */
export async function exportCsv(req, res) {
  const { from, to } = range(req.query);
  const rows = await db.query(
    `SELECT r.receipt_no, r.receipt_date, p.medical_record_no, p.name AS patient_name,
            r.treatment_type, r.doctor_name, r.payment_method, r.payment_ref,
            r.subtotal, r.discount, r.tax, r.total, r.status, u.full_name AS kasir
       FROM receipts r
       JOIN patients p ON p.id = r.patient_id
       JOIN users u    ON u.id = r.created_by
      WHERE r.receipt_date BETWEEN ? AND ?
      ORDER BY r.receipt_date ASC, r.id ASC`,
    [from, to],
  );

  const headers = [
    'No Kwitansi', 'Tanggal', 'No RM', 'Nama Pasien', 'Jenis Perawatan', 'Dokter',
    'Metode', 'Referensi', 'Subtotal', 'Diskon', 'Pajak', 'Total', 'Status', 'Kasir',
  ];
  const esc = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(';')];
  for (const r of rows) lines.push(Object.values(r).map(esc).join(';'));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="Laporan-Kwitansi-${from}_sd_${to}.csv"`);
  // BOM agar Excel membaca UTF-8 dengan benar.
  res.send(`﻿${lines.join('\r\n')}`);
}
