import { db } from '../db/index.js';
import { signToken } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { verifyPassword, hashPassword, checkPasswordStrength } from '../utils/password.js';
import { unauthorized, badRequest, forbidden } from '../utils/httpError.js';
import { v } from '../utils/validate.js';

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  full_name: u.full_name,
  role: u.role,
  is_active: !!u.is_active,
});

export async function login(req, res) {
  const data = v(req.body)
    .string('username', { required: true, max: 64, label: 'Username' })
    .string('password', { required: true, max: 200, label: 'Password' })
    .done();

  const user = await db.get('SELECT * FROM users WHERE username = ?', [data.username]);
  // Pesan sengaja disamakan agar tidak membocorkan username mana yang ada.
  if (!user || !verifyPassword(data.password, user.password_hash)) {
    throw unauthorized('Username atau password salah.');
  }
  if (!user.is_active) throw forbidden('Akun Anda dinonaktifkan. Hubungi administrator.');

  await logAudit({ ...req, user }, { action: 'login', entity: 'user', entityId: user.id });
  res.json({ token: signToken(user), user: publicUser(user) });
}

export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

export async function changePassword(req, res) {
  const data = v(req.body)
    .string('current_password', { required: true, max: 200, label: 'Password saat ini' })
    .string('new_password', { required: true, max: 200, label: 'Password baru' })
    .done();

  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(data.current_password, user.password_hash)) {
    throw badRequest('Password saat ini tidak cocok.', { current_password: 'Password saat ini tidak cocok.' });
  }
  const weak = checkPasswordStrength(data.new_password);
  if (weak) throw badRequest(weak, { new_password: weak });
  if (data.current_password === data.new_password) {
    throw badRequest('Password baru harus berbeda dari password lama.', {
      new_password: 'Password baru harus berbeda dari password lama.',
    });
  }

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(data.new_password), req.user.id]);
  await logAudit(req, { action: 'change_password', entity: 'user', entityId: req.user.id });
  res.json({ message: 'Password berhasil diperbarui.' });
}
