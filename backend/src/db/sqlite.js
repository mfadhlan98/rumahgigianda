import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.js';

/**
 * Adapter SQLite (bawaan Node >= 22.5, tanpa dependensi native).
 * API dibuat async agar seragam dengan adapter MySQL.
 */
let handle = null;

function open() {
  if (handle) return handle;
  fs.mkdirSync(path.dirname(env.db.sqliteFile), { recursive: true });
  handle = new DatabaseSync(env.db.sqliteFile);
  handle.exec('PRAGMA journal_mode = WAL;');
  handle.exec('PRAGMA foreign_keys = ON;');
  return handle;
}

const clean = (params = []) => params.map((p) => (p === undefined ? null : p));

function makeApi(db) {
  return {
    dialect: 'sqlite',
    async query(sql, params = []) {
      return db.prepare(sql).all(...clean(params));
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...clean(params)) ?? null;
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...clean(params));
      return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async exec(sql) {
      db.exec(sql);
    },
  };
}

export function createSqliteAdapter() {
  const db = open();
  const api = makeApi(db);

  return {
    ...api,
    /** Jalankan beberapa perintah dalam satu transaksi atomik. */
    async transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(api);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* transaksi sudah tertutup */
        }
        throw err;
      }
    },
    async close() {
      if (handle) {
        handle.close();
        handle = null;
      }
    },
  };
}
