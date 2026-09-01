import { db } from '../db/index.js';

/** Catat jejak audit. Kegagalan pencatatan tidak boleh menggagalkan transaksi bisnis. */
export async function logAudit(req, { action, entity, entityId = null, detail = null }, conn = db) {
  try {
    await conn.run(
      `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req?.user?.id ?? null,
        req?.user?.username ?? null,
        action,
        entity,
        entityId === null ? null : String(entityId),
        typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null,
        req?.ip ?? null,
      ],
    );
  } catch (err) {
    console.error('[AUDIT] gagal mencatat:', err.message);
  }
}
