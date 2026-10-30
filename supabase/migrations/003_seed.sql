-- =============================================================================
-- 003_seed.sql — Dữ liệu gốc: chức vụ + 5 nhân viên + 2 rule
-- Chạy THỨ BA, sau 002_rls.sql. Chạy lại được (on conflict do nothing).
-- Sao y hệt seed của server/server.js (seedIfEmpty) để không đổi danh tính,
-- chức vụ, ngân sách nào khi chuyển backend.
-- QUAN TRỌNG: seed KHÔNG tạo tài khoản đăng nhập (không mật khẩu nào ở
-- đây). Tài khoản Auth được tạo ở lượt dùng đầu tiên:
--  * Giám đốc: mở web → "Cài đặt lần đầu" → đặt mật khẩu + quét TOTP
--    (app tự gắn Auth user vào hàng s-chung vì email trùng).
--  * Nhân viên: Giám đốc tạo hàng (đã có auth_email); nhân viên đăng nhập
--    lần đầu bằng username + mật khẩu tự chọn → app tự gắn Auth user vào
--    hàng (email trùng) và bắt đổi mật khẩu ngay vì must_change_password.
-- Vì vậy cột account của Giám đốc giữ nguyên như seed máy chủ cũ
-- (teddyssk559@gmail.com). Nếu Giám đốc muốn ẩn email này khỏi dữ liệu
-- hiển thị, đó là quyết định riêng — không tự đổi ở đây.
-- =============================================================================

insert into public.roles (id, name, level, can_approve, can_manage) values
  ('r-giamdoc', 'Giám đốc', 1, true, true),
  ('r-dieuphoi', 'Điều phối', 1, true, false),
  ('r-quanly', 'Quản lý', 2, true, false),
  ('r-thucthi', 'Thực thi', 3, false, false)
on conflict (id) do nothing;

insert into public.staff
  (id, name, account, role_id, status, budget, used, resting, rested_fully,
   must_change_password, disabled, auth_email, auth_user_id) values
  ('s-chung', 'Chung', 'teddyssk559@gmail.com', 'r-giamdoc', 'waiting', null, 0, false, false,
   true, false, 'director@office.internal', null),
  ('s-muse', 'Muse', 'muse-dieu-phoi', 'r-dieuphoi', 'working', 5000000000, 0, false, false,
   true, false, 'muse@office.internal', null),
  ('s-hung', 'Hùng', 'muse-hung', 'r-quanly', 'waiting', null, 0, false, false,
   true, false, 'hung@office.internal', null),
  ('s-tuan', 'Tuấn', 'muse-tuan', 'r-thucthi', 'waiting', null, 0, false, false,
   true, false, 'tuan@office.internal', null),
  ('s-linh', 'Linh', 'muse-linh', 'r-thucthi', 'waiting', null, 0, false, false,
   true, false, 'linh@office.internal', null)
on conflict (id) do nothing;

insert into public.rules (id, text) values
  ('rule-1', 'Mọi việc phải qua kiểm tra trước khi trình duyệt'),
  ('rule-2', 'Duyệt / trả lại phải có lý do; cấm tự duyệt việc của mình')
on conflict (id) do nothing;
