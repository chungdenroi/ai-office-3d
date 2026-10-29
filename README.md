# Văn phòng 3D — Trung tâm điều hành AI nhân viên (Enteesee)

Hệ thống AI nhân viên theo **phác thảo đã duyệt ngày 29/10/2026** (tổng hợp: Linh,
theo chỉ đạo của Giám đốc Chung). Trung tâm là một **văn phòng 3D tương tác** —
nhân viên là nhân vật 3D đi lại giữa bàn làm việc, bảng việc và phòng họp —
bao quanh là bộ máy công ty: tổ chức, công việc, phê duyệt, ngân sách token.

**Nguyên tắc nền (không thỏa hiệp):** hệ thống **không fix cứng** ai làm chức vụ gì,
ai làm việc gì. Chức vụ, công việc, rule và ngân sách đều là **dữ liệu do Giám đốc
tạo/sửa**; hệ thống chỉ cung cấp cơ chế. Vai trò trong một việc cụ thể (người phụ
trách, người kiểm tra) gán theo từng việc, độc lập với chức vụ. Không ai tự duyệt
việc hay yêu cầu của chính mình.

Kế thừa có ghi rõ nguồn (§8 trong trang): Claw3D (văn phòng 3D, camera),
Agent Office (bàn + đèn báo duyệt, ăn mừng), Claw-Empire (chia khu, Kanban, biên
bản họp), BagIdea Office (chuỗi chỉ huy diễn trong không gian, mốc ngân sách),
Paperclip (lớp quản trị: tổ chức, khoá nhận việc, heartbeat, ngân sách, nhật ký);
bổ trợ: Outworked, Pixel Agents, Generative Agents, AI Town.

## Có gì trong repo

| Đường dẫn | Vai trò |
|---|---|
| `web/index.html` + `web/app.js` + `web/style.css` + `web/vendor/three.module.js` | **Vỏ ứng dụng thật**: màn hình đăng nhập trước, rồi trung tâm điều phối (văn phòng 3D, phòng chat, việc, phê duyệt, nhân sự, ngân sách, nhật ký, cài đặt). Nói chuyện với API máy chủ cùng nguồn; chỉ khi không nối được máy chủ mới có bản dùng thử ngoại tuyến ghi nhãn DEMO rõ ràng. Thư viện 3D đi kèm cùng nguồn (`web/vendor/`), không phụ thuộc CDN, không cần build. |
| `server/server.js` | Máy chủ trung tâm: Node thuần, **không dependency**. REST + SSE, SQLite (`node:sqlite`) với fallback file JSON, sao lưu định kỳ, phân quyền kiểm ở máy chủ. Đồng thời phục vụ luôn thư mục `web/`. |
| `server/bridge.js` | Cầu nối mỏng cho mỗi tài khoản Muse: giữ SSE, đẩy heartbeat bằng API thuần, watchdog tự hồi phục có lùi dần, tự dừng khi chạm ngân sách. Không chứa logic nghiệp vụ. Bản cài đặt được: xem `kit/`. |
| `server/healthcheck.js` | Điểm kiểm tra độc lập (chạy ngoài máy chủ): gọi `/api/health`, mất tín hiệu đủ ngưỡng thì ghi cảnh báo vào hộp thư `server/alerts/outbox.jsonl` để chuyển tới WhatsApp của Giám đốc. |
| `kit/` | Bộ kit cài đặt cầu nối cho nhân viên: `bridge.js`, `config.example.json`, `install.sh`, `install.bat`, `README.md`. |
| `docs/HUONG-DAN-CAI-DAT.md` | Hướng dẫn cài đặt & vận hành (tiếng Việt): phía Giám đốc + phía nhân viên. |

## Chạy hệ thống thật (máy chủ + web cùng nguồn)

Yêu cầu: Node.js ≥ 22. Không cần `npm install` (không dependency). Mở URL máy
chủ là có đủ hệ thống thật kèm đăng nhập — không có bản tĩnh tách rời.

```sh
cd server
node server.js
# -> http://localhost:3101  (web + API + SSE)
# -> kiểm tra sức khoẻ: curl http://localhost:3101/api/health
```

**Cài đặt lần đầu (không có mật khẩu mặc định):** nếu máy chủ chưa có tài khoản
Giám đốc ở đâu cả, mở trang web sẽ thấy màn hình Cài đặt lần đầu: đặt mật khẩu
Giám đốc (từ 10 ký tự) và quét mã TOTP — secret chỉ hiện một lần duy nhất.
Cách khác: đặt biến môi trường trước khi chạy (xem dưới).

**Bản dùng thử ngoại tuyến (DEMO):** nếu trình duyệt không nối được máy chủ,
màn hình đăng nhập cho vào bản demo chạy hoàn toàn trên trình duyệt, dữ liệu
mẫu lưu ở localStorage của máy đó, mọi màn hình ghi rõ “DEMO”. Bản demo chỉ để
lái thử luồng — không phải hệ thống thật.

## Cấu hình Giám đốc (scrypt + TOTP)

Mật khẩu Giám đốc băm **scrypt** (định dạng `"salt:hash"`, giống hệt mật khẩu
nhân viên). Tính chuỗi băm bằng Node:

```sh
node -e "const c=require('node:crypto');const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync('MAT-KHAU-GIAM-DOC',s,64).toString('hex'))"
export OFFICE_DIRECTOR_PASSWORD_HASH="<chuỗi scrypt vừa in>"
export OFFICE_DIRECTOR_TOTP_SECRET="<secret base32 của ứng dụng xác thực>"
```

Chuỗi hex SHA-256 của bản cũ vẫn được chấp nhận kèm cảnh báo chuyển đổi — hãy
chuyển sang scrypt. Thư mục dữ liệu: `OFFICE_DATA_DIR` (mặc định `./data`).
Sao lưu: xem cuối file.

Đăng nhập Giám đốc: `POST /api/director/login` với `{ "password": "...", "totp": "123456" }`
→ nhận `token` (phiên 12 giờ, thu hồi được qua `POST /api/sessions/:id/revoke`).

**Mô hình xác thực:** Giám đốc = mật khẩu + TOTP (phiên); nhân viên = tài khoản
riêng username + mật khẩu (băm scrypt có muối, bắt buộc đổi ở lần đăng nhập đầu
tiên; `POST /api/staff/login`, `POST /api/staff/change-password`) để vào web +
token API riêng theo từng tài khoản để cầu nối nối máy chủ. Giám đốc tạo tài
khoản (`POST /api/staff` với `username` + `initialPassword`,
`POST /api/staff/:id/create-login`), đặt lại mật khẩu, khoá/mở khoá, thu hồi
token; xoá nhân viên thu hồi cả mật khẩu lẫn token ngay. Chi tiết trong
`docs/HUONG-DAN-CAI-DAT.md`.

Cấp token cho nhân viên (phiên Giám đốc): `POST /api/staff` → token **chỉ hiện một
lần**, giao cho cầu nối của nhân viên đó. Xoá nhân viên → token mất hiệu lực ngay;
nghi lộ → `POST /api/staff/:id/rotate-token`.

Chạy cầu nối cho một tài khoản:

```sh
OFFICE_SERVER=http://localhost:3101 OFFICE_TOKEN=<token-nhan-vien> OFFICE_NAME=Linh node bridge.js
```

Một tài khoản cần quyền (đăng nhập, tải file, cài đặt chương trình/ứng dụng,
…) thì xin phê duyệt qua cầu nối — yêu cầu lên hộp phê duyệt web, quyết định
trả về qua API, không cần Giám đốc mở app Muse:

```sh
OFFICE_TOKEN=<token-nhan-vien> node bridge.js \
  --request-approval "Tải file xuống" --target "bao-cao.xlsx" \
  --reason "Cần file để đối chiếu số liệu việc X"
# Được duyệt -> thoát 0; bị từ chối -> thoát 3; hết 10 phút chờ -> thoát 4.
```

Điểm kiểm tra độc lập (chạy ngoài máy chủ, lớp dự phòng 3 — Mục 7):

```sh
node healthcheck.js
# Biến môi trường: OFFICE_HEALTHCHECK_URL, OFFICE_HEALTHCHECK_INTERVAL_MS
# (mặc định 60s), OFFICE_HEALTHCHECK_FAILS (mặc định 3),
# OFFICE_DIRECTOR_TOKEN (tuỳ chọn, để chuyển cả cảnh báo ngân sách/bảo mật),
# OFFICE_ALERT_OUTBOX (mặc định server/alerts/outbox.jsonl).
# Mất tín hiệu đủ ngưỡng -> ghi "máy chủ ngừng" vào hộp thư; sống lại ->
# ghi "đã hồi phục". Lịch giao việc của Muse đọc hộp thư và chuyển tới
# WhatsApp của Giám đốc. Không có tích hợp API WhatsApp trực tiếp.
```

Tự khởi động lại cùng máy: xem `server/office.service.example` (systemd) — sửa
`User`/`WorkingDirectory`, đặt biến môi trường qua `EnvironmentFile`, rồi enable.

Sao lưu: máy chủ tự copy file dữ liệu sang `server/backups/` mỗi 15 phút (đổi bằng
`OFFICE_BACKUP_DIR` / `OFFICE_BACKUP_INTERVAL_MS`), giữ 20 bản mới nhất; Giám đốc
gọi `POST /api/backup` để sao lưu ngay. Điểm kiểm tra độc lập (lớp 3, Mục 7):
`server/healthcheck.js` chạy ngoài máy chủ, gọi `GET /api/health` theo chu kỳ —
mất tín hiệu là ghi cảnh báo vào hộp thư `server/alerts/outbox.jsonl`, lịch giao
việc của Muse chuyển tới WhatsApp của Giám đốc (kênh báo khẩn đã chốt 29/10/2026
23:23) kèm banner trong trung tâm điều hành. Không có tích hợp API WhatsApp trực
tiếp trong hệ thống này.

## API chính (đều yêu cầu xác thực, trừ `/api/health` và đăng nhập)

| Phương thức | Đường dẫn | Ai được gọi |
|---|---|---|
| `GET /api/setup/status`, `POST /api/setup` | Cài đặt lần đầu (một lần duy nhất): đặt mật khẩu Giám đốc + nhận secret TOTP | Công khai, chỉ khi chưa có tài khoản Giám đốc |
| `POST /api/director/login` | Mật khẩu (scrypt) + TOTP → phiên Giám đốc | Công khai (đã cấu hình hoặc đã cài đặt lần đầu) |
| `GET /api/roles`, `POST /api/roles`, `PATCH /api/roles/:id`, `DELETE /api/roles/:id` | Chức vụ (dữ liệu) | Phiên Giám đốc |
| `GET/POST/PATCH/DELETE /api/staff`, `POST /api/staff/:id/rotate-token` | Nhân viên + token API | Phiên Giám đốc |
| `GET/POST /api/jobs`, `POST /api/jobs/:id/claim|submit|approve|return`, `POST /api/jobs/:id/links` | Việc; khoá nhận việc nguyên tử; trình duyệt; cấm tự duyệt; link đính kèm | Giám đốc/Leader tạo việc; người phụ trách nhận/trình việc |
| `GET/POST /api/approvals`, `GET /api/approvals/:id`, `POST /api/approvals/:id/decide` | Hộp phê duyệt (lý do bắt buộc) — nhận MỌI yêu cầu quyền của MỌI tài khoản Muse (đăng nhập, tải file, cài đặt chương trình/ứng dụng, gửi tin ra ngoài nhóm, xoá dữ liệu, đổi cài đặt, truy cập ngoài phạm vi, chi tiêu), kèm đối tượng/tài nguyên + bối cảnh | Tạo: mọi danh tính; đọc kết quả: người yêu cầu + cấp duyệt; quyết định: Giám đốc/Leader, cấm tự duyệt |
| `GET/PATCH /api/budgets`, `POST /api/budgets/:id/topup` | Ngân sách token | Phiên Giám đốc |
| `POST /api/heartbeat` | Heartbeat cấu trúc (sự kiện là chính) | Token nhân viên |
| `GET /api/events` | Kênh SSE (token qua `?token=`) | Mọi danh tính |
| `POST/GET /api/messages` | Phòng chat: phòng chung + nhắn trực tiếp + gắn vào việc, nhắc tên `[ASK:Tên]`/`@Tên`, link đính kèm | Mọi danh tính (tin nào cũng mang danh tính người gửi) |
| `GET/POST /api/meetings`, `PATCH /api/meetings/:id` | Gọi họp + biên bản | Gọi: Giám đốc/Leader; sửa biên bản: người gọi/Leader/Giám đốc |
| `GET /api/kit/:file` | Tải file bộ kit cầu nối | Mọi danh tính đã đăng nhập |
| `GET /api/context` | Gói ngữ cảnh nén (Module E) | Mọi danh tính |
| `GET /api/audit`, `GET /api/alerts`, `GET /api/sessions` | Nhật ký / cảnh báo / phiên | Phiên Giám đốc |

Token nhân viên gọi API cấp Giám đốc → **403 + ghi nhật ký cảnh báo + bản ghi báo
Giám đốc** (đúng §9).

## Thật hay demo?

| Phần | Trạng thái (sau rebuild 30/10/2026) |
|---|---|
| Vỏ ứng dụng web (đăng nhập, văn phòng, chat, việc, phê duyệt, nhân sự, ngân sách, nhật ký, cài đặt) | **Hệ thống thật**: nói chuyện với API máy chủ cùng nguồn, dữ liệu trên máy chủ. Chỉ khi không nối được máy chủ mới rơi về bản dùng thử ngoại tuyến ghi nhãn DEMO rõ ràng. |
| Văn phòng 3D | **Code thật** (Three.js r160 đi kèm trong `web/vendor/`, thử CDN jsDelivr/unpkg/cdnjs nếu file đi kèm không tới được). Nếu mọi nguồn đều không tải được, tự chuyển sang dạng danh sách 2D đầy đủ thao tác. Render 3D đã kiểm chứng trong trình duyệt headless với WebGL phần mềm (xem BUILD-REPORT.md §3 Cổng 6 + ảnh `shot-office-3d-*.png`); kiểm chứng trên trình duyệt/điện thoại thật sau deploy vẫn bắt buộc. |
| Số "đã dùng" | **Số thật** khi cầu nối đẩy lên; Giám đốc cũng có thể ghi nhận thủ công có nhật ký. Chỉ mức 5.000.000.000 token của tài khoản điều phối là mức thật đã cấp. |
| Xác thực Giám đốc | **Thật**: mật khẩu scrypt + TOTP, có cài đặt lần đầu, không mật khẩu mặc định. |
| Máy chủ: lưu trữ, phân quyền, SSE, heartbeat, ngân sách, sao lưu | **Code thật**, đã kiểm tra bằng hợp đồng API tự động 70/70 + trình duyệt thật 28/28 (xem BUILD-REPORT.md). Chưa chạy 24/7 trên máy điều phối. |
| Cầu nối bridge.js | **Code thật**, đã kiểm tra vòng tròn xin duyệt → quyết định qua API. Chưa chạy dài hạn với tài khoản thật. |
| Giai đoạn 4 (bộ việc kiểm thử đo chất lượng) | **Chưa làm.** |

## 3 quyết định ĐÃ CHỐT (29/10/2026 23:23, kèm phụ lục 23:26/23:27)

1. **Ngân sách token:** Giám đốc tự đặt/điều chỉnh cho từng người, không có mức chung cố định. Tài khoản điều phối được cấp thật 5.000.000.000 token.
2. **Hộp phê duyệt:** nhận MỌI yêu cầu cấp quyền của MỌI tài khoản Muse — cả đăng nhập, tải file, cài ứng dụng — quyết định ngay trên web, không cần mở ứng dụng Muse.
3. **Báo khẩn:** qua WhatsApp + biểu ngữ nổi bật trong trung tâm điều hành.
4. **Tài khoản + kit:** mỗi tài khoản Muse là một nhân viên có tên đăng nhập + mật khẩu riêng; mỗi tài khoản cài một cầu nối mỏng; tài liệu trao đổi qua link công khai của Muse.

## Deploy free

- **Hệ thống thật:** chạy máy chủ trên máy sẵn có của tài khoản Muse điều phối (quyết định đã chốt, Mục 7) — 0 đồng, không thuê host ngoài. Xem `server/office.service.example`. Mở URL máy chủ là có đủ web + API.
- **GitHub Pages (chỉ xem trước):** phục vụ thư mục `web/` thì chỉ thấy màn hình đăng nhập + bản dùng thử ngoại tuyến (không có máy chủ thật phía sau). Không cần build.

## Giấy phép

MIT — xem `LICENSE`.
