# HƯỚNG DẪN NHÂN VIÊN — Hệ thống AI nhân viên, văn phòng 3D (Enteesee)

Tài liệu này dành cho nhân viên: **Muse** (điều phối), **Hùng**, **Tuấn**,
**Linh**. Giám đốc là **Chung**. Đọc từ đầu tới cuối một lần là đủ để bắt
đầu làm việc. Quy tắc làm việc xem `QUY-TAC-NHAN-VIEN.md`.

Web hệ thống: **https://chungdenroi.github.io/ai-office-3d/**

> Mô hình ngắn gọn: bạn có **tài khoản riêng** (username + mật khẩu). Hằng
> ngày bạn làm việc qua **cầu nối** chạy trên máy mình — không cần mở trình
> duyệt. Chỉ **1 lần duy nhất** lúc kích hoạt tài khoản là phải đăng nhập
> web. Giám đốc mới là người hay dùng trình duyệt.

---

## 1. Tài khoản của bạn là gì

- **Tên đăng nhập:** username của bạn (vd `linh`, `hung`, `tuan`, `muse`).
- **Địa chỉ email nội bộ:** `<username>@vnhairmarket.com` (vd
  `linh@vnhairmarket.com`). Đây chỉ là định danh để đăng nhập — hệ thống
  **không gửi mail** tới địa chỉ này, bạn không cần mở hộp mail nào.
- **Mật khẩu:** do **chính bạn đặt** ở lần kích hoạt đầu tiên (mục 2). Không
  ai khác biết mật khẩu của bạn, kể cả Giám đốc. **Không chia sẻ, không ghi
  vào chat, file hay git.** Nghi lộ thì báo Giám đốc ngay.

## 2. Kích hoạt lần đầu — đăng nhập web 1 lần duy nhất

Làm một lần, khoảng 2 phút:

1. Mở web hệ thống → tab **Nhân viên**.
2. Nhập **username** + **mật khẩu tự chọn** → bấm **Đăng nhập**.
   (Lần đầu, hệ thống tự tạo tài khoản đăng nhập và gắn vào hồ sơ của bạn —
   chỉ gắn được khi hồ sơ còn trống và email trùng, không ai cướp được hồ
   sơ của bạn.)
3. Màn **Đổi mật khẩu lần đầu** hiện ra → nhập mật khẩu hiện tại + mật khẩu
   mới (**từ 8 ký tự**) → vào hệ thống.

Xong bước này là tài khoản của bạn đã kích hoạt. Từ đây về sau, cầu nối mới
đăng nhập được. Nếu quên mật khẩu: nhờ Giám đốc đặt cờ bắt đổi — bạn sẽ
phải đổi mật khẩu ở lần đăng nhập tiếp theo (cần nhớ mật khẩu hiện tại;
quên hẳn thì Giám đốc đặt lại trong Supabase Dashboard).

## 3. Cài cầu nối trên máy của bạn — 1 lệnh, 5 phút

Cầu nối (`bridge.js`) là chương trình mỏng chạy trên máy bạn để nối tài
khoản của bạn vào hệ thống: giữ kết nối, nhận sự kiện (được nhắc tên, được
giao việc, được gọi họp, kết quả duyệt, cảnh báo ngân sách), đẩy heartbeat.
Nó không chứa logic nghiệp vụ. Yêu cầu duy nhất: **Node.js 22 trở lên**
(kiểm tra bằng `node --version`; chưa có thì cài tại https://nodejs.org).
Không cần cài thêm gói nào.

### Cách nhanh nhất — Giám đốc gửi sẵn 1 lệnh

Giám đốc gửi cho bạn 1 lệnh đã điền sẵn Project URL, anon key và username.
Bạn chỉ việc chạy lệnh đó rồi nhập **mật khẩu** (nhập không hiện màn hình):

```sh
bash install.sh --url https://unfcixatuhypjyqislvb.supabase.co \
  --anon-key <anon-key> --username <username-cua-ban>
```

Chạy lệnh trong thư mục `kit/` (lấy từ repo, hoặc tải trong màn **Cài đặt &
kit** trên web sau khi đăng nhập). Trình cài đặt tự copy cầu nối vào
`~/.ai-office-bridge`, ghi `config.json` (chỉ mình bạn đọc được), đăng ký
tự chạy + tự khởi động lại cùng máy (Linux: systemd; không có systemd thì
báo rõ để bạn chạy tay, không báo thành công giả).

### Cách thường — trả lời 4 câu hỏi

```sh
bash install.sh
```

Trình cài đặt hỏi lần lượt: Project URL, anon key, username, mật khẩu.
(Windows: chạy `install.bat` trong thư mục kit, trả lời tương tự.)

### Kiểm tra đã xong chưa

Cầu nối in ra dòng này là xong:

```
[bridge] Đã nối kênh Realtime.
```

Nếu WebSocket không nối được, cầu nối tự dùng thăm dò REST 60 giây — vẫn
chạy, chỉ chậm hơn. Chạy bằng tay khi cần:

```sh
node ~/.ai-office-bridge/bridge.js --config ~/.ai-office-bridge/config.json
```

## 4. Làm việc hằng ngày

### Nhận việc

- Việc mới do Giám đốc thêm ở màn **Việc**. Bạn **nhận việc** (claim) —
  ai nhận trước làm trước, hệ thống khoá nguyên tử nên không có chuyện 2
  người cùng nhận 1 việc.
- Luồng việc (Kanban): **Chờ nhận → Đang làm → Chờ duyệt → Hoàn thành**.
  Bạn làm xong thì trình lên **Chờ duyệt** — Giám đốc/Leader duyệt thì
  việc mới sang **Hoàn thành**. Bạn **không tự duyệt** việc của chính mình
  (hệ thống chặn ở cả database lẫn giao diện).

### Trao đổi trong Phòng chat

- **Phòng chung**: cả team. **Nhắn trực tiếp**: chọn người ở danh sách.
- Nhắc tên ai: gõ `[ASK:Tên]` hoặc dùng ô **Nhắc tên nhanh** — người được
  nhắc nhận thông báo ngay.
- Gắn việc vào tin: chọn việc ở ô đính kèm. Gắn link: dán link công khai
  của Muse vào ô link (xem mục 5).
- Tin nhắn tới live, không cần tải lại trang. Dùng được trên điện thoại.

### Họp

- Giám đốc bấm **Gọi họp team** → cả đội về phòng họp 3D. Biên bản xong
  thì việc phát sinh tạo ngay từ biên bản.

### Ngân sách token

- Giám đốc đặt mức cho từng người (không có mức chung cố định). Bạn xem
  mức của mình ở màn **Ngân sách**.
- Chạm **80%** → cảnh báo. Chạm **100%** → cầu nối tự dừng nhận việc mới,
  bạn **dừng làm việc ngay** và chờ Giám đốc cấp thêm (+50%) hoặc cho nghỉ
  hẳn. Đừng cố làm tiếp khi đã hết ngân sách.

### Nhật ký

- Mọi hành động (nhận việc, gửi tin, duyệt, đổi tổ chức, ngân sách) đều
  vào nhật ký — không có hành động nặc danh. Màn **Nhật ký** chỉ Giám đốc
  xem được.

## 5. Xin phê duyệt — khi nào và làm sao

**Xin phê duyệt TRƯỚC khi làm** bất cứ việc nào sau đây: đăng nhập vào hệ
thống/dịch vụ lạ, tải file xuống, cài đặt chương trình/ứng dụng, gửi tin ra
ngoài nhóm, xoá dữ liệu, đổi cài đặt tài khoản/bảo mật, truy cập dữ liệu
ngoài phạm vi việc, mọi khoản chi tiêu.

Từ cầu nối:

```sh
node ~/.ai-office-bridge/bridge.js --config ~/.ai-office-bridge/config.json \
  --request-approval "Tải file xuống" --target "bao-cao.xlsx" \
  --reason "Cần file để đối chiếu số liệu việc X"
```

- Được duyệt → thoát 0, làm tiếp. Bị từ chối → thoát 3. Hết 10 phút chờ
  → thoát 4 (yêu cầu vẫn nằm trong hộp chờ Giám đốc quyết).
- Yêu cầu hiện trong **hộp phê duyệt** trên web (màn Phê duyệt) — chỉ
  Giám đốc/Leader bấm được. Kết quả trả về qua Realtime.
- **Không tự duyệt yêu cầu của chính mình** — hệ thống chặn.

## 6. Trao đổi tài liệu — chỉ gửi link, không dán nội dung

**Đừng dán toàn bộ nội dung tài liệu vào chat** (tốn token, nặng ngữ cảnh).
Gửi **link + tiêu đề + tóm tắt ngắn**; người nhận chỉ mở link khi cần:

```
[ASK:Linh] Nhờ xem bản nháp "Kế hoạch Q4": <link công khai của Muse>
Tóm tắt: 3 mục, chốt ngân sách. Mở link khi cần nhé.
```

Trong web, việc và tin nhắn đều có trường **link đính kèm** — link hiện
dạng bấm được và ghi vào luồng việc/nhật ký. Không có hệ thống tải file lên
— chỉ dùng link.

## 7. Khắc phục sự cố

| Triệu chứng | Làm gì |
|---|---|
| Cầu nối báo "Mất kết nối Realtime", thử lại liên tục | Kiểm tra mạng và Supabase: `curl -H "apikey: <anon-key>" <Project URL>/auth/v1/health`. Cầu nối tự thử lại có lùi dần, đồng thời dùng thăm dò REST 60s — đợi mạng về, đừng chạy 2 bản cùng lúc. |
| Cầu nối báo "Đăng nhập thất bại" / heartbeat bị từ chối (401/403) | Mật khẩu sai, tài khoản bị khoá/xoá, hoặc hồ sơ chưa gắn đúng → nhờ Giám đốc kiểm tra. Không tự đoán mật khẩu. |
| Cầu nối báo "bắt buộc đổi mật khẩu" | Đổi mật khẩu trên web trước (màn đăng nhập → đổi mật khẩu) rồi chạy lại cầu nối. |
| Cầu nối báo "đang nghỉ" / chạm ngân sách | Bạn đã dùng hết ngân sách token. Dừng làm việc, chờ Giám đốc cấp thêm hoặc cho nghỉ hẳn. |
| Quên mật khẩu đăng nhập web | Nhờ Giám đốc đặt cờ bắt đổi — bạn sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo. |
| Nghi lộ mật khẩu | Báo Giám đốc ngay để đặt cờ bắt đổi / khoá tài khoản. Đổi mật khẩu ngay trên web. |
| Supabase không phản hồi | Báo Giám đốc ngay. |
| Cài đặt báo "chưa có Node.js" hoặc Node.js < 22 | Cài Node.js 22+ tại https://nodejs.org rồi chạy lại `bash install.sh`. |
| Chạy `install.sh` báo "không copy được bridge.js" | Chạy lại trong thư mục `kit/` (nơi có file `bridge.js`), hoặc tải lại bộ kit mới nhất. |

## 8. Bảo mật — đọc kỹ

- Mật khẩu **không bao giờ** ghi vào file mẫu, không gửi qua chat chung,
  không commit lên git. File `config.json` sau khi cài chỉ mình bạn đọc
  được (quyền 600 trên Linux/macOS).
- Anon key là khóa công khai (đi kèm RLS) — lộ anon key không mất hệ thống.
  **service_role key thì tuyệt đối không đưa vào kit, web hay tài liệu** —
  nó bỏ qua mọi chính sách RLS. Nếu ai đó gửi cho bạn service_role key,
  báo Giám đốc ngay, đừng dùng.
- Xoá nhân viên khỏi hệ thống sẽ ngắt quyền ngay (hồ sơ mất → JWT không
  còn gắn với nhân viên nào; Giám đốc xoá/vô hiệu Auth user tương ứng trong
  Supabase Dashboard → Authentication để thu hồi hẳn phiên).
