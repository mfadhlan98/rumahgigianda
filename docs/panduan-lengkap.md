# Panduan Teknis — Sistem Kwitansi Klinik Gigi

Aplikasi web untuk mengelola data pasien, mencatat transaksi pembayaran, dan
mencetak kwitansi resmi beresolusi tinggi (PDF/A) di klinik gigi.

Backend dan frontend dipisah ke dalam dua folder, namun keduanya dijalankan oleh
satu proses Node.js sehingga cukup satu perintah untuk memulai.

```
sistem-kwitansi-klinik/
├── backend/          API REST, database, dan mesin cetak PDF
│   ├── src/
│   │   ├── config/       pembacaan .env
│   │   ├── controllers/  logika tiap endpoint
│   │   ├── db/           adapter SQLite & MySQL + skema
│   │   ├── middleware/   autentikasi, penanganan galat
│   │   ├── routes/       pemetaan URL
│   │   ├── services/     PDF, font, QR, pengaturan, audit
│   │   └── utils/        validasi, terbilang, format, password
│   ├── assets/fonts/     tempat menaruh font kustom (opsional)
│   ├── data/             berkas database SQLite
│   ├── backup/           hasil pencadangan otomatis
│   ├── storage/          logo klinik
│   └── test/             uji fungsional menyeluruh
├── frontend/         antarmuka pengguna (HTML/CSS/JavaScript, tanpa build)
│   ├── css/
│   └── js/views/         satu berkas per halaman
├── skrip-windows/    firewall, jalan otomatis, jadwal pencadangan
└── mulai-server.bat  penyalaan sekali klik untuk Windows
```

---

## 1. Menjalankan aplikasi

### Kebutuhan

* **Node.js versi 22.5 atau lebih baru** (diuji pada Node 24).
  Unduh di <https://nodejs.org>.
* Peramban modern: Chrome, Edge, atau Firefox.

### Langkah pertama kali

```bash
cd backend
npm install
```

Salin berkas contoh konfigurasi lalu sesuaikan seperlunya:

```bash
copy .env.example .env
```

### Menjalankan

```bash
cd backend
npm start
```

Buka <http://localhost:4000> di peramban.

Pengguna Windows dapat langsung mengklik dua kali **`mulai-server.bat`** di
folder utama — skrip itu memasang dependensi bila perlu, menyalakan server, dan
membuka peramban.

### Akun pertama

Saat database masih kosong, sistem otomatis membuat satu akun administrator:

| Username | Password   |
| -------- | ---------- |
| `admin`  | `admin123` |

> **Segera ganti password ini** lewat menu **Pengaturan → Ganti Password**.
> Ubah juga `SEED_ADMIN_PASSWORD` di `.env` sebelum dipakai di klinik.

**Daftar tarif sengaja dibiarkan kosong.** Isi tarif resmi klinik lewat menu
**Tarif Layanan**. Tarif contoh tidak diisikan otomatis karena harganya karangan
dan berisiko tercetak pada kwitansi asli bila lupa diganti.

Untuk keperluan demo atau pengembangan, 18 tarif layanan gigi yang umum dapat
dimuat dengan menyetel `SEED_SAMPLE_SERVICES=true` di `.env` saat database masih
kosong.

---

## 2. Fitur

### Input data pasien & transaksi

* Nomor rekam medis diusulkan otomatis (`RM-000001`) dan tetap bisa diketik manual.
* Pencarian pasien seketika berdasarkan nama, nomor rekam medis, atau telepon.
* Rincian biaya per baris: tindakan, obat, konsultasi, atau lainnya —
  memilih dari daftar tarif akan mengisi harga secara otomatis.
* Metode pembayaran tunai, transfer, atau kartu; nomor referensi diwajibkan
  untuk pembayaran non-tunai agar mudah direkonsiliasi.
* Subtotal, diskon, pajak, total, dan kembalian dihitung langsung saat mengetik,
  lengkap dengan baris terbilang.

### Pembuatan kwitansi otomatis

* Nomor unik berformat `PREFIX/YYYYMM/NNNN` (contoh `KGM/202608/0001`),
  urutannya direset tiap bulan dan dijamin unik oleh indeks basis data.
* Template HD: font Inter tertanam, tata letak grid, logo klinik resolusi tinggi.
* Enam ukuran cetak: **A5 melintang** (bawaan, bentuk kwitansi pada umumnya), **A4 melintang**, **A5 tegak**, **A4 tegak**, **struk termal 80 mm**, dan **58 mm**.
* Cetak langsung ke printer atau simpan sebagai PDF — keduanya memakai berkas
  yang sama persis, sehingga tidak ada selisih tampilan antara layar dan kertas.

### Manajemen arsip

* Seluruh kwitansi tersimpan di database, bukan hanya di kertas.
* Pencarian arsip berdasarkan nomor kwitansi, nama pasien, nomor rekam medis,
  rentang tanggal, metode pembayaran, dan status.
* Kwitansi tidak pernah dihapus. Kwitansi keliru **dibatalkan** (status `void`)
  disertai alasan, pelaku, dan waktu — jejaknya tetap utuh untuk audit.
* Laporan keuangan per rentang tanggal dan ekspor CSV untuk pembukuan.

### Keamanan & validasi

* Login dengan token JWT; password disimpan sebagai hash scrypt bergaram.
* Dua peran:

  | Kemampuan                          | Admin | Kasir |
  | ---------------------------------- | :---: | :---: |
  | Membuat kwitansi                   |   ✓   |   ✓   |
  | Melihat arsip & laporan            |   ✓   |   ✓   |
  | Menambah / mengubah pasien         |   ✓   |   ✓   |
  | Menonaktifkan pasien               |   ✓   |   —   |
  | Mengelola tarif layanan            |   ✓   |   —   |
  | Membatalkan kwitansi               |   ✓   |   —   |
  | Mengelola pengguna & lihat audit   |   ✓   |   —   |
  | Mengubah profil klinik & logo      |   ✓   |   —   |

* Validasi berlapis: peramban menahan kesalahan yang jelas, server memvalidasi
  ulang seluruh masukan dan **menghitung ulang semua nilai uang** — angka yang
  dikirim peramban tidak pernah dipercaya.
* Pencegahan duplikat: nomor rekam medis dan kode layanan unik; pasien dengan
  nama + tanggal lahir identik memicu peringatan yang harus dikonfirmasi.
* Setiap aktivitas penting dicatat di tabel `audit_logs`.

### Kwitansi HD & keterbacaan mesin

* **PDF/A-3b** — standar arsip jangka panjang dengan profil warna sRGB,
  metadata XMP, dan seluruh font tertanam.
* Semua teks berupa teks sungguhan (bukan gambar), sehingga bisa dicari,
  disalin, dan diproses OCR/parser.
* Baris data terstruktur tercetak di kaki kwitansi:
  `#KWT|KGM/202608/0001|2026-08-31|RM-000001|TOTAL=325000|SIG=BBF916E38F47|OK|#`
* **QR verifikasi** berisi tautan atau payload teks beserta kode HMAC-SHA256.
  Siapa pun dapat memindainya untuk memastikan kwitansi asli lewat halaman
  publik `/verify.html` — halaman itu hanya menampilkan data ringkas dengan
  nama pasien disamarkan.

---

## 3. Kustomisasi

Semua di menu **Pengaturan** (khusus admin), tanpa perlu menyentuh berkas kode:

* Nama klinik, tagline, alamat, telepon, email, website, NPWP.
* Nomor rekening bank (tercetak saat pembayaran transfer).
* Logo klinik — unggah PNG/JPG maksimal 3 MB. Untuk hasil cetak tajam,
  gunakan PNG minimal 600 × 600 piksel.
* Awalan nomor kwitansi, ukuran cetak default, catatan kaki.
* Nama dan jabatan penanda tangan.
* Aktif/nonaktif QR dan URL dasar verifikasi.

### Mengganti font kwitansi

Letakkan `Regular.ttf`, `Bold.ttf`, dan `Italic.ttf` di
`backend/assets/fonts/`, lalu jalankan ulang server. Bila folder kosong,
sistem memakai **Inter** (lisensi SIL OFL) yang sudah ikut terpasang, dan
memakai font sistem sebagai cadangan terakhir.

> Font wajib tertanam agar keluaran tetap memenuhi PDF/A — gunakan font yang
> lisensinya mengizinkan penyematan (*embedding*).

---

## 4. Pindah ke MySQL / MariaDB

Secara bawaan aplikasi memakai **SQLite** (`node:sqlite` bawaan Node) supaya
langsung jalan tanpa memasang server database. Untuk klinik dengan beberapa
komputer kasir, pindahkan ke MySQL:

1. Buat database:

   ```sql
   CREATE DATABASE klinik_gigi_manda CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Ubah `backend/.env`:

   ```ini
   DB_DRIVER=mysql
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=klinik
   MYSQL_PASSWORD=rahasia
   MYSQL_DATABASE=klinik_gigi_manda
   ```

3. Jalankan `npm start`. Tabel dibuat otomatis dari
   `backend/src/db/schema.mysql.sql`.

Tidak ada kode aplikasi yang perlu diubah — seluruh query melewati satu lapisan
adapter di `backend/src/db/`.

---

## 5. Catatan pemasangan di klinik

* **Ganti `JWT_SECRET`** di `.env` dengan teks acak panjang. Pada
  `NODE_ENV=production`, server menolak berjalan bila secretnya kurang dari
  32 karakter atau masih memakai nilai bawaan/placeholder. Membuat nilai baru:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

  Secret ini juga menandatangani kode verifikasi QR pada kwitansi, sehingga
  menggantinya membuat kode pada kwitansi yang sudah tercetak tidak lagi cocok.
  **Tetapkan sekali di awal, sebelum kwitansi pertama terbit.**
* **Ganti password akun `admin`** dari nilai bawaan lewat
  **Pengaturan → Ganti Password**, lalu serahkan akunnya ke pemilik klinik.
* Bila suatu saat diakses lewat internet, taruh di belakang HTTPS
  (mis. Nginx atau Caddy), isi `CORS_ORIGIN` sesuai alamatnya, dan setel
  `TRUST_PROXY=true`. Untuk klinik dengan beberapa PC di satu ruangan,
  jaringan lokal saja sudah cukup dan jauh lebih aman — lihat bagian berikut.

---

## 6. Pemasangan di jaringan klinik (2 PC)

Susunan yang disarankan: satu PC menjalankan server sekaligus menyimpan data,
PC lain cukup membuka browser. **Tidak perlu internet sama sekali** — justru
itu yang membuat sistem hanya bisa dipakai dari dalam klinik.

```
PC 1 (meja kasir)  ── menjalankan server + menyimpan database
       │                buka http://localhost:4000
   router klinik
       │
PC 2 (ruang pemilik) ── cukup browser, buka http://<ip-pc-1>:4000
```

Alamat IP PC 1 ditampilkan sendiri oleh server saat menyala.

### Langkah pemasangan di PC 1

Folder `skrip-windows/` berisi tiga skrip PowerShell yang dijalankan berurutan:

| Skrip | Fungsi | Perlu admin |
| ----- | ------ | ----------- |
| `1-izinkan-firewall.ps1` | Membuka port 4000 untuk jaringan Private saja | Ya |
| `2-pasang-autostart.ps1` | Server menyala sendiri saat komputer dihidupkan | Tidak |
| `3-jadwalkan-backup.ps1` | Pencadangan otomatis tiap hari pukul 20:00 | Tidak |

Skrip 2 dan 3 punya opsi `-Hapus` untuk membatalkannya. Jam pencadangan bisa
diubah, misalnya `.\3-jadwalkan-backup.ps1 -Jam 21:30`.

Di PC 2 tidak ada yang perlu dipasang — cukup buat pintasan browser ke alamat
PC 1. Agar alamat itu tidak berubah-ubah, kunci IP PC 1 lewat **DHCP
reservation** di router klinik.

### Membatasi ke komputer tertentu saja

Firewall sudah membuat aplikasi tidak terjangkau dari luar jaringan klinik.
Untuk lapisan kedua — agar perangkat tamu yang ikut Wi-Fi klinik pun tidak bisa
membukanya — isi `ALLOWED_IPS` di `.env`:

```ini
# hanya dua PC klinik
ALLOWED_IPS=192.168.18.2,192.168.18.3

# atau seluruh jaringan lokal
ALLOWED_IPS=192.168.18.0/24
```

Kosongkan untuk mematikan pembatasan ini. Komputer server sendiri (localhost)
selalu diizinkan, jadi salah tulis tidak akan mengunci Anda keluar sepenuhnya.
Pemeriksaan memakai alamat soket asli, bukan header `X-Forwarded-For`, sehingga
tidak bisa dipalsukan dari sisi klien.

> Pakai bersama DHCP reservation. Bila IP PC diberikan acak oleh router, suatu
> saat alamatnya berubah dan staf akan terkunci di luar.

---

## 7. Pencadangan dan pemulihan

Seluruh arsip kwitansi berada di satu berkas: `backend/data/klinik.db`.
Kalau berkas itu hilang, semuanya hilang.

```bash
npm run backup                # buat cadangan sekarang
npm run restore -- --latest   # pulihkan dari cadangan terbaru
npm run restore -- backup/klinik-20260831-2310.db
```

Cadangan disimpan di `backend/backup/` dengan nama berisi tanggal dan jam.
Yang lebih tua dari 30 hari dibuang sendiri (atur lewat `BACKUP_KEEP_DAYS`),
kecuali cadangan terbaru yang tidak pernah dihapus.

Pencadangan memakai `VACUUM INTO`, yang menghasilkan salinan utuh **tanpa perlu
menghentikan server** — aman dijalankan di tengah jam praktik.

> **Salin folder `backup/` ke flashdisk atau cloud secara berkala.** Cadangan
> yang hanya tersimpan di komputer yang sama ikut hilang bila komputernya rusak
> atau dicuri.

### Peringatan: database itu tiga berkas, bukan satu

Selagi server berjalan, SQLite memakai `klinik.db`, `klinik.db-wal`, dan
`klinik.db-shm`. Transaksi terbaru bisa masih berada di `-wal` dan belum masuk
ke berkas utama.

**Jangan pernah menyalin, memindahkan, atau menghapus salah satunya saja.**
Menghapus `-wal` sementara servernya dimatikan paksa akan membuang data yang
sudah tersimpan dan tampak seperti database kembali kosong.

Cara yang aman:

* Untuk menyalin database → `npm run backup`
* Untuk mengembalikan database → `npm run restore`
* Untuk memindahkan berkasnya secara manual → hentikan server dengan benar
  (Ctrl+C, bukan Task Manager), lalu pindahkan ketiga berkas bersamaan

`npm run restore` menolak berjalan selagi server hidup, dan selalu menyimpan
kondisi lama sebagai `backup/sebelum-restore-*.db` sebelum menimpa.

---

## 8. Ringkasan API

Semua endpoint di bawah `/api`. Kecuali yang ditandai publik, semuanya
memerlukan header `Authorization: Bearer <token>`.

| Metode | Endpoint                        | Akses  | Keterangan                          |
| ------ | ------------------------------- | ------ | ----------------------------------- |
| GET    | `/health`                       | publik | Status server                       |
| POST   | `/auth/login`                   | publik | Login, mengembalikan token          |
| GET    | `/auth/me`                      | semua  | Profil pengguna aktif               |
| POST   | `/auth/change-password`         | semua  | Ganti password sendiri              |
| GET    | `/patients`                     | semua  | Daftar & pencarian pasien           |
| GET    | `/patients/next-mr-no`          | semua  | Usulan nomor rekam medis            |
| GET    | `/patients/:id`                 | semua  | Detail + 20 kwitansi terakhir       |
| POST   | `/patients`                     | semua  | Tambah pasien                       |
| PUT    | `/patients/:id`                 | semua  | Ubah pasien                         |
| PATCH  | `/patients/:id/status`          | admin  | Aktif / nonaktif                    |
| GET    | `/service-items`                | semua  | Daftar tarif                        |
| POST   | `/service-items`                | admin  | Tambah tarif                        |
| PUT    | `/service-items/:id`            | admin  | Ubah tarif                          |
| PATCH  | `/service-items/:id/status`     | admin  | Aktif / nonaktif                    |
| GET    | `/receipts`                     | semua  | Arsip kwitansi (filter + halaman)   |
| GET    | `/receipts/:id`                 | semua  | Detail + terbilang + QR             |
| GET    | `/receipts/:id/pdf?size=a5land` | semua  | PDF (`a5land`,`a4land`,`a5`,`a4`,`thermal80`,`thermal58`) |
| POST   | `/receipts`                     | semua  | Buat kwitansi                       |
| POST   | `/receipts/:id/void`            | admin  | Batalkan kwitansi                   |
| GET    | `/reports/summary`              | semua  | Rekap pendapatan                    |
| GET    | `/reports/export.csv`           | semua  | Ekspor CSV                          |
| GET    | `/settings`                     | semua  | Profil klinik                       |
| PUT    | `/settings`                     | admin  | Ubah profil klinik                  |
| GET    | `/settings/logo`                | semua  | Berkas logo                         |
| POST   | `/settings/logo`                | admin  | Unggah logo (base64)                |
| DELETE | `/settings/logo`                | admin  | Hapus logo                          |
| GET    | `/users`                        | admin  | Daftar pengguna                     |
| POST   | `/users`                        | admin  | Tambah pengguna                     |
| PUT    | `/users/:id`                    | admin  | Ubah pengguna                       |
| POST   | `/users/:id/reset-password`     | admin  | Reset password pengguna             |
| GET    | `/users/audit/logs`             | admin  | Jejak audit                         |
| GET    | `/verify?no=…&sig=…`            | publik | Verifikasi keaslian kwitansi        |

Galat dikembalikan sebagai `{ "error": "...", "details": { "field": "pesan" } }`
sehingga antarmuka dapat menandai isian yang salah satu per satu.

---

## 9. Perintah yang tersedia

Jalankan dari folder `backend/`:

```bash
npm start        # jalankan server
npm run dev      # jalankan dengan auto-reload saat berkas berubah
npm run seed     # isi ulang data awal (aman diulang, tidak menimpa data lama)
npm test         # uji fungsional menyeluruh terhadap server yang sedang berjalan
npm run backup   # cadangkan database sekarang
npm run restore -- --latest   # pulihkan dari cadangan terbaru
```

### Tentang `npm test`

`backend/test/smoke.mjs` menjalankan 64 pemeriksaan terhadap server hidup:
autentikasi, pembatasan peran, validasi masukan, perhitungan uang, penomoran
kwitansi, pembuatan PDF keempat ukuran (termasuk pemeriksaan font tertanam dan
metadata PDF/A), unggah logo, verifikasi QR, laporan, dan ekspor CSV.

Pengujian ini **menulis data** dan menegaskan jumlah secara persis, sehingga
hanya sahih pada database kosong — ia akan berhenti dengan pesan jelas bila
databasenya sudah berisi. Cara menjalankannya dengan aman:

```bash
# 1. hentikan server, lalu simpan database asli
move backend\data\klinik.db backend\data\klinik.db.simpan

# 2. terminal 1
cd backend && npm start

# 3. terminal 2
cd backend && npm test

# 4. hentikan server, buang database uji, kembalikan yang asli
del backend\data\klinik.db
move backend\data\klinik.db.simpan backend\data\klinik.db
```
