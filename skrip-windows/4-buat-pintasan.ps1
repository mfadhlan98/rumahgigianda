# Memasang pintasan "Kwitansi Klinik" di desktop.
#
# Setelah ini pengguna cukup klik dua kali ikon berlogo klinik. Tidak ada
# alamat yang perlu diketik, tidak ada jendela hitam, dan tidak perlu tahu
# apa itu jaringan lokal.
#
# Jalankan di KEDUA komputer:
#
#   PC utama (yang menyimpan data)
#       .\4-buat-pintasan.ps1
#
#   PC kedua di meja depan — sebutkan alamat PC utama
#       .\4-buat-pintasan.ps1 -Alamat http://192.168.1.10:4000
#
# Alamat PC utama didapat dari skrip 1-izinkan-firewall.ps1, atau dari
# baris "Dari PC lain di jaringan" yang tercetak saat server menyala.

param(
  [string]$Alamat = 'http://localhost:4000',
  [string]$Nama   = 'Kwitansi Klinik'
)

$ErrorActionPreference = 'Stop'

$akar    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$launcher = Join-Path $akar 'buka-aplikasi.ps1'
$ikon     = Join-Path $akar 'aset-merek\logo-ikon.ico'

if (-not (Test-Path $launcher)) {
  Write-Host "  [X] buka-aplikasi.ps1 tidak ditemukan di $akar" -ForegroundColor Red
  Write-Host "      Pastikan seluruh folder aplikasi disalin utuh, bukan hanya skrip-windows."
  exit 1
}

try { $uri = [Uri]$Alamat } catch {
  Write-Host "  [X] Alamat tidak valid: $Alamat" -ForegroundColor Red
  Write-Host "      Contoh yang benar: http://192.168.1.10:4000"
  exit 1
}

$desktop  = [Environment]::GetFolderPath('Desktop')
$pintasan = Join-Path $desktop "$Nama.lnk"

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($pintasan)
$s.TargetPath = (Get-Command powershell.exe).Source
# -WindowStyle Hidden menyembunyikan jendela biru PowerShell; yang muncul
# ke pengguna hanya jendela aplikasinya.
$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -Alamat `"$Alamat`""
$s.WorkingDirectory = $akar
$s.Description = 'Sistem Kwitansi Klinik'
if (Test-Path $ikon) { $s.IconLocation = "$ikon,0" }
$s.WindowStyle = 7   # mulai terminimalkan, jaga-jaga bila jendela sempat muncul
$s.Save()

# COM object menahan berkas; lepaskan agar pintasan langsung bisa dipakai.
[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)

Write-Host ""
Write-Host "  Pintasan dibuat." -ForegroundColor Green
Write-Host "    Berkas  : $pintasan"
Write-Host "    Membuka : $Alamat"
if (Test-Path $ikon) {
  Write-Host "    Ikon    : logo klinik"
} else {
  Write-Host "    Ikon    : bawaan Windows (aset-merek\logo-ikon.ico tidak ada)" -ForegroundColor Yellow
}

$diPcIni = $uri.Host -in @('localhost', '127.0.0.1', '::1')
Write-Host ""
if ($diPcIni) {
  Write-Host "  Pintasan ini juga menyalakan aplikasinya bila belum hidup,"
  Write-Host "  jadi PC ini bisa dipakai walau belum sempat dinyalakan lebih dulu."
} else {
  Write-Host "  Pintasan ini hanya membuka jendela aplikasi. Komputer utama"
  Write-Host "  ($($uri.Host)) harus dalam keadaan menyala."
}
Write-Host ""
Write-Host "  Minta pengguna mencobanya sekarang, di depan Anda." -ForegroundColor Cyan
Write-Host ""
