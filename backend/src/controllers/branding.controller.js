import fs from 'node:fs';
import { db } from '../db/index.js';
import { env } from '../config/env.js';
import { getSettings } from '../services/settings.js';
import { verifyPassword } from '../utils/password.js';
import { notFound } from '../utils/httpError.js';

/**
 * Identitas visual klinik untuk halaman yang belum login.
 *
 * Sengaja publik dan sengaja sempit: hanya nama, tagline, warna, dan logo —
 * semuanya sudah tercetak pada setiap kwitansi yang dipegang pasien, jadi
 * bukan informasi rahasia. Alamat, telepon, rekening, dan pengaturan lain
 * tetap hanya bisa dibaca setelah login.
 */
/**
 * Apakah akun admin masih memakai password bawaan.
 *
 * Dipakai untuk memutuskan apakah petunjuk "login pertama kali" masih perlu
 * ditampilkan. Menyebutkan password bawaan di halaman login hanya masuk akal
 * selama password itu memang masih berlaku; setelah diganti, petunjuk yang
 * sama justru menyesatkan staf.
 */
async function adminMasihBawaan() {
  try {
    const u = await db.get('SELECT password_hash FROM users WHERE username = ?', [env.seed.adminUsername]);
    return Boolean(u && verifyPassword(env.seed.adminPassword, u.password_hash));
  } catch {
    return false;
  }
}

export async function branding(req, res) {
  const s = await getSettings();
  res.json({
    clinic_name: s.clinic_name,
    clinic_tagline: s.clinic_tagline,
    brand_color: s.brand_color,
    brand_accent: s.brand_accent,
    has_logo: Boolean(s.logo_path && fs.existsSync(s.logo_path)),
    default_admin: await adminMasihBawaan(),
  });
}

export async function brandingLogo(req, res) {
  const s = await getSettings();
  if (!s.logo_path || !fs.existsSync(s.logo_path)) throw notFound('Logo belum diunggah.');

  const buf = fs.readFileSync(s.logo_path);
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  res.setHeader('Content-Type', png ? 'image/png' : 'image/jpeg');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(buf);
}
