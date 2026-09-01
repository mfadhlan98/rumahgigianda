<#
    Membuka port 4000 di Windows Firewall agar PC kedua bisa membuka aplikasi.

    Aturan dibatasi ke profil jaringan Private saja — kalau laptop klinik suatu
    saat tersambung ke Wi-Fi publik (kafe, hotel), portnya tetap tertutup.

    Jalankan sebagai Administrator:
      klik kanan berkas ini -> Run with PowerShell (sebagai admin)
#>

$ErrorActionPreference = 'Stop'
$NamaAturan = 'Klinik Gigi Manda - Sistem Kwitansi (TCP 4000)'
$Port = 4000

function Tulis($teks, $warna = 'Gray') { Write-Host "  $teks" -ForegroundColor $warna }

Write-Host ''
Write-Host '  Izinkan Akses Jaringan - Sistem Kwitansi Klinik' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------'

$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $admin) {
    Tulis 'Skrip ini harus dijalankan sebagai Administrator.' 'Red'
    Tulis 'Klik kanan berkas ini, pilih "Run as administrator".' 'Yellow'
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 1
}

$lama = Get-NetFirewallRule -DisplayName $NamaAturan -ErrorAction SilentlyContinue
if ($lama) {
    Tulis 'Aturan sudah pernah dibuat — dihapus dulu agar tidak dobel.' 'DarkGray'
    Remove-NetFirewallRule -DisplayName $NamaAturan
}

New-NetFirewallRule `
    -DisplayName $NamaAturan `
    -Description 'Mengizinkan komputer lain di jaringan klinik membuka sistem kwitansi.' `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Private `
    -Program Any | Out-Null

Tulis "Port $Port dibuka untuk jaringan Private." 'Green'
Write-Host ''

Tulis 'Alamat yang dipakai di PC kedua:' 'Cyan'
Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Tulis "  http://$($_.IPAddress):$Port" 'White' }

Write-Host ''
Tulis 'Pastikan jaringan Wi-Fi klinik disetel sebagai "Private", bukan "Public".' 'Yellow'
Tulis 'Cek di: Settings > Network & Internet > Wi-Fi > (nama jaringan) > Network profile type' 'DarkGray'
Write-Host ''
Tulis 'Untuk membatalkan aturan ini nanti:' 'DarkGray'
Tulis "  Remove-NetFirewallRule -DisplayName '$NamaAturan'" 'DarkGray'
Write-Host ''
Read-Host '  Tekan Enter untuk menutup'
