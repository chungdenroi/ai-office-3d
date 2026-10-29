# TIẾN ĐỘ — Hệ thống AI nhân viên, Trung tâm điều phối

## TRẠNG THÁI — 3 PHƯƠNG ÁN GIAO DIỆN XONG (CHƯA DEPLOY), CHỜ GIÁM ĐỐC NHÌN VÀ CHỌN

## (0) MỚI NHẤT 30/10 — 3 phương án giao diện (Giám đốc chê "xấu" 06:41 +07)

- Làm 3 hướng nhìn thật trên ứng dụng thật, chọn bằng `?theme=dark|light|warm`:
  (1) dark "Phòng điều hành tối", (2) light "Sáng sạch hiện đại",
  (3) warm "Gỗ ấm văn phòng" (tiêu đề serif). Chỉ đổi lớp hình ảnh + bảng màu
  cảnh 3D; cấu trúc, màn hình, máy chủ không đổi. Không tham số = giữ nguyên
  giao diện hiện tại (đã kiểm chứng).
- 12 ảnh chụp thật (mỗi bản × văn phòng/chat × 1440/390px) tại
  `docs/theme-options/<theme>/`, đã xem từng ảnh: đọc được, không tràn ngang,
  menu dưới cố định hiện ở 390px, không lỗi JS. Chi tiết + file chờ deploy:
  `BUILD-REPORT.md` §8. Sửa 1 điểm sau khi xem ảnh (bản dark tối quá nửa phải
  cảnh). Nhãn 3D góc tổng vẫn chồng dòng phụ như bản hiện tại — không do theme.
- CHƯA DEPLOY: agent cha push bằng gh-api put-file (KHÔNG git local) các file
  ở `BUILD-REPORT.md` §8.1, rồi kiểm chứng live `?theme=...` trước khi đưa
  Giám đốc chọn. Sau khi chọn: bản đó thành mặc định, kiểm chứng live lại.
- Các đợt sửa trước (khung nhãn 3D, lỗi THREE) vẫn CHƯA DEPLOY — push chung.

## (0b) Sửa khung nhãn 3D (lỗi live 04:36 +07)

- Lỗi A (Phòng họp: nhãn vượt mép trên), lỗi B (Theo người: nhãn khổng lồ
  che nút), lỗi C (vào lần đầu thiếu nhân vật): ĐÃ SỬA + ĐÃ KIỂM CHỨNG
  trong headless-shell (chi tiết + bảng số liệu: `BUILD-REPORT.md` §7).
  Chỉ đổi `web/app.js` (camera, `makeLabel`, `fitLabels`, `_initGen`,
  `setSize(…, false)`) + 2 dòng `web/style.css` (min-width lưới, max-width
  canvas). Tìm thêm lúc kiểm thử: resize sống 1280→390 tràn ngang do bẫy
  min-content của canvas — đã sửa và đo lại (docW = vw = 390).
- Kết quả cuối (cache đã chặn): 1280px — 0 nhãn vượt biên cả 4 góc, chồng
  tối đa 13%; 390px — 0 vượt biên, chồng tối đa 22% (chạm góc, tên đọc
  rõ); vào lần đầu đủ 5 nhân vật; nhân viên mới vào sau hiện không cần
  reload; không lỗi JS; `node --check` PASS. DB thật không chạm.
- CHƯA DEPLOY: agent cha push bằng gh-api put-file (KHÔNG git local):
  `web/app.js`, `web/style.css`, `BUILD-REPORT.md`, `PROGRESS.md` (+ các
  file đợt trước nếu chưa push). Sau đó kiểm chứng live bắt buộc: render
  3D + nhãn 4 góc + menu dưới cố định ở 390px thật.


Cập nhật lần cuối: ~07:00, 30/10/2026 (giờ Sài Gòn).

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
- **Sửa lỗi 3D live 30/10/2026 (sau kiểm chứng trình duyệt thật 05:21–05:24 +07):**
  màn Văn phòng 3D chết hẳn với "THREE is not defined" vì `buildRoom`/`buildBoard`
  dùng biến `THREE` ngoài phạm vi — lỗi chỉ lộ khi CDN tải được (môi trường thử
  nghiệm chặn CDN nên rơi về 2D và che mất lỗi). Đã sửa: `THREE.` → `T.` trong
  hai method, tách `buildStage()` có catch → 2D, bọc `init()` ở `renderOffice`,
  đưa Three.js r160 vào repo (`web/vendor/three.module.js`, loader thử file
  cùng nguồn trước rồi mới tới CDN), sửa dòng "Đang tải" còn sót và dòng gợi ý
  bị nút camera che. Kiểm chứng: tái hiện lỗi trước sửa, sau sửa 15/15 + 8/9
  (1 phép đo sai của script, đã kiểm tra lại đúng) — chi tiết `BUILD-REPORT.md`
  §2.4 + §3 Cổng 6. File đổi thêm: `web/vendor/three.module.js` (MỚI),
  `web/index.html` (importmap), `web/app.js`, `web/style.css`, `README.md`,
  `docs/HUONG-DAN-CAI-DAT.md`, 2 ảnh chụp 3D mới. CHƯA DEPLOY — cha (parent
  agent) push + kiểm chứng live.

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
   `workflow`, Pages đang chạy chế độ legacy từ `/`). File MỚI/đổi trong đợt sửa
   lỗi 3D: `web/vendor/three.module.js`, `web/index.html`, `web/app.js`,
   `web/style.css`, `README.md`, `docs/HUONG-DAN-CAI-DAT.md`, `BUILD-REPORT.md`,
   `PROGRESS.md`, `docs/screenshots-390px/shot-office-3d-390.png`,
   `docs/screenshots-390px/shot-office-3d-desktop.png`.
2. Kiểm tra lại trên site thật + trình duyệt thật có mạng, ƯU TIÊN: render 3D trực
   quan (5 nhân vật, nhãn đọc được, camera, gọi họp, đi bộ/ăn mừng) và menu dưới
   cố định ở 390px thật, vì đây là phần còn UNTESTED trên thiết bị thật.
3. Kiểm tra `install.bat` + đường cài kit đầy đủ trên Windows thật.
4. Chạy máy chủ 24/7 trên máy điều phối (systemd `server/office.service.example`).
5. Giai đoạn 4 (bộ việc kiểm thử đo chất lượng) — chưa làm.

## (5) BLOCKERS / UNTESTED

- Render 3D trên trình duyệt/điện thoại thật của Giám đốc: CHƯA KIỂM CHỨNG HẾT
  (đã kiểm chứng trong headless-shell + WebGL phần mềm với file vendor, xem
  BUILD-REPORT.md §3 Cổng 6). Dạng 2D đã kiểm chứng đầy đủ và tự bật khi 3D lỗi.
- Kit đầy đủ + Windows thật: UNTESTED (chỉ `--dry-run` Linux + vòng tròn bridge qua API).
- Chạy 24/7 + hiệu năng đa phiên lớn: UNTESTED.

## (6) Cập nhật lần cuối

~07:00, 30/10/2026 (Asia/Saigon) — sửa khung nhãn 3D + resize xong, chờ deploy + kiểm chứng trên trình duyệt/điện thoại thật.
