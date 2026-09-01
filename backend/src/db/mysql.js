import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

/** Adapter MySQL / MariaDB dengan connection pool. */
let pool = null;

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    ...env.db.mysql,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Kembalikan DATE/DATETIME sebagai string agar konsisten dengan SQLite.
    dateStrings: true,
    multipleStatements: true,
  });
  return pool;
}

const clean = (params = []) => params.map((p) => (p === undefined ? null : p));

function makeApi(conn) {
  return {
    dialect: 'mysql',
    async query(sql, params = []) {
      const [rows] = await conn.query(sql, clean(params));
      return rows;
    },
    async get(sql, params = []) {
      const [rows] = await conn.query(sql, clean(params));
      return rows[0] ?? null;
    },
    async run(sql, params = []) {
      const [res] = await conn.query(sql, clean(params));
      return { insertId: Number(res.insertId ?? 0), changes: Number(res.affectedRows ?? 0) };
    },
    async exec(sql) {
      await conn.query(sql);
    },
  };
}

export function createMysqlAdapter() {
  const p = getPool();
  const api = makeApi(p);

  return {
    ...api,
    async transaction(fn) {
      const conn = await p.getConnection();
      await conn.beginTransaction();
      try {
        const result = await fn(makeApi(conn));
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },
  };
}
