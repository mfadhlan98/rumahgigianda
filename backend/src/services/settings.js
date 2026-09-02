import { db } from '../db/index.js';
import { env } from '../config/env.js';

/**
 * Profil klinik & preferensi kwitansi disimpan di tabel `settings`
 * agar bisa diubah dari halaman Pengaturan tanpa menyentuh file .env.
 * Nilai di .env hanya dipakai sebagai default saat pertama kali dijalankan.
 */
export const SETTING_DEFS = {
  clinic_name: { label: 'Nama klinik', max: 120, fallback: () => env.clinic.name },
  clinic_tagline: { label: 'Tagline', max: 120, fallback: () => env.clinic.tagline },
  clinic_address: { label: 'Alamat', max: 300, fallback: () => env.clinic.address },
  clinic_phone: { label: 'Telepon', max: 60, fallback: () => env.clinic.phone },
  clinic_email: { label: 'Email', max: 120, fallback: () => env.clinic.email },
  clinic_website: { label: 'Website', max: 120, fallback: () => '' },
  clinic_npwp: { label: 'NPWP', max: 40, fallback: () => '' },

  // Satu kolom bebas, bukan tiga kolom terpisah: klinik lazim punya beberapa
  // rekening sekaligus, ditambah dompet digital yang tidak berbentuk rekening.
  payment_accounts: {
    label: 'Rekening & tujuan pembayaran',
    max: 600,
    fallback: () => '',
  },

  /* Nomor Surat Izin Praktik. Diberi kolom sendiri, bukan dititipkan ke
     tagline atau NPWP: nomor ini menerangkan izin praktik dokternya, bukan
     identitas pajak klinik, dan tempatnya di kop tepat di bawah nama dokter. */
  clinic_license: { label: 'Nomor SIP (izin praktik)', max: 120, fallback: () => '' },

  brand_color: { label: 'Warna utama merek', max: 7, fallback: () => '#0f3d3e' },
  brand_accent: { label: 'Warna aksen merek', max: 7, fallback: () => '#14807f' },

  receipt_prefix: { label: 'Awalan nomor kwitansi', max: 12, fallback: () => env.receipt.prefix },
  receipt_footer_note: {
    label: 'Catatan kaki kwitansi',
    max: 300,
    fallback: () => 'Kwitansi ini dicetak oleh sistem dan sah tanpa tanda tangan basah.',
  },
  signer_name: { label: 'Nama penanda tangan', max: 120, fallback: () => '' },
  signer_title: { label: 'Jabatan penanda tangan', max: 80, fallback: () => 'Dokter Gigi' },

  qr_enabled: { label: 'Tampilkan QR verifikasi', max: 1, fallback: () => '1' },
  qr_base_url: { label: 'URL dasar verifikasi QR', max: 200, fallback: () => '' },
  default_print_size: { label: 'Ukuran cetak default', max: 12, fallback: () => 'a5land' },
  logo_path: { label: 'Berkas logo', max: 300, fallback: () => '' },
};

let cache = null;

/** Ambil seluruh pengaturan (dengan cache proses). */
export async function getSettings(force = false) {
  if (cache && !force) return cache;

  const rows = await db.query('SELECT skey, svalue FROM settings');
  const stored = Object.fromEntries(rows.map((r) => [r.skey, r.svalue]));

  const result = {};
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    result[key] = stored[key] !== undefined && stored[key] !== null ? stored[key] : def.fallback();
  }
  cache = result;
  return result;
}

export async function setSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFS)) continue;
    const existing = await db.get('SELECT skey FROM settings WHERE skey = ?', [key]);
    if (existing) await db.run('UPDATE settings SET svalue = ? WHERE skey = ?', [value, key]);
    else await db.run('INSERT INTO settings (skey, svalue) VALUES (?, ?)', [key, value]);
  }
  cache = null;
  return getSettings(true);
}

export function invalidateSettingsCache() {
  cache = null;
}
