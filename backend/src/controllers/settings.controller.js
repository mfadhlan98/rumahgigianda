import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { getSettings, setSettings, SETTING_DEFS } from '../services/settings.js';
import { logAudit } from '../services/audit.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { isHex } from '../utils/color.js';

const LOGO_DIR = path.join(env.receipt.storageDir, '..');
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

/** Tanda tangan berkas gambar — jangan percaya ekstensi atau mime dari klien. */
const MAGIC = [
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

function sniffImage(buf) {
  return MAGIC.find((m) => m.bytes.every((b, i) => buf[i] === b)) || null;
}

export async function read(req, res) {
  const settings = await getSettings();
  res.json({
    data: { ...settings, has_logo: Boolean(settings.logo_path && fs.existsSync(settings.logo_path)) },
    fields: Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, d]) => [k, d.label])),
  });
}

export async function save(req, res) {
  const patch = {};
  const errors = {};

  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    if (key === 'logo_path') continue; // hanya diubah lewat unggah logo
    if (!(key in req.body)) continue;

    const raw = req.body[key];
    const value = raw === null || raw === undefined ? '' : String(raw).trim();
    if (value.length > def.max) {
      errors[key] = `${def.label} maksimal ${def.max} karakter.`;
      continue;
    }
    patch[key] = value;
  }

  if (patch.clinic_name !== undefined && !patch.clinic_name) {
    errors.clinic_name = 'Nama klinik wajib diisi.';
  }
  if (patch.receipt_prefix !== undefined && !/^[A-Za-z0-9-]{1,12}$/.test(patch.receipt_prefix || '')) {
    errors.receipt_prefix = 'Awalan hanya boleh huruf, angka, dan strip (maks. 12 karakter).';
  }
  if (patch.default_print_size !== undefined
      && !['a4', 'a5', 'thermal58', 'thermal80'].includes(patch.default_print_size)) {
    errors.default_print_size = 'Ukuran cetak tidak dikenali.';
  }

  for (const key of ['brand_color', 'brand_accent']) {
    if (patch[key] === undefined || patch[key] === '') continue;
    if (!isHex(patch[key])) {
      errors[key] = 'Isi dengan kode warna heksadesimal, contoh #70544D.';
    }
  }
  if (patch.qr_enabled !== undefined) patch.qr_enabled = patch.qr_enabled === '1' || patch.qr_enabled === 'true' ? '1' : '0';

  if (Object.keys(errors).length) throw badRequest('Pengaturan belum valid.', errors);

  const data = await setSettings(patch);
  await logAudit(req, { action: 'update', entity: 'settings', detail: Object.keys(patch).join(',') });
  res.json({ data, message: 'Pengaturan tersimpan.' });
}

/** Unggah logo resolusi tinggi sebagai data URL base64 (tanpa dependensi multipart). */
export async function uploadLogo(req, res) {
  const raw = String(req.body?.data || '');
  const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!base64) throw badRequest('Berkas logo tidak terkirim.', { data: 'Pilih berkas logo terlebih dahulu.' });

  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw badRequest('Data logo bukan base64 yang valid.', { data: 'Berkas rusak.' });
  }
  if (buf.length === 0) throw badRequest('Berkas logo kosong.', { data: 'Berkas kosong.' });
  if (buf.length > MAX_LOGO_BYTES) {
    throw badRequest('Ukuran logo maksimal 3 MB.', { data: 'Berkas terlalu besar (maks. 3 MB).' });
  }

  const kind = sniffImage(buf);
  if (!kind) throw badRequest('Format logo harus PNG atau JPG.', { data: 'Gunakan PNG (disarankan) atau JPG.' });

  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const target = path.join(LOGO_DIR, `logo.${kind.ext}`);

  // Hapus logo lama dengan ekstensi berbeda agar tidak menyisakan berkas yatim.
  for (const m of MAGIC) {
    const other = path.join(LOGO_DIR, `logo.${m.ext}`);
    if (m.ext !== kind.ext && fs.existsSync(other)) fs.unlinkSync(other);
  }
  fs.writeFileSync(target, buf);

  await setSettings({ logo_path: target });
  await logAudit(req, { action: 'upload_logo', entity: 'settings', detail: { bytes: buf.length, type: kind.mime } });
  res.json({ message: 'Logo berhasil diunggah.', size: buf.length, type: kind.mime });
}

export async function getLogo(req, res) {
  const settings = await getSettings();
  const file = settings.logo_path;
  if (!file || !fs.existsSync(file)) throw notFound('Logo belum diunggah.');

  const buf = fs.readFileSync(file);
  const kind = sniffImage(buf);
  res.setHeader('Content-Type', kind?.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(buf);
}

export async function removeLogo(req, res) {
  const settings = await getSettings();
  if (settings.logo_path && fs.existsSync(settings.logo_path)) fs.unlinkSync(settings.logo_path);
  await setSettings({ logo_path: '' });
  await logAudit(req, { action: 'delete_logo', entity: 'settings' });
  res.json({ message: 'Logo dihapus.' });
}
