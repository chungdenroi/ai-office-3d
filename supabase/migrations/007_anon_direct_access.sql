-- =============================================================================
-- 007_anon_direct_access.sql — Cho phép truy cập trực tiếp không cần đăng nhập
-- Giám đốc lệnh 31/10 10:08: bỏ nút đăng nhập, vào thẳng hệ thống.
-- Lý do: Supabase Auth bị chặn trên mạng/PC công ty (REST vẫn nối được nhưng
-- /auth/v1/token không qua được), nên đăng nhập bằng Auth không thể chạy ở đó.
-- Cách làm: mở RLS cho vai trò anon (chưa đăng nhập) trên mọi bảng để app
-- đọc/ghi được bằng anon key mà không cần JWT.
--
-- CẢNH BÁO BẢO MẬT: sau migration này, bất kỳ ai có anon key + URL đều đọc/
-- ghi được toàn bộ dữ liệu (nhân sự, việc, tin nhắn, phê duyệt, ngân sách,
-- nhật ký). Đây là đánh đổi theo lệnh của Giám đốc (muốn vào thẳng, không
-- đăng nhập). Muốn bảo mật lại thì revert migration này + bật lại đăng nhập.
-- =============================================================================

-- Cấp quyền bảng cho anon (RLS vẫn là tuyến kiểm tra chính; grant chỉ mở cửa vào).
grant select, insert, update, delete on public.roles, public.staff, public.rules,
  public.jobs, public.approvals, public.messages, public.meetings,
  public.budget_events, public.alerts, public.audit_log to anon;

-- Mở policy cho anon trên mọi bảng (policy cũ cho authenticated vẫn giữ nguyên;
-- RLS cho phép khi BẤT KỲ policy nào thỏa, nên thêm policy anon là đủ).
create policy roles_anon on public.roles for all to anon using (true) with check (true);
create policy staff_anon on public.staff for all to anon using (true) with check (true);
create policy rules_anon on public.rules for all to anon using (true) with check (true);
create policy jobs_anon on public.jobs for all to anon using (true) with check (true);
create policy approvals_anon on public.approvals for all to anon using (true) with check (true);
create policy messages_anon on public.messages for all to anon using (true) with check (true);
create policy meetings_anon on public.meetings for all to anon using (true) with check (true);
create policy budget_events_anon on public.budget_events for all to anon using (true) with check (true);
create policy alerts_anon on public.alerts for all to anon using (true) with check (true);
create policy audit_log_anon on public.audit_log for all to anon using (true) with check (true);

-- Cho anon gọi được các hàm trợ giúp (để app không lỗi khi chưa đăng nhập).
grant execute on function public.current_staff_id() to anon;
grant execute on function public.current_can_approve() to anon;
grant execute on function public.current_can_manage() to anon;
grant execute on function public.claim_staff(text, text) to anon;
grant execute on function public.log_audit(text, text, text, text, text, text, jsonb) to anon;
