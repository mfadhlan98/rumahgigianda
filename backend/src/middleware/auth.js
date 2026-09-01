import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { unauthorized, forbidden } from '../utils/httpError.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.full_name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Wajib login. Menempelkan req.user dari data terbaru di database. */
export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) throw unauthorized('Token tidak ditemukan. Silakan login.');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (e) {
      throw unauthorized(e.name === 'TokenExpiredError' ? 'Sesi berakhir, silakan login ulang.' : 'Token tidak valid.');
    }

    const user = await db.get(
      'SELECT id, username, full_name, role, is_active FROM users WHERE id = ?',
      [payload.sub],
    );
    if (!user) throw unauthorized('Akun tidak ditemukan.');
    if (!user.is_active) throw forbidden('Akun Anda dinonaktifkan. Hubungi administrator.');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Batasi endpoint ke peran tertentu, mis. requireRole('admin'). */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(forbidden(`Fitur ini hanya untuk peran: ${roles.join(', ')}.`));
  }
  next();
};
