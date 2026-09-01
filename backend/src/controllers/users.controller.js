import { db } from '../db/index.js';
import { logAudit } from '../services/audit.js';
import { hashPassword, checkPasswordStrength } from '../utils/password.js';
import { badRequest, notFound, conflict } from '../utils/httpError.js';
import { v } from '../utils/validate.js';

export const ROLES = ['admin', 'kasir'];

const PUBLIC_COLS = 'id, username, full_name, role, is_active, created_at';

export async function list(req, res) {
  const rows = await db.query(`SELECT ${PUBLIC_COLS} FROM users ORDER BY role ASC, full_name ASC`);
  res.json({ data: rows, roles: ROLES });
}

export async function create(req, res) {
  const data = v(req.body)
    .string('username', { required: true, min: 3, max: 64, label: 'Username' })
    .string('full_name', { required: true, min: 3, max: 150, label: 'Nama lengkap' })
    .string('role', { required: true, allow: ROLES, label: 'Peran' })
    .string('password', { required: true, max: 200, label: 'Password' })
    .done();

  if (!/^[a-zA-Z0-9._-]+$/.test(data.username)) {
    throw badRequest('Username hanya boleh huruf, angka, titik, garis bawah, dan strip.', {
      username: 'Format username tidak valid.',
    });
  }
  const weak = checkPasswordStrength(data.password);
  if (weak) throw badRequest(weak, { password: weak });

  const dup = await db.get('SELECT id FROM users WHERE username = ?', [data.username]);
  if (dup) throw conflict(`Username "${data.username}" sudah dipakai.`, { username: 'Username sudah dipakai.' });

  const { insertId } = await db.run(
    'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [data.username, hashPassword(data.password), data.full_name, data.role],
  );
  await logAudit(req, {
    action: 'create',
    entity: 'user',
    entityId: insertId,
    detail: { username: data.username, role: data.role },
  });

  res.status(201).json({
    data: await db.get(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`, [insertId]),
    message: 'Pengguna berhasil dibuat.',
  });
}

export async function update(req, res) {
  const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!target) throw notFound('Pengguna tidak ditemukan.');

  const data = v(req.body)
    .string('full_name', { required: true, min: 3, max: 150, label: 'Nama lengkap' })
    .string('role', { required: true, allow: ROLES, label: 'Peran' })
    .bool('is_active', { default: true })
    .done();

  const active = data.is_active ? 1 : 0;

  // Jangan sampai klinik kehilangan seluruh admin aktif.
  if (target.role === 'admin' && (data.role !== 'admin' || !active)) {
    const { c } = await db.get(
      "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?",
      [target.id],
    );
    if (Number(c) === 0) {
      throw badRequest('Harus tersisa minimal satu admin aktif.', { role: 'Ini admin aktif terakhir.' });
    }
  }
  if (target.id === req.user.id && !active) {
    throw badRequest('Anda tidak dapat menonaktifkan akun Anda sendiri.', { is_active: 'Tidak boleh menonaktifkan diri sendiri.' });
  }

  await db.run('UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?', [
    data.full_name, data.role, active, target.id,
  ]);
  await logAudit(req, { action: 'update', entity: 'user', entityId: target.id, detail: data });

  res.json({
    data: await db.get(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`, [target.id]),
    message: 'Data pengguna diperbarui.',
  });
}

export async function resetPassword(req, res) {
  const target = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!target) throw notFound('Pengguna tidak ditemukan.');

  const data = v(req.body)
    .string('new_password', { required: true, max: 200, label: 'Password baru' })
    .done();

  const weak = checkPasswordStrength(data.new_password);
  if (weak) throw badRequest(weak, { new_password: weak });

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(data.new_password), target.id]);
  await logAudit(req, { action: 'reset_password', entity: 'user', entityId: target.id });
  res.json({ message: `Password ${target.username} berhasil direset.` });
}

/** Jejak audit — hanya admin. */
export async function auditLogs(req, res) {
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
  const rows = await db.query(
    'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?',
    [limit],
  );
  res.json({ data: rows });
}
