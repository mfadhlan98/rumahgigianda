import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env, ROOT } from '../config/env.js';

/**
 * Memulihkan database dari berkas cadangan.
 *
 * Saat server berjalan, database SQLite tersebar di TIGA berkas:
 * klinik.db, klinik.db-wal, dan klinik.db-shm. Transaksi terbaru bisa masih
 * berada di berkas -wal dan belum masuk ke .db. Memindahkan atau menghapus
 * salah satunya saja akan membuang data yang sudah tersimpan.
 *
 * Skrip ini menangani ketiganya sekaligus, menolak berjalan selagi server
 * hidup, dan menyimpan kondisi lama sebelum menimpa.
 *
 *   npm run restore -- --latest
 *   npm run restore -- backup/klinik-20260831-2310.db
 */

const BACKUP_DIR = path.resolve(ROOT, 'backup');

function serverBerjalan() {
  return new Promise((resolve) => {
    const sock = net.connect({ port: env.port, host: '127.0.0.1' });
    sock.setTimeout(700);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

function cadanganTerbaru() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const daftar = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ full: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return daftar[0]?.full || null;
}

function periksaBerkas(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const { integrity_check: hasil } = db.prepare('PRAGMA integrity_check').get();
    if (hasil !== 'ok') throw new Error(`Berkas cadangan rusak: ${hasil}`);
    return {
      pengguna: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      pasien: db.prepare('SELECT COUNT(*) AS c FROM patients').get().c,
      kwitansi: db.prepare('SELECT COUNT(*) AS c FROM receipts').get().c,
    };
  } finally {
    db.close();
  }
}

export async function restore(sumber) {
  if (env.db.driver !== 'sqlite') {
    throw new Error(`Driver "${env.db.driver}" tidak dipulihkan oleh skrip ini. Untuk MySQL gunakan perintah mysql < cadangan.sql`);
  }
  if (!fs.existsSync(sumber)) throw new Error(`Berkas cadangan tidak ditemukan: ${sumber}`);

  if (await serverBerjalan()) {
    throw new Error(
      `Server masih berjalan di port ${env.port}. Hentikan dulu (tutup jendelanya atau tekan Ctrl+C), `
      + 'baru jalankan pemulihan.',
    );
  }

  const isi = periksaBerkas(sumber);
  const target = env.db.sqliteFile;

  // Simpan kondisi sekarang sebelum ditimpa — termasuk -wal yang mungkin
  // berisi transaksi yang belum masuk ke berkas utama.
  let disimpan = null;
  if (fs.existsSync(target)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const cap = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    disimpan = path.join(BACKUP_DIR, `sebelum-restore-${cap}.db`);
    fs.copyFileSync(target, disimpan);
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(target + ext)) fs.copyFileSync(target + ext, disimpan + ext);
    }
  }

  // Ketiga berkas harus dibuang bersama; menyisakan -wal lama akan merusak
  // database yang baru dipulihkan.
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(target + ext)) fs.unlinkSync(target + ext);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(sumber, target);

  return { sumber, target, isi, disimpan };
}

// Dijalankan langsung lewat `npm run restore -- <berkas|--latest>`
if (process.argv[1] && process.argv[1].endsWith('restore.js')) {
  const arg = process.argv[2];

  if (!arg) {
    console.error('  [restore] Sebutkan berkas cadangannya, atau pakai --latest untuk yang terbaru.');
    console.error('  [restore]   npm run restore -- --latest');
    console.error('  [restore]   npm run restore -- backup/klinik-20260831-2310.db');
    if (fs.existsSync(BACKUP_DIR)) {
      const ada = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db'));
      if (ada.length) {
        console.error('\n  Cadangan yang tersedia:');
        ada.sort().reverse().forEach((f) => console.error(`    ${f}`));
      }
    }
    process.exit(1);
  }

  const sumber = arg === '--latest' ? cadanganTerbaru() : path.resolve(arg);
  if (!sumber) {
    console.error('  [restore] Belum ada berkas cadangan di folder backup/.');
    process.exit(1);
  }

  try {
    const hasil = await restore(sumber);
    console.log(`  [restore] Dipulihkan dari : ${hasil.sumber}`);
    console.log(`  [restore] Ke              : ${hasil.target}`);
    console.log(`  [restore] Isi             : ${hasil.isi.pengguna} pengguna, ${hasil.isi.pasien} pasien, ${hasil.isi.kwitansi} kwitansi`);
    if (hasil.disimpan) console.log(`  [restore] Kondisi lama disimpan di: ${hasil.disimpan}`);
    console.log('  [restore] Jalankan kembali servernya sekarang.');
  } catch (err) {
    console.error(`  [restore] GAGAL: ${err.message}`);
    process.exit(1);
  }
}
