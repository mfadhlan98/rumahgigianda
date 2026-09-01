import { db } from '../db/index.js';
import { logAudit } from '../services/audit.js';
import { notFound, conflict } from '../utils/httpError.js';
import { v } from '../utils/validate.js';

export const CATEGORIES = ['tindakan', 'obat', 'konsultasi', 'lainnya'];

export async function list(req, res) {
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const includeInactive = req.query.include_inactive === '1';

  const where = [];
  const params = [];
  if (!includeInactive) where.push('is_active = 1');
  if (category && CATEGORIES.includes(category)) {
    where.push('category = ?');
    params.push(category);
  }
  if (q) {
    where.push('(name LIKE ? OR code LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await db.query(
    `SELECT * FROM service_items ${clause} ORDER BY category ASC, name ASC`,
    params,
  );
  res.json({ data: rows, categories: CATEGORIES });
}

function validateItem(body) {
  return v(body)
    .string('code', { required: true, min: 2, max: 40, label: 'Kode' })
    .string('name', { required: true, min: 2, max: 150, label: 'Nama layanan' })
    .string('category', { required: true, allow: CATEGORIES, label: 'Kategori' })
    .int('default_price', { required: true, min: 0, max: 999_999_999, label: 'Tarif' })
    .done();
}

export async function create(req, res) {
  const data = validateItem(req.body);
  const dup = await db.get('SELECT id FROM service_items WHERE code = ?', [data.code]);
  if (dup) throw conflict(`Kode "${data.code}" sudah dipakai.`, { code: 'Kode sudah dipakai.' });

  const { insertId } = await db.run(
    'INSERT INTO service_items (code, name, category, default_price) VALUES (?, ?, ?, ?)',
    [data.code, data.name, data.category, data.default_price],
  );
  await logAudit(req, { action: 'create', entity: 'service_item', entityId: insertId, detail: data });
  res.status(201).json({ data: await db.get('SELECT * FROM service_items WHERE id = ?', [insertId]), message: 'Layanan ditambahkan.' });
}

export async function update(req, res) {
  const existing = await db.get('SELECT * FROM service_items WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Layanan tidak ditemukan.');

  const data = validateItem(req.body);
  const dup = await db.get('SELECT id FROM service_items WHERE code = ? AND id <> ?', [data.code, existing.id]);
  if (dup) throw conflict(`Kode "${data.code}" sudah dipakai.`, { code: 'Kode sudah dipakai.' });

  await db.run(
    'UPDATE service_items SET code = ?, name = ?, category = ?, default_price = ? WHERE id = ?',
    [data.code, data.name, data.category, data.default_price, existing.id],
  );
  await logAudit(req, { action: 'update', entity: 'service_item', entityId: existing.id, detail: data });
  res.json({ data: await db.get('SELECT * FROM service_items WHERE id = ?', [existing.id]), message: 'Layanan diperbarui.' });
}

/** Nonaktifkan, bukan hapus — kwitansi lama tetap merujuk tarif ini. */
export async function setStatus(req, res) {
  const existing = await db.get('SELECT * FROM service_items WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Layanan tidak ditemukan.');
  const active = req.body?.is_active === true || req.body?.is_active === 1;
  await db.run('UPDATE service_items SET is_active = ? WHERE id = ?', [active ? 1 : 0, existing.id]);
  await logAudit(req, { action: active ? 'activate' : 'deactivate', entity: 'service_item', entityId: existing.id });
  res.json({ message: active ? 'Layanan diaktifkan.' : 'Layanan dinonaktifkan.' });
}
