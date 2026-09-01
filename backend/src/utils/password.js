import crypto from 'node:crypto';

/**
 * Hash password memakai scrypt bawaan Node (tanpa dependensi native).
 * Format tersimpan: scrypt$N$r$p$saltHex$hashHex
 */
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  try {
    const [scheme, sN, sR, sP, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(plain), salt, expected.length, {
      N: Number(sN),
      r: Number(sR),
      p: Number(sP),
      maxmem: 64 * 1024 * 1024,
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Aturan minimal password agar akun tidak mudah ditebak. */
export function checkPasswordStrength(plain) {
  const v = String(plain ?? '');
  if (v.length < 6) return 'Password minimal 6 karakter.';
  if (/^\s|\s$/.test(v)) return 'Password tidak boleh diawali/diakhiri spasi.';
  return null;
}
