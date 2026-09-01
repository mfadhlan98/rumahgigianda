import os from 'node:os';
import { env } from './config/env.js';
import { db, migrate } from './db/index.js';
import { createApp } from './app.js';
import { ensureSeed } from './db/seed.js';
import { allowlistSummary } from './middleware/ipAllowlist.js';
import { getSettings } from './services/settings.js';

/** Alamat IPv4 komputer ini di jaringan lokal, untuk ditunjukkan ke PC kedua. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
}

async function main() {
  await migrate();
  await ensureSeed({ quiet: true });

  // Nama klinik diambil dari pengaturan, bukan dipatok di kode.
  const { clinic_name: namaKlinik } = await getSettings();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log('');
    console.log(`  ${namaKlinik} — Sistem Kwitansi`);
    console.log(`  Server   : http://localhost:${env.port}`);
    console.log(`  Database : ${env.db.driver}${env.db.driver === 'sqlite' ? ` (${env.db.sqliteFile})` : ''}`);
    console.log(`  Mode     : ${env.nodeEnv}`);
    console.log(`  Batas IP : ${allowlistSummary()}`);
    for (const ip of lanAddresses()) {
      console.log(`  Dari PC lain di jaringan: http://${ip}:${env.port}`);
    }
    console.log('');
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} diterima, menutup server...`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    // Paksa keluar bila koneksi menggantung lebih dari 10 detik.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
