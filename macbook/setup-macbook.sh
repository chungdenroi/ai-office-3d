#!/usr/bin/env bash
# Cài máy chủ Trung tâm điều phối chạy tự động trên MacBook (launchd, user).
# Không cần sudo. Không chứa mật khẩu/secret nào.
# CHẠY SAU KHI đã tạo mã đăng nhập ở http://localhost:3101 (xem HUONG-DAN-MACBOOK.md).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$REPO_DIR/server"
PLIST_SRC="$REPO_DIR/macbook/com.enteesee.office.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.enteesee.office.plist"
LABEL="com.enteesee.office"

# 1. Node >= 22
if ! command -v node >/dev/null 2>&1; then
  echo "CHƯA CÓ Node.js. Cài từ https://nodejs.org (bản LTS) rồi chạy lại script này."
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node đang là $(node --version), cần >= 22. Cập nhật Node rồi chạy lại."
  exit 1
fi
echo "Node OK: $(node --version) tại $NODE_BIN"

# 2. Code máy chủ phải có
if [ ! -f "$SERVER_DIR/server.js" ]; then
  echo "Không thấy $SERVER_DIR/server.js — chạy script này từ trong repo ai-office-3d."
  exit 1
fi

# 3. Cảnh báo nếu chưa cài đặt lần đầu
if curl -fsS "http://localhost:3101/api/setup/status" 2>/dev/null | grep -q '"needsSetup":true'; then
  echo "CẢNH BÁO: máy chủ đang chạy nhưng CHƯA có mã đăng nhập Giám đốc."
  echo "Tạo mã trước tại http://localhost:3101 rồi mới mở Tailscale (xem HUONG-DAN-MACBOOK.md bước 3)."
fi

# 4. Ghi plist với đường dẫn thật trên máy này
mkdir -p "$HOME/Library/LaunchAgents" "$SERVER_DIR/logs"
sed -e "s|@NODE_BIN@|$NODE_BIN|g" -e "s|@SERVER_DIR@|$SERVER_DIR|g" "$PLIST_SRC" > "$PLIST_DST"
echo "Đã ghi $PLIST_DST"

# 5. Nạp lại (bỏ bản cũ nếu có) và chạy ngay
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true
sleep 2

# 6. Kiểm tra
if curl -fsS "http://localhost:3101/api/health" >/dev/null 2>&1; then
  echo "MÁY CHỦ ĐANG CHẠY: http://localhost:3101"
else
  echo "Chưa thấy máy chủ trả lời. Xem log: $SERVER_DIR/logs/office.log"
  exit 1
fi
echo "Xong. Máy chủ sẽ tự chạy lại mỗi khi anh mở máy."
echo "Tiếp theo: đăng nhập Tailscale trên MacBook + điện thoại (cùng tài khoản), rồi mở http://<tên-máy>:3101 trên điện thoại."
