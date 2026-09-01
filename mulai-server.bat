@echo off
setlocal
chcp 65001 >nul
title Sistem Kwitansi - Klinik Gigi Manda

cd /d "%~dp0backend"

echo.
echo   ============================================
echo    Sistem Kwitansi - Klinik Gigi Manda
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [X] Node.js belum terpasang di komputer ini.
    echo.
    echo       Silakan unduh dan pasang lebih dulu dari:
    echo       https://nodejs.org  ^(pilih versi LTS^)
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo   [1/3] Menyiapkan berkas konfigurasi .env ...
    copy /y ".env.example" ".env" >nul
)

if not exist "node_modules" (
    echo   [2/3] Memasang dependensi ^(hanya sekali, mohon tunggu^) ...
    call npm install
    if errorlevel 1 (
        echo.
        echo   [X] Pemasangan dependensi gagal. Periksa koneksi internet Anda.
        pause
        exit /b 1
    )
)

echo   [3/3] Menyalakan server ...
echo.
echo   Aplikasi akan terbuka di peramban pada http://localhost:4000
echo   Biarkan jendela ini tetap terbuka selama aplikasi dipakai.
echo   Tekan Ctrl+C untuk menghentikan server.
echo.

start "" http://localhost:4000
node src/server.js

echo.
echo   Server berhenti.
pause
