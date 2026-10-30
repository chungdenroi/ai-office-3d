/* CẤU HÌNH SUPABASE — ĐIỀN GIÁ TRỊ THẬT TRƯỚC KHI DÙNG HỆ THỐNG THẬT.
 *
 * Cách điền (người tạo project làm, không phải người dùng cuối):
 *   1. Tạo project Supabase mới (gói Free) + chạy 4 file trong
 *      supabase/migrations/ theo đúng thứ tự trong Supabase Dashboard
 *      → SQL Editor.
 *   2. Trong Dashboard → Project Settings → API: copy "Project URL" và
 *      "anon public" key vào 2 ô dưới, thay đúng 2 chuỗi giữ chỗ.
 *   3. Trong Dashboard → Authentication → Sign In / Providers → Email:
 *      TẮT "Confirm email" (không gửi email xác nhận — tài khoản kích hoạt
 *      bằng tên đăng nhập nội bộ, xem supabase/README.md).
 *
 * AN TOÀN:
 *   - Chỉ điền ANON key (khóa công khai, dùng chung với RLS). KHÔNG BAO
 *     GIỜ điền service_role key vào đây, vào code, vào kit hay vào tài
 *     liệu — service_role bỏ qua mọi chính sách RLS, lộ ra là mất hệ thống.
 *   - Khi 2 ô dưới còn là chuỗi giữ chỗ, app tự chạy bản DEMO ngoại tuyến
 *     có ghi nhãn DEMO, không bao giờ hiện dữ liệu mẫu như dữ liệu thật.
 */
window.OFFICE_SUPABASE = {
  url: 'https://unfcixatuhypjyqislvb.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZmNpeGF0dWh5cGp5cWlzbHZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNzEyMjIsImV4cCI6MjEwODk0NzIyMn0.YigfXUaL9O_RMIxHag_ttT_dGsJuCMsLdYTwJBNPACw',
};
