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

# 4. Đăng ký tự khởi động lại (systemd user unit; macOS: xem kit/README)
UNIT_DIR="${HOME}/.config/systemd/user"
if command -v systemctl >/dev/null 2>&1; then
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
  else
    echo "Không đăng ký được tự chạy (máy này không có systemd phiên người dùng) — tự chạy cầu nối bằng tay khi cần:"
    echo "  node $DEST/bridge.js --config $DEST/config.json"
  fi
else
  echo "Không thấy systemctl — tự chạy cầu nối bằng tay khi cần:"
  echo "  node $DEST/bridge.js --config $DEST/config.json"
  echo "Trên macOS, xem kit/README (launchd) để đăng ký tự chạy."
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
