-- =============================================================================
-- 008_revoke_anon_direct_access.sql — Thu hồi quyền truy cập trực tiếp
-- Giám đốc lệnh 31/10 11:41: trở lại trạng thái cũ (đăng nhập mật khẩu +
-- mã TOTP) — bỏ chế độ vào thẳng vì link public ai cũng vào được.
-- Đảo ngược migration 007: xoá các policy cho anon, thu hồi grant bảng.
-- Sau migration này, anon (chưa đăng nhập) lại bị RLS chặn như cũ: mọi
-- truy vấn trả 0 dòng hoặc bị chặn; chỉ phiên Auth (authenticated) mới
-- đọc/ghi được dữ liệu.
-- =============================================================================

drop policy if exists roles_anon on public.roles;
drop policy if exists staff_anon on public.staff;
drop policy if exists rules_anon on public.rules;
drop policy if exists jobs_anon on public.jobs;
drop policy if exists approvals_anon on public.approvals;
drop policy if exists messages_anon on public.messages;
drop policy if exists meetings_anon on public.meetings;
drop policy if exists budget_events_anon on public.budget_events;
drop policy if exists alerts_anon on public.alerts;
drop policy if exists audit_log_anon on public.audit_log;

revoke select, insert, update, delete on public.roles, public.staff, public.rules,
  public.jobs, public.approvals, public.messages, public.meetings,
  public.budget_events, public.alerts, public.audit_log from anon;

revoke execute on function public.current_staff_id() from anon;
revoke execute on function public.current_can_approve() from anon;
revoke execute on function public.current_can_manage() from anon;
revoke execute on function public.claim_staff(text, text) from anon;
revoke execute on function public.log_audit(text, text, text, text, text, text, jsonb) from anon;
