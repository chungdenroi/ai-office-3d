-- =============================================================================
-- 005_claim_staff.sql — Gắn Auth user vào hàng staff bằng hàm SECURITY DEFINER
-- =============================================================================
-- VÌ SAO: "Cài đặt lần đầu" 06:00–06:01 31/10/2026 gãy 2 lần liên tiếp ở bước
-- gắn hàng s-chung: signUp thành công (tạo 2 Auth user mồ côi) nhưng câu
-- UPDATE staff trực tiếp từ app trả 0 dòng dù policy staff_update nhìn thì
-- cho phép (USING: auth_user_id IS NULL; WITH CHECK: auth_user_id = auth.uid()
-- AND auth_email = JWT email). Nguyên nhân chính xác chưa xác định được —
-- nghi ngờ tương tác giữa RLS (policy + RETURNING/select) với người dùng vừa
-- đăng ký chưa có hàng staff — nên bỏ hẳn đường UPDATE qua RLS, thay bằng
-- hàm SECURITY DEFINER (vượt RLS, cùng mẫu với current_staff_id() đã có).
-- Hàm vẫn giữ đủ 3 điều kiện an toàn: chỉ gắn hàng CHƯA gắn, email của hàng
-- phải TRÙNG email trong JWT của người gọi, và chỉ gắn đúng auth.uid() của
-- người gọi (không gắn hộ người khác). Trigger trg_staff_guard vẫn chạy trên
-- câu UPDATE bên trong hàm và vẫn chặn mọi sửa cột khác.
-- DÙNG Ở: setupDirector (gắn theo id 's-chung') + staffLoginViaAuth kích
-- hoạt lần đầu (gắn theo email). Trả về hàng vừa gắn (id, role_id,
-- must_change_password, disabled) hoặc rỗng nếu không gắn được.
-- =============================================================================

create or replace function public.claim_staff(p_staff_id text default null, p_email text default null)
returns table (id text, role_id text, must_change_password boolean, disabled boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  if v_uid is null or v_email is null then return; end if;
  return query
    update public.staff set auth_user_id = v_uid
    where auth_user_id is null
      and auth_email = v_email
      and (id = p_staff_id or (p_staff_id is null and auth_email = p_email))
    returning staff.id, staff.role_id, staff.must_change_password, staff.disabled;
end;
$$;

grant execute on function public.claim_staff(text, text) to authenticated;
