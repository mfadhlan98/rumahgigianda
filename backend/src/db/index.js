import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { createSqliteAdapter } from './sqlite.js';
import { createMysqlAdapter } from './mysql.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function build() {
  switch (env.db.driver) {
    case 'sqlite':
      return createSqliteAdapter();
    case 'mysql':
    case 'mariadb':
      return createMysqlAdapter();
    default:
      throw new Error(`DB_DRIVER "${env.db.driver}" tidak dikenali. Gunakan "sqlite" atau "mysql".`);
  }
}

export const db = build();

/**
 * Kolom yang ditambahkan setelah skema pertama dipakai di klinik. CREATE TABLE
 * IF NOT EXISTS tidak menyentuh tabel yang sudah ada, jadi kolom baru harus
 * di-ALTER satu per satu. Urutannya permanen: jangan menyisipkan di tengah.
 */
const KOLOM_TAMBAHAN = [
  ['receipts', 'diagnosis', db.dialect === 'mysql' ? 'VARCHAR(300) NULL' : 'TEXT'],
];

async function kolomAda(table, column) {
  if (db.dialect === 'mysql') {
    const row = await db.get(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column],
    );
    return !!row;
  }
  const rows = await db.query(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

/** Buat tabel bila belum ada, lalu tambahkan kolom yang belum ada (idempoten). */
export async function migrate() {
  const file = db.dialect === 'mysql' ? 'schema.mysql.sql' : 'schema.sqlite.sql';
  const sql = fs.readFileSync(path.join(here, file), 'utf8');

  if (db.dialect === 'mysql') {
    await db.exec(sql); // multipleStatements aktif
  } else {
    await db.exec(sql); // sqlite exec mendukung banyak statement
  }

  for (const [table, column, type] of KOLOM_TAMBAHAN) {
    if (!(await kolomAda(table, column))) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}
