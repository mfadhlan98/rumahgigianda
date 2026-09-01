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

/** Buat tabel bila belum ada (idempoten). */
export async function migrate() {
  const file = db.dialect === 'mysql' ? 'schema.mysql.sql' : 'schema.sqlite.sql';
  const sql = fs.readFileSync(path.join(here, file), 'utf8');

  if (db.dialect === 'mysql') {
    await db.exec(sql); // multipleStatements aktif
  } else {
    await db.exec(sql); // sqlite exec mendukung banyak statement
  }
}
