#!/usr/bin/env bash
# Xin phê duyệt chia sẻ file công khai qua hộp phê duyệt web (Quy tắc 13).
# Luồng kỹ thuật: tạo yêu cầu trong hộp phê duyệt web → Giám đốc/Leader duyệt
# ở đó → sau khi duyệt, gửi file cho Muse trong phòng chat, Muse đẩy lên
# GitHub và gửi lại link công khai. Không dùng kho Muse nên không hiện thẻ
# phê duyệt của app Muse ở bước đẩy file.
# Cách dùng: bash request-share.sh <đường-dẫn-file> "<mục đích>"
#   vd: bash request-share.sh ./bao-cao-test.html "Chia sẻ kết quả kiểm thử hệ thống"
set -u
FILE="${1:-}"
PURPOSE="${2:-Chia sẻ file công khai}"
[ -f "$FILE" ] || { echo "LỖI: không thấy file $FILE"; exit 1; }
DEST="${HOME}/.ai-office-bridge"
[ -f "$DEST/bridge.js" ] && [ -f "$DEST/config.json" ] || { echo "LỖI: chưa cài cầu nối. Chạy install.sh trước."; exit 1; }
BASE="$(basename "$FILE")"
echo "== Xin phê duyệt chia sẻ file: $BASE =="
echo "Mục đích: $PURPOSE"
echo "Yêu cầu sẽ lên hộp phê duyệt web — Giám đốc/Leader duyệt ở đó."
node "$DEST/bridge.js" --config "$DEST/config.json" \
  --request-approval "Chia sẻ file công khai: $BASE" \
  --target "$BASE" --reason "$PURPOSE"
RC=$?
if [ "$RC" = 0 ]; then
  echo ""
  echo "ĐÃ ĐƯỢC DUYỆT. Bước tiếp theo: gửi file này cho Muse trong phòng chat"
  echo "(đính kèm link file), Muse sẽ đẩy lên GitHub và gửi lại link công khai."
  echo "File: $FILE"
elif [ "$RC" = 3 ]; then
  echo "BỊ TỪ CHỐI — không chia sẻ file này."
else
  echo "Chưa có quyết định (mã $RC). Xem lại hộp phê duyệt web sau."
fi
exit "$RC"
