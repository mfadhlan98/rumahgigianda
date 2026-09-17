'use strict';

/* Konfigurasi pembangun installer Windows.
 *
 * Ditulis sebagai JavaScript, bukan JSON, karena ikonnya dipilih saat
 * membangun: ikon klinik (assets/icon.png, tidak ikut repo) bila ada, ikon
 * bawaan bila tidak. Repo publik tidak boleh memuat logo klien, tetapi
 * installer untuk klinik harus memakainya.
 */

const fs = require('node:fs');
const path = require('node:path');

const ikonKlinik = path.join(__dirname, 'assets', 'icon.png');
const ikon = fs.existsSync(ikonKlinik) ? 'assets/icon.png' : 'assets/icon-bawaan.png';

module.exports = {
  appId: 'id.klinik.kwitansi',
  productName: 'Kwitansi Klinik',
  copyright: 'Copyright © 2026 Muhammad Fadhlan',

  directories: {
    output: 'dist',
    buildResources: 'assets',
  },

  // Tanpa arsip asar. Backend membaca font, skema SQL, dan berkas tampilan
  // lewat fs biasa; asar menambah lapisan yang tidak dibutuhkan dan punya
  // kasus tepi. Folder biasa juga memudahkan pemasang melihat isinya.
  asar: false,

  files: [
    'main.cjs',
    'assets/**',
    {
      from: '../backend',
      to: 'backend',
      filter: ['package.json', 'src/**', 'assets/**'],
    },
    {
      from: '../frontend',
      to: 'frontend',
      filter: ['**/*'],
    },
  ],

  /* Dependensi backend disalin lewat extraFiles, bukan files: electron-builder
     diam-diam mengecualikan node_modules dari pola files — bahkan yang berasal
     dari folder luar — karena mengira ia sendiri yang mengelolanya dari
     package.json akar. Hasilnya aplikasi terpasang tanpa Express maupun PDFKit
     dan mati saat dibuka. Tujuannya tepat di sebelah src/ supaya resolusi impor
     Node dan pencarian font @fontsource berjalan seperti di folder proyek. */
  extraFiles: [
    {
      from: '../backend/node_modules',
      to: 'resources/app/backend/node_modules',
      filter: [
        '**/*',
        '!.cache/**',
        '!**/*.{md,markdown,ts,map}',
        '!**/{test,tests,__tests__,docs,example,examples}/**',
      ],
    },
  ],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: ikon,
    // Tidak ditandatangani: sertifikat penandatanganan kode berbayar dan di luar
    // cakupan. SmartScreen akan bertanya sekali saat pertama dipasang.
    // signExecutable (bukan signAndEditExecutable): yang dilewati hanya tanda
    // tangannya — ikon dan metadata tetap ditanam ke .exe. Dengan
    // signAndEditExecutable: false, ikonnya ikut hilang dan jadi ikon Electron.
    signExecutable: false,
  },

  nsis: {
    oneClick: false,
    perMachine: false,                       // dipasang per pengguna, tanpa hak admin
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    shortcutName: 'Kwitansi Klinik',
    artifactName: 'Pasang-Kwitansi-Klinik-${version}.${ext}',
    deleteAppDataOnUninstall: false,         // data klinik tidak ikut terhapus saat uninstall
    installerLanguages: ['id_ID'],
    language: '1057',
  },
};
