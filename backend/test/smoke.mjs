/**
 * Uji fungsional menyeluruh terhadap server yang sedang berjalan.
 *
 *   Terminal 1:  npm start
 *   Terminal 2:  npm test
 *
 * PERHATIAN: pengujian ini MENULIS data (pasien, kwitansi, pengguna "kasir1",
 * serta mengubah pengaturan klinik). Jalankan pada database uji, bukan pada
 * database klinik yang sedang dipakai. Cara paling aman:
 *
 *   1. hentikan server
 *   2. pindahkan data/klinik.db ke tempat lain
 *   3. npm start lalu npm test
 *   4. hapus database uji, kembalikan yang asli
 *
 * Alamat server dapat diganti lewat variabel lingkungan BASE_URL.
 */
const BASE = process.env.BASE_URL || 'http://localhost:4000';

// Uji ini berjalan pada database kosong, sehingga akun admin masih memakai
// kredensial dari seed. Dibaca dari lingkungan agar tetap cocok bila
// SEED_ADMIN_* di .env diubah.
const ADMIN_USER = process.env.SEED_ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD || 'admin123';

let token = null;
let pass = 0, fail = 0;

async function call(method, path, body, raw = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

let r = await call('GET', '/api/health');
check('health ok', r.status === 200 && r.json.status === 'ok', JSON.stringify(r.json));

r = await call('POST', '/api/auth/login', { username: ADMIN_USER, password: 'password-yang-pasti-salah' });
check('login password salah ditolak 401', r.status === 401);

r = await call('POST', '/api/auth/login', { username: ADMIN_USER, password: ADMIN_PASS });
check('login berhasil', r.status === 200 && !!r.json.token, JSON.stringify(r.json).slice(0, 200));
token = r.json.token;

const noAuth = await fetch(BASE + '/api/patients');
check('tanpa token ditolak 401', noAuth.status === 401);

// Pengujian ini menegaskan jumlah dan nominal secara persis, sehingga hanya
// sahih pada database kosong. Berhenti lebih awal dengan pesan yang jelas
// daripada gagal membingungkan di tengah jalan.
{
  const p = await call('GET', '/api/patients?limit=1');
  const rc = await call('GET', '/api/receipts?limit=1');
  const existing = Number(p.json?.meta?.total || 0) + Number(rc.json?.meta?.total || 0);
  if (existing > 0) {
    console.log('\n  DIBATALKAN: database sudah berisi data.');
    console.log('  Uji ini menulis data dan hanya sahih pada database kosong.\n');
    console.log('  Langkah aman:');
    console.log('    1. hentikan server (Ctrl+C)');
    console.log('    2. pindahkan backend/data/klinik.db ke tempat lain');
    console.log('    3. npm start, lalu npm test di terminal lain');
    console.log('    4. hapus database uji, kembalikan berkas yang asli\n');
    process.exit(2);
  }
}

r = await call('GET', '/api/patients/next-mr-no');
check('saran nomor RM', r.status === 200 && /^RM-\d{6}$/.test(r.json.medical_record_no), JSON.stringify(r.json));
const mr = r.json.medical_record_no;

r = await call('POST', '/api/patients', { medical_record_no: '', name: 'A' });
check('validasi pasien kosong -> 400 + peta error', r.status === 400 && !!r.json.details?.medical_record_no, JSON.stringify(r.json));

r = await call('POST', '/api/patients', {
  medical_record_no: mr, name: 'Siti Rahmawati', birth_date: '1990-05-12',
  gender: 'P', phone: '081234567890', address: 'Jl. Melati No. 8, Jakarta',
});
check('buat pasien', r.status === 201, JSON.stringify(r.json).slice(0, 250));
const patientId = r.json.data?.id;

r = await call('POST', '/api/patients', { medical_record_no: mr, name: 'Orang Lain' });
check('nomor RM duplikat ditolak 409', r.status === 409, JSON.stringify(r.json));

r = await call('POST', '/api/patients', { medical_record_no: 'RM-999001', name: 'Siti Rahmawati', birth_date: '1990-05-12' });
check('nama + tgl lahir duplikat -> 409 peringatan', r.status === 409 && r.json.details?.code === 'DUPLICATE_PATIENT', JSON.stringify(r.json));

r = await call('POST', '/api/patients', { medical_record_no: 'RM-999001', name: 'Siti Rahmawati', birth_date: '1990-05-12', allow_duplicate: true });
check('duplikat bisa ditembus dengan allow_duplicate', r.status === 201, JSON.stringify(r.json).slice(0, 200));

// Database baru sengaja tidak berisi tarif contoh, jadi uji ini membuat sendiri
// tarif yang dibutuhkan — sekaligus menguji jalur penambahan tarif oleh admin.
r = await call('GET', '/api/service-items');
check('database baru tidak memuat tarif contoh', r.status === 200 && r.json.data.length === 0, `n=${r.json.data?.length}`);

r = await call('POST', '/api/service-items', {
  code: 'TIN-01', name: 'Pembersihan Karang Gigi (Scaling) Rahang Atas & Bawah',
  category: 'tindakan', default_price: 350000,
});
check('admin menambah tarif layanan', r.status === 201, JSON.stringify(r.json).slice(0, 200));
const svc = r.json.data;

r = await call('POST', '/api/service-items', {
  code: 'TIN-01', name: 'Duplikat', category: 'tindakan', default_price: 1000,
});
check('kode tarif duplikat ditolak 409', r.status === 409, JSON.stringify(r.json));

r = await call('GET', '/api/service-items');
check('tarif baru muncul di daftar', r.status === 200 && r.json.data.length === 1, `n=${r.json.data?.length}`);

r = await call('POST', '/api/receipts', { patient_id: patientId, payment_method: 'tunai', items: [] });
check('kwitansi tanpa rincian ditolak', r.status === 400 && !!r.json.details?.items, JSON.stringify(r.json));

r = await call('POST', '/api/receipts', {
  patient_id: patientId, payment_method: 'tunai', amount_paid: 100,
  items: [{ description: 'Scaling', qty: 1, unit_price: 350000, category: 'tindakan' }],
});
check('uang diterima kurang ditolak', r.status === 400 && !!r.json.details?.amount_paid, JSON.stringify(r.json));

r = await call('POST', '/api/receipts', {
  patient_id: patientId, payment_method: 'transfer',
  items: [{ description: 'Scaling', qty: 1, unit_price: 350000 }],
});
check('transfer tanpa nomor referensi ditolak', r.status === 400 && !!r.json.details?.payment_ref, JSON.stringify(r.json));

r = await call('POST', '/api/receipts', {
  patient_id: patientId, receipt_date: '2099-01-01', payment_method: 'tunai', amount_paid: 350000,
  items: [{ description: 'Scaling', qty: 1, unit_price: 350000 }],
});
check('tanggal masa depan ditolak', r.status === 400 && !!r.json.details?.receipt_date, JSON.stringify(r.json));

r = await call('POST', '/api/receipts', {
  patient_id: patientId, payment_method: 'tunai', amount_paid: 500000, discount: 25000,
  treatment_type: 'Perawatan gigi rutin', doctor_name: 'drg. Manda Prasetyo',
  notes: 'Kontrol ulang 2 minggu lagi.',
  items: [
    { service_item_id: svc?.id, description: svc?.name || 'Scaling', qty: 1, unit_price: 350000, category: 'tindakan' },
    { description: 'Konsultasi Dokter Gigi Umum', qty: 1, unit_price: 50000, category: 'konsultasi' },
    { description: 'Amoxicillin 500 mg', qty: 2, unit_price: 45000, category: 'obat' },
  ],
});
check('buat kwitansi', r.status === 201, JSON.stringify(r.json).slice(0, 300));
const receipt = r.json.data;
check('nomor kwitansi berformat PREFIX/YYYYMM/NNNN', /^KGM\/\d{6}\/\d{4}$/.test(receipt?.receipt_no || ''), receipt?.receipt_no);
check('subtotal dihitung server', receipt?.subtotal === 490000, `subtotal=${receipt?.subtotal}`);
check('total = subtotal - diskon', receipt?.total === 465000, `total=${receipt?.total}`);
check('kembalian benar', receipt?.change_amount === 35000, `kembali=${receipt?.change_amount}`);
check('terbilang benar', r.json.terbilang === 'Empat ratus enam puluh lima ribu rupiah', r.json.terbilang);

r = await call('GET', `/api/receipts/${receipt.id}`);
check('detail kwitansi menyertakan QR', r.status === 200 && String(r.json.verification?.qr || '').startsWith('data:image/png;base64,'), String(r.json.verification?.qr).slice(0, 40));
const sig = r.json.verification.signature;
check('3 baris rincian tersimpan', r.json.data.items.length === 3, `n=${r.json.data?.items?.length}`);

const pub = await fetch(`${BASE}/api/verify?no=${encodeURIComponent(receipt.receipt_no)}&sig=${sig}`);
const pubJson = await pub.json();
check('verifikasi publik valid', pub.status === 200 && pubJson.valid === true, JSON.stringify(pubJson).slice(0, 200));
check('nama pasien disamarkan di verifikasi publik', /\*/.test(pubJson.data?.patient_name || ''), pubJson.data?.patient_name);

const bad = await fetch(`${BASE}/api/verify?no=${encodeURIComponent(receipt.receipt_no)}&sig=AAAAAAAAAAAA`);
check('kode verifikasi palsu ditolak', bad.status === 404);

for (const size of ['a5', 'a4', 'a5land', 'a4land', 'thermal58', 'thermal80']) {
  const p = await call('GET', `/api/receipts/${receipt.id}/pdf?size=${size}`, null, true);
  const head = p.buf.subarray(0, 8).toString('latin1');
  const body = p.buf.toString('latin1');
  check(`PDF ${size} terbentuk (${(p.buf.length / 1024).toFixed(0)} KB)`, p.status === 200 && head.startsWith('%PDF-'), head);
  check(`PDF ${size} font tertanam`, body.includes('FontFile2') || body.includes('FontFile3'));
  if (!size.startsWith('thermal')) check(`PDF ${size} metadata PDF/A`, body.includes('pdfaid:part'));
}

r = await call('GET', '/api/reports/summary?date_from=2000-01-01&date_to=2099-12-31');
check('laporan ringkasan', r.status === 200 && Number(r.json.totals.pendapatan) === 465000, JSON.stringify(r.json.totals));

const csv = await call('GET', '/api/reports/export.csv?date_from=2000-01-01&date_to=2099-12-31', null, true);
check('ekspor CSV', csv.status === 200 && csv.buf.toString('utf8').includes('No Kwitansi'));

r = await call('GET', `/api/receipts?q=${encodeURIComponent('Siti')}`);
check('cari arsip berdasarkan nama pasien', r.status === 200 && r.json.data.length === 1, `n=${r.json.data?.length}`);
r = await call('GET', `/api/receipts?q=${encodeURIComponent(receipt.receipt_no)}`);
check('cari arsip berdasarkan nomor kwitansi', r.status === 200 && r.json.data.length === 1, `n=${r.json.data?.length}`);

r = await call('POST', `/api/receipts/${receipt.id}/void`, { reason: 'x' });
check('alasan pembatalan terlalu pendek ditolak', r.status === 400, JSON.stringify(r.json));

r = await call('PUT', '/api/settings', {
  clinic_name: 'Klinik Gigi Manda',
  payment_accounts: 'BCA 1234567890 a.n. Klinik Gigi Manda\nDANA 081200000000',
  signer_name: 'drg. Manda Prasetyo', qr_enabled: '1',
});
check('simpan pengaturan klinik', r.status === 200 && r.json.data.payment_accounts.includes('DANA'), JSON.stringify(r.json).slice(0, 200));

r = await call('PUT', '/api/settings', { receipt_prefix: 'BAD PREFIX!!' });
check('awalan nomor tidak valid ditolak', r.status === 400, JSON.stringify(r.json));

r = await call('PUT', '/api/settings', { brand_color: '#70544D', brand_accent: '#B29D7F' });
check('simpan warna merek', r.status === 200 && r.json.data.brand_color === '#70544D', JSON.stringify(r.json).slice(0, 150));

r = await call('PUT', '/api/settings', { brand_color: 'cokelat tua' });
check('warna bukan hex ditolak', r.status === 400 && !!r.json.details?.brand_color, JSON.stringify(r.json));

r = await call('POST', '/api/settings/logo', { data: 'aGVsbG8gd29ybGQ=' });
check('logo bukan gambar ditolak', r.status === 400, JSON.stringify(r.json));

r = await call('POST', '/api/users', { username: 'kasir1', full_name: 'Kasir Satu', role: 'kasir', password: 'kasir123' });
check('admin membuat akun kasir', r.status === 201, JSON.stringify(r.json).slice(0, 200));

const adminToken = token;
const kasirLogin = await call('POST', '/api/auth/login', { username: 'kasir1', password: 'kasir123' });
token = kasirLogin.json.token;

r = await call('POST', '/api/users', { username: 'x1', full_name: 'X Y', role: 'admin', password: 'abc123' });
check('kasir tidak boleh kelola pengguna (403)', r.status === 403, JSON.stringify(r.json));

r = await call('PUT', '/api/settings', { clinic_name: 'Diretas' });
check('kasir tidak boleh ubah pengaturan (403)', r.status === 403);

r = await call('POST', `/api/receipts/${receipt.id}/void`, { reason: 'Salah input tindakan' });
check('kasir tidak boleh membatalkan kwitansi (403)', r.status === 403);

r = await call('POST', '/api/receipts', {
  patient_id: patientId, payment_method: 'tunai', amount_paid: 50000,
  items: [{ description: 'Konsultasi', qty: 1, unit_price: 50000, category: 'konsultasi' }],
});
check('kasir boleh membuat kwitansi', r.status === 201, JSON.stringify(r.json).slice(0, 200));
check('nomor urut bertambah', String(r.json.data?.receipt_no || '').endsWith('0002'), r.json.data?.receipt_no);

token = adminToken;
r = await call('POST', `/api/receipts/${receipt.id}/void`, { reason: 'Salah input tindakan' });
check('admin membatalkan kwitansi', r.status === 200 && r.json.data.status === 'void', JSON.stringify(r.json).slice(0, 150));

r = await call('POST', `/api/receipts/${receipt.id}/void`, { reason: 'Coba batalkan dua kali' });
check('pembatalan ganda ditolak 409', r.status === 409);

r = await call('GET', '/api/reports/summary?date_from=2000-01-01&date_to=2099-12-31');
check('kwitansi batal tidak dihitung sebagai pendapatan', Number(r.json.totals.pendapatan) === 50000, JSON.stringify(r.json.totals));

r = await call('GET', '/api/users/audit/logs');
check('jejak audit tercatat', r.status === 200 && r.json.data.length > 5, `n=${r.json.data?.length}`);

r = await call('POST', '/api/auth/change-password', { current_password: 'salah', new_password: 'baru123' });
check('ganti password dengan password lama salah ditolak', r.status === 400);

/* ---- Logo HD, awalan nomor dari pengaturan, dan penyajian halaman ---- */

const { makeLogoPng } = await import('./make-logo.mjs');
const logoB64 = makeLogoPng(600).toString('base64');

r = await call('POST', '/api/settings/logo', { data: `data:image/png;base64,${logoB64}` });
check('unggah logo PNG 600x600', r.status === 200 && r.json.type === 'image/png', JSON.stringify(r.json));

const logoGet = await call('GET', '/api/settings/logo', null, true);
check('logo dapat diambil kembali', logoGet.status === 200 && logoGet.buf.subarray(1, 4).toString() === 'PNG');

const withLogo = await call('GET', `/api/receipts/${receipt.id}/pdf?size=a5`, null, true);
check('PDF menyertakan gambar logo', withLogo.buf.toString('latin1').includes('/Image'), `bytes=${withLogo.buf.length}`);

r = await call('PUT', '/api/settings', { receipt_prefix: 'KGM2' });
check('ubah awalan nomor kwitansi', r.status === 200 && r.json.data.receipt_prefix === 'KGM2', JSON.stringify(r.json).slice(0, 150));

r = await call('POST', '/api/receipts', {
  patient_id: patientId, payment_method: 'kartu', payment_ref: '1234',
  items: [{ description: 'Rontgen Panoramik', qty: 1, unit_price: 250000, category: 'tindakan' }],
});
check('awalan baru dipakai kwitansi berikutnya', String(r.json.data?.receipt_no || '').startsWith('KGM2/'), r.json.data?.receipt_no);
check('non-tunai dianggap lunas penuh',
  r.json.data?.amount_paid === 250000 && r.json.data?.change_amount === 0,
  JSON.stringify({ bayar: r.json.data?.amount_paid, kembali: r.json.data?.change_amount }));

const page = await fetch(`${BASE}/verify.html`);
check('halaman verifikasi publik tersaji', page.status === 200 && (await page.text()).includes('Verifikasi Kwitansi'));

const spa = await fetch(`${BASE}/rute-tidak-dikenal`);
check('rute tak dikenal jatuh ke halaman aplikasi', spa.status === 200);

const api404 = await fetch(`${BASE}/api/tidak-ada`);
check('endpoint API tak dikenal menghasilkan 404 JSON', api404.status === 404);

console.log(`\n  ${pass} lulus, ${fail} gagal\n`);
process.exit(fail ? 1 : 0);
