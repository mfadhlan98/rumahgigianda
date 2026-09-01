# Sistem Kwitansi Klinik Gigi

Sistem pencatatan pembayaran dan pencetakan kwitansi untuk klinik gigi, dibangun
untuk sebuah klinik sungguhan di Sumatera Barat. Menggantikan buku kwitansi:
kasir menerbitkan kwitansi bernomor, mencetaknya, dan setiap transaksi tetap bisa
dicari serta ditelusuri.

Berjalan sepenuhnya di komputer klinik sendiri. Tanpa internet, tanpa biaya bulanan,
dan data pasien tidak pernah keluar dari klinik.

> **Status** — dalam persiapan pemakaian di *Rumah Gigi Anda*, Sijunjung.
> Dibangun utuh: backend, antarmuka, mesin cetak PDF, skrip pemasangan, sampai
> panduan yang benar-benar dipakai staf klinik.

[Read in English →](README.md)

---

## Kenapa dibuat

Klinik kecil di Indonesia masih menulis kwitansi dengan tangan. Akibatnya salah
hitung, nomor dobel, kwitansi pudar atau hilang, dan tidak ada cara menjawab
"berapa pemasukan Selasa lalu?" tanpa membongkar tumpukan buku.

Yang dibutuhkan klinik: sesuatu yang bisa dipelajari resepsionis dalam lima belas
menit, tetap jalan saat internet mati, dan tidak menaruh rekam medis pasien di
server orang lain.

## Fitur

**Alur kasir**
- Pencarian pasien seketika lewat nama, nomor rekam medis, atau telepon
- Rincian biaya diambil dari daftar tarif klinik, atau diketik bebas
- Tunai / transfer / kartu, dengan nomor referensi wajib untuk non-tunai
- Subtotal, diskon, pajak, total, kembalian, dan terbilang dihitung seketika

**Kwitansi**
- Nomor unik berformat `PREFIX/YYYYMM/NNNN`, urutan direset tiap bulan
- Enam ukuran: A5 dan A4 melintang (bentuk kwitansi Indonesia pada umumnya) maupun tegak, serta struk termal 58 mm dan 80 mm
- Yang tampil di pratinjau sama persis dengan yang dicetak dan yang diarsipkan
- Warna dan logo mengikuti identitas klinik sendiri

**Arsip & laporan**
- Kwitansi tidak pernah dihapus — yang keliru *dibatalkan* beserta alasan, pelaku, dan waktu
- Pencarian berdasarkan nomor, pasien, rentang tanggal, metode bayar, status
- Rekap pendapatan per periode, rincian per metode dan kategori, ekspor CSV

**Operasional**
- Dua peran: administrator dan kasir, ditegakkan di sisi server
- Setiap tindakan penting tercatat di jejak audit
- Pencadangan terjadwal, plus perintah pemulihan yang berpengaman
- Skrip Windows untuk firewall, jalan otomatis, dan penjadwalan cadangan

---

## Keputusan teknis yang menarik dilihat

**Kwitansi berformat PDF/A-3b, bukan sekadar PDF.** Standar arsip dengan profil
warna sRGB, metadata XMP, dan seluruh huruf tertanam — kwitansi yang dibuka sepuluh
tahun lagi tetap tampil sama. Karena PDF/A melarang font yang tidak tertanam,
perender menelusuri rantai font (Inter bawaan → font klinik → font sistem) dan
mematikan mode arsip alih-alih diam-diam menghasilkan berkas yang tidak patuh.
Lihat [`services/pdf.js`](backend/src/services/pdf.js) dan [`services/fonts.js`](backend/src/services/fonts.js).

**Nilai uang tidak pernah dipercaya dari peramban.** Sisi klien menghitung hanya
untuk ditampilkan; server menghitung ulang seluruh angka dari rincian sebelum
menyimpan. Lihat [`controllers/receipts.controller.js`](backend/src/controllers/receipts.controller.js).

**Nomor kwitansi tahan dua kasir bersamaan.** Urutan diambil di dalam transaksi dan
dijaga indeks `UNIQUE(period, seq)`; tabrakan ditangkap lalu diulang, bukan ditutupi
dengan penguncian.

**Kwitansi bisa diverifikasi tanpa membuka sistem.** Tiap kwitansi memuat QR dan
potongan tanda tangan HMAC-SHA256 atas data kuncinya sendiri. Endpoint publik
memastikan keasliannya dan mengembalikan data seminimal mungkin dengan nama
disamarkan — cukup bagi pasien atau auditor, tidak cukup untuk membocorkan rekam medis.
Lihat [`services/verification.js`](backend/src/services/verification.js).

**Antarmuka tanpa tahap build.** ES module biasa, tanpa bundler, tanpa framework.
Komputer klinik tidak seharusnya butuh perkakas Node hanya untuk menyajikan halaman,
dan pemelihara berikutnya harus bisa membuka satu berkas lalu langsung membacanya.
Seluruh antarmuka sekitar 3.000 baris.

**Satu antarmuka database, dua mesin.** SQLite secara bawaan supaya jalan tanpa
pemasangan apa pun; MySQL di balik adapter yang sama untuk klinik yang tumbuh
melewati satu komputer. Berpindah cukup satu variabel lingkungan — tidak ada kode
aplikasi yang berubah. Lihat [`db/`](backend/src/db/).

**Warna merek dihitung, bukan dipatok.** Klinik memberi dua kode warna dari logonya.
Turunan seperti latar muda, garis, dan baris selang-seling dihitung sendiri, dan
warna teks di atas bidang berwarna dipilih berdasarkan rasio kontras WCAG — sehingga
warna merek yang muda membuat tulisannya berubah gelap, bukan menghilang.
Lihat [`utils/color.js`](backend/src/utils/color.js).

**Permintaan seasal selalu diizinkan.** Komputer kedua membuka aplikasi di
`http://192.168.1.50:4000`, alamat yang mustahil diketahui saat kode ditulis. CORS
membandingkan host permintaan itu sendiri, bukan daftar yang disiapkan lebih dulu —
akses jaringan lokal langsung jalan tanpa konfigurasi, sementara asal luar tetap ditolak.

**Pembatas login memakai kunci username *dan* alamat asal.** Mengunci berdasarkan
username saja membuat siapa pun bisa mengunci klinik dari sistemnya sendiri; berdasarkan
alamat saja membuat kegagalan satu penyerang mengunci seluruh akun. Password yang benar
tetap ditolak selama masa tunggu — kalau tidak, jedanya bisa diabaikan begitu saja.
Alamatnya diambil dari soket mentah, bukan `req.ip`: pembatas yang bisa dilewati dengan
mengarang header `X-Forwarded-For` tidak membatasi apa pun.
Lihat [`services/loginThrottle.js`](backend/src/services/loginThrottle.js).

**Manifes aplikasi disusun, bukan berkas statis.** Ikon dan warnanya diambil dari
pengaturan klinik, sehingga klinik mana pun yang memasang ini mendapat nama dan logonya
sendiri di taskbar tanpa menyunting apa pun. Logo klinik hampir tidak pernah persegi
sementara sistem operasi menuntut ikon persegi, jadi ikonnya disusun sebagai SVG yang
menempatkan logo di tengah bidang persegi — tanpa pustaka pengolah gambar sama sekali.
Lihat [`controllers/branding.controller.js`](backend/src/controllers/branding.controller.js).

---

## Teknologi

| Lapisan | Pilihan | Alasan |
| ------- | ------- | ------ |
| Runtime | Node.js ≥ 22.5 | `node:sqlite` sudah bawaan — tidak ada modul native yang perlu dikompilasi |
| Backend | Express 4 | Kecil, membosankan, sudah dipahami banyak orang |
| Database | SQLite (bawaan) / MySQL | Tanpa pemasangan, tetap bisa tumbuh |
| PDF | PDFKit + Inter tertanam | PDF/A-3b, teks sungguhan, terbaca OCR |
| Frontend | ES module murni | Tanpa build, tanpa gonta-ganti framework |
| Autentikasi | JWT + scrypt | scrypt sudah ada di pustaka standar Node |

Total delapan dependensi. Tanpa bundler, tanpa ORM, tanpa framework antarmuka.

---

## Struktur proyek

```
backend/
  src/
    config/       pembacaan lingkungan dan pengaman produksi
    controllers/  satu berkas per sumber daya
    db/           adapter SQLite + MySQL, skema, seed, cadangan, pemulihan
    middleware/   autentikasi, pembatasan IP, penanganan galat
    routes/       pemetaan URL
    services/     PDF, font, QR, pengaturan, audit, verifikasi
    utils/        validasi, warna, terbilang, kata sandi
  test/           uji fungsional menyeluruh
frontend/
  css/            satu lembar gaya, berbasis token
  js/views/       satu berkas per halaman
skrip-windows/    firewall, jalan otomatis, penjadwalan cadangan
docs/             panduan teknis lengkap
```

---

## Menjalankan

Butuh Node.js 22.5 atau lebih baru.

```bash
cd backend
npm install
copy .env.example .env
npm start
```

Buka <http://localhost:4000>. Saat pertama dijalankan, aplikasi membuat akun
administrator dan menampilkan kredensialnya di konsol. Daftar tarif sengaja
dibiarkan kosong — harga contoh di klinik yang sedang beroperasi itu risiko,
bukan kemudahan.

Untuk melihat hasil cetak tanpa menerbitkan kwitansi sungguhan:

```bash
npm run pratinjau -- a5land thermal80
```

---

## Pengujian

```bash
npm test
```

69 pemeriksaan menyeluruh terhadap server yang berjalan: autentikasi, batas peran,
validasi masukan, perhitungan uang, penomoran kwitansi, pembuatan PDF keempat ukuran
(termasuk pemeriksaan font tertanam dan metadata PDF/A), unggah logo, verifikasi QR,
laporan, dan ekspor CSV.

Karena menegaskan angka secara persis, suite ini menolak berjalan pada database yang
sudah berisi data dan mengatakannya terus terang, bukan gagal di tengah jalan.

---

## Dokumentasi

- [`docs/panduan-lengkap.md`](docs/panduan-lengkap.md) — panduan teknis lengkap:
  konfigurasi, pemasangan di klinik, akses jarak jauh lewat Tailscale, pindah ke MySQL,
  pencadangan dan pemulihan, serta rujukan API.

---

## Lisensi

[MIT](LICENSE)

Dibuat oleh Muhammad Fadhlan. Logo, warna merek, dan data usaha klinik bukan bagian dari
repositori ini.
