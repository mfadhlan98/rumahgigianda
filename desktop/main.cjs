'use strict';

/* Cangkang desktop Sistem Kwitansi.
 *
 * Menjalankan server Express di dalam proses utama Electron — memakai Node
 * yang tertanam di Electron, jadi komputer klinik tidak perlu memasang
 * Node.js — lalu membuka tampilannya di jendela milik aplikasi sendiri.
 *
 * Menutup jendela tidak mematikan server: aplikasi turun ke baki sistem dan
 * terus melayani. Ini penting karena pemilik klinik membuka rekap dari rumah
 * lewat jaringan pribadi; kalau resepsionis menutup jendela sepulang praktik,
 * servernya harus tetap hidup.
 *
 * Seluruh data — database, logo, cadangan, kunci rahasia — disimpan di folder
 * data pengguna, bukan di folder aplikasi. Folder aplikasi bisa berada di
 * lokasi hanya-baca, dan pemasangan ulang versi baru tidak boleh menyentuh
 * data klinik.
 */

const {
  app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, clipboard,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const NAMA = 'Kwitansi Klinik';
const ID_APLIKASI = 'id.klinik.kwitansi';
const PORT_BAWAAN = 4000;

// Windows mengelompokkan ikon taskbar berdasarkan ID ini; harus sama dengan
// appId di konfigurasi pembangun, atau ikonnya jatuh ke ikon Electron generik.
app.setAppUserModelId(ID_APLIKASI);

/* ---------- Satu instans saja ---------- */

// Klik ikon dua kali tidak boleh menjalankan dua server yang berebut port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => tampilkanJendela());
}

/* ---------- Lokasi ---------- */

// Saat dikemas, backend/ dan frontend/ disalin ke dalam folder aplikasi.
// Saat dikembangkan, keduanya ada di folder induk. Struktur relatifnya sama,
// sehingga backend menemukan frontend dan fontnya tanpa perubahan apa pun.
const akar = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
const dirBackend = path.join(akar, 'backend');

// Mode pengembangan memakai folder data terpisah. Tanpa ini, menjalankan
// 'electron .' di komputer pemasang akan menulis ke folder yang sama dengan
// aplikasi terpasang — dan pengujian bisa mencemari data klinik sungguhan.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Kwitansi Klinik (dev)'));
}
const userData = app.getPath('userData');
const dirData = path.join(userData, 'data');
const dirStorage = path.join(userData, 'storage');
const dirBackup = path.join(userData, 'backup');
const berkasKonfig = path.join(userData, 'konfigurasi.json');

const mulaiTersembunyi = process.argv.includes('--tersembunyi');

/* ---------- Konfigurasi ---------- */

/**
 * Konfigurasi dibuat sekali pada peluncuran pertama dan tidak pernah diubah
 * sendiri oleh aplikasi sesudahnya.
 *
 * Kunci JWT dibangkitkan di sini, bukan dibaca dari berkas .env: pemasang tidak
 * perlu tahu apa itu, dan kuncinya tidak pernah berubah — mengganti kunci
 * membuat kode verifikasi QR pada kwitansi yang sudah tercetak tidak lagi cocok.
 */
function muatKonfigurasi() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(berkasKonfig, 'utf8')); } catch { /* belum ada */ }

  let pertamaKali = false;
  if (typeof cfg.jwtSecret !== 'string' || cfg.jwtSecret.length < 32) {
    cfg.jwtSecret = crypto.randomBytes(48).toString('base64url');
    pertamaKali = true;
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) cfg.port = PORT_BAWAAN;
  if (typeof cfg.autostart !== 'boolean') { cfg.autostart = true; pertamaKali = true; }

  if (pertamaKali) simpanKonfigurasi(cfg);
  return { cfg, pertamaKali };
}

function simpanKonfigurasi(cfg) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(berkasKonfig, JSON.stringify(cfg, null, 2));
}

/**
 * Pilihan autostart diterapkan ulang pada SETIAP peluncuran, bukan hanya saat
 * pertama kali. Windows menyimpan jalur exe lengkap di registri; bila aplikasi
 * dipasang ulang ke folder lain atau versi baru menggantikan yang lama,
 * pendaftaran lama menunjuk ke berkas yang sudah tidak ada dan autostart
 * diam-diam mati. Menerapkannya ulang tiap kali membuat jalurnya selalu benar.
 */
function terapkanAutostart(cfg) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: cfg.autostart, args: ['--tersembunyi'] });
}

/** Variabel lingkungan HARUS terpasang sebelum modul backend diimpor. */
function siapkanLingkungan(cfg) {
  for (const d of [dirData, dirStorage, dirBackup]) fs.mkdirSync(d, { recursive: true });
  Object.assign(process.env, {
    NODE_ENV: 'production',
    PORT: String(cfg.port),
    JWT_SECRET: cfg.jwtSecret,
    SQLITE_FILE: path.join(dirData, 'klinik.db'),
    STORAGE_DIR: dirStorage,
    BACKUP_DIR: dirBackup,
  });
  if (cfg.allowedIps) process.env.ALLOWED_IPS = cfg.allowedIps;
}

/* ---------- Server ---------- */

async function mulaiServer(cfg) {
  const impor = (rel) => import(pathToFileURL(path.join(dirBackend, 'src', rel)).href);
  const { migrate } = await impor('db/index.js');
  const { ensureSeed } = await impor('db/seed.js');
  const { createApp } = await impor('app.js');
  const cadangan = await impor('db/backup.js');
  cadangkanSqlite = cadangan.backupSqlite;
  pangkasCadangan = cadangan.prune;

  await migrate();
  await ensureSeed({ quiet: true });

  const server = createApp().listen(cfg.port, '0.0.0.0');
  await new Promise((selesai, gagal) => {
    server.once('listening', selesai);
    server.once('error', gagal);
  });
  return server;
}

/* ---------- Pencadangan otomatis ---------- */

/**
 * Pencadangan dijadwalkan dari dalam aplikasi, bukan lewat Task Scheduler.
 *
 * Aturannya bukan "setiap pukul 20.00" melainkan "bila cadangan terbaru sudah
 * lebih dari 23 jam" dan diperiksa tiap setengah jam. Komputer klinik yang
 * dimatikan pukul 19.00 tidak akan pernah kena jadwal pukul 20.00; dengan
 * aturan ini, cadangan tetap terjadi begitu komputernya menyala keesokan hari.
 */
const JEDA_PERIKSA = 30 * 60 * 1000;
const USIA_MAKS = 23 * 60 * 60 * 1000;
let cadangkanSqlite = null;
let pangkasCadangan = null;
let cadanganTerakhir = null;   // { waktu, berkas } atau { waktu, galat }

function usiaCadanganTerbaru() {
  try {
    const berkas = fs.readdirSync(dirBackup)
      .filter((f) => /^klinik-\d{8}-\d{4}\.db$/.test(f))
      .map((f) => fs.statSync(path.join(dirBackup, f)).mtimeMs);
    if (!berkas.length) return Infinity;
    return Date.now() - Math.max(...berkas);
  } catch { return Infinity; }
}

function jalankanCadangan(alasan) {
  try {
    const hasil = cadangkanSqlite();
    const dihapus = pangkasCadangan();
    cadanganTerakhir = { waktu: new Date(), berkas: path.basename(hasil.file) };
    console.log(`[cadangan] ${alasan}: ${path.basename(hasil.file)} (${Math.round(hasil.bytes / 1024)} KB)`
      + (dihapus.length ? `, ${dihapus.length} cadangan lama dihapus` : ''));
  } catch (err) {
    cadanganTerakhir = { waktu: new Date(), galat: err.message };
    console.error(`[cadangan] gagal (${alasan}): ${err.message}`);
  }
  perbaruiTooltip();
}

function mulaiPenjadwalCadangan() {
  const periksa = () => { if (usiaCadanganTerbaru() > USIA_MAKS) jalankanCadangan('terjadwal'); };
  periksa();
  setInterval(periksa, JEDA_PERIKSA).unref();
}

function perbaruiTooltip() {
  if (!baki) return;
  let baris = `${NAMA} — berjalan di port ${process.env.PORT}`;
  if (cadanganTerakhir?.berkas) baris += `\nCadangan terakhir: ${cadanganTerakhir.waktu.toLocaleString('id-ID')}`;
  else if (cadanganTerakhir?.galat) baris += `\nCADANGAN GAGAL: ${cadanganTerakhir.galat}`;
  baki.setToolTip(baris);
}

/** Alamat IPv4 komputer ini, untuk ditunjukkan bila ada komputer/HP lain. */
function alamatJaringan() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
}

/* ---------- Ikon ---------- */

function berkasIkon() {
  const kandidat = ['icon.ico', 'icon.png', 'icon-bawaan.png'].map((n) => path.join(__dirname, 'assets', n));
  return kandidat.find((p) => fs.existsSync(p));
}

/* ---------- Jendela & baki ---------- */

let jendela = null;
let baki = null;
let keluarSungguhan = false;

function tampilkanJendela() {
  if (!jendela) return;
  if (jendela.isMinimized()) jendela.restore();
  jendela.show();
  jendela.focus();
}

function buatJendela(port) {
  jendela = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: NAMA,
    icon: berkasIkon(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      plugins: true,   // penampil PDF bawaan Chromium, dipakai pratinjau kwitansi
    },
  });

  jendela.once('ready-to-show', () => { if (!mulaiTersembunyi) jendela.show(); });
  jendela.loadURL(`http://127.0.0.1:${port}/`);

  // Menutup jendela = sembunyikan. Server tetap hidup untuk akses dari luar.
  jendela.on('close', (e) => {
    if (keluarSungguhan) return;
    e.preventDefault();
    jendela.hide();
  });

  // Tautan keluar dibuka di peramban sistem; PDF kwitansi (blob:) tetap di dalam.
  jendela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || url.startsWith(`http://127.0.0.1:${port}`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buatBaki(port, cfg) {
  const ikon = berkasIkon();
  baki = new Tray(ikon ? nativeImage.createFromPath(ikon) : nativeImage.createEmpty());
  baki.setToolTip(`${NAMA} — berjalan di port ${port}`);

  const alamat = alamatJaringan().map((ip) => ({
    label: `http://${ip}:${port}`,
    click: () => clipboard.writeText(`http://${ip}:${port}`),
  }));

  baki.setContextMenu(Menu.buildFromTemplate([
    { label: `Buka ${NAMA}`, click: tampilkanJendela },
    { type: 'separator' },
    {
      label: 'Alamat untuk komputer / HP lain (klik untuk salin)',
      submenu: alamat.length ? alamat : [{ label: 'Tidak terhubung ke jaringan', enabled: false }],
    },
    { label: 'Cadangkan sekarang', click: () => jalankanCadangan('manual') },
    { label: 'Buka folder data & cadangan', click: () => shell.openPath(userData) },
    { type: 'separator' },
    {
      label: 'Jalankan saat Windows menyala',
      type: 'checkbox',
      checked: cfg.autostart,
      click: (item) => { cfg.autostart = item.checked; simpanKonfigurasi(cfg); terapkanAutostart(cfg); },
    },
    { type: 'separator' },
    { label: 'Keluar — server ikut berhenti', click: () => { keluarSungguhan = true; app.quit(); } },
  ]));

  baki.on('click', tampilkanJendela);
}

/* ---------- Alur utama ---------- */

app.whenReady().then(async () => {
  const { cfg } = muatKonfigurasi();

  terapkanAutostart(cfg);

  siapkanLingkungan(cfg);

  try {
    await mulaiServer(cfg);
  } catch (err) {
    const portTerpakai = err && err.code === 'EADDRINUSE';
    dialog.showErrorBox(
      `${NAMA} tidak bisa dimulai`,
      portTerpakai
        ? `Port ${cfg.port} sedang dipakai program lain.\n\n`
          + 'Biasanya karena aplikasi ini sudah berjalan, atau server lama dari '
          + 'pemasangan sebelumnya masih hidup. Tutup yang lama lalu coba lagi.'
        : `Terjadi kesalahan saat menyalakan server:\n\n${err && err.message ? err.message : err}\n\n`
          + `Folder data: ${userData}`,
    );
    app.exit(1);
    return;
  }

  buatJendela(cfg.port);
  buatBaki(cfg.port, cfg);
  mulaiPenjadwalCadangan();
});

// Tanpa ini Electron keluar begitu jendela terakhir ditutup — padahal kita
// sengaja menyembunyikannya sambil membiarkan server hidup.
app.on('window-all-closed', () => { /* biarkan hidup di baki */ });

app.on('before-quit', () => { keluarSungguhan = true; });
