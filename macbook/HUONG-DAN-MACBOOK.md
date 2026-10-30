# HƯỚNG DẪN CHẠY HỆ THỐNG TRÊN MACBOOK QUA TAILSCALE
# (Chỉ Giám đốc dùng — dữ liệu nằm trên máy của anh, không cần thẻ, không tốn phí)

## Thứ tự bắt buộc (đọc trước khi làm)

1. Cài Node + chạy máy chủ + **tạo mã đăng nhập ngay trên máy** (mở
   `http://localhost:3101` trên chính MacBook, đặt mật khẩu + quét mã TOTP).
2. **Sau khi** tạo xong mã đăng nhập mới đăng nhập Tailscale trên MacBook.
   Làm ngược lại là để cổng cài đặt lần đầu lộ ra mạng trước khi có mật khẩu.

Mã đăng nhập (mật khẩu + mã xác thực) do chính anh tạo ở bước 3 — chỉ anh
biết, không ai khác có. Quên mật khẩu thì xóa file dữ liệu và cài lại từ đầu
(xem mục "Quên mã đăng nhập" ở cuối).

---

## Bước 1 — Kiểm tra Node.js (cần bản 22 trở lên)

Mở Terminal trên MacBook, gõ:

```sh
node --version
```

- Nếu hiện `v22.x` trở lên: qua bước 2.
- Nếu chưa có Node hoặc bản cũ: cài từ https://nodejs.org (bản LTS) rồi mở
  lại Terminal kiểm tra lại.

## Bước 2 — Lấy code về máy

```sh
cd ~
git clone https://github.com/chungdenroi/ai-office-3d.git
cd ai-office-3d
```

Đã có thư mục từ trước thì chỉ cần cập nhật:

```sh
cd ~/ai-office-3d && git pull
```

## Bước 3 — Chạy thử + tạo mã đăng nhập (làm trên MacBook, chưa mở Tailscale)

```sh
cd ~/ai-office-3d/server && node server.js
```

Mở trình duyệt trên MacBook: http://localhost:3101

Màn hình "Cài đặt lần đầu" hiện ra: đặt mật khẩu Giám đốc (từ 10 ký tự, chỉ
anh biết) rồi quét mã QR bằng app xác thực trên điện thoại (Google
Authenticator / Microsoft Authenticator / Apple Passwords). Ghi lại mã khôi
phục nếu màn hình có cho. Đăng nhập thử một lần cho chắc, rồi tắt máy chủ
bằng `Ctrl+C` trong Terminal.

Kiểm tra cổng cài đặt đã đóng (tùy chọn):

```sh
curl -s http://localhost:3101/api/setup/status
```

Máy chủ đang chạy thì phải trả `{"needsSetup":false}`.

## Bước 4 — Cho máy chủ tự chạy mỗi khi mở máy

```sh
cd ~/ai-office-3d && bash macbook/setup-macbook.sh
```

Script này: kiểm tra Node, ghi file tự chạy (launchd) trỏ đúng thư mục code
trên máy anh, nạp và chạy máy chủ ngay. Log nằm ở
`~/ai-office-3d/server/logs/office.log`. Không cần mật khẩu quản trị.

Muốn dừng hẳn: `launchctl bootout gui/$(id -u)/com.enteesee.office`

## Bước 5 — Tailscale: MacBook + điện thoại cùng một tài khoản

1. Trên MacBook: tải app **Tailscale** (App Store), đăng nhập bằng Gmail
   công việc `kingofgiftcard99@gmail.com`. Chỉ đăng nhập SAU khi xong bước 3.
2. Trên iPhone: tải app **Tailscale**, đăng nhập CÙNG tài khoản đó, bật
   kết nối (nút gạt trong app).
3. Trên MacBook, xem tên máy trong app Tailscale (ví dụ `macbook-pro`) hoặc
   gõ trong Terminal: `hostname`

## Bước 6 — Mở hệ thống trên điện thoại

Bật Tailscale trên điện thoại, mở trình duyệt:

```
http://<tên-máy>:3101
```

Ví dụ tên máy là `macbook-pro` thì gõ `http://macbook-pro:3101`. Dùng
`http`, không phải `https` — kết nối trong mạng Tailscale đã mã hóa sẵn.
Đăng nhập bằng mã Giám đốc đã tạo ở bước 3.

## Máy ngủ thì sao?

MacBook gập máy hoặc ngủ là điện thoại không vào được — đó là bản chất của
máy, không phải lỗi. Lúc cần dùng: cắm sạc, mở máy, vào
Cài đặt hệ thống → Màn hình khóa / Tiết kiệm năng lượng → bật "Không cho
ngủ khi cắm sạc". Muốn chạy 24/7 thật thì cần một máy luôn bật (máy bàn,
Mac mini, Raspberry Pi) — tính sau, không bắt buộc bây giờ.

## Kiểm tra nhanh khi có sự cố

```sh
# Máy chủ có đang chạy không?
curl -s http://localhost:3101/api/health
# Xem log
tail -30 ~/ai-office-3d/server/logs/office.log
# Tailscale trên MacBook có đang nối không? (mở app Tailscale xem trạng thái)
```

## Quên mã đăng nhập

Không có cách lấy lại mật khẩu Giám đốc — đó là thiết kế an toàn. Cách duy
nhất: dừng máy chủ, xóa file `~/ai-office-3d/server/data/office.db`, chạy
lại và làm lại bước 3 (mọi việc/ngân sách/nhật ký cũ mất theo). Sao lưu
thường xuyên: thư mục `~/ai-office-3d/server/backups/` tự có bản sao mỗi
15 phút — copy thư mục này ra chỗ khác để giữ.

## Ghi chú

- Tailnet này chỉ nối thiết bị của chính Giám đốc (MacBook + điện thoại).
  Nhân viên AI nối vào hệ thống bằng cầu nối riêng — quyết riêng sau, không
  đi chung tailnet này.
- Bản web công khai https://chungdenroi.github.io/ai-office-3d/ vẫn chỉ là
  demo ngoại tuyến, không nối vào máy chủ này.
