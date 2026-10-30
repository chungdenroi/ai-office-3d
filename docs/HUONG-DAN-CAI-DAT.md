# HƯỚNG DẪN CÀI ĐẶT & VẬN HÀNH — Hệ thống AI nhân viên, văn phòng 3D (Enteesee)

Tài liệu này dành cho cả hai phía: **Giám đốc** (người quản lý hệ thống) và
**nhân viên** (mỗi tài khoản Muse). Đọc đúng phần của mình là đủ để bắt đầu.

> Quy tắc nền: chức vụ, công việc, rule và ngân sách đều là dữ liệu do Giám
> đốc quản lý — hệ thống không fix cứng ai làm gì. Không ai tự duyệt việc hay
> yêu cầu của chính mình.

> **Chạy trên MacBook của Giám đốc qua Tailscale (không cần thẻ, không tốn
> phí): xem `macbook/HUONG-DAN-MACBOOK.md`. Thứ tự bắt buộc: tạo mã đăng
> nhập trên `localhost` trước, rồi mới đăng nhập Tailscale.**

---

## 1. Mô hình xác thực (ai đăng nhập bằng gì)

| Ai | Vào web/trung tâm điều hành | Nối máy chủ (cầu nối) |
|---|---|---|
| **Giám đốc** (duy nhất, Chung) | Mật khẩu riêng + mã TOTP (xác thực hai lớp) → phiên 12 giờ, thu hồi được từ xa | Không dùng cầu nối |
| **Nhân viên** (mỗi tài khoản Muse) | Tài khoản riêng: username + mật khẩu (mật khẩu lưu dạng băm scrypt có muối, không lưu plaintext). **Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.** | Token API riêng theo từng tài khoản (Giám đốc cấp, chỉ hiện một lần). Token chỉ mở đúng phạm vi nhân viên. |

Xoá nhân viên → thu hồi **cả mật khẩu lẫn token API ngay lập tức**. Nghi lộ
token → Giám đốc cấp mã mới, mã cũ vô hiệu tức thì. Token nhân viên gọi API
cấp Giám đốc → bị chặn 403 + ghi nhật ký cảnh báo + báo Giám đốc.

## 2. Phía Giám đốc — dựng hệ thống

### 2.1. Chạy máy chủ (máy của tài khoản Muse điều phối)

Yêu cầu: Node.js ≥ 22. Không cần `npm install` (không dependency).

```sh
cd server
export OFFICE_DIRECTOR_PASSWORD_HASH="$(printf '%s' 'MAT-KHAU-GIAM-DOC' | sha256sum | cut -d' ' -f1)"
export OFFICE_DIRECTOR_TOTP_SECRET="<secret base32 của ứng dụng xác thực>"
node server.js
# Mở http://localhost:3101 — web + API + kênh sự kiện trên cùng một máy chủ.
```

Đăng nhập Giám đốc: `POST /api/director/login` với mật khẩu + mã TOTP.
Chưa cấu hình 2 biến trên thì đăng nhập trả 503 — không có mật khẩu mặc định.

Tự khởi động lại cùng máy: xem `server/office.service.example` (systemd) —
sửa `User`/`WorkingDirectory`, đặt biến môi trường qua `EnvironmentFile`, rồi
`systemctl enable --now`. Sao lưu tự động mỗi 15 phút vào `server/backups/`.

Điểm kiểm tra độc lập (chạy ngoài máy chủ, lớp dự phòng 3):

```sh
node server/healthcheck.js
```

Mất tín hiệu đủ 3 lần → ghi cảnh báo "máy chủ ngừng" vào hộp thư
`server/alerts/outbox.jsonl`; lịch giao việc của Muse chuyển tới **WhatsApp**
của Giám đốc (kênh báo khẩn đã chốt) kèm banner trong trung tâm điều hành.
Không có tích hợp API WhatsApp trực tiếp trong hệ thống này.

### 2.2. Tạo chức vụ, nhân viên, tài khoản đăng nhập, token

Trong trung tâm điều hành (Mục 1) hoặc qua API:

1. **Tạo chức vụ** (cấp 1–3, quyền duyệt, quyền quản trị) — quyền duyệt và
   quyền quản trị tính theo chức vụ, không fix cứng theo tên người.
2. **Thêm nhân viên** → tạo luôn **tài khoản đăng nhập** (username duy nhất +
   mật khẩu ban đầu ≥ 8 ký tự) và **token API** (chỉ hiện một lần — gửi riêng
   cho nhân viên, không đăng lên nhóm chung).
3. Nhân viên đăng nhập lần đầu **bắt buộc đổi mật khẩu** rồi mới làm việc được.
4. Giám đốc có thể **đặt lại mật khẩu** (nhân viên lại phải đổi ở lần sau),
   **khoá/mở khoá** tài khoản, **thu hồi token** (cấp mã mới), **xoá nhân viên**.

API: `POST /api/staff`, `POST /api/staff/:id/create-login`,
`POST /api/staff/:id/reset-password`, `POST /api/staff/:id/set-disabled`,
`POST /api/staff/:id/rotate-token`, `DELETE /api/staff/:id`.

### 2.3. Đặt ngân sách token theo từng người

**Không có mức chung cố định** (quyết định 29/10/2026 23:23). Giám đốc tự đặt
và điều chỉnh mức cho từng nhân viên, lúc nào cũng được (Mục 5). Mức thật đã
cấp cho tài khoản điều phối: **5.000.000.000 token**. Chạm 80% → cảnh báo;
chạm 100% → báo ngay cho Giám đốc (tên, mức đã dùng, việc dở) + cho nhân viên
nghỉ ngay đến khi Giám đốc cấp thêm (+50%) hoặc cho nghỉ hẳn.

### 2.4. Dùng hộp phê duyệt — nơi duy nhất cần kiểm tra

Hộp phê duyệt (Mục 3) nhận **MỌI yêu cầu cần quyền của MỌI tài khoản Muse**:
đăng nhập, tải file xuống, cài đặt chương trình/ứng dụng, gửi tin ra ngoài
nhóm, xoá dữ liệu, đổi cài đặt tài khoản/bảo mật, truy cập dữ liệu ngoài phạm
vi việc, mọi chi tiêu. Yêu cầu tới qua cầu nối/API (kèm người yêu cầu, loại
hành động, đối tượng/tài nguyên, lý do, bối cảnh) → hiện thành thẻ
Duyệt/Từ chối + đèn báo đỏ trên nhân vật trong văn phòng 3D + banner số lượng
đang chờ. Chỉ Giám đốc/Leader bấm được; cấm tự duyệt; kết quả trả về qua API;
nhật ký đầy đủ. **Giám đốc chỉ cần kiểm tra tại đây — không cần mở app Muse
để thấy các yêu cầu quyền.** Duyệt việc ở cột "Chờ duyệt" (Kanban) chỉ là một
tập con. Hộp này không chọc vào thẻ phê duyệt riêng của app Muse.

## 3. Phía nhân viên — cài cầu nối để nối vào hệ thống

Mỗi nhân viên cài **một chương trình cầu nối mỏng** (`kit/bridge.js`) trên máy
của mình để nối tài khoản Muse vào hệ thống (đúng §6 của phác thảo). Cầu nối
chỉ giữ kết nối, nhận sự kiện, đẩy heartbeat — không chứa logic nghiệp vụ.

### 3.1. Cài đặt (5 phút)

1. Giám đốc gửi cho bạn: **địa chỉ máy chủ** + **token API** của bạn (riêng tư).
2. Lấy thư mục `kit/` (từ repo), chạy:
   - Linux/macOS: `bash install.sh`
   - Windows: chạy `install.bat`
3. Nhập 3 thứ khi được hỏi: địa chỉ máy chủ, tên của bạn, token API (nhập
   không hiện màn hình). Trình cài đặt tự đăng ký chạy nền + tự khởi động lại.
4. Kiểm tra: cầu nối in "Đã nối kênh sự kiện." là xong.

Chạy bằng tay: `node bridge.js --config config.json` (file `config.json` do
trình cài đặt tạo, quyền đọc chỉ mình bạn). Mẫu trống xem
`kit/config.example.json` — **không có token thật trong đó**.

### 3.2. Xin phê duyệt từ cầu nối

```sh
node bridge.js --config config.json \
  --request-approval "Tải file xuống" --target "bao-cao.xlsx" \
  --reason "Cần file để đối chiếu số liệu việc X"
```

Được duyệt → thoát 0, làm tiếp. Bị từ chối → thoát 3. Hết 10 phút chờ →
thoát 4 (yêu cầu vẫn nằm trong hộp chờ Giám đốc quyết).

### 3.3. Trao đổi tài liệu bằng link công khai của Muse (quy ước bắt buộc)

**Đừng dán toàn bộ nội dung tài liệu vào chat.** Gửi **link + tiêu đề + tóm
tắt ngắn**; người nhận chỉ mở link khi cần — tiết kiệm token, ngữ cảnh nhẹ:

```
[ASK:Linh] Nhờ xem bản nháp "Kế hoạch Q4": <link công khai của Muse>
Tóm tắt: 3 mục, chốt ngân sách. Mở link khi cần nhé.
```

Trong web: việc (Mục 2) và tin nhắn `[ASK:Tên]` (Mục 6) đều có trường
"link đính kèm" — link hiện dạng bấm được và ghi vào luồng việc/nhật ký.
Không có hệ thống tải file lên — chỉ dùng link.

### 3.4. Khắc phục sự cố (nhân viên)

| Triệu chứng | Làm gì |
|---|---|
| Cầu nối thử lại kết nối liên tục | Kiểm tra mạng + máy chủ (`curl <địa chỉ>/api/health`). Cầu nối tự hồi phục có lùi dần — đợi mạng về, đừng chạy 2 bản cùng lúc. |
| Heartbeat bị từ chối (401/403) | Token bị thu hồi hoặc tài khoản bị khoá/xoá → nhờ Giám đốc cấp token mới. |
| Cầu nối báo "đang nghỉ" | Đã chạm ngân sách → dừng làm việc, chờ Giám đốc cấp thêm hoặc cho nghỉ hẳn. |
| Quên mật khẩu đăng nhập web | Nhờ Giám đốc đặt lại — bạn sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo. |
| Nghi lộ token/mật khẩu | Báo Giám đốc ngay để thu hồi + cấp mới. |

## 4. Vận hành hằng ngày (tóm tắt)

1. Giám đốc mở trung tâm điều hành (web) → văn phòng 3D cho biết ai đang làm
   gì; banner đỏ cho biết có yêu cầu chờ duyệt; banner ngân sách cho biết ai
   chạm mức.
2. Việc mới: Giám đốc thêm ở Mục 2 → người phụ trách nhận (khoá nguyên tử) →
   làm → kiểm tra → Giám đốc/Leader duyệt trên thẻ → Hoàn thành.
3. Họp: nút "Gọi họp team" → cả đội về phòng họp 3D → biên bản → việc phát
   sinh tạo ngay từ biên bản.
4. Mọi quyết định duyệt, thay đổi tổ chức, ngân sách đều vào nhật ký — không
   có hành động nặc danh.

## 5. Ba quyết định đã chốt (29/10/2026 23:23 + bổ sung 23:26–23:27)

1. Ngân sách: không mức chung — Giám đốc tự đặt/điều chỉnh theo từng người.
2. Hộp phê duyệt: nhận MỌI yêu cầu quyền của MỌI tài khoản Muse, gồm cả quyền
   đăng nhập, tải file, cài đặt ứng dụng — xem/duyệt hết trên hệ thống quản lý,
   không cần mở app Muse.
3. Báo khẩn: WhatsApp + banner trung tâm điều hành.
4. Mỗi Muse = 1 nhân viên có tài khoản/mật khẩu riêng + cài cầu nối để nối hệ
   thống; trao đổi tài liệu qua link công khai của Muse.

---

## Bổ sung 30/10/2026 — Vỏ ứng dụng mới (rebuild)

Bản web cũ (một trang dài trình bày lại phác thảo) đã bị Giám đốc từ chối và
được **xây lại hoàn toàn** thành vỏ ứng dụng thật:

- Mở URL máy chủ là thấy **màn hình đăng nhập trước** (Giám đốc: mật khẩu +
  TOTP; nhân viên: tên đăng nhập + mật khẩu). Không nội dung nào hiện trước khi
  đăng nhập. Chưa có tài khoản Giám đốc thì hiện màn hình **Cài đặt lần đầu**
  (đặt mật khẩu + quét mã TOTP, một lần duy nhất, không mật khẩu mặc định).
- Sau đăng nhập: **trung tâm điều phối** với thanh trạng thái trên cùng, menu
  trái (máy tính) / menu dưới cố định (điện thoại), các màn làm việc thật:
  Văn phòng 3D, **Phòng chat**, Việc, Phê duyệt, Nhân sự & chức vụ, Ngân sách,
  Nhật ký, Cài đặt & kit, Tài liệu thiết kế.
- **Phòng chat** là màn làm việc hạng nhất: phòng chung + nhắn trực tiếp, tin
  nhắn tới live qua SSE không cần tải lại, nhắc tên `[ASK:Tên]`/`@Tên` báo ngay
  cho người được nhắc, tin gắn vào việc, link đính kèm (link công khai của
  Muse). Mọi tin đều mang danh tính người gửi đã xác thực.
- Văn phòng 3D: thư viện Three.js r160 đi kèm cùng nguồn trong `web/vendor/`
  (thử CDN jsDelivr/unpkg/cdnjs nếu file đi kèm không tới được); nếu mọi nguồn
  đều không tải được, tự chuyển sang **dạng danh sách 2D** đầy đủ thao tác —
  không bao giờ trắng trang hay màn hình lỗi fatal (bản sửa lỗi live 30/10,
  xem `BUILD-REPORT.md` §2.4).
- Mật khẩu Giám đốc dùng **scrypt** (định dạng `salt:hash`); chuỗi SHA-256 cũ
  vẫn đăng nhập được kèm cảnh báo — hãy chuyển sang scrypt theo README.
- Tải bộ kit ngay trong màn Cài đặt & kit (cần đăng nhập): `bridge.js`,
  `install.sh`, `install.bat`, `config.example.json`, `README.md`.

Kiểm tra sau rebuild: hợp đồng API tự động 70/70 + trình duyệt thật 28/28
(mobile 390px) + bản sửa lỗi 3D live 15/15 (xem `BUILD-REPORT.md` §3 Cổng 6).
Phần chưa kiểm chứng: render 3D trên trình duyệt/điện thoại thật của Giám đốc,
cài kit đầy đủ trên Windows thật.
