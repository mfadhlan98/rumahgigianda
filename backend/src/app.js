import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { env, ROOT } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { ipAllowlist } from './middleware/ipAllowlist.js';

import authRoutes from './routes/auth.routes.js';
import patientRoutes from './routes/patients.routes.js';
import serviceItemRoutes from './routes/serviceItems.routes.js';
import receiptRoutes from './routes/receipts.routes.js';
import reportRoutes from './routes/reports.routes.js';
import userRoutes from './routes/users.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import verifyRoutes from './routes/verify.routes.js';
import brandingRoutes from './routes/branding.routes.js';
import { manifest } from './controllers/branding.controller.js';
import { wrap } from './middleware/asyncHandler.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  // Paling depan: tolak komputer di luar daftar izin sebelum apa pun diproses.
  app.use(ipAllowlist);

  /**
   * Kebijakan CORS.
   *
   * Frontend disajikan oleh server ini juga, sehingga permintaan dari halaman
   * aplikasi SELALU seasal — termasuk ketika PC kedua membukanya lewat alamat
   * IP (http://192.168.1.50:4000). Alamat seperti itu mustahil didaftarkan
   * lebih dulu di CORS_ORIGIN karena baru diketahui saat pemasangan, maka
   * kesamaan asal diperiksa terhadap host permintaan itu sendiri.
   *
   * CORS_ORIGIN hanya diperlukan bila frontend disajikan dari alamat lain,
   * misalnya di belakang reverse proxy dengan nama domain berbeda.
   */
  app.use(cors((req, cb) => {
    const origin = req.headers.origin;

    // Alat non-browser (curl, layanan printer) tidak mengirim Origin.
    if (!origin) return cb(null, { origin: true });

    const seasal = origin === `${req.protocol}://${req.headers.host}`;
    // Daftar kosong berarti "hanya seasal", bukan "izinkan semua" — pemasangan
    // biasa tidak perlu mengizinkan situs luar mana pun.
    const terdaftar = env.corsOrigin.includes(origin);

    // Asal yang tidak diizinkan cukup tidak diberi header CORS — peramban yang
    // akan menolaknya. Melempar galat di sini hanya menghasilkan 500 yang
    // membingungkan, bukan penolakan yang benar.
    cb(null, { origin: seasal || terdaftar });
  }));

  app.use(express.json({ limit: '5mb' })); // 5mb menampung unggahan logo base64
  app.use(express.urlencoded({ extended: false }));

  // Header keamanan dasar tanpa dependensi tambahan.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', driver: env.db.driver, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/service-items', serviceItemRoutes);
  app.use('/api/receipts', receiptRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/verify', verifyRoutes);
  app.use('/api/branding', brandingRoutes);

  // Manifes wajib berada di akar, bukan di bawah /api: cakupan aplikasi ("/")
  // tidak boleh lebih luas daripada letak manifesnya sendiri.
  app.get('/manifest.webmanifest', wrap(manifest));

  // Sajikan frontend dari server yang sama agar cukup satu proses saat dipakai di klinik.
  // `no-cache` memaksa browser memvalidasi ulang tiap muat, sehingga staf tidak
  // terjebak memakai versi lama setelah aplikasi diperbarui.
  const frontendDir = path.resolve(ROOT, '..', 'frontend');
  app.use(express.static(frontendDir, {
    extensions: ['html'],
    etag: true,
    lastModified: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }));

  app.use('/api', notFoundHandler);
  app.use((req, res) => res.sendFile(path.join(frontendDir, 'index.html')));
  app.use(errorHandler);

  return app;
}
