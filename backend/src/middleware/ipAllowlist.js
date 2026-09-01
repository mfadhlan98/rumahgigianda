import { env } from '../config/env.js';

/**
 * Pembatasan akses berdasarkan alamat IP komputer yang membuka aplikasi.
 *
 * Dipakai agar sistem hanya bisa dibuka dari komputer klinik, bukan dari
 * perangkat lain yang kebetulan ikut tersambung ke jaringan yang sama.
 *
 * Pemeriksaan sengaja memakai alamat soket mentah (`req.socket.remoteAddress`),
 * BUKAN `req.ip`. Bila Express memercayai proxy, `req.ip` diambil dari header
 * X-Forwarded-For yang bisa ditulis bebas oleh pengirim — daftar izin yang
 * memakainya jadi tidak ada artinya.
 */

/** Ubah "::ffff:192.168.1.5" menjadi "192.168.1.5"; sisanya dikembalikan apa adanya. */
export function normalizeIp(raw) {
  const ip = String(raw || '').trim();
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/** Alamat komputer server sendiri — selalu diizinkan agar tidak mengunci diri. */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function ipToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out * 256) + n;
  }
  return out;
}

/** Cocokkan sebuah IPv4 dengan satu entri daftar izin (IP tunggal atau CIDR). */
export function matchesRule(ip, rule) {
  if (!rule.includes('/')) return ip === rule;

  const [base, bitsRaw] = rule.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipLong = ipToLong(ip);
  const baseLong = ipToLong(base);
  if (ipLong === null || baseLong === null) return false;

  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((ipLong & mask) >>> 0) === ((baseLong & mask) >>> 0);
}

export function isAllowed(ip) {
  if (env.allowedIps.length === 0) return true;   // fitur mati
  if (LOOPBACK.has(ip)) return true;              // server itu sendiri
  return env.allowedIps.some((rule) => matchesRule(ip, rule));
}

export function ipAllowlist(req, res, next) {
  if (env.allowedIps.length === 0) return next();

  const ip = normalizeIp(req.socket?.remoteAddress);
  if (isAllowed(ip)) return next();

  console.warn(`[AKSES DITOLAK] ${ip} mencoba membuka ${req.method} ${req.originalUrl}`);

  // Tanggapan disamakan untuk semua jalur, termasuk berkas statis, supaya
  // perangkat yang tidak berhak tidak bisa memuat halaman login sekalipun.
  res.status(403);
  if (req.originalUrl.startsWith('/api')) {
    return res.json({
      error: 'Komputer ini tidak terdaftar untuk memakai sistem kwitansi klinik.',
      details: { ip },
    });
  }
  return res
    .type('text/plain; charset=utf-8')
    .send(`Akses ditolak.\n\nKomputer dengan alamat ${ip} tidak terdaftar untuk memakai `
      + 'sistem kwitansi klinik ini.\nHubungi administrator klinik bila ini keliru.\n');
}

/** Ringkasan untuk ditampilkan saat server menyala. */
export function allowlistSummary() {
  if (env.allowedIps.length === 0) return 'nonaktif (semua komputer di jaringan boleh)';
  return `${env.allowedIps.length} entri — ${env.allowedIps.join(', ')}`;
}
