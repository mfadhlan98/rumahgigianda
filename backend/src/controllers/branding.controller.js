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

/** Lebar dan tinggi PNG dibaca dari blok IHDR; JPG tidak didukung di sini. */
function ukuranPng(buf) {
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  if (!png || buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Ikon persegi untuk taskbar dan menu Start.
 *
 * Logo klinik hampir tidak pernah persegi, sedangkan sistem operasi menuntut
 * ikon persegi. Membiarkan peramban memaksa proporsinya membuat logo gepeng.
 * SVG dipilih karena bisa menempatkan logo apa adanya di tengah bidang persegi
 * tanpa perlu pustaka pengolah gambar sama sekali — hanya penyusunan teks.
 *
 * Alas putih disengaja: logo klinik umumnya gelap, dan taskbar Windows juga
 * gelap, jadi ikon berlatar transparan akan lenyap.
 */
export async function brandingIkon(req, res) {
  const s = await getSettings();
  if (!s.logo_path || !fs.existsSync(s.logo_path)) throw notFound('Logo belum diunggah.');

  const buf = fs.readFileSync(s.logo_path);
  const dim = ukuranPng(buf);
  const mime = dim ? 'image/png' : 'image/jpeg';

  const S = 512;
  const pad = 0.80;                                  // logo mengisi 80% bidang
  const rasio = dim ? dim.w / dim.h : 1;
  const w = rasio >= 1 ? S * pad : S * pad * rasio;
  const h = rasio >= 1 ? (S * pad) / rasio : S * pad;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<rect width="${S}" height="${S}" rx="88" fill="#ffffff"/>
<image href="data:${mime};base64,${buf.toString('base64')}"
       x="${((S - w) / 2).toFixed(1)}" y="${((S - h) / 2).toFixed(1)}"
       width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(svg);
}

/**
 * Manifes aplikasi web, supaya sistem kwitansi bisa dipasang sebagai aplikasi
 * dan muncul di taskbar dengan nama serta ikon klinik — bukan ikon peramban.
 *
 * Disusun dari pengaturan klinik, bukan berkas statis, agar setiap klinik
 * mendapat nama dan warnanya sendiri tanpa menyunting apa pun.
 */
export async function manifest(req, res) {
  const s = await getSettings();
  const nama = s.clinic_name || 'Klinik';
  const adaLogo = Boolean(s.logo_path && fs.existsSync(s.logo_path));

  const ikon = adaLogo
    ? [
      // SVG lebih dulu: persegi, tajam di segala ukuran, dan tidak menggepengkan logo.
      { src: '/api/branding/ikon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/api/branding/ikon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ]
    : [{ src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    name: `Sistem Kwitansi — ${nama}`,
    short_name: 'Kwitansi Klinik',
    description: `Pencatatan dan pencetakan kwitansi pembayaran ${nama}.`,
    lang: 'id',
    dir: 'ltr',
    start_url: '/app.html',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: s.brand_color || '#0f3d3e',
    icons: ikon,
  });
}
