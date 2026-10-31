-- =============================================================================
-- 006_log_audit.sql — Ghi nhật ký kiểm tra bằng hàm SECURITY DEFINER
-- =============================================================================
-- VÌ SAO: INSERT trực tiếp vào audit_log qua RLS bị chặn 403 dù policy
-- audit_insert (with check actor_id = current_staff_id()) nhìn thì cho phép,
-- và hàm current_staff_id() gọi qua RPC trả đúng 's-muse' (đã kiểm chứng
-- 31/10 08:25: RPC 200 "s-muse", SELECT staff 5 dòng, nhưng INSERT 403).
-- Đây là cùng lớp lỗi với vụ UPDATE staff 06:00 31/10 (đã sửa bằng
-- claim_staff): ghi trực tiếp qua RLS thất bại vì lý do chưa xác định được
-- ở tầng đánh giá policy — nên dùng hàm SECURITY DEFINER (vượt RLS) như
-- claim_staff. Hàm vẫn giữ đúng điều kiện an toàn: chỉ ghi với actor_id là
-- chính người gọi (actor_id = current_staff_id()), không ghi hộ người khác.
-- DÙNG Ở: writeAudit trong web/supabase.js (gọi rpc log_audit thay cho
-- insert trực tiếp vào audit_log).
-- =============================================================================

create or replace function public.log_audit(
  p_id text, p_action text, p_actor_id text, p_actor_type text,
  p_target text, p_result text, p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_staff text := public.current_staff_id();
begin
  if v_staff is null then return; end if;
  if p_actor_id is distinct from v_staff then return; end if;
  insert into public.audit_log (id, action, actor_id, actor_type, target, result, extra)
  values (p_id, p_action, p_actor_id, p_actor_type, p_target, p_result, coalesce(p_extra, '{}'::jsonb));
end;
$$;

grant execute on function public.log_audit(text, text, text, text, text, text, jsonb) to authenticated;
