import { db, migrate } from './index.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/password.js';

const DEFAULT_SERVICES = [
  ['KON-01', 'Konsultasi Dokter Gigi Umum', 'konsultasi', 50000],
  ['KON-02', 'Konsultasi Dokter Gigi Spesialis', 'konsultasi', 100000],
  ['TIN-01', 'Pembersihan Karang Gigi (Scaling) Rahang Atas & Bawah', 'tindakan', 350000],
  ['TIN-02', 'Tambal Gigi Sinar (Komposit) — Sederhana', 'tindakan', 250000],
  ['TIN-03', 'Tambal Gigi Sinar (Komposit) — Kompleks', 'tindakan', 400000],
  ['TIN-04', 'Cabut Gigi Anak', 'tindakan', 150000],
  ['TIN-05', 'Cabut Gigi Dewasa', 'tindakan', 300000],
  ['TIN-06', 'Cabut Gigi Bungsu (Odontektomi)', 'tindakan', 2500000],
  ['TIN-07', 'Perawatan Saluran Akar per Kunjungan', 'tindakan', 500000],
  ['TIN-08', 'Pemasangan Mahkota (Crown) Porselen', 'tindakan', 3000000],
  ['TIN-09', 'Gigi Tiruan Lepasan per Elemen', 'tindakan', 600000],
  ['TIN-10', 'Bleaching / Pemutihan Gigi', 'tindakan', 1500000],
  ['TIN-11', 'Rontgen Periapikal', 'tindakan', 100000],
  ['TIN-12', 'Rontgen Panoramik', 'tindakan', 250000],
  ['OBT-01', 'Antibiotik (Amoxicillin 500 mg, 10 tablet)', 'obat', 45000],
  ['OBT-02', 'Analgesik (Asam Mefenamat 500 mg, 10 tablet)', 'obat', 30000],
  ['OBT-03', 'Obat Kumur Antiseptik 300 ml', 'obat', 55000],
  ['LAI-01', 'Biaya Administrasi', 'lainnya', 15000],
];

/** Isi data awal bila database masih kosong. Aman dijalankan berulang kali. */
export async function ensureSeed({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };

  const { c: userCount } = await db.get('SELECT COUNT(*) AS c FROM users');
  // Database yang baru dibuat: pesannya selalu ditampilkan, karena inilah saat
  // pemasang membaca konsol dan perlu tahu langkah berikutnya.
  const fresh = Number(userCount) === 0;

  if (fresh) {
    await db.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [env.seed.adminUsername, hashPassword(env.seed.adminPassword), env.seed.adminName, 'admin'],
    );
    console.log(`  [seed] Akun admin dibuat: ${env.seed.adminUsername} / ${env.seed.adminPassword}`);
    console.log('  [seed] SEGERA ganti password ini setelah login pertama.');
  } else {
    log(`  [seed] ${userCount} pengguna sudah ada — dilewati.`);
  }

  const { c: serviceCount } = await db.get('SELECT COUNT(*) AS c FROM service_items');
  if (Number(serviceCount) > 0) {
    log(`  [seed] ${serviceCount} tarif layanan sudah ada — dilewati.`);
    return;
  }

  // Tarif contoh berisi harga karangan. Membiarkannya masuk ke klinik yang
  // sedang beroperasi berisiko: kasir bisa menerbitkan kwitansi dengan harga
  // yang bukan tarif resmi. Karena itu hanya diisi bila diminta eksplisit.
  if (!env.seed.sampleServices) {
    const say = fresh ? console.log : log;
    say('  [seed] Daftar tarif dibiarkan kosong — isi tarif resmi klinik lewat menu Tarif Layanan.');
    say('         Untuk demo, setel SEED_SAMPLE_SERVICES=true di .env pada database kosong.');
    return;
  }

  for (const [code, name, category, price] of DEFAULT_SERVICES) {
    await db.run(
      'INSERT INTO service_items (code, name, category, default_price) VALUES (?, ?, ?, ?)',
      [code, name, category, price],
    );
  }
  log(`  [seed] ${DEFAULT_SERVICES.length} tarif layanan CONTOH ditambahkan — ganti sebelum dipakai klinik.`);
}

// Dijalankan langsung lewat `npm run seed`
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  await migrate();
  await ensureSeed();
  await db.close();
  console.log('  [seed] Selesai.');
}
