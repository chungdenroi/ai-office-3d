# Backend Supabase — Runbook + quyết định thiết kế

Web app giữ nguyên là trang tĩnh trên GitHub Pages (cùng URL) — chỉ backend
đổi từ máy chủ Node/SQLite/SSE (`server/`, nay là legacy) sang Supabase
(gói Free). Tài liệu vận hành cho người dùng cuối nằm ở
`docs/HUONG-DAN-CAI-DAT.md`; file này ghi quyết định kỹ thuật + bước triển
khai cho người làm migration/deploy.

## 1. Triển khai (người tạo project làm, theo đúng thứ tự)

1. Tạo project Supabase mới (gói Free).
2. Dashboard → Authentication → Sign In / Providers → Email: **TẮT
   "Confirm email"** (bắt buộc — hệ thống dùng email nội bộ, không gửi mail;
   để bật thì cả cài đặt Giám đốc lẫn kích hoạt nhân viên đều kẹt).
3. Dashboard → SQL Editor: chạy lần lượt
   `migrations/001_schema.sql` → `002_rls.sql` → `003_seed.sql` →
   `004_realtime.sql`. (Mỗi file đều chạy lại được: `if not exists`,
   `on conflict do nothing`, `drop trigger if exists`, kiểm tra
   publication trước khi thêm.)
4. Dashboard → Project Settings → API: copy **Project URL** + **anon
   public key** vào `web/config.js`, thay đúng 2 chuỗi giữ chỗ.
5. Deploy lên GitHub Pages bằng `gh-api put-file` (KHÔNG git push local):
   các file đổi trong đợt migration này — xem §6. Deploy xong kiểm chứng
   live: desktop + 390px thật (xem §5).

### Placeholder phải điền (không bịa giá trị)

| Placeholder | Lấy ở đâu | Điền vào |
|---|---|---|
| `YOUR_SUPABASE_URL_HERE` | Dashboard → Project Settings → API → Project URL | `web/config.js` → `OFFICE_SUPABASE.url` |
| `YOUR_SUPABASE_ANON_KEY_HERE` | Dashboard → Project Settings → API → anon public | `web/config.js` → `OFFICE_SUPABASE.anonKey` |

Khi 2 ô còn là chuỗi giữ chỗ, app tự chạy bản DEMO ngoại tuyến có nhãn
DEMO — không bao giờ hiện dữ liệu mẫu như dữ liệu thật.

## 2. Thiết kế Auth

- **Giám đốc**: một Auth user + TOTP MFA của Supabase Auth (AAL2).
  Email nội bộ cố định `director@office.internal` (không phải email thật,
  không gửi mail). App không hỏi email ở tab Giám đốc — chỉ hỏi mật khẩu +
  mã 6 số, email do app tự điền phía dưới. Cài đặt lần đầu tạo Auth user
  → gắn vào hàng `s-chung` (chỉ gắn khi `auth_user_id` còn NULL) → đăng ký
  TOTP → **xác minh TOTP ngay trong lượt cài đặt** (nút "Xác minh mã" chặn
  nút "tới màn hình đăng nhập" cho tới khi xác minh xong). Cài đặt dở dang
  thì lần đăng nhập sau hiện mã TOTP mới để quét + xác minh lại.
- **Nhân viên**: Auth user với email nội bộ `<username>@office.internal`
  (username chỉ chữ không dấu/số/dấu chấm/gạch dưới/gạch ngang; liên hệ
  thật nằm ở cột `account`). Giám đốc tạo hàng staff (đã có `auth_email`);
  nhân viên kích hoạt bằng đăng nhập lần đầu với username + mật khẩu tự
  chọn → app gắn Auth user vào hàng (chỉ gắn khi hàng còn trống VÀ email
  trùng JWT — xem §3) → cờ `must_change_password` bắt đổi mật khẩu ngay.
- **Mật khẩu ban đầu ở form tạo nhân viên KHÔNG được lưu.** Supabase Auth
  chỉ nhận mật khẩu do chính nhân viên đặt khi kích hoạt. Form vẫn có ô
  mật khẩu (tương thích UI cũ) nhưng adapter bỏ qua và hiện ghi chú kích
  hoạt cho Giám đốc — đừng hứa với nhân viên rằng mật khẩu form dùng được.
- **service_role key KHÔNG BAO GIỜ** xuất hiện ở web/kit/docs/file commit
  nào. Mọi thao tác đi bằng anon key + JWT + RLS.
- **Tài khoản Auth mồ côi** (ai đó tự đăng ký email lạ mà không có hàng
  staff): RLS chặn đọc mọi bảng (SELECT yêu cầu đã gắn staff), app từ chối
  đăng nhập ("chưa gắn với nhân viên nào"). Giám đốc dọn dẹp định kỳ trong
  Dashboard → Authentication. Lưu ý: lượt đăng ký thăm dò username sẽ tạo
  Auth user mồ côi (không gắn được hàng) — vô hại nhưng cần dọn.
- **Phiên Giám đốc 12 giờ của máy chủ cũ** → phiên Supabase Auth (JWT +
  refresh token tự làm mới, lưu ở localStorage key `office-supabase-auth`).
  Thu hồi phiên: Dashboard → Authentication (app không có quyền này bằng
  anon key — cố tình).

## 3. Thiết kế RLS (002_rls.sql) — đọc kỹ trước khi sửa policy

- Quyền tính theo **chức vụ** (`can_approve`/`can_manage`) qua 3 hàm
  `SECURITY DEFINER`: `current_staff_id()`, `current_can_approve()`,
  `current_can_manage()`. Hàm phải là SECURITY DEFINER vì chính nó đọc
  bảng staff mà người gọi đang bị RLS chặn.
- **Mọi SELECT yêu cầu đã gắn staff**, trừ một ngoại lệ: người vừa đăng ký
  Auth được đọc đúng hàng chưa gắn mà `auth_email` trùng email trong JWT
  của mình (để lượt kích hoạt kiểm tra + gắn được).
- **Cấm tự duyệt ở 2 lớp**: policy approvals (UPDATE yêu cầu: đang chờ +
  có quyền duyệt + `requester_id != current` + `decided_by = current`) và
  trigger `jobs_transition_guard` (duyệt/trả việc: có quyền duyệt + không
  phải người phụ trách). App cũng kiểm tra lại để báo lỗi đẹp.
- **Máy trạng thái việc** (trigger): Chờ nhận → Đang làm chỉ người phụ
  trách (claimed_by phải là chính mình); Đang làm → Chờ duyệt chỉ người
  phụ trách; Chờ duyệt → Hoàn thành/Đang làm chỉ người có quyền duyệt và
  không phải người phụ trách; còn lại → lỗi. Nhận việc nguyên tử vẫn giữ
  bằng cập nhật có điều kiện ở app (`WHERE status='Chờ nhận'`, 0 dòng =
  đã có người nhận trước) — trigger là lớp thứ hai.
- **Cột nhạy cảm** (`role_id`, `budget`, `disabled`, `auth_*`, ...):
  policy cho phép sửa DÒNG, trigger `staff_self_update_guard` chặn sửa
  CỘT — người thường chỉ được sửa `status`/`used` và tắt cờ bắt đổi mật
  khẩu (true → false); kích hoạt chỉ được gắn `auth_user_id` khi hàng còn
  trống, email giữ nguyên và trùng JWT, mọi cột khác không đổi (chống
  cướp hàng bằng cách đổi email trong cùng một câu lệnh). Giám đốc toàn
  quyền. Trigger bỏ qua khi không có JWT (bảo trì trực tiếp bằng
  Dashboard/SQL).
- **Tin nhắn**: SELECT chỉ phòng chung + tin mình gửi/nhận (đúng máy chủ
  cũ); INSERT chỉ với `from_id` là chính mình; không sửa/xoá.
- **Nhật ký**: INSERT chỉ với `actor_id` là chính mình; SELECT chỉ Giám
  đốc; không sửa/xoá. Giới hạn: nhật ký do client tự ghi — xem §7.
- **Grant**: chỉ cấp quyền bảng cho `authenticated`; `anon` không có gì
  (mọi truy vấn khi chưa đăng nhập trả 0 dòng hoặc bị chặn — `/api/health`
  công khai vẫn an toàn).
- **Realtime + RLS**: Realtime tôn trọng RLS của JWT trong `user_token`
  khi join kênh — mỗi client chỉ nhận sự kiện trên dòng mình được đọc.

## 4. Thiết kế Realtime (thay SSE)

- Web app mở **một kênh `office`** theo dõi `postgres_changes` trên 7 bảng
  (jobs, approvals, messages, meetings, staff, budget_events, alerts) —
  xem `web/supabase.js` (`connectRealtime`). Sự kiện đẩy về → `handleEvent`
  cũ trong `web/app.js` dùng lại (ánh xạ snake_case → camelCase trước).
- **Không thăm dò nhanh**: Realtime là kênh chính; thăm dò dự phòng chậm
  120 giây ở web, 60 giây ở cầu nối (bài học vụ Firebase 429).
- Gói Free giới hạn ~200 kết nối Realtime đồng thời/project — đội 5 người
  thoải mái. Project tạm dừng sau 7 ngày không dùng (khôi phục 1 cú nhấp,
  dữ liệu giữ 1 năm).

## 5. Kiểm chứng

### Đã kiểm chứng trong đợt migration (không cần project thật)

- `node --check` cho mọi file JS đổi/viết mới: `web/app.js`,
  `web/supabase.js`, `web/config.js`, `web/vendor/supabase.min.js`,
  `kit/bridge.js` — đều PASS.
- Thư viện Supabase JS UMD v2.118.0 vendored vào `web/vendor/`:
  218.544 byte, md5 `f7ee2a8cc50df657f40bff109b9a544d`, 0 tham chiếu CDN
  (UMD được chọn vì bản ESM tách nhiều package với bare import, không
  chạy offline nếu không có bundler).
- Đối chiếu cột: mọi cột adapter/kit dùng đều có trong `001_schema.sql`
  (staff, jobs, approvals, messages, meetings, rules, budget_events,
  alerts, audit_log, roles).
- Đối chiếu route: mọi đường `/api/...` mà `web/app.js` gọi đều có trong
  `web/supabase.js` (kể cả `/api/backup` xuất JSON đầy đủ cho Giám đốc,
  `/api/sessions/:id/revoke` trả hướng dẫn Dashboard thay vì giả vờ thu
  hồi).
- Rà soát: 0 `alert()`, 0 import CDN lúc chạy cho Supabase (tham chiếu
  CDN duy nhất còn lại trong `web/` là fallback three.js cũ, không đụng
  tới), không branding/tên "NEXUS" (từ này chỉ xuất hiện trong câu cấm ở
  comment/docs cũ), 0 service_role key, 0 mật khẩu/token thật trong mọi
  file đổi mới.

### Chưa kiểm chứng — parent làm sau khi project tồn tại

- [ ] Chạy 4 migration trên project thật (SQL Editor) — lỗi cú pháp chỉ
      lộ ở đây (không có Postgres local để chạy thử).
- [ ] Điền `web/config.js` + deploy + kiểm chứng live: đăng nhập Giám đốc
      (cài đặt lần đầu + TOTP), kích hoạt nhân viên, 9 màn hình, Realtime
      (gửi tin ở tab A → tab B nhận ngay), 390px không tràn, nhãn 3D
      không chồng ở 4 góc camera.
- [ ] Cầu nối: đăng nhập GoTrue + Realtime WebSocket với project thật
      (giao thức viết theo Realtime v2 nhưng chưa đối chiếu live; rơi về
      thăm dò 60s nếu không khớp).
- [ ] Headless DEMO-mode regression (9 màn, 0 lỗi JS, 1440 + 390) — chạy
      lại sau deploy vì lần chạy trước bị gián đoạn ở bước này (xem §7).

## 6. File đổi trong đợt migration

| File | Thay đổi |
|---|---|
| `supabase/migrations/001_schema.sql` | MỚI — lược đồ 10 bảng |
| `supabase/migrations/002_rls.sql` | MỚI — RLS + trigger + hàm trợ giúp |
| `supabase/migrations/003_seed.sql` | MỚI — 4 chức vụ + 5 nhân viên + 2 rule |
| `supabase/migrations/004_realtime.sql` | MỚI — publication + replica identity full |
| `supabase/README.md` | MỚI — file này |
| `web/config.js` | MỚI — Project URL + anon key (giữ chỗ) |
| `web/vendor/supabase.min.js` | MỚI — Supabase JS UMD v2.118.0 vendored |
| `web/supabase.js` | MỚI — tầng dữ liệu Supabase (dịch /api/... sang PostgREST/Auth/Realtime) |
| `web/app.js` | SỬA PHẪU THUẬT — route sang Supabase khi đã cấu hình, Realtime thay SSE, thăm dò 120s, màn cài đặt lần đầu (nút + xác minh TOTP), kit tải file tĩnh, ghi chú kích hoạt nhân viên |
| `web/index.html` | SỬA — thêm script config/vendor/supabase trước app.js; form xác minh TOTP; nút "Cài đặt lần đầu" |
| `kit/bridge.js` | VIẾT LẠI — GoTrue password grant + Realtime WS + thăm dò 60s |
| `kit/config.example.json` | MỚI — supabaseUrl/anonKey/username/password (mẫu trống) |
| `kit/install.sh`, `kit/install.bat` | SỬA — hỏi Supabase URL/anon key/username/mật khẩu; kiểm tra `/auth/v1/health` |
| `kit/README.md` | VIẾT LẠI — hướng Supabase |
| `docs/HUONG-DAN-CAI-DAT.md` | VIẾT LẠI — Supabase-first |
| `server/LEGACY.md` | MỚI — đánh dấu máy chủ cũ ngừng dùng |
| `BUILD-REPORT.md`, `PROGRESS.md` | Ghi thêm mục migration |

Không đổi: `web/style.css` (giao diện Obsidian giữ nguyên), code cảnh 3D
(trừ đường dữ liệu), `server/` (chỉ thêm LEGACY.md, không sửa code, không
chạy, không động vào `server/data/office.db`), site live (parent deploy).

## 7. Giới hạn + nợ kỹ thuật (nói thẳng)

- **SQL chưa chạy thật**: không có Postgres/Supabase CLI local, không cài
  thêm tool nặng, không tạo tài khoản cloud — 4 file migration chỉ được
  rà soát bằng đọc + đối chiếu cột, chưa qua parser Postgres. Lỗi (nếu có)
  sẽ lộ khi chạy trong SQL Editor — sửa ngay tại đó rồi đồng bộ lại file.
- **Headless DEMO regression chưa chạy xong** trong đợt này (lần chạy bị
  gián đoạn trước khi có kết quả) — parent chạy lại sau deploy, hoặc chạy
  ngay với bản DEMO (config còn giữ chỗ) trước khi điền config thật.
- **Nhật ký client-ghi**: xem §6 mục cuối của HUONG-DAN-CAI-DAT.md.
- **Mật khẩu Auth quên hẳn**: nhân viên quên mật khẩu hiện tại thì không
  tự đổi được (đổi mật khẩu cần mật khẩu hiện tại để kiểm tra) — Giám đốc
  đặt lại trong Dashboard → Authentication → Users → Reset password
  (gửi link đặt lại qua email thật — cần email thật của nhân viên, không
  phải email nội bộ; hoặc Giám đốc tạo lại Auth user).
- **Orphan Auth user**: xem §2.
- **Bridge WS**: xem §5 (chưa kiểm chứng live).
- **Seed giữ email Giám đốc** (`teddyssk559@gmail.com` ở cột `account` của
  `s-chung`, y hệt seed máy chủ cũ). Câu hỏi "có ẩn email này khỏi dữ liệu
  demo không" vẫn chưa được trả lời — migration KHÔNG tự đổi, vì đây là
  dữ liệu hệ thống thật, không phải seed demo công khai.
