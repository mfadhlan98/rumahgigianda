import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details ?? undefined });
  }

  // Pelanggaran UNIQUE dari SQLite / MySQL
  const msg = String(err?.message || '');
  if (err?.code === 'ER_DUP_ENTRY' || /UNIQUE constraint failed/i.test(msg)) {
    return res.status(409).json({ error: 'Data duplikat: nilai tersebut sudah dipakai.' });
  }
  if (err?.code === 'ER_NO_REFERENCED_ROW_2' || /FOREIGN KEY constraint failed/i.test(msg)) {
    return res.status(400).json({ error: 'Referensi data tidak valid.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Body permintaan bukan JSON yang valid.' });
  }

  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Terjadi kesalahan pada server.',
    details: env.isProd ? undefined : msg,
  });
}
