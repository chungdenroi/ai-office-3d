#!/usr/bin/env bash
# Cài đặt cầu nối AI nhân viên (Linux/macOS) — chạy 1 lần trên máy của nhân viên.
# Không chứa secret: máy chủ, tên và token được hỏi lúc cài đặt (token nhập
# không hiện lên màn hình), ghi vào file cấu hình chỉ mình bạn đọc được.
# Cách dùng: bash install.sh [--dry-run]   (dry-run: chỉ kiểm tra, không ghi gì)
# Cách nhanh nhất (Giám đốc gửi sẵn 1 lệnh, bạn chỉ nhập mật khẩu):
#   bash install.sh --url https://unfcixatuhypjyqislvb.supabase.co \
#     --anon-key <anon-key> --username <username-cua-ban>
# Mật khẩu KHÔNG nhận qua cờ dòng lệnh (không để mật khẩu lọt vào lịch sử lệnh).
set -u
DRY_RUN=0
SB_URL=""; SB_ANON=""; NAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --url) SB_URL="${2:-}"; shift ;;
    --url=*) SB_URL="${1#--url=}" ;;
    --anon-key) SB_ANON="${2:-}"; shift ;;
    --anon-key=*) SB_ANON="${1#--anon-key=}" ;;
    --username) NAME="${2:-}"; shift ;;
    --username=*) NAME="${1#--username=}" ;;
    *) echo "Cờ không rõ: $1 (dùng: --dry-run --url ... --anon-key ... --username ...)"; exit 1 ;;
  esac
  shift
done
DEST="${HOME}/.ai-office-bridge"
echo "== Cài đặt cầu nối AI nhân viên =="
echo "Thư mục cài đặt: $DEST"
if [ "$DRY_RUN" = 1 ]; then echo "[dry-run] Chỉ kiểm tra, không ghi file nào."; fi

# 1. Kiểm tra Node.js >= 22
if ! command -v node >/dev/null 2>&1; then
  echo "LỖI: chưa có Node.js. Cài Node.js 22+ tại https://nodejs.org rồi chạy lại."
  exit 1
fi
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "LỖI: Node.js đang là $(node --version), cần >= 22. Nâng cấp Node.js rồi chạy lại."
  exit 1
fi
echo "Node.js OK: $(node --version)"
[ "$DRY_RUN" = 1 ] && { echo "[dry-run] Kiểm tra xong: Node.js đạt."; exit 0; }

# 2. Copy cầu nối (lấy đúng thư mục chứa file install.sh này — chạy từ
# thư mục nào cũng được, không phụ thuộc thư mục hiện tại).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$DEST"
cp "$SCRIPT_DIR/bridge.js" "$DEST/bridge.js" || { echo "LỖI: không copy được bridge.js từ $SCRIPT_DIR."; exit 1; }
[ -f "$DEST/bridge.js" ] || { echo "LỖI: không thấy bridge.js sau khi copy."; exit 1; }
chmod 600 "$DEST/bridge.js"

# 3. Hỏi thông tin còn thiếu (mật khẩu luôn nhập tay, không hiện màn hình,
# không ghi vào lịch sử lệnh). Giá trị đã có qua cờ thì không hỏi lại.
if [ -z "$SB_URL" ]; then printf "Supabase Project URL (vd https://xyzcompany.supabase.co): "; read -r SB_URL; fi
if [ -z "$SB_ANON" ]; then printf "Supabase anon key (Project Settings -> API -> anon public): "; read -r SB_ANON; fi
if [ -z "$NAME" ]; then printf "Tên đăng nhập của bạn (vd linh — đúng username trong hệ thống): "; read -r NAME; fi
printf "Mật khẩu của bạn (nhập không hiện màn hình): "
read -rs PASS; echo
if [ -z "$SB_URL" ] || [ -z "$SB_ANON" ] || [ -z "$NAME" ] || [ -z "$PASS" ]; then echo "LỖI: chưa nhập đủ thông tin."; exit 1; fi
umask 077
# Ghi JSON bằng node để mật khẩu chứa ký tự đặc biệt cũng không vỡ file.
node -e 'const fs=require("node:fs");const f=process.argv[1];fs.writeFileSync(f,JSON.stringify({supabaseUrl:process.argv[2],anonKey:process.argv[3],username:process.argv[4],password:process.argv[5]},null,2));fs.chmodSync(f,0o600);' "$DEST/config.json" "$SB_URL" "$SB_ANON" "$NAME" "$PASS"
echo "Đã ghi cấu hình (chỉ bạn đọc được)."

# 4. Đăng ký tự chạy lại khi máy khởi động lại / cầu nối chết.
#    Linux: systemd user unit + linger (để chạy ngay khi boot, chưa cần đăng
#    nhập; không có linger thì service chỉ chạy khi đã đăng nhập — máy khởi
#    động lại là cầu nối chết, đúng lỗi Linh gặp 31/10).
#    macOS: launchd plist (systemd không có trên macOS; trước đây install.sh
#    chỉ nhắc đọc README, không tự đăng ký — cầu nối chết sau mỗi lần khởi
#    động lại máy).
#    Còn lại: cron @reboot làm phương án dự phòng.
AUTO_START_OK=0
if command -v systemctl >/dev/null 2>&1; then
  UNIT_DIR="${HOME}/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/ai-office-bridge.service" <<EOF
[Unit]
Description=AI Office bridge - $NAME
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DEST
ExecStart=$(command -v node) $DEST/bridge.js --config $DEST/config.json
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=5

[Install]
WantedBy=default.target
EOF
  if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable --now ai-office-bridge.service 2>/dev/null; then
    echo "Đã đăng ký tự chạy + tự khởi động lại (systemctl --user)."
    systemctl --user status ai-office-bridge.service --no-pager 2>/dev/null | head -8 || true
    AUTO_START_OK=1
  else
    echo "Không đăng ký được tự chạy bằng systemctl --user."
  fi
  # Linger: cho service chạy ngay khi boot, chưa cần đăng nhập.
  if command -v loginctl >/dev/null 2>&1; then
    if loginctl enable-linger "$USER" 2>/dev/null; then
      echo "Đã bật linger — cầu nối tự chạy khi máy khởi động lại (kể cả chưa đăng nhập)."
    else
      echo "CẢNH BÁO: không bật được linger (cần chạy tay 1 lần: loginctl enable-linger $USER). Không có linger, cầu nối chỉ chạy khi bạn đã đăng nhập."
    fi
  fi
fi
if [ "$AUTO_START_OK" = 0 ] && [ "$(uname -s)" = "Darwin" ]; then
  PLIST_DIR="${HOME}/Library/LaunchAgents"
  mkdir -p "$PLIST_DIR"
  cat > "$PLIST_DIR/com.enteesee.ai-office-bridge.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.enteesee.ai-office-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$DEST/bridge.js</string>
    <string>--config</string>
    <string>$DEST/config.json</string>
  </array>
  <key>WorkingDirectory</key><string>$DEST</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DEST/bridge.log</string>
  <key>StandardErrorPath</key><string>$DEST/bridge.log</string>
</dict>
</plist>
EOF
  if launchctl load "$PLIST_DIR/com.enteesee.ai-office-bridge.plist" 2>/dev/null; then
    echo "Đã đăng ký tự chạy + tự khởi động lại (launchd, macOS)."
    AUTO_START_OK=1
  else
    echo "CẢNH BÁO: không nạp được launchd plist. Chạy tay: launchctl load ~/Library/LaunchAgents/com.enteesee.ai-office-bridge.plist"
  fi
fi
if [ "$AUTO_START_OK" = 0 ]; then
  # Dự phòng cuối: cron @reboot (chạy khi máy khởi động lại).
  if command -v crontab >/dev/null 2>&1; then
    if (crontab -l 2>/dev/null | grep -v "ai-office-bridge"; echo "@reboot sleep 20 && $(command -v node) $DEST/bridge.js --config $DEST/config.json >> $DEST/bridge.log 2>&1") | crontab - 2>/dev/null; then
      echo "Đã đăng ký tự chạy bằng cron @reboot (phương án dự phòng)."
      AUTO_START_OK=1
    fi
  fi
fi
if [ "$AUTO_START_OK" = 0 ]; then
  echo "Không đăng ký được tự chạy — tự chạy cầu nối bằng tay khi cần:"
  echo "  node $DEST/bridge.js --config $DEST/config.json"
fi

# 5. Thử nối Supabase (endpoint sức khoẻ của Auth — cần kèm anon key vì
# cổng Supabase đòi apikey trên mọi đường dẫn).
echo "Thử kiểm tra Supabase..."
if curl -fsS --max-time 10 -H "apikey: $SB_ANON" "$SB_URL/auth/v1/health" >/dev/null 2>&1; then
  echo "Supabase phản hồi OK."
else
  echo "CẢNH BÁO: chưa nối được Supabase ($SB_URL). Kiểm tra Project URL + mạng (xem kit/README mục Khắc phục sự cố)."
fi
echo "XONG. Cầu nối đang chạy nền và tự hồi phục khi mất mạng."
