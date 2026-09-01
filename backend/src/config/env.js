import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

const resolve = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));
const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  port: int(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  corsOrigin: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Daftar IP/CIDR yang boleh membuka aplikasi. Kosong = semua boleh.
  allowedIps: (process.env.ALLOWED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Hanya nyalakan bila server berada di belakang reverse proxy (Nginx/Caddy).
  // Bila menyala tanpa proxy, siapa pun bisa memalsukan alamat asalnya lewat
  // header X-Forwarded-For — merusak jejak audit dan pembatasan IP.
  trustProxy: process.env.TRUST_PROXY === 'true',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-jangan-dipakai-di-produksi',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  db: {
    driver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
    sqliteFile: resolve(process.env.SQLITE_FILE || './data/klinik.db'),
    mysql: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: int(process.env.MYSQL_PORT, 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'klinik_gigi_manda',
    },
  },

  clinic: {
    name: process.env.CLINIC_NAME || 'Klinik Gigi Manda',
    tagline: process.env.CLINIC_TAGLINE || '',
    address: process.env.CLINIC_ADDRESS || '',
    phone: process.env.CLINIC_PHONE || '',
    email: process.env.CLINIC_EMAIL || '',
  },

  /* Satu-satunya akar untuk berkas yang ditulis aplikasi: logo klinik dan
     arsip kwitansi. Wajib bisa dialihkan lewat STORAGE_DIR — pengujian yang
     memakai database terpisah tetap akan menimpa logo klinik sungguhan bila
     jalur ini dipatok, karena logo disimpan sebagai berkas, bukan di database. */
  storageDir: resolve(process.env.STORAGE_DIR || './storage'),

  receipt: {
    prefix: process.env.RECEIPT_PREFIX || 'KGM',
    seqPad: int(process.env.RECEIPT_SEQ_PAD, 4),
    storageDir: resolve(path.join(process.env.STORAGE_DIR || './storage', 'receipts')),
  },

  seed: {
    adminUsername: process.env.SEED_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin123',
    adminName: process.env.SEED_ADMIN_NAME || 'Administrator Klinik',
    // Sengaja mati secara bawaan: tarif contoh berisi harga karangan yang
    // berbahaya bila sampai tercetak di kwitansi asli. Nyalakan hanya untuk
    // demo atau pengembangan.
    sampleServices: process.env.SEED_SAMPLE_SERVICES === 'true',
  },
};

/**
 * Cegah server produksi berjalan dengan secret yang bisa ditebak.
 * Bukan hanya nilai bawaan: placeholder di .env.example juga harus tertolak,
 * karena itulah nilai yang paling mungkin ikut tersalin saat pemasangan.
 */
const SECRET_TIDAK_AMAN = [
  'dev-secret-jangan-dipakai-di-produksi',
  'ganti-dengan-secret-acak-yang-panjang-dan-rahasia',
  'secret', 'rahasia', 'changeme', 'jwtsecret',
];

if (env.isProd) {
  const s = env.jwtSecret.trim();
  const lemah = s.length < 32
    || s.startsWith('dev-secret')
    || SECRET_TIDAK_AMAN.includes(s.toLowerCase());

  if (lemah) {
    throw new Error(
      'JWT_SECRET belum aman untuk NODE_ENV=production. Isi dengan teks acak minimal 32 karakter, '
      + 'misalnya hasil: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
}
