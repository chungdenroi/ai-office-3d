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

set /p SB_URL="Supabase Project URL (vd https://xyzcompany.supabase.co): "
set /p SB_ANON="Supabase anon key (Project Settings - API - anon public): "
set /p NAME="Ten dang nhap cua ban (vd linh): "
echo Nhap mat khau cua ban (nhap khong hien man hinh):
powershell -NoProfile -Command "$p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host -AsSecureString 'Mat khau'))); @{ supabaseUrl='%SB_URL%'; anonKey='%SB_ANON%'; username='%NAME%'; password=$p } | ConvertTo-Json | Set-Content -Path '%DEST%\config.json' -Encoding UTF8"
echo Da ghi cau hinh.

echo.
echo Dang ky tu chay khi dang nhap (Scheduled Task):
schtasks /Create /TN "AI Office Bridge" /TR "node \"%DEST%\bridge.js\" --config \"%DEST%\config.json\"" /SC ONLOGON /RL LIMITED /F
schtasks /Run /TN "AI Office Bridge"
echo.
echo Thu kiem tra Supabase...
curl -fsS --max-time 10 "%SB_URL%/auth/v1/health" >nul 2>&1
if errorlevel 1 (
  echo CANH BAO: chua noi duoc Supabase (%SB_URL%). Kiem tra Project URL + mang (xem kit\README).
) else (
  echo Supabase phan hoi OK.
)
echo XONG. Cau noi dang chay nen va tu hoi phuc khi mat mang.
endlocal
