-- =============================================================================
-- 004_realtime.sql — Bật Realtime cho các bảng app theo dõi
-- Chạy THỨ TƯ (CUỐI CÙNG), sau 003_seed.sql.
-- App (web/supabase.js) mở MỘT kênh 'office' theo dõi postgres_changes trên
-- 7 bảng này, thay cho SSE của máy chủ cũ. KHÔNG thăm dò nhanh: Realtime là
-- kênh chính, app chỉ làm tươi chậm 120 giây dự phòng (bài học vụ
-- Firebase 429 do thăm dò dồn).
-- replica identity full: để sự kiện UPDATE/DELETE mang đủ hàng cũ/mới cho
-- client đối chiếu (đặc biệt khi RLS lọc cột — ở đây không lọc cột nên
-- default cũng đủ, nhưng full là chắc chắn nhất).
-- LƯU Ý QUOTA GÓI FREE: Realtime tính theo kết nối đồng thời (giới hạn
-- ~200 kết nối/project ở gói Free) — đội 5 người dùng thoải mái.
-- =============================================================================

-- Thêm vào publication (lặp lại được: bỏ qua bảng đã có trong publication).
do $$
declare t text;
begin
  for t in select unnest(array['jobs', 'approvals', 'messages', 'meetings', 'staff', 'budget_events', 'alerts']) loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

alter table public.jobs replica identity full;
alter table public.approvals replica identity full;
alter table public.messages replica identity full;
alter table public.meetings replica identity full;
alter table public.staff replica identity full;
alter table public.budget_events replica identity full;
alter table public.alerts replica identity full;
