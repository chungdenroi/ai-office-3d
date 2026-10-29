# Bộ kit cài đặt cầu nối — AI nhân viên (Enteesee)

Cầu nối (`bridge.js`) là chương trình mỏng chạy trên máy của mỗi nhân viên để
nối tài khoản Muse của bạn vào hệ thống trung tâm. Nó chỉ giữ kết nối, nhận
sự kiện và đẩy heartbeat — không chứa logic nghiệp vụ.

## Cài đặt nhanh

**Linux / macOS:**

```sh
bash install.sh
```

**Windows:** mở thư mục kit, chạy `install.bat`.

Trình cài đặt sẽ hỏi 3 thứ (nhập lúc cài đặt, không ghi sẵn trong file nào):

1. Địa chỉ máy chủ (Giám đốc cho — ví dụ `http://localhost:3101`).
2. Tên của bạn (đúng tên trong hệ thống).
3. Token API của bạn (Giám đốc cấp, chỉ hiện **một lần** — nhập không hiện
   lên màn hình).

Xong: cầu nối tự chạy nền, tự khởi động lại cùng máy, tự hồi phục khi mất
mạng (lùi dần, không lặp vô hạn).

## Chạy bằng tay (không cài tự động)

```sh
node bridge.js --config config.json
# hoặc: OFFICE_SERVER=... OFFICE_TOKEN=... OFFICE_NAME=... node bridge.js
```

## Xin phê duyệt từ cầu nối

Khi bạn cần quyền (đăng nhập, tải file, cài đặt chương trình/ứng dụng, …):

```sh
node bridge.js --config config.json \
  --request-approval "Tải file xuống" --target "bao-cao.xlsx" \
  --reason "Cần file để đối chiếu số liệu việc X"
```

Yêu cầu lên hộp phê duyệt web; Giám đốc/Leader duyệt tại đó; kết quả trả về
đây. Được duyệt → thoát 0; bị từ chối → thoát 3.

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
| Cầu nối báo "Mất kết nối sự kiện", thử lại liên tục | Kiểm tra máy chủ có đang chạy không: mở địa chỉ máy chủ trên trình duyệt, hoặc `curl <địa chỉ>/api/health`. Mất mạng thì cầu nối tự thử lại có lùi dần — đợi mạng về. |
| Cầu nối báo heartbeat "bị từ chối" (401/403) | Token đã bị thu hồi hoặc tài khoản đã bị khoá/xoá. Nhờ Giám đốc cấp token mới (và kiểm tra tài khoản còn hoạt động không). Không tự đoán token. |
| Cầu nối báo "đang nghỉ" / chạm ngân sách | Bạn đã dùng hết ngân sách token. Dừng làm việc, chờ Giám đốc cấp thêm hoặc cho nghỉ hẳn — cầu nối chỉ còn gửi nhịp "đang nghỉ". |
| Máy chủ không phản hồi (kiểm tra sức khoẻ lỗi) | Báo Giám đốc ngay. Giám đốc nhận cảnh báo qua WhatsApp + banner trung tâm điều hành (điểm kiểm tra độc lập ghi vào hộp thư cảnh báo). |
| Lỗi "Thiếu OFFICE_TOKEN" | Chạy bằng `--config config.json` hoặc đặt biến môi trường. Không ghi token vào code. |
| Node.js < 22 | Cài Node.js 22+ tại https://nodejs.org rồi cài lại. |

## Bảo mật

- Token và mật khẩu **không bao giờ** ghi vào file mẫu, không gửi qua chat
  chung, không commit lên git. File `config.json` sau khi cài chỉ mình bạn
  đọc được (quyền 600 trên Linux/macOS).
- Nghi lộ token: báo Giám đốc ngay để thu hồi và cấp mã mới — mã cũ vô hiệu
  tức thì.
- Xoá nhân viên khỏi hệ thống sẽ thu hồi cả mật khẩu lẫn token API ngay.
