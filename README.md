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
| `web/index.html` + `web/app.js` + `web/style.css` | Trang trung tâm điều hành (bản tĩnh). Three.js qua CDN, không cần build. Dữ liệu lưu ở localStorage, xuất/nhập được JSON. |
| `server/server.js` | Máy chủ trung tâm: Node thuần, **không dependency**. REST + SSE, SQLite (`node:sqlite`) với fallback file JSON, sao lưu định kỳ, phân quyền kiểm ở máy chủ. Đồng thời phục vụ luôn thư mục `web/`. |
| `server/bridge.js` | Cầu nối mỏng cho mỗi tài khoản Muse: giữ SSE, đẩy heartbeat bằng API thuần, watchdog tự hồi phục có lùi dần, tự dừng khi chạm ngân sách. Không chứa logic nghiệp vụ. Bản cài đặt được: xem `kit/`. |
| `server/healthcheck.js` | Điểm kiểm tra độc lập (chạy ngoài máy chủ): gọi `/api/health`, mất tín hiệu đủ ngưỡng thì ghi cảnh báo vào hộp thư `server/alerts/outbox.jsonl` để chuyển tới WhatsApp của Giám đốc. |
| `kit/` | Bộ kit cài đặt cầu nối cho nhân viên: `bridge.js`, `config.example.json`, `install.sh`, `install.bat`, `README.md`. |
| `docs/HUONG-DAN-CAI-DAT.md` | Hướng dẫn cài đặt & vận hành (tiếng Việt): phía Giám đốc + phía nhân viên. |

## Chạy bản web tĩnh (demo trên trình duyệt)

Bản tĩnh chạy được ngay không cần máy chủ — nhưng **khóa Giám đốc ở bản tĩnh chỉ
là khóa demo** để lái thử luồng, không phải xác thực thật. Xác thực thật chỉ có
ở `server/`.

```sh
# Cách 1: mở trực tiếp bằng trình duyệt qua máy chủ tĩnh bất kỳ, ví dụ:
python3 -m http.server 8080 --directory web
# mở http://localhost:8080/

# Cách 2: máy chủ server/ cũng phục vụ luôn web/ ở cổng 3101 (xem dưới).
```

## Chạy máy chủ (Giai đoạn 1 — xương sống)

Yêu cầu: Node.js ≥ 22. Không cần `npm install` (không dependency).

```sh
cd server

# 1. Đặt mật khẩu + secret TOTP của Giám đốc (KHÔNG ghi vào code, KHÔNG commit):
#    - OFFICE_DIRECTOR_PASSWORD_HASH: sha256 hex của mật khẩu Giám đốc
#      (tính bằng: printf '%s' 'MAT-KHAU' | sha256sum)
#    - OFFICE_DIRECTOR_TOTP_SECRET: secret base32 của ứng dụng xác thực
#      (tạo bằng ứng dụng authenticator, ví dụ: JBSWY3DPEHPK3PXP)
export OFFICE_DIRECTOR_PASSWORD_HASH="$(printf '%s' 'MAT-KHAU-GIAM-DOC' | sha256sum | cut -d' ' -f1)"
export OFFICE_DIRECTOR_TOTP_SECRET="JBSWY3DPEHPK3PXP"

# 2. Chạy:
node server.js
# -> http://localhost:3101  (web + API + SSE)
# -> kiểm tra sức khoẻ: curl http://localhost:3101/api/health
```

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
| `POST /api/director/login` | Mật khẩu + TOTP → phiên Giám đốc | Công khai (đã cấu hình) |
| `GET /api/roles`, `POST /api/roles`, `DELETE /api/roles/:id` | Chức vụ (dữ liệu) | Phiên Giám đốc |
| `GET/POST/PATCH/DELETE /api/staff`, `POST /api/staff/:id/rotate-token` | Nhân viên + token API | Phiên Giám đốc |
| `GET/POST /api/jobs`, `POST /api/jobs/:id/claim|approve|return` | Việc; khoá nhận việc nguyên tử; cấm tự duyệt | Giám đốc/Leader tạo việc; người phụ trách nhận việc |
| `GET/POST /api/approvals`, `GET /api/approvals/:id`, `POST /api/approvals/:id/decide` | Hộp phê duyệt (lý do bắt buộc) — nhận MỌI yêu cầu quyền của MỌI tài khoản Muse (đăng nhập, tải file, cài đặt chương trình/ứng dụng, gửi tin ra ngoài nhóm, xoá dữ liệu, đổi cài đặt, truy cập ngoài phạm vi, chi tiêu), kèm đối tượng/tài nguyên + bối cảnh | Tạo: mọi danh tính; đọc kết quả: người yêu cầu + cấp duyệt; quyết định: Giám đốc/Leader, cấm tự duyệt |
| `GET/PATCH /api/budgets`, `POST /api/budgets/:id/topup` | Ngân sách token | Phiên Giám đốc |
| `POST /api/heartbeat` | Heartbeat cấu trúc (sự kiện là chính) | Token nhân viên |
| `GET /api/events` | Kênh SSE (token qua `?token=`) | Mọi danh tính |
| `POST/GET /api/messages` | Bus `[ASK:Tên]` | Mọi danh tính |
| `GET /api/context` | Gói ngữ cảnh nén (Module E) | Mọi danh tính |
| `GET /api/audit`, `GET /api/alerts`, `GET /api/sessions` | Nhật ký / cảnh báo / phiên | Phiên Giám đốc |

Token nhân viên gọi API cấp Giám đốc → **403 + ghi nhật ký cảnh báo + bản ghi báo
Giám đốc** (đúng §9).

## Demo hay thật?

| Phần | Trạng thái |
|---|---|
| Văn phòng 3D, tổ chức, Kanban, phê duyệt, ngân sách trên bản tĩnh | **Chạy thật trên trình duyệt**, dữ liệu localStorage. Chưa nối máy chủ — nối API là bước tiếp theo của Giai đoạn 2/3. |
| Số "đã dùng" trong Mục 5 | **Số mô phỏng**, ghi rõ trong giao diện. Chỉ mức 5.000.000.000 token của tài khoản điều phối là mức thật đã cấp. |
| Khóa Giám đốc trên bản tĩnh | **Khóa demo.** Xác thực thật (mật khẩu + TOTP) chỉ ở máy chủ. |
| Máy chủ: lưu trữ, phân quyền, SSE, heartbeat, ngân sách, sao lưu | **Code thật**, đã kiểm tra bằng lệnh (xem BUILD-REPORT.md). Chưa chạy 24/7 trên máy điều phối. |
| Cầu nối bridge.js | **Code thật**, chưa chạy dài hạn với tài khoản thật. |
| Giai đoạn 4 (bộ việc kiểm thử đo chất lượng) | **Chưa làm.** |

## 3 quyết định còn mở (chờ Giám đốc — hệ thống không tự quyết thay)

1. Mức ngân sách token mặc định cho các nhân viên còn lại (ngoài mức 5 tỷ của tài
   khoản điều phối) — đặt theo người hay một mức chung?
2. Danh mục hành động phải qua phê duyệt (đề xuất mặc định: gửi tin ra ngoài
   nhóm, xoá dữ liệu, đổi cài đặt tài khoản/bảo mật, cài thêm chương trình, mọi
   chi tiêu).
3. Kênh báo khẩn cho Giám đốc khi máy chủ ngừng hoặc có nhân viên chạm ngân sách
   (tin nhắn vào nhóm / thông báo trên điện thoại)?

## Deploy free

- **Web tĩnh:** GitHub Pages phục vụ thư mục `web/` (Settings → Pages → deploy
  from branch, thư mục `/web`). Không cần build.
- **Máy chủ:** chạy trên máy sẵn có của tài khoản Muse điều phối (quyết định đã
  chốt, Mục 7) — 0 đồng, không thuê host ngoài. Xem `server/office.service.example`.

## Giấy phép

MIT — xem `LICENSE`.
