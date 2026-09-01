const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima',
  'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
];

/** Ubah bilangan bulat menjadi kata (Bahasa Indonesia). */
function toWords(n) {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) {
    const sisa = n % 10;
    return `${toWords(Math.floor(n / 10))} puluh${sisa ? ' ' + toWords(sisa) : ''}`;
  }
  if (n < 200) return `seratus${n - 100 ? ' ' + toWords(n - 100) : ''}`;
  if (n < 1000) {
    const sisa = n % 100;
    return `${toWords(Math.floor(n / 100))} ratus${sisa ? ' ' + toWords(sisa) : ''}`;
  }
  if (n < 2000) return `seribu${n - 1000 ? ' ' + toWords(n - 1000) : ''}`;
  if (n < 1e6) {
    const sisa = n % 1000;
    return `${toWords(Math.floor(n / 1000))} ribu${sisa ? ' ' + toWords(sisa) : ''}`;
  }
  if (n < 1e9) {
    const sisa = n % 1e6;
    return `${toWords(Math.floor(n / 1e6))} juta${sisa ? ' ' + toWords(sisa) : ''}`;
  }
  if (n < 1e12) {
    const sisa = n % 1e9;
    return `${toWords(Math.floor(n / 1e9))} miliar${sisa ? ' ' + toWords(sisa) : ''}`;
  }
  const sisa = n % 1e12;
  return `${toWords(Math.floor(n / 1e12))} triliun${sisa ? ' ' + toWords(sisa) : ''}`;
}

/** "Dua ratus lima puluh ribu rupiah" — untuk baris terbilang di kwitansi. */
export function terbilangRupiah(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Nol rupiah';
  const words = toWords(n).replace(/\s+/g, ' ').trim();
  const capital = words.charAt(0).toUpperCase() + words.slice(1);
  return `${n < 0 ? 'Minus ' : ''}${capital} rupiah`;
}
