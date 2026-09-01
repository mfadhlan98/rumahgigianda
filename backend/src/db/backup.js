import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env, ROOT } from '../config/env.js';

/**
 * Pencadangan database.
 *
 * Menyalin berkas .db begitu saja TIDAK aman: SQLite memakai mode WAL, sehingga
 * sebagian transaksi terbaru masih berada di berkas -wal terpisah dan salinan
 * bisa rusak bila diambil saat kasir sedang menyimpan kwitansi.
 * Karena itu dipakai `VACUUM INTO`, yang menghasilkan salinan utuh dan
 * terpadatkan tanpa perlu menghentikan server.
 */

const BACKUP_DIR = path.resolve(ROOT, 'backup');
const SIMPAN_HARI = Number.parseInt(process.env.BACKUP_KEEP_DAYS || '30', 10);

function stamp(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function backupSqlite() {
  if (!fs.existsSync(env.db.sqliteFile)) {
    throw new Error(`Database tidak ditemukan: ${env.db.sqliteFile}`);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `klinik-${stamp()}.db`);

  if (fs.existsSync(target)) {
    throw new Error(`Berkas cadangan ${path.basename(target)} sudah ada — coba lagi semenit lagi.`);
  }

  // Dibuka read-only supaya proses pencadangan tidak mungkin mengubah data asli.
  const db = new DatabaseSync(env.db.sqliteFile, { readOnly: true });
  try {
    // Tanda kutip tunggal digandakan mengikuti aturan literal teks SQL.
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  return { file: target, bytes: fs.statSync(target).size };
}

/** Hapus cadangan yang lebih tua dari SIMPAN_HARI, sisakan minimal satu. */
export function prune() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const berkas = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^klinik-\d{8}-\d{4}\.db$/.test(f))
    .map((f) => ({ f, full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const batas = Date.now() - SIMPAN_HARI * 24 * 60 * 60 * 1000;
  const dihapus = [];

  // Lewati indeks 0: cadangan terbaru tidak pernah dihapus, apa pun umurnya.
  for (let i = 1; i < berkas.length; i += 1) {
    if (berkas[i].mtime < batas) {
      fs.unlinkSync(berkas[i].full);
      dihapus.push(berkas[i].f);
    }
  }
  return dihapus;
}

// Dijalankan langsung lewat `npm run backup`
if (process.argv[1] && process.argv[1].endsWith('backup.js')) {
  if (env.db.driver !== 'sqlite') {
    console.error(`  [backup] Driver "${env.db.driver}" tidak dicadangkan oleh skrip ini.`);
    console.error('  [backup] Untuk MySQL gunakan mysqldump, contoh:');
    console.error(`  [backup]   mysqldump -u ${env.db.mysql.user} -p ${env.db.mysql.database} > cadangan.sql`);
    process.exit(1);
  }

  try {
    const { file, bytes } = backupSqlite();
    console.log(`  [backup] Berhasil: ${file} (${(bytes / 1024).toFixed(0)} KB)`);

    const dihapus = prune();
    if (dihapus.length) {
      console.log(`  [backup] ${dihapus.length} cadangan lama (>${SIMPAN_HARI} hari) dihapus.`);
    }
  } catch (err) {
    console.error(`  [backup] GAGAL: ${err.message}`);
    process.exit(1);
  }
}
