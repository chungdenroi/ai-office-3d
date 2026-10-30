-- =============================================================================
-- 001_schema.sql — Lược đồ hệ thống AI nhân viên (bản Supabase)
-- Chạy ĐẦU TIÊN trong Supabase Dashboard → SQL Editor.
-- Dịch từ server/server.js (máy chủ Node cũ, nay là legacy): cùng tên thực
-- thể, cùng trạng thái việc, cùng ngữ nghĩa ngân sách/phê duyệt. Máy chủ cũ
-- dùng kho tài liệu tự do; ở đây chuẩn hoá thành bảng quan hệ để RLS kiểm
-- tra được từng dòng (xem 002_rls.sql).
-- Quy ước: id dạng text do app tự sinh (giữ đúng id 's-chung', 'r-giamdoc'
-- của bản cũ để không vỡ link/bookmark); thời gian timestamptz UTC.
-- KHÔNG chứa secret/key/mật khẩu nào. Tài khoản đăng nhập nằm ở Auth của
-- Supabase, chỉ gắn vào staff qua auth_user_id (xem 003_seed.sql).
-- =============================================================================

-- Chức vụ: quyền tính theo dữ liệu chức vụ, không ghi cứng theo tên người.
create table if not exists public.roles (
  id text primary key,
  name text not null,
  level integer not null default 3,
  can_approve boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nhân viên. auth_email là định danh đăng nhập NỘI BỘ dạng email
-- (<username>@office.internal, KHÔNG phải email thật, không gửi mail).
-- auth_user_id gắn với Supabase Auth; NULL nghĩa là chưa kích hoạt.
-- must_change_password: bắt đổi mật khẩu ở lần đăng nhập đầu (giữ đúng
-- ngữ nghĩa máy chủ cũ). disabled: khoá tài khoản.
create table if not exists public.staff (
  id text primary key,
  name text not null,
  account text not null default '',
  role_id text references public.roles (id),
  status text not null default 'waiting' check (status in ('waiting', 'working', 'resting')),
  budget bigint,
  used bigint not null default 0 check (used >= 0),
  resting boolean not null default false,
  rested_fully boolean not null default false,
  must_change_password boolean not null default true,
  disabled boolean not null default false,
  auth_email text unique,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rules (
  id text primary key,
  text text not null,
  created_at timestamptz not null default now()
);

-- Việc. Trạng thái đúng 4 cột của máy chủ cũ.
-- assignee/reviewer/claimed_by/created_by: xoá nhân viên thì để NULL (UI
-- hiện "(đã xoá)") thay vì xoá cả việc — đúng hành vi kho tài liệu cũ.
create table if not exists public.jobs (
  id text primary key,
  name text not null,
  "desc" text not null default '',
  rule_id text references public.rules (id) on delete set null,
  assignee_id text references public.staff (id) on delete set null,
  reviewer_id text references public.staff (id) on delete set null,
  status text not null default 'Chờ nhận'
    check (status in ('Chờ nhận', 'Đang làm', 'Chờ duyệt', 'Hoàn thành')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  claimed_by text references public.staff (id) on delete set null,
  links jsonb not null default '[]'::jsonb,
  created_by text references public.staff (id) on delete set null,
  submitted_at timestamptz,
  submit_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Yêu cầu phê duyệt. Lý do bắt buộc ở tầng app; decided_by != requester
-- được chặn ở cả policy RLS (002) lẫn app.
create table if not exists public.approvals (
  id text primary key,
  requester_id text references public.staff (id) on delete set null,
  action text not null,
  target text not null default '',
  reason text not null,
  context text not null default '',
  job_id text references public.jobs (id) on delete set null,
  source text not null default 'api',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by text references public.staff (id) on delete set null,
  decided_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tin nhắn. to_id = 'room' (phòng chung) hoặc id nhân viên (tin riêng).
-- link: {url, title}. tagged_ids: id các nhân viên được nhắc ([ASK:Tên]/@Tên).
create table if not exists public.messages (
  id text primary key,
  from_id text references public.staff (id) on delete set null,
  to_id text not null,
  job_id text references public.jobs (id) on delete set null,
  text text not null,
  link jsonb,
  tagged_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Cuộc họp + biên bản. attendees: mảng id nhân viên lúc gọi họp.
create table if not exists public.meetings (
  id text primary key,
  title text not null,
  called_by text references public.staff (id) on delete set null,
  attendees jsonb not null default '[]'::jsonb,
  minutes text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sự kiện ngân sách: set (Giám đốc đặt), topup (+50%), warn (chạm 80%),
-- full (chạm 100% → tự nghỉ).
create table if not exists public.budget_events (
  id text primary key,
  staff_id text references public.staff (id) on delete cascade,
  kind text not null check (kind in ('set', 'topup', 'warn', 'full')),
  budget bigint,
  used bigint,
  note text,
  created_at timestamptz not null default now()
);

-- Cảnh báo (chủ yếu: chạm 100% ngân sách). Chỉ Giám đốc đọc (xem 002).
create table if not exists public.alerts (
  id text primary key,
  kind text not null,
  staff_id text references public.staff (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

-- Nhật ký kiểm toán. Ghi bởi client bằng JWT của chính người thao tác
-- (actor_id bắt buộc bằng người đăng nhập — xem policy 002); KHÔNG sửa/xoá
-- được qua RLS. Giới hạn đã biết: client tự ghi nên không chống được người
-- dùng cố tình bỏ qua ghi nhật ký bằng SQL trực tiếp — khác máy chủ cũ ở
-- điểm này, xem supabase/README.md.
create table if not exists public.audit_log (
  id text primary key,
  action text not null,
  actor_id text references public.staff (id) on delete set null,
  actor_type text,
  target text,
  result text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Tự cập nhật updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['roles', 'staff', 'jobs', 'approvals', 'meetings']) loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
