# Membuka Sistem Kwitansi seperti aplikasi biasa.
#
# Dijalankan lewat pintasan di desktop, tanpa jendela hitam dan tanpa
# alamat yang harus diketik. Di PC server, berkas ini menyalakan servernya
# lebih dulu bila belum hidup; di PC kedua ia hanya membuka jendelanya.
#
# Dipanggil oleh pintasan bikinan skrip-windows\4-buat-pintasan.ps1.

param(
  # Alamat aplikasi. Kosong berarti PC ini juga servernya.
  [string]$Alamat = 'http://localhost:4000'
)

$ErrorActionPreference = 'Stop'
$akar = Split-Path -Parent $MyInvocation.MyCommand.Path

function Uri-Bagian([string]$u) {
  try { return [Uri]$u } catch { return [Uri]'http://localhost:4000' }
}

$uri = Uri-Bagian $Alamat
$diPcIni = $uri.Host -in @('localhost', '127.0.0.1', '::1')

function Server-Hidup {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $ok = $c.ConnectAsync($uri.Host, $uri.Port).Wait(700)
    $c.Close()
    return $ok
  } catch { return $false }
}

function Pesan($teks, $judul) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($teks, $judul, 'OK', 'Warning') | Out-Null
}

# --- Nyalakan server bila PC ini memang servernya dan belum hidup ---
if (-not (Server-Hidup)) {
  if (-not $diPcIni) {
    Pesan @"
Aplikasi kwitansi belum bisa dihubungi.

Biasanya karena komputer utama di ruang praktik sedang mati
atau belum selesai menyala.

Coba nyalakan komputer utama, tunggu sekitar satu menit,
lalu klik ikon ini lagi.
"@ 'Sistem Kwitansi'
    exit 1
  }

  $backend = Join-Path $akar 'backend'
  if (-not (Test-Path (Join-Path $backend 'src\server.js'))) {
    Pesan "Berkas aplikasi tidak ditemukan di:`n$backend" 'Sistem Kwitansi'
    exit 1
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Pesan @"
Node.js belum terpasang di komputer ini.

Hubungi pemasang sistem. Aplikasi tidak bisa jalan tanpa itu.
"@ 'Sistem Kwitansi'
    exit 1
  }

  if (-not (Test-Path (Join-Path $backend '.env'))) {
    Copy-Item (Join-Path $backend '.env.example') (Join-Path $backend '.env')
  }

  Start-Process -FilePath 'node' -ArgumentList 'src\server.js' `
    -WorkingDirectory $backend -WindowStyle Hidden

  # Beri waktu server menyala. Database besar bisa perlu beberapa detik.
  $batas = (Get-Date).AddSeconds(30)
  while (-not (Server-Hidup) -and (Get-Date) -lt $batas) { Start-Sleep -Milliseconds 400 }

  if (-not (Server-Hidup)) {
    Pesan @"
Aplikasi gagal menyala dalam 30 detik.

Hubungi pemasang sistem dan sebutkan pesan ini.
"@ 'Sistem Kwitansi'
    exit 1
  }
}

# --- Buka sebagai jendela aplikasi, bukan tab peramban ---
# Mode --app menyembunyikan kolom alamat, tombol maju/mundur, dan bookmark,
# sehingga tidak terlihat seperti membuka situs web.
$peramban = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

# Dua hal yang wajib, dan keduanya pernah membuat klik ikon terasa tidak
# melakukan apa-apa:
#
#   --user-data-dir  Tanpa ini, permintaan --app diserahkan ke Edge/Chrome yang
#                    sudah berjalan dengan profil pribadi pengguna, dan sering
#                    diabaikan begitu saja. Profil terpisah memaksa jendela
#                    aplikasi dibuat sendiri. Sekaligus memisahkan aplikasi
#                    klinik dari riwayat, bookmark, dan tab pribadi pengguna.
#
#   -WindowStyle     Pintasan menjalankan berkas ini lewat PowerShell
#     Normal         tersembunyi, dan proses anak mewarisi status "sembunyikan
#                    jendela" itu bila tidak ditulis eksplisit.
$profil = Join-Path $env:LOCALAPPDATA 'KwitansiKlinik\peramban'

if ($peramban) {
  $arg = @(
    "--user-data-dir=`"$profil`"",
    "--app=$Alamat",
    '--no-first-run',
    '--no-default-browser-check'
  )
  Start-Process -FilePath $peramban -ArgumentList $arg -WindowStyle Normal
} else {
  # Tidak ada Chrome/Edge — buka dengan peramban bawaan apa pun itu.
  Start-Process $Alamat -WindowStyle Normal
}
