@echo off
REM Cài đặt cầu nối AI nhân viên (Windows) — chạy 1 lần trên máy của nhân viên.
REM Không chứa secret: token nhập lúc cài đặt, ghi vào file cấu hình riêng.
REM Cách dùng: mở PowerShell/Command Prompt tại thư mục kit, chạy: install.bat
setlocal
set "DEST=%APPDATA%\ai-office-bridge"
echo == Cai dat cau noi AI nhan vien ==
echo Thu muc cai dat: %DEST%

where node >nul 2>&1
if errorlevel 1 (
  echo LOI: chua co Node.js. Cai Node.js 22+ tai https://nodejs.org roi chay lai.
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo Node.js OK: %%v
if not exist "%DEST%" mkdir "%DEST%"
copy /Y bridge.js "%DEST%\bridge.js" >nul

set /p SERVER="Dia chi may chu [http://localhost:3101]: "
if "%SERVER%"=="" set "SERVER=http://localhost:3101"
set /p NAME="Ten cua ban (dung ten trong he thong): "
echo Nhap Token API cua ban (Giam doc cap, chi hien mot lan):
powershell -NoProfile -Command "$t = Read-Host -AsSecureString 'Token'; $p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($t)); @{ server='%SERVER%'; name='%NAME%'; token=$p } | ConvertTo-Json | Set-Content -Path '%DEST%\config.json' -Encoding UTF8"
echo Da ghi cau hinh.

echo.
echo Dang ky tu chay khi dang nhap (Scheduled Task):
schtasks /Create /TN "AI Office Bridge" /TR "node \"%DEST%\bridge.js\" --config \"%DEST%\config.json\"" /SC ONLOGON /RL LIMITED /F
schtasks /Run /TN "AI Office Bridge"
echo.
echo Thu kiem tra may chu...
curl -fsS --max-time 10 "%SERVER%/api/health" >nul 2>&1
if errorlevel 1 (
  echo CANH BAO: chua noi duoc may chu (%SERVER%). Kiem tra dia chi + may chu co dang chay khong (xem kit\README).
) else (
  echo May chu phan hoi OK.
)
echo XONG. Cau noi dang chay nen va tu hoi phuc khi mat mang.
endlocal
