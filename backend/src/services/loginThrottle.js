/* Pembatas percobaan login.
 *
 * Selama aplikasi hanya bisa dibuka dari satu ruangan di klinik, menebak
 * password berulang-ulang tidak realistis. Begitu aplikasi bisa dihubungi dari
 * luar — laptop dokter di rumah lewat VPN, misalnya — tidak ada lagi yang
 * menghalangi seseorang mencoba ribuan password tanpa henti.
 *
 * Hitungan disimpan di memori dan hilang saat server dinyalakan ulang. Itu
 * disengaja: klinik hanya punya segelintir pengguna, tidak sebanding dengan
 * ongkos menyimpannya ke database. Konsekuensinya penyerang bisa mengulang
 * dari nol bila berhasil membuat server restart — tetapi untuk itu ia sudah
 * harus menguasai komputernya, dan pada titik itu password bukan lagi
 * pertahanan yang tersisa.
 */

// Ambang dipilih supaya kasir yang salah ketik beberapa kali tidak ikut
// terkunci lama, sementara penebakan otomatis langsung tersendat.
const TAHAP = [
  { gagal: 5, jedaDetik: 60 },
  { gagal: 8, jedaDetik: 300 },
  { gagal: 12, jedaDetik: 900 },
];

const LUPAKAN_SETELAH_MS = 60 * 60 * 1000;  // catatan menganggur dibuang
const MAKS_ENTRI = 5000;                    // batas atas, mencegah memori membengkak

const catatan = new Map();

const kunciDari = (username, ip) => `${String(username || '').toLowerCase()}@${ip || '-'}`;

function bersihkan(sekarang) {
  for (const [k, c] of catatan) {
    if (sekarang - c.terakhir > LUPAKAN_SETELAH_MS) catatan.delete(k);
  }
  // Kalau masih terlalu banyak, buang yang paling lama tidak tersentuh.
  if (catatan.size > MAKS_ENTRI) {
    const urut = [...catatan.entries()].sort((a, b) => a[1].terakhir - b[1].terakhir);
    for (const [k] of urut.slice(0, catatan.size - MAKS_ENTRI)) catatan.delete(k);
  }
}

function jedaUntuk(gagal) {
  let detik = 0;
  for (const t of TAHAP) if (gagal >= t.gagal) detik = t.jedaDetik;
  return detik;
}

/**
 * Sisa waktu tunggu dalam detik, 0 bila boleh mencoba sekarang.
 */
export function sisaJeda(username, ip, sekarang = Date.now()) {
  const c = catatan.get(kunciDari(username, ip));
  if (!c || !c.bolehLagiPada) return 0;
  const sisa = Math.ceil((c.bolehLagiPada - sekarang) / 1000);
  return sisa > 0 ? sisa : 0;
}

/**
 * Catat satu percobaan gagal. Mengembalikan jeda yang berlaku sesudahnya,
 * dalam detik — 0 berarti belum kena jeda.
 */
export function catatGagal(username, ip, sekarang = Date.now()) {
  const kunci = kunciDari(username, ip);
  const c = catatan.get(kunci) || { gagal: 0, terakhir: sekarang, bolehLagiPada: 0 };
  c.gagal += 1;
  c.terakhir = sekarang;

  const detik = jedaUntuk(c.gagal);
  if (detik > 0) c.bolehLagiPada = sekarang + detik * 1000;

  catatan.set(kunci, c);
  bersihkan(sekarang);
  return detik;
}

/** Login berhasil — bersihkan hitungannya. */
export function catatBerhasil(username, ip) {
  catatan.delete(kunciDari(username, ip));
}

/** Hanya untuk pengujian. */
export function resetSemua() {
  catatan.clear();
}

/** Ringkasan untuk keperluan diagnosa. */
export function ringkasan() {
  return { entri: catatan.size };
}
