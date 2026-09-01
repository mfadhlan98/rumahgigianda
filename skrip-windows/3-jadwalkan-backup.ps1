<#
    Menjadwalkan pencadangan database otomatis setiap hari lewat Task Scheduler.

    Cadangan disimpan di backend\backup\ dengan nama berisi tanggal.
    Cadangan yang lebih tua dari 30 hari dibuang sendiri, kecuali yang terbaru.

    Pasang   :  .\3-jadwalkan-backup.ps1
    Jam lain :  .\3-jadwalkan-backup.ps1 -Jam 21:30
    Batalkan :  .\3-jadwalkan-backup.ps1 -Hapus
#>

param(
    [string]$Jam = '20:00',
    [switch]$Hapus
)

$ErrorActionPreference = 'Stop'

function Tulis($teks, $warna = 'Gray') { Write-Host "  $teks" -ForegroundColor $warna }

$NamaTugas = 'Klinik Gigi Manda - Backup Harian'
$Proyek    = Split-Path -Parent $PSScriptRoot
$Backend   = Join-Path $Proyek 'backend'

Write-Host ''
Write-Host '  Pencadangan Otomatis Harian' -ForegroundColor Cyan
Write-Host '  ----------------------------'

if ($Hapus) {
    $ada = Get-ScheduledTask -TaskName $NamaTugas -ErrorAction SilentlyContinue
    if ($ada) {
        Unregister-ScheduledTask -TaskName $NamaTugas -Confirm:$false
        Tulis 'Jadwal pencadangan dihapus.' 'Green'
    } else {
        Tulis 'Tidak ada jadwal pencadangan yang terpasang.' 'DarkGray'
    }
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 0
}

if (-not (Test-Path (Join-Path $Backend 'src\db\backup.js'))) {
    Tulis "Tidak menemukan backend\src\db\backup.js di: $Proyek" 'Red'
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 1
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
    Tulis 'Node.js tidak ditemukan di PATH. Pasang Node.js lebih dulu.' 'Red'
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 1
}

try { $waktu = [datetime]::ParseExact($Jam, 'HH:mm', $null) }
catch {
    Tulis "Format jam tidak valid: '$Jam'. Gunakan format 24 jam, misalnya 20:00." 'Red'
    Write-Host ''
    Read-Host '  Tekan Enter untuk menutup'
    exit 1
}

$aksi   = New-ScheduledTaskAction -Execute $node -Argument 'src\db\backup.js' -WorkingDirectory $Backend
$pemicu = New-ScheduledTaskTrigger -Daily -At $waktu
$setelan = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$lama = Get-ScheduledTask -TaskName $NamaTugas -ErrorAction SilentlyContinue
if ($lama) {
    Tulis 'Jadwal lama ditemukan — diganti.' 'DarkGray'
    Unregister-ScheduledTask -TaskName $NamaTugas -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $NamaTugas `
    -Description 'Mencadangkan database kwitansi Klinik Gigi Manda setiap hari.' `
    -Action $aksi `
    -Trigger $pemicu `
    -Settings $setelan | Out-Null

Tulis "Pencadangan dijadwalkan setiap hari pukul $Jam." 'Green'
Tulis "Hasil disimpan di: $Backend\backup" 'DarkGray'
Write-Host ''

Tulis 'Menguji sekali sekarang...' 'Cyan'
Push-Location $Backend
& $node 'src\db\backup.js'
$kode = $LASTEXITCODE
Pop-Location

if ($kode -eq 0) { Tulis 'Uji pencadangan berhasil.' 'Green' }
else { Tulis 'Uji pencadangan GAGAL — periksa pesan di atas.' 'Red' }

Write-Host ''
Tulis 'StartWhenAvailable aktif: bila komputer mati pada jam tersebut,' 'DarkGray'
Tulis 'pencadangan dijalankan begitu komputer dinyalakan kembali.' 'DarkGray'
Write-Host ''
Tulis 'SARAN: salin isi folder backup ke flashdisk atau cloud secara berkala.' 'Yellow'
Tulis 'Cadangan yang tersimpan di komputer yang sama ikut hilang bila komputernya rusak.' 'Yellow'
Write-Host ''
Read-Host '  Tekan Enter untuk menutup'
