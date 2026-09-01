<#
    Membuat server kwitansi menyala sendiri setiap komputer dihidupkan,
    supaya staf klinik tidak perlu tahu soal terminal.

    Caranya: menaruh pintasan ke mulai-server.bat di folder Startup pengguna.
    Tidak perlu hak Administrator, dan mudah dibatalkan.

    Pasang   :  .\2-pasang-autostart.ps1
    Batalkan :  .\2-pasang-autostart.ps1 -Hapus
#>

param([switch]$Hapus)

$ErrorActionPreference = 'Stop'

function Tulis($teks, $warna = 'Gray') { Write-Host "  $teks" -ForegroundColor $warna }

$Proyek   = Split-Path -Parent $PSScriptRoot
$Bat      = Join-Path $Proyek 'mulai-server.bat'
$Startup  = [Environment]::GetFolderPath('Startup')
$Pintasan = Join-Path $Startup 'Sistem Kwitansi Klinik.lnk'

Write-Host ''
Write-Host '  Jalan Otomatis Saat Komputer Menyala' -ForegroundColor Cyan
Write-Host '  -------------------------------------'

if ($Hapus) {
    if (Test-Path $Pintasan) {
        Remove-Item $Pintasan -Force
        Tulis 'Pintasan startup dihapus. Server tidak lagi menyala otomatis.' 'Green'
    } else {
        Tulis 'Tidak ada pintasan startup yang terpasang.' 'DarkGray'
    }
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 0
}

if (-not (Test-Path $Bat)) {
    Tulis "Tidak menemukan mulai-server.bat di: $Proyek" 'Red'
    Tulis 'Pastikan folder skrip-windows berada di dalam folder proyek.' 'Yellow'
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 1
}

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($Pintasan)
$lnk.TargetPath       = $Bat
$lnk.WorkingDirectory = $Proyek
$lnk.Description      = 'Menjalankan server sistem kwitansi Klinik Gigi Manda'
$lnk.WindowStyle      = 7   # 7 = minimized, jendela tidak menutupi layar kerja
$lnk.Save()

Tulis 'Pintasan startup dibuat.' 'Green'
Tulis "Lokasi : $Pintasan" 'DarkGray'
Write-Host ''
Tulis 'Mulai sekarang server menyala sendiri setiap komputer ini dihidupkan,' 'White'
Tulis 'dalam jendela yang diminimalkan di taskbar.' 'White'
Write-Host ''
Tulis 'PENTING: pasang ini HANYA di PC yang menyimpan data (PC 1).' 'Yellow'
Tulis 'PC kedua cukup membuka browser ke alamat PC 1.' 'Yellow'
Write-Host ''
Tulis 'Untuk membatalkan:  .\2-pasang-autostart.ps1 -Hapus' 'DarkGray'
Write-Host ''
Read-Host '  Tekan Enter untuk menutup'
