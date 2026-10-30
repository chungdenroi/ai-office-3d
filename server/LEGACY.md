# LEGACY — Máy chủ Node cũ (NGỪNG DÙNG)

Từ đợt migration Supabase (30/10/2026), backend thật của hệ thống là
Supabase (xem `supabase/README.md` + `docs/HUONG-DAN-CAI-DAT.md`).

Thư mục `server/` này **chỉ còn giá trị tham khảo** (ngữ nghĩa staff /
roles / jobs / approvals / messages / meetings / budgets / audit mà bản
Supabase dịch sang):

- **KHÔNG chạy** `server.js` nữa (không `node server.js`, không systemd
  unit `office.service.example`).
- **KHÔNG sửa** code trong này, **KHÔNG động vào** `server/data/office.db`
  (dữ liệu cũ giữ nguyên để đối chiếu).
- **KHÔNG xoá** — ngữ nghĩa trong `server.js` là căn cứ để rà soát bản
  Supabase (đặc biệt: cấm tự duyệt, khoá nhận việc nguyên tử, ngưỡng ngân
  sách 80%/100%, bắt đổi mật khẩu lần đầu).
- Cầu nối cũ dùng token API (`kit/bridge.js` bản cũ, `server/bridge.js`)
  đã bị thay bằng cầu nối Supabase (GoTrue JWT) — xem `kit/README.md`.
- Sao lưu cũ trong `server/backups/` và cảnh báo cũ trong
  `server/alerts/` giữ nguyên để đối chiếu, không dùng cho vận hành mới
  (sao lưu mới: màn Cài đặt & kit → Tải file JSON + Supabase Dashboard →
  Database → Backups).
