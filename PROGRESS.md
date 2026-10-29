# TIẾN ĐỘ — Hệ thống AI nhân viên, Trung tâm điều phối

## TRẠNG THÁI — REBUILD XONG, CHỜ DEPLOY + KIỂM CHỨNG 3D TRÊN TRÌNH DUYỆT THẬT

Cập nhật lần cuối: ~06:30, 30/10/2026 (giờ Sài Gòn).

## (1) Chuyện gì đã xảy ra

- Bản build 29/10/2026 (17 file, trang dài trình bày lại phác thảo) bị Giám đốc
  **từ chối** 30/10/2026 04:37 +07: không giống hệ thống, như landing page trải dài,
  lỗi 1 đống — kèm ảnh chụp mobile 390px.
- Rebuild 30/10/2026: thay toàn bộ `web/` bằng vỏ ứng dụng thật (đăng nhập trước,
  9 màn hình làm việc, phòng chat mới), sửa 12 điểm ở `server/server.js` (scrypt,
  submit, sửa chức vụ, họp, kit, chat, vá 500). Giữ `kit/`, `bridge.js`,
  `healthcheck.js`. Không động vào phòng họp cũ `~/workspace/ai-company/`.
- Kiểm tra: hợp đồng API 70/70 + trình duyệt thật 28/28 (mobile 390px). Chi tiết +
  danh sách lỗi đã sửa + UNTESTED trong `BUILD-REPORT.md` (thay bản cũ).

## (2) DONE (rebuild)

- Vỏ ứng dụng: `web/index.html`, `web/app.js`, `web/style.css` — đăng nhập/TOTP/
  cài đặt lần đầu, topbar + sidebar/bottom nav cố định, 9 màn: Văn phòng 3D (+dạng
  2D dự phòng), Phòng chat (SSE live, [ASK:Tên], gắn việc, link), Việc (Kanban,
  nhận nguyên tử, trình duyệt, cấm tự duyệt), Phê duyệt (mọi loại quyền), Nhân sự
  & chức vụ (CRUD, token hiện 1 lần), Ngân sách (80%/100%/nạp 50%), Nhật ký,
  Cài đặt & kit, Tài liệu.
- Máy chủ: scrypt Giám đốc + cài đặt lần đầu, `submit`/`PATCH roles`/`meetings`/
  `kit download`/chat đầy đủ, vá các lỗi 500 (TOTP/hash), `openDecisions` đếm thật.
- 6 lỗi ảnh chụp Giám đốc đều đã sửa + kiểm chứng (trừ nhãn 3D trực quan — CDN chặn,
  xem UNTESTED). 5 lỗi web khác tìm thấy khi kiểm thử cũng đã sửa.
- Tài liệu: `README.md` cập nhật (chạy thật, scrypt, API, quyết định đã chốt),
  `docs/HUONG-DAN-CAI-DAT.md` bổ sung mục rebuild, ảnh chụp kiểm chứng 390px tại
  `docs/screenshots-390px/`.
- DB thật (`server/data/office.db`) sau sự cố kiểm thử đã dọn sạch về seed gốc
  (4 chức vụ, 2 rule, 5 nhân viên) — xem BUILD-REPORT.md §4.1.

## (3) DOING NOW

Không còn việc đang làm. Chờ agent cha: review, push repo `chungdenroi/ai-office-3d`,
deploy, kiểm chứng trên site thật + trình duyệt thật có mạng.

## (4) NEXT (thuộc về agent cha / sau deploy)

1. Push các file đã đổi lên repo (KHÔNG push bằng git local — dùng gh-api put-file
   như lần trước; file workflow Pages vẫn chỉ có ở local vì token thiếu quyền
   `workflow`, Pages đang chạy chế độ legacy từ `/`).
2. Kiểm tra lại trên site thật + trình duyệt thật có mạng, ƯU TIÊN: render 3D trực
   quan (5 nhân vật, nhãn đọc được, camera, gọi họp, đi bộ/ăn mừng), vì đây là
   phần UNTESTED duy nhất còn lại trong môi trường thử nghiệm (CDN bị chặn).
3. Kiểm tra `install.bat` + đường cài kit đầy đủ trên Windows thật.
4. Chạy máy chủ 24/7 trên máy điều phối (systemd `server/office.service.example`).
5. Giai đoạn 4 (bộ việc kiểm thử đo chất lượng) — chưa làm.

## (5) BLOCKERS / UNTESTED

- Render 3D trực quan: UNTESTED (CDN jsDelivr bị chặn trong sandbox). Dạng 2D đã
  kiểm chứng đầy đủ và tự bật khi 3D lỗi — hệ thống không bao giờ trắng trang.
- Kit đầy đủ + Windows thật: UNTESTED (chỉ `--dry-run` Linux + vòng tròn bridge qua API).
- Chạy 24/7 + hiệu năng đa phiên lớn: UNTESTED.

## (6) Cập nhật lần cuối

~06:30, 30/10/2026 (Asia/Saigon) — rebuild xong, chờ deploy + kiểm chứng 3D thật.
