# HƯỚNG DẪN CÀI ĐẶT & VẬN HÀNH — Hệ thống AI nhân viên, văn phòng 3D (Enteesee)

Tài liệu này dành cho cả hai phía: **Giám đốc** (người quản lý hệ thống) và
**nhân viên** (mỗi tài khoản Muse). Đọc đúng phần của mình là đủ để bắt đầu.

> Quy tắc nền: chức vụ, công việc, rule và ngân sách đều là dữ liệu do Giám
> đốc quản lý — hệ thống không fix cứng ai làm gì. Không ai tự duyệt việc hay
> yêu cầu của chính mình.

> **Backend hiện tại là Supabase (gói Free).** Web app là trang tĩnh trên
> GitHub Pages, nối thẳng tới Supabase bằng anon key + JWT + RLS — không
> còn máy chủ Node tự chạy. Máy chủ Node cũ (`server/`) đã chuyển thành
> legacy, xem `server/LEGACY.md` — không chạy nó nữa.

---

## 1. Mô hình xác thực (ai đăng nhập bằng gì)

| Ai | Vào web/trung tâm điều hành | Nối Supabase (cầu nối) |
|---|---|---|
| **Giám đốc** (duy nhất, Chung) | Mật khẩu riêng + mã TOTP (xác thực hai lớp của Supabase Auth) → phiên Supabase, thu hồi trong Dashboard → Authentication | Không dùng cầu nối |
| **Nhân viên** (mỗi tài khoản Muse) | Tài khoản riêng: username + mật khẩu. **Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.** | Cầu nối đăng nhập bằng chính username + mật khẩu của nhân viên (GoTrue password grant → JWT). Không token API chia sẻ, không service_role key. |

Tên đăng nhập là định danh dạng email `<username>@vnhairmarket.com`
(vd `linh@vnhairmarket.com`) — miền thật của công ty (Supabase từ chối
miền giả .internal); app không gửi mail tới địa chỉ này.
Liên hệ thật của nhân viên nằm ở cột `account` trong hồ sơ, không phải
email này.

Xoá nhân viên → hàng staff mất → JWT không còn gắn với nhân viên nào
(quyền ngắt ngay). Để thu hồi hẳn phiên, Giám đốc xoá/vô hiệu Auth user
tương ứng trong Supabase Dashboard → Authentication. Nghi lộ mật khẩu →
Giám đốc đặt cờ bắt đổi ở lần đăng nhập sau, hoặc nhân viên tự đổi trên web.

## 2. Phía Giám đốc — dựng hệ thống trên Supabase

### 2.1. Tạo project + chạy migration (làm một lần)

1. Tạo project Supabase mới (gói Free, region gần nhất — Singapore).
2. Trong Dashboard → **Authentication → Sign In / Providers → Email**:
   **TẮT "Confirm email"**. (Bắt buộc: hệ thống dùng email nội bộ, không
   gửi mail xác nhận. Để bật thì cả cài đặt Giám đốc lẫn kích hoạt nhân
   viên đều kẹt ở bước tạo phiên.)
3. Trong Dashboard → **SQL Editor**, chạy lần lượt 4 file trong
   `supabase/migrations/` theo đúng thứ tự:
   - `001_schema.sql` — bảng staff/roles/jobs/approvals/messages/meetings/
     budget_events/alerts/audit_log + rule.
   - `002_rls.sql` — Row Level Security mọi bảng + trigger cấm tự duyệt,
     trigger chặn sửa cột nhạy cảm, máy trạng thái việc.
   - `003_seed.sql` — 4 chức vụ + 5 nhân viên (Chung, Muse, Hùng, Tuấn,
     Linh) + 2 rule, y hệt seed máy chủ cũ. **Không tạo mật khẩu nào ở
     đây.**
   - `004_realtime.sql` — bật Realtime cho 7 bảng app theo dõi.
4. Trong Dashboard → **Project Settings → API**: copy **Project URL** và
   **anon public key** vào `web/config.js`, thay đúng 2 chuỗi giữ chỗ
   `YOUR_SUPABASE_URL_HERE` / `YOUR_SUPABASE_ANON_KEY_HERE`.
   **Chỉ điền anon key. KHÔNG BAO GIỜ điền service_role key** vào web,
   kit hay tài liệu — nó bỏ qua mọi chính sách RLS.
5. Deploy web tĩnh lên GitHub Pages như cũ (cùng URL) — xem
   `supabase/README.md` mục deploy.

### 2.2. Cài đặt lần đầu — tài khoản Giám đốc

Mở web → bấm **"Cài đặt lần đầu"** (nút này luôn hiện khi đã cấu hình
Supabase, vì app không thăm dò được "đã cài đặt chưa" khi chưa đăng nhập
— RLS chặn đọc khi chưa có phiên; lần cài đặt thứ hai sẽ bị chặn ở
database nên không sợ ai cài đè):

1. Đặt mật khẩu Giám đốc (từ 10 ký tự).
2. Quét mã TOTP vào ứng dụng xác thực (Google/Microsoft Authenticator)
   **ngay** — mã bí mật chỉ hiện một lần.
3. Nhập mã 6 số để **xác minh TOTP ngay trong lượt cài đặt** — chưa xác
   minh thì chưa tới được màn hình đăng nhập.

App tự gắn Auth user vừa tạo vào hàng `s-chung` (vì email trùng
`director@vnhairmarket.com`). Sau đó đăng nhập tab Giám đốc bằng mật khẩu +
mã 6 số như bình thường. Nếu cài đặt dở dang (tạo tài khoản nhưng chưa
xác minh TOTP), lần đăng nhập sau sẽ hiện lại mã TOTP mới để quét + xác
minh — không kẹt tài khoản.

### 2.3. Tạo chức vụ, nhân viên, tài khoản đăng nhập

Trong trung tâm điều hành (màn Nhân sự & chức vụ):

1. **Tạo chức vụ** (cấp 1–3, quyền duyệt, quyền quản trị) — quyền duyệt và
   quyền quản trị tính theo chức vụ, không fix cứng theo tên người.
2. **Thêm nhân viên** → nhập tên + chức vụ + username (vd `linh`) + ngân
   sách (nếu có). App tạo hàng staff với `auth_email = linh@vnhairmarket.com`
   và cờ bắt đổi mật khẩu đang bật.
   **Mật khẩu ban đầu nhập ở form không được lưu** — Supabase Auth chỉ
   nhận mật khẩu do chính nhân viên đặt khi kích hoạt (xem 2.4). Đừng hứa
   với nhân viên rằng mật khẩu form là mật khẩu đăng nhập.
3. Nhân viên **kích hoạt** bằng cách đăng nhập lần đầu với username +
   mật khẩu tự chọn → app tự gắn Auth user vào hàng (email trùng) →
   **bắt đổi mật khẩu ngay** rồi mới làm việc được.
4. Giám đốc có thể **đặt lại cờ bắt đổi mật khẩu** (nhân viên lại phải đổi
   ở lần sau), **khoá/mở khoá** tài khoản, **xoá nhân viên**.
   Thu hồi phiên thực hiện trong Supabase Dashboard → Authentication
   (app không có quyền này bằng anon key — cố tình, để không ai tự cấp
   quyền thu hồi phiên người khác).

### 2.4. Kích hoạt nhân viên (luồng đầy đủ)

1. Giám đốc tạo hàng nhân viên với username (mục 2.3).
2. Nhân viên mở web → tab **Nhân viên** → nhập username + mật khẩu tự
   chọn → bấm Đăng nhập.
3. Lần đầu: app tạo Auth user + gắn vào hàng (chỉ gắn được khi hàng còn
   trống và email trùng — chống cướp hàng của người khác, xem
   `supabase/README.md`).
4. Màn **Đổi mật khẩu lần đầu** hiện ra → nhập mật khẩu hiện tại +
   mật khẩu mới (từ 8 ký tự) → vào hệ thống.
5. Cầu nối: nhân viên chạy `bash install.sh` trong `kit/`, nhập Project
   URL + anon key + username + mật khẩu (xem mục 3).

### 2.5. Đặt ngân sách token theo từng người

**Không có mức chung cố định** (quyết định 29/10/2026 23:23). Giám đốc tự đặt
và điều chỉnh mức cho từng nhân viên, lúc nào cũng được (màn Ngân sách).
Mức thật đã cấp cho tài khoản điều phối: **5.000.000.000 token**. Chạm 80% →
cảnh báo; chạm 100% → báo ngay cho Giám đốc (tên, mức đã dùng, việc dở) +
cho nhân viên nghỉ ngay đến khi Giám đốc cấp thêm (+50%) hoặc cho nghỉ hẳn.

### 2.6. Dùng hộp phê duyệt — nơi duy nhất cần kiểm tra

Hộp phê duyệt (màn Phê duyệt) nhận **MỌI yêu cầu cần quyền của MỌI tài khoản
Muse**: đăng nhập, tải file xuống, cài đặt chương trình/ứng dụng, gửi tin ra
ngoài nhóm, xoá dữ liệu, đổi cài đặt tài khoản/bảo mật, truy cập dữ liệu ngoài
phạm vi việc, mọi chi tiêu. Yêu cầu tới qua cầu nối/API (kèm người yêu cầu,
loại hành động, đối tượng/tài nguyên, lý do, bối cảnh) → hiện thành thẻ
Duyệt/Từ chối + đèn báo đỏ trên nhân vật trong văn phòng 3D + banner số lượng
đang chờ. Chỉ Giám đốc/Leader bấm được; cấm tự duyệt (chặn ở cả policy RLS
lẫn app); kết quả trả về qua Realtime; nhật ký đầy đủ. **Giám đốc chỉ cần
kiểm tra tại đây — không cần mở app Muse để thấy các yêu cầu quyền.**
Duyệt việc ở cột "Chờ duyệt" (Kanban) chỉ là một tập con. Hộp này không chọc
vào thẻ phê duyệt riêng của app Muse.

## 3. Phía nhân viên — cài cầu nối để nối vào hệ thống

Mỗi nhân viên cài **một chương trình cầu nối mỏng** (`kit/bridge.js`) trên máy
của mình để nối tài khoản Muse vào hệ thống. Cầu nối chỉ giữ kết nối, nhận
sự kiện, đẩy heartbeat — không chứa logic nghiệp vụ. Không cần cài thêm gói
nào (Node.js 22+ đã có sẵn fetch + WebSocket).

### 3.1. Cài đặt (5 phút)

1. Giám đốc gửi cho bạn: **Supabase Project URL + anon key** + **username**
   của bạn (riêng tư).
2. Lấy thư mục `kit/` (từ repo), chạy:
   - Linux/macOS: `bash install.sh`
   - Windows: chạy `install.bat`
3. Nhập 4 thứ khi được hỏi: Project URL, anon key, username, mật khẩu
   (nhập không hiện màn hình). Trình cài đặt tự đăng ký chạy nền + tự
   khởi động lại.
4. Kiểm tra: cầu nối in "Đã nối kênh Realtime." là xong (nếu WebSocket
   không nối được, cầu nối tự dùng thăm dò REST 60s — vẫn chạy, chỉ chậm
   hơn).

Chạy bằng tay: `node bridge.js --config config.json` (file `config.json` do
trình cài đặt tạo, quyền đọc chỉ mình bạn). Mẫu trống xem
`kit/config.example.json` — **không có mật khẩu thật trong đó**.

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

Trong web: việc và tin nhắn `[ASK:Tên]` đều có trường "link đính kèm" —
link hiện dạng bấm được và ghi vào luồng việc/nhật ký. Không có hệ thống
tải file lên — chỉ dùng link.

### 3.4. Khắc phục sự cố (nhân viên)

| Triệu chứng | Làm gì |
|---|---|
| Cầu nối thử lại kết nối liên tục | Kiểm tra mạng + Supabase (`curl <Project URL>/auth/v1/health`). Cầu nối tự hồi phục có lùi dần, đồng thời dùng thăm dò REST 60s — đợi mạng về, đừng chạy 2 bản cùng lúc. |
| Heartbeat bị từ chối (401/403) | Mật khẩu sai, tài khoản bị khoá/xoá, hoặc hàng staff chưa gắn đúng → nhờ Giám đốc kiểm tra. |
| Cầu nối báo "đang nghỉ" | Đã chạm ngân sách → dừng làm việc, chờ Giám đốc cấp thêm hoặc cho nghỉ hẳn. |
| Cầu nối báo "bắt buộc đổi mật khẩu" | Đổi mật khẩu trên web trước rồi chạy lại cầu nối. |
| Quên mật khẩu đăng nhập web | Nhờ Giám đốc đặt cờ bắt đổi — bạn sẽ phải đổi mật khẩu ở lần đăng nhập tiếp theo (cần nhớ mật khẩu hiện tại để đổi; quên hẳn thì Giám đốc đặt lại trong Dashboard → Authentication). |
| Nghi lộ mật khẩu | Báo Giám đốc ngay để đặt cờ bắt đổi / khoá tài khoản. |

## 4. Vận hành hằng ngày (tóm tắt)

1. Giám đốc mở trung tâm điều hành (web) → văn phòng 3D cho biết ai đang làm
   gì; banner đỏ cho biết có yêu cầu chờ duyệt; banner ngân sách cho biết ai
   chạm mức.
2. Việc mới: Giám đốc thêm ở màn Việc → người phụ trách nhận (khoá nguyên tử
   qua cập nhật có điều kiện) → làm → trình → Giám đốc/Leader duyệt trên
   thẻ → Hoàn thành.
3. Họp: nút "Gọi họp team" → cả đội về phòng họp 3D → biên bản → việc phát
   sinh tạo ngay từ biên bản.
4. Mọi quyết định duyệt, thay đổi tổ chức, ngân sách đều vào nhật ký — không
   có hành động nặc danh.
5. Sao lưu: màn Cài đặt & kit → "Tải file JSON" (xuất toàn bộ dữ liệu hệ
   thống). Sao lưu đầy đủ của project (kể cả Auth user) thực hiện trong
   Supabase Dashboard → Database → Backups (gói Free: sao lưu theo lịch
   của Supabase, khôi phục qua Dashboard).

## 5. Ba quyết định đã chốt (29/10/2026 23:23 + bổ sung 23:26–23:27)

1. Ngân sách: không mức chung — Giám đốc tự đặt/điều chỉnh theo từng người.
2. Hộp phê duyệt: nhận MỌI yêu cầu quyền của MỌI tài khoản Muse, gồm cả quyền
   đăng nhập, tải file, cài đặt ứng dụng — xem/duyệt hết trên hệ thống quản lý,
   không cần mở app Muse.
3. Báo khẩn: WhatsApp + banner trung tâm điều hành.
4. Mỗi Muse = 1 nhân viên có tài khoản/mật khẩu riêng + cài cầu nối để nối hệ
   thống; trao đổi tài liệu qua link công khai của Muse.

## 6. Giới hạn đã biết của bản Supabase (đọc trước khi vận hành)

- **Nhật ký do client tự ghi** (không còn máy chủ viết nhật ký): người dùng
  kỹ thuật có thể bỏ qua ghi nhật ký bằng SQL trực tiếp. RLS vẫn chặn sửa/
  xoá nhật ký và chặn giả actor khác — nhưng không chặn được việc "không
  ghi". Đây là đánh đổi của kiến trúc không máy chủ; nếu cần nhật ký chống
  chối bỏ tuyệt đối, phải thêm Database Trigger/Webhook ghi nhật ký ở phía
  máy chủ (việc tương lai, chưa làm).
- **Thu hồi phiên** chỉ làm được trong Supabase Dashboard (app không có
  quyền này bằng anon key).
- **Realtime gói Free** giới hạn ~200 kết nối đồng thời/project — đội 5
  người dùng thoải mái; project tạm dừng sau 7 ngày không dùng (dùng hằng
  ngày thì không dừng; khôi phục 1 cú nhấp, dữ liệu giữ 1 năm).
- **Đường WebSocket Realtime của cầu nối** (`kit/bridge.js`) viết theo giao
  thức Realtime v2 nhưng chưa kiểm chứng với project thật — nếu không khớp,
  cầu nối vẫn chạy bằng thăm dò REST 60s. Khi kiểm chứng xong, cập nhật
  `supabase/README.md`.
- **Web app là trang tĩnh**: mọi logic đều chạy ở trình duyệt + RLS. Đừng
  bao giờ đưa service_role key vào web/kit/docs — nó bỏ qua mọi chính sách.

---

## Phụ lục — Vỏ ứng dụng (rebuild 30/10/2026)

- Mở URL web là thấy **màn hình đăng nhập trước** (Giám đốc: mật khẩu +
  TOTP; nhân viên: tên đăng nhập + mật khẩu). Không nội dung nào hiện trước
  khi đăng nhập. Chưa có tài khoản Giám đốc thì bấm **"Cài đặt lần đầu"**
  (đặt mật khẩu + quét mã TOTP + xác minh mã, một lần duy nhất, không mật
  khẩu mặc định).
- Sau đăng nhập: **trung tâm điều phối** với thanh trạng thái trên cùng, menu
  trái (máy tính) / menu dưới cố định (điện thoại), các màn làm việc thật:
  Văn phòng 3D, **Phòng chat**, Việc, Phê duyệt, Nhân sự & chức vụ, Ngân sách,
  Nhật ký, Cài đặt & kit, Tài liệu thiết kế.
- **Phòng chat** là màn làm việc hạng nhất: phòng chung + nhắn trực tiếp, tin
  nhắn tới live qua Realtime không cần tải lại, nhắc tên `[ASK:Tên]`/`@Tên`
  báo ngay cho người được nhắc, tin gắn vào việc, link đính kèm (link công
  khai của Muse). Mọi tin đều mang danh tính người gửi đã xác thực.
- Văn phòng 3D: thư viện Three.js r160 đi kèm cùng nguồn trong `web/vendor/`
  (không CDN lúc chạy); nếu file đi kèm không tải được, tự chuyển sang
  **dạng danh sách 2D** đầy đủ thao tác — không bao giờ trắng trang.
- Chế độ chưa cấu hình Supabase (`web/config.js` còn chuỗi giữ chỗ): app
  chạy **bản DEMO ngoại tuyến** (localStorage, ghi nhãn DEMO ở mọi màn) —
  không bao giờ hiện dữ liệu mẫu như dữ liệu thật.
- Tải bộ kit ngay trong màn Cài đặt & kit (cần đăng nhập): `bridge.js`,
  `install.sh`, `install.bat`, `config.example.json`, `README.md` — tải
  thẳng file tĩnh từ repo (thư mục `kit/` cạnh `web/`).
