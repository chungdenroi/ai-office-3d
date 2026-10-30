-- =============================================================================
-- 002_rls.sql — Row Level Security cho mọi bảng + trigger giữ bất biến
-- Chạy THỨ HAI, sau 001_schema.sql.
-- MÔ HÌNH PHÂN QUYỀN (giữ đúng server.js, nhưng kiểm tra ở DATABASE chứ
-- không chỉ ẩn nút ở UI):
--  * Quyền tính theo chức vụ (can_approve/can_manage) qua hàng staff + roles
--    của chính người đăng nhập — không ghi cứng theo tên người.
--  * Mọi SELECT (trừ ngoại lệ kích hoạt bên dưới) yêu cầu người đọc đã gắn
--    với một hàng staff (tài khoản Auth mồ côi, chưa gắn staff, không đọc
--    được gì — khác với mặc định "authenticated đọc được").
--  * CẤM TỰ DUYỆT ở 2 lớp: policy (approvals) + trigger (jobs).
--  * CỘT NHẠY CẢM (role_id, budget, disabled, auth_*) không sửa được bằng
--    UPDATE của người thường — policy cho phép sửa DÒNG, trigger chặn sửa
--    CỘT (Postgres không có policy theo cột cho UPDATE).
--  * service_role KHÔNG được cấp, KHÔNG xuất hiện ở app/kit/docs. Mọi thao
--    tác đi bằng anon key + JWT + RLS. Trigger bỏ qua khi không có JWT
--    (bảo trì trực tiếp bằng Dashboard/SQL với quyền postgres).
--  * anon (chưa đăng nhập) không có policy nào → mọi truy vấn trả 0 dòng
--    hoặc bị chặn. Vì vậy /api/health công khai vẫn an toàn khi chưa đăng nhập.
-- =============================================================================

alter table public.roles enable row level security;
alter table public.staff enable row level security;
alter table public.rules enable row level security;
alter table public.jobs enable row level security;
alter table public.approvals enable row level security;
alter table public.messages enable row level security;
alter table public.meetings enable row level security;
alter table public.budget_events enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;

-- Quyền truy cập bảng cho vai trò authenticated (chưa đăng nhập = anon:
-- không cấp gì). RLS vẫn là tuyến kiểm tra chính; grant chỉ mở cửa vào.
grant select, insert, update, delete on public.roles, public.staff, public.rules,
  public.jobs, public.approvals, public.messages, public.meetings,
  public.budget_events, public.alerts, public.audit_log to authenticated;

-- --- Hàm trợ giúp (SECURITY DEFINER để đọc staff/roles vượt RLS của chính
-- nó — nếu không, hàm sẽ tự chặn mình vì người gọi chưa đọc được staff).
create or replace function public.current_staff_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.staff where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_can_approve()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s join public.roles r on r.id = s.role_id
    where s.auth_user_id = auth.uid() and r.can_approve
  );
$$;

create or replace function public.current_can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s join public.roles r on r.id = s.role_id
    where s.auth_user_id = auth.uid() and r.can_manage
  );
$$;

grant execute on function public.current_staff_id() to authenticated;
grant execute on function public.current_can_approve() to authenticated;
grant execute on function public.current_can_manage() to authenticated;

-- --- ROLES: đọc khi đã gắn staff; ghi chỉ Giám đốc.
create policy roles_read on public.roles for select to authenticated
  using (public.current_staff_id() is not null);
create policy roles_write on public.roles for all to authenticated
  using (public.current_can_manage()) with check (public.current_can_manage());

-- --- STAFF: đọc khi đã gắn staff; NGOẠI LỆ kích hoạt — người vừa đăng ký
-- Auth được đọc đúng hàng chưa gắn mà auth_email trùng email trong JWT của
-- mình (để lượt kích hoạt kiểm tra + gắn được; hàng của người khác không
-- đọc được vì email không trùng).
create policy staff_read on public.staff for select to authenticated
  using (
    public.current_staff_id() is not null
    or (auth_user_id is null and auth_email = (auth.jwt() ->> 'email'))
  );
-- Ghi: Giám đốc toàn quyền; nhân viên tự sửa dòng mình (cột nào được sửa
-- do trigger staff_self_update_guard quyết); kích hoạt gắn auth_user_id
-- cho hàng còn trống mà email trùng JWT (kèm trigger chống đổi email).
create policy staff_insert on public.staff for insert to authenticated
  with check (public.current_can_manage());
create policy staff_update on public.staff for update to authenticated
  using (
    public.current_can_manage()
    or id = public.current_staff_id()
    or auth_user_id is null
  )
  with check (
    public.current_can_manage()
    or id = public.current_staff_id()
    or (auth_user_id = auth.uid() and auth_email = (auth.jwt() ->> 'email'))
  );
create policy staff_delete on public.staff for delete to authenticated
  using (public.current_can_manage());

-- Trigger chặn sửa cột nhạy cảm (xem giải thích ở đầu file).
create or replace function public.staff_self_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  -- Bảo trì trực tiếp không qua JWT: không chặn.
  if v_uid is null then return new; end if;
  -- Giám đốc: toàn quyền.
  if public.current_can_manage() then return new; end if;
  -- Kích hoạt: chỉ gắn auth_user_id cho hàng còn trống, email giữ nguyên
  -- và trùng JWT, mọi cột khác không đổi (chống cướp hàng bằng cách đổi
  -- email trong cùng một câu lệnh).
  if old.auth_user_id is null
    and new.auth_user_id = v_uid
    and new.auth_email = v_email
    and old.auth_email = new.auth_email
    and old.name = new.name and old.account = new.account
    and old.role_id = new.role_id and old.status = new.status
    and old.budget is not distinct from new.budget
    and old.used = new.used and old.resting = new.resting
    and old.rested_fully = new.rested_fully
    and old.must_change_password = new.must_change_password
    and old.disabled = new.disabled
  then return new; end if;
  -- Tự sửa: chỉ status/used và tắt cờ bắt đổi mật khẩu (true -> false).
  if old.id = public.current_staff_id()
    and new.id = old.id and new.name = old.name and new.account = old.account
    and new.role_id = old.role_id
    and new.budget is not distinct from old.budget
    and new.resting = old.resting and new.rested_fully = old.rested_fully
    and new.disabled = old.disabled
    and new.auth_email is not distinct from old.auth_email
    and new.auth_user_id is not distinct from old.auth_user_id
    and (new.must_change_password = old.must_change_password
         or (old.must_change_password and not new.must_change_password))
  then return new; end if;
  raise exception 'Không được sửa hồ sơ nhân viên này.';
end;
$$;
drop trigger if exists trg_staff_guard on public.staff;
create trigger trg_staff_guard before update on public.staff
  for each row execute function public.staff_self_update_guard();

-- --- RULES: đọc khi đã gắn staff; ghi chỉ Giám đốc.
create policy rules_read on public.rules for select to authenticated
  using (public.current_staff_id() is not null);
create policy rules_write on public.rules for all to authenticated
  using (public.current_can_manage()) with check (public.current_can_manage());

-- --- JOBS: đọc khi đã gắn staff. Tạo: Giám đốc/Leader (can_approve), luôn
-- ở trạng thái Chờ nhận. Sửa: Giám đốc, người phụ trách, người kiểm tra,
-- hoặc người có quyền duyệt — chuyển trạng thái do trigger dưới kiểm tra.
create policy jobs_read on public.jobs for select to authenticated
  using (public.current_staff_id() is not null);
create policy jobs_insert on public.jobs for insert to authenticated
  with check ((public.current_can_manage() or public.current_can_approve()) and status = 'Chờ nhận');
create policy jobs_update on public.jobs for update to authenticated
  using (
    public.current_can_manage() or public.current_can_approve()
    or assignee_id = public.current_staff_id()
    or reviewer_id = public.current_staff_id()
  )
  with check (
    public.current_can_manage() or public.current_can_approve()
    or assignee_id = public.current_staff_id()
    or reviewer_id = public.current_staff_id()
  );
create policy jobs_delete on public.jobs for delete to authenticated
  using (public.current_can_manage());

-- Máy trạng thái việc + cấm tự duyệt/trả việc của chính mình.
create or replace function public.jobs_transition_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me text := public.current_staff_id();
begin
  if auth.uid() is null then return new; end if;
  if old.status = new.status then
    -- Cập nhật không đổi trạng thái (tiến độ, link): phải là Giám đốc,
    -- người phụ trách, người kiểm tra, hoặc người có quyền duyệt.
    if public.current_can_manage() or public.current_can_approve()
      or old.assignee_id = v_me or old.reviewer_id = v_me
    then return new; end if;
    raise exception 'Không được sửa việc này.';
  end if;
  if old.status = 'Chờ nhận' and new.status = 'Đang làm' then
    -- Nhận việc: chỉ người phụ trách, và người nhận phải là chính mình.
    -- (Dấu ngoặc bắt buộc: AND ràng buộc chặt hơn OR trong SQL.)
    if old.assignee_id = v_me and new.claimed_by = v_me
      and (old.claimed_by is null or old.claimed_by = v_me)
    then return new; end if;
    raise exception 'Chỉ người phụ trách mới nhận được việc này.';
  end if;
  if old.status = 'Đang làm' and new.status = 'Chờ duyệt' then
    if old.assignee_id = v_me and new.claimed_by is not distinct from old.claimed_by
    then return new; end if;
    raise exception 'Chỉ người phụ trách mới trình được việc.';
  end if;
  if old.status = 'Chờ duyệt' and new.status = 'Hoàn thành' then
    -- Duyệt: có quyền duyệt VÀ không phải người phụ trách (cấm tự duyệt).
    if public.current_can_approve() and old.assignee_id is distinct from v_me
    then return new; end if;
    raise exception 'Cấm tự duyệt việc của chính mình.';
  end if;
  if old.status = 'Chờ duyệt' and new.status = 'Đang làm' then
    -- Trả lại: có quyền duyệt VÀ không phải người phụ trách.
    if public.current_can_approve() and old.assignee_id is distinct from v_me
    then return new; end if;
    raise exception 'Cấm tự duyệt việc của chính mình.';
  end if;
  raise exception 'Chuyển trạng thái việc không hợp lệ.';
end;
$$;
drop trigger if exists trg_jobs_transition on public.jobs;
create trigger trg_jobs_transition before update on public.jobs
  for each row execute function public.jobs_transition_guard();

-- --- APPROVALS: đọc khi đã gắn staff. Tạo: người yêu cầu phải là chính
-- mình. Quyết: đang chờ + có quyền duyệt + KHÔNG phải người yêu cầu +
-- decided_by phải là chính mình (cấm tự duyệt ở tầng DB, không chỉ app).
create policy approvals_read on public.approvals for select to authenticated
  using (public.current_staff_id() is not null);
create policy approvals_insert on public.approvals for insert to authenticated
  with check (requester_id = public.current_staff_id());
create policy approvals_update on public.approvals for update to authenticated
  using (
    status = 'pending' and public.current_can_approve()
    and requester_id is distinct from public.current_staff_id()
  )
  with check (
    status in ('approved', 'rejected')
    and decided_by = public.current_staff_id()
    and requester_id is distinct from public.current_staff_id()
  );
create policy approvals_delete on public.approvals for delete to authenticated
  using (public.current_can_manage());

-- --- MESSAGES: đọc khi đã gắn staff VÀ chỉ phòng chung + tin mình gửi/nhận
-- (đúng máy chủ cũ: tin riêng của người khác không hiện cho mọi người).
-- Ghi: chỉ gửi với from_id là chính mình. Không sửa/xoá.
create policy messages_read on public.messages for select to authenticated
  using (
    public.current_staff_id() is not null
    and (to_id = 'room' or from_id = public.current_staff_id() or to_id = public.current_staff_id())
  );
create policy messages_insert on public.messages for insert to authenticated
  with check (from_id = public.current_staff_id());

-- --- MEETINGS: đọc khi đã gắn staff. Gọi: Giám đốc/Leader. Sửa biên bản:
-- Giám đốc, Leader, hoặc người gọi họp. Xoá: Giám đốc.
create policy meetings_read on public.meetings for select to authenticated
  using (public.current_staff_id() is not null);
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.current_can_manage() or public.current_can_approve());
create policy meetings_update on public.meetings for update to authenticated
  using (
    public.current_can_manage() or public.current_can_approve()
    or called_by = public.current_staff_id()
  )
  with check (
    public.current_can_manage() or public.current_can_approve()
    or called_by = public.current_staff_id()
  );
create policy meetings_delete on public.meetings for delete to authenticated
  using (public.current_can_manage());

-- --- BUDGET_EVENTS / ALERTS: chỉ Giám đốc đọc. Ghi: Giám đốc, hoặc chính
-- nhân viên đó (cầu nối báo chạm ngưỡng qua heartbeat của mình).
create policy budget_events_read on public.budget_events for select to authenticated
  using (public.current_can_manage());
create policy budget_events_insert on public.budget_events for insert to authenticated
  with check (public.current_can_manage() or staff_id = public.current_staff_id());
create policy alerts_read on public.alerts for select to authenticated
  using (public.current_can_manage());
create policy alerts_insert on public.alerts for insert to authenticated
  with check (public.current_can_manage() or staff_id = public.current_staff_id());

-- --- AUDIT_LOG: chỉ Giám đốc đọc. Ghi: actor_id phải là chính mình.
-- Không sửa/xoá qua RLS (không có policy update/delete).
create policy audit_read on public.audit_log for select to authenticated
  using (public.current_can_manage());
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = public.current_staff_id());
