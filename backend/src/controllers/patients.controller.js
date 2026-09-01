import { db } from '../db/index.js';
import { logAudit } from '../services/audit.js';
import { notFound, conflict } from '../utils/httpError.js';
import { v } from '../utils/validate.js';

const GENDERS = ['L', 'P'];

function parsePaging(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

/** Nomor rekam medis berikutnya: RM-000123 (berdasarkan angka tertinggi yang ada). */
export async function nextMedicalRecordNo() {
  const rows = await db.query(
    "SELECT medical_record_no FROM patients WHERE medical_record_no LIKE 'RM-%'",
  );
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(String(r.medical_record_no).slice(3), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `RM-${String(max + 1).padStart(6, '0')}`;
}

export async function suggestMrNo(req, res) {
  res.json({ medical_record_no: await nextMedicalRecordNo() });
}

export async function list(req, res) {
  const { page, limit, offset } = parsePaging(req.query);
  const q = String(req.query.q || '').trim();
  const includeInactive = req.query.include_inactive === '1';

  const where = [];
  const params = [];
  if (!includeInactive) where.push('is_active = 1');
  if (q) {
    where.push('(name LIKE ? OR medical_record_no LIKE ? OR phone LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { total } = await db.get(`SELECT COUNT(*) AS total FROM patients ${clause}`, params);
  const rows = await db.query(
    `SELECT * FROM patients ${clause} ORDER BY name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  res.json({ data: rows, meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
}

export async function detail(req, res) {
  const patient = await db.get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) throw notFound('Pasien tidak ditemukan.');

  const receipts = await db.query(
    `SELECT id, receipt_no, receipt_date, total, payment_method, status
       FROM receipts WHERE patient_id = ? ORDER BY receipt_date DESC, id DESC LIMIT 20`,
    [patient.id],
  );
  res.json({ data: { ...patient, receipts } });
}

function validatePatient(body) {
  return v(body)
    .string('medical_record_no', { required: true, min: 2, max: 50, label: 'Nomor rekam medis' })
    .string('name', { required: true, min: 2, max: 150, label: 'Nama pasien' })
    .date('birth_date', { label: 'Tanggal lahir' })
    .string('gender', { max: 2, allow: GENDERS, label: 'Jenis kelamin' })
    .string('phone', { max: 30, label: 'Nomor telepon' })
    .string('address', { max: 500, label: 'Alamat' })
    .string('note', { max: 500, label: 'Catatan' })
    .done();
}

export async function create(req, res) {
  const data = validatePatient(req.body);

  const dupMr = await db.get('SELECT id FROM patients WHERE medical_record_no = ?', [data.medical_record_no]);
  if (dupMr) throw conflict(`Nomor rekam medis "${data.medical_record_no}" sudah dipakai pasien lain.`, {
    medical_record_no: 'Nomor rekam medis sudah dipakai.',
  });

  // Peringatan lunak: nama + tanggal lahir sama persis. Bisa dilewati dengan allow_duplicate=true.
  if (!req.body.allow_duplicate) {
    // Bandingkan NULL secara portabel (SQLite & MySQL) tanpa operator khusus.
    const dupName = data.birth_date
      ? await db.get('SELECT id, medical_record_no FROM patients WHERE name = ? AND birth_date = ?', [data.name, data.birth_date])
      : await db.get('SELECT id, medical_record_no FROM patients WHERE name = ? AND birth_date IS NULL', [data.name]);
    if (dupName) {
      throw conflict(
        `Pasien bernama "${data.name}" dengan tanggal lahir sama sudah terdaftar (${dupName.medical_record_no}).`,
        { code: 'DUPLICATE_PATIENT', existing_id: dupName.id, hint: 'Kirim allow_duplicate=true bila memang pasien berbeda.' },
      );
    }
  }

  const { insertId } = await db.run(
    `INSERT INTO patients (medical_record_no, name, birth_date, gender, phone, address, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.medical_record_no, data.name, data.birth_date, data.gender, data.phone, data.address, data.note],
  );

  await logAudit(req, { action: 'create', entity: 'patient', entityId: insertId, detail: data });
  const created = await db.get('SELECT * FROM patients WHERE id = ?', [insertId]);
  res.status(201).json({ data: created, message: 'Pasien berhasil ditambahkan.' });
}

export async function update(req, res) {
  const existing = await db.get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Pasien tidak ditemukan.');

  const data = validatePatient(req.body);
  const dup = await db.get(
    'SELECT id FROM patients WHERE medical_record_no = ? AND id <> ?',
    [data.medical_record_no, existing.id],
  );
  if (dup) throw conflict(`Nomor rekam medis "${data.medical_record_no}" sudah dipakai pasien lain.`, {
    medical_record_no: 'Nomor rekam medis sudah dipakai.',
  });

  await db.run(
    `UPDATE patients
        SET medical_record_no = ?, name = ?, birth_date = ?, gender = ?, phone = ?, address = ?, note = ?
      WHERE id = ?`,
    [data.medical_record_no, data.name, data.birth_date, data.gender, data.phone, data.address, data.note, existing.id],
  );

  await logAudit(req, { action: 'update', entity: 'patient', entityId: existing.id, detail: data });
  res.json({ data: await db.get('SELECT * FROM patients WHERE id = ?', [existing.id]), message: 'Data pasien diperbarui.' });
}

/** Nonaktifkan pasien (soft delete) agar riwayat kwitansi tetap utuh untuk audit. */
export async function deactivate(req, res) {
  const existing = await db.get('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!existing) throw notFound('Pasien tidak ditemukan.');

  const active = req.body?.is_active === true || req.body?.is_active === 1;
  await db.run('UPDATE patients SET is_active = ? WHERE id = ?', [active ? 1 : 0, existing.id]);
  await logAudit(req, { action: active ? 'activate' : 'deactivate', entity: 'patient', entityId: existing.id });
  res.json({ message: active ? 'Pasien diaktifkan kembali.' : 'Pasien dinonaktifkan.' });
}
