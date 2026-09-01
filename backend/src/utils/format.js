/** Format rupiah tanpa desimal, mis. 250000 -> "Rp250.000". */
export function rupiah(n) {
  const v = Math.round(Number(n) || 0);
  return `Rp${v.toLocaleString('id-ID')}`;
}

/** "2026-08-31" -> "31 Agustus 2026" */
const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function tanggalIndo(isoDate) {
  const s = String(isoDate ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
}

/** Tanggal hari ini di zona waktu lokal server, format YYYY-MM-DD. */
export function todayLocal() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Timestamp lokal, format YYYY-MM-DD HH:mm:ss. */
export function nowLocal() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
