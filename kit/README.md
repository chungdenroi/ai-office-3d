# Bộ kit cài đặt cầu nối — AI nhân viên (Enteesee)

Cầu nối (`bridge.js`) là chương trình mỏng chạy trên máy của mỗi nhân viên để
nối tài khoản Muse của bạn vào hệ thống trung tâm. Nó chỉ giữ kết nối, nhận
sự kiện và đẩy heartbeat — không chứa logic nghiệp vụ. Bản này nối thẳng
tới **Supabase** (không qua máy chủ Node cũ — `server/` đã chuyển thành
legacy, xem `server/LEGACY.md`).

## Cài đặt nhanh

**Linux / macOS:**

```sh
bash install.sh
```

**Windows:** mở thư mục kit, chạy `install.bat`.

Trình cài đặt sẽ hỏi 4 thứ (nhập lúc cài đặt, không ghi sẵn trong file nào):

1. Supabase Project URL (Giám đốc cho — vd `https://xyzcompany.supabase.co`).
2. Supabase anon key (khóa công khai trong Project Settings → API).
3. Tên đăng nhập của bạn (vd `linh` — đúng username trong hệ thống).
4. Mật khẩu của bạn (nhập không hiện lên màn hình).

Xong: cầu nối tự chạy nền, tự khởi động lại cùng máy, tự hồi phục khi mất
mạng (lùi dần, không lặp vô hạn).

Cầu nối đăng nhập bằng tài khoản của chính bạn (GoTrue password grant →
JWT). **Không dùng service_role key, không dùng token API chia sẻ nữa.**
Mọi thao tác đi bằng JWT của chính mình + RLS ở database.

## Chạy bằng tay (không cài tự động)

```sh
node bridge.js --config config.json
# hoặc: OFFICE_SUPABASE_URL=... OFFICE_ANON_KEY=... OFFICE_USERNAME=... OFFICE_PASSWORD=... node bridge.js
```

## Xin phê duyệt từ cầu nối

Khi bạn cần quyền (đăng nhập, tải file, cài đặt chương trình/ứng dụng, …):

```sh
node bridge.js --config config.json \
  --request-approval "Tải file xuống" --target "bao-cao.xlsx" \
  --reason "Cần file để đối chiếu số liệu việc X"
```

Yêu cầu lên hộp phê duyệt web; Giám đốc/Leader duyệt tại đó; kết quả trả về
đây. Được duyệt → thoát 0; bị từ chối → thoát 3; hết 10 phút chờ → thoát 4.
Quyết định được nhận qua Realtime, rơi về thăm dò chậm 60 giây nếu mất
WebSocket.

## Trao đổi tài liệu bằng link công khai của Muse

Đừng dán toàn bộ nội dung tài liệu vào chat (tốn token, nặng ngữ cảnh). Gửi
**link + tiêu đề + tóm tắt ngắn**; người nhận chỉ mở link khi cần:

```
[ASK:Linh] Nhờ xem bản nháp "Kế hoạch Q4": <link công khai của Muse>
Tóm tắt: 3 mục, chốt ngân sách. Mở link khi cần nhé.
```

Trong web, việc và tin nhắn đều có trường "link đính kèm" — link hiện dạng
bấm được và ghi vào nhật ký/luồng việc.

## Khắc phục sự cố

| Triệu chứng | Làm gì |
|---|---|
| Cầu nối báo "Mất kết nối Realtime", thử lại liên tục | Kiểm tra mạng và Supabase: `curl <Project URL>/auth/v1/health`. Mất mạng thì cầu nối tự thử lại có lùi dần, đồng thời dùng thăm dò REST 60s — đợi mạng về. |
| Cầu nối báo heartbeat "bị từ chối" (401/403) | Mật khẩu sai, tài khoản bị khoá/xoá, hoặc hàng staff chưa gắn đúng. Nhờ Giám đốc kiểm tra tài khoản còn hoạt động không. Không tự đoán mật khẩu. |
| Cầu nối báo "đang nghỉ" / chạm ngân sách | Bạn đã dùng hết ngân sách token. Dừng làm việc, chờ Giám đốc cấp thêm hoặc cho nghỉ hẳn — cầu nối chỉ còn đọc trạng thái mỗi 60s. |
| Cầu nối báo "bắt buộc đổi mật khẩu" | Tài khoản bắt buộc đổi mật khẩu ở lần đăng nhập đầu — đổi mật khẩu trên web trước rồi chạy lại cầu nối. |
| Supabase không phản hồi (kiểm tra sức khoẻ lỗi) | Báo Giám đốc ngay. Giám đốc nhận cảnh báo qua WhatsApp + banner trung tâm điều hành. |
| Lỗi "Thiếu cấu hình" | Chạy bằng `--config config.json` hoặc đặt biến môi trường. Không ghi secret vào code. |
| Node.js < 22 | Cài Node.js 22+ tại https://nodejs.org rồi cài lại. |

## Bảo mật

- Mật khẩu **không bao giờ** ghi vào file mẫu, không gửi qua chat
  chung, không commit lên git. File `config.json` sau khi cài chỉ mình bạn
  đọc được (quyền 600 trên Linux/macOS).
- Anon key là khóa công khai (đi kèm RLS) — lộ anon key không mất hệ
  thống. **service_role key thì tuyệt đối không đưa vào kit, web hay tài
  liệu** — nó bỏ qua mọi chính sách RLS.
- Nghi lộ mật khẩu: đổi mật khẩu ngay trên web (hoặc nhờ Giám đốc đặt cờ
  bắt đổi ở lần đăng nhập sau).
- Xoá nhân viên khỏi hệ thống sẽ ngắt quyền ngay (hàng staff mất → JWT
  không còn gắn với nhân viên nào; Giám đốc xoá/vô hiệu Auth user tương
  ứng trong Supabase Dashboard → Authentication để thu hồi hẳn phiên).
