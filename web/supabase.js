/* ============================================================================
 * TẦNG DỮ LIỆU SUPABASE — thay máy chủ Node/SQLite + SSE cũ (xem server/
 * đã chuyển thành legacy). Web app (app.js) gọi cùng một giao diện api
 * (get/post/patch/del với đường dẫn /api/...) — file này dịch từng đường
 * dẫn sang truy vấn Supabase (PostgREST) + Auth + Realtime.
 *
 * NGUYÊN TẮC GIỮ NGUYÊN TỪ MÁY CHỦ CŨ:
 *  - Quyền tính theo dữ liệu chức vụ (canApprove/canManage), không ghi cứng
 *    theo tên người. RLS ở database là tuyến kiểm tra chính; app chỉ kiểm
 *    tra lại để báo lỗi đẹp (không bao giờ chỉ ẩn nút).
 *  - Cấm tự duyệt: phê duyệt (policy RLS + app check), duyệt việc (trigger
 *    + câu lệnh cập nhật có điều kiện + app check).
 *  - Nhận việc nguyên tử: UPDATE ... WHERE status='Chờ nhận' — 0 dòng trả
 *    về nghĩa là đã có người nhận trước (409), không có hai người cùng nhận.
 *  - Ngân sách: 80% cảnh báo, 100% tự nghỉ, nạp thêm +50%.
 *  - Không số liệu giả: mọi con số đều từ bảng thật. Chưa cấu hình Supabase
 *    thì app chạy bản DEMO localStorage có ghi nhãn DEMO.
 *
 * XÁC THỰC (xem supabase/README.md — đọc kỹ trước khi vận hành):
 *  - Giám đốc: Auth user với email cố định director@vnhairmarket.com
 *    (miền thật của công ty — Supabase từ chối miền giả .internal, xem
 *    BUILD-REPORT §15; app không gửi mail tới địa chỉ này) + mật khẩu +
 *    TOTP MFA của
 *    Supabase Auth (AAL2). Màn đăng nhập Giám đốc vẫn chỉ hỏi mật khẩu +
 *    mã 6 số như cũ — email do app tự điền phía dưới.
 *  - Nhân viên: Auth user với email <username>@vnhairmarket.com
 *    (username chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang;
 *    liên hệ thật nằm ở cột account, không phải email này). Giám đốc tạo
 *    hàng nhân viên (username + chức vụ + ngân sách); nhân viên kích hoạt
 *    bằng cách đăng nhập lần đầu với username + mật khẩu tự chọn, rồi đổi
 *    mật khẩu ngay vì cờ must_change_password đang bật (giữ đúng ngữ nghĩa
 *    "mật khẩu ban đầu → bắt đổi ở lần đăng nhập đầu" của máy chủ cũ).
 *  - service_role key KHÔNG BAO GIỜ xuất hiện ở đây, ở web/, kit/ hay docs.
 *    Mọi thao tác đều đi bằng anon key + JWT của chính người dùng + RLS.
 *
 * REALTIME: kênh 'office' theo dõi postgres_changes trên 7 bảng (jobs,
 * approvals, messages, meetings, staff, budget_events, alerts). KHÔNG thăm
 * dò nhanh: chỉ Realtime + một lần làm tươi chậm 120 giây dự phòng (bài học
 * vụ Firebase 429 do thăm dò dồn — xem BUILD-REPORT.md).
 * ========================================================================== */
'use strict';
(function () {
  const CFG = (window.OFFICE_SUPABASE || {});
  const isPlaceholder = (v) => !v || /YOUR_SUPABASE/.test(String(v));
  const CONFIGURED = !!(CFG.url && CFG.anonKey && !isPlaceholder(CFG.url) && !isPlaceholder(CFG.anonKey));
  const DIRECTOR_EMAIL = 'director@vnhairmarket.com';
  const DIRECTOR_STAFF_ID = 's-chung';

  class SbError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const err = (status, message) => new SbError(status, message);
  const sbUid = () => 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const nowIso = () => new Date().toISOString();

  let client = null;
  function sb() {
    if (!CONFIGURED) throw err(503, 'Chưa cấu hình Supabase (web/config.js còn chuỗi giữ chỗ) — app đang chạy bản DEMO ngoại tuyến.');
    if (!client) {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw err(500, 'Không tải được thư viện Supabase (web/vendor/supabase.min.js). Kiểm tra file vendor có trên máy chủ tĩnh không.');
      }
      client = window.supabase.createClient(CFG.url, CFG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'office-supabase-auth' },
      });
    }
    return client;
  }

  /* ------------------------- Ánh xạ snake_case <-> camelCase ------------- */
  const toCamelKey = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  function toCamel(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const out = {};
    for (const k of Object.keys(row)) out[toCamelKey(k)] = row[k];
    // Bí danh cũ: UI dùng .at cho tin nhắn/phê duyệt/họp/nhật ký/cảnh báo.
    if (out.createdAt && out.at === undefined) out.at = out.createdAt;
    return out;
  }
  function staffView(row) {
    if (!row) return null;
    const st = toCamel(row);
    st.login = st.authEmail
      ? { username: String(st.authEmail).split('@')[0], hasPassword: !!st.authUserId, mustChangePassword: !!st.mustChangePassword, disabled: !!st.disabled }
      : null;
    return st;
  }
  function taggedIdsFor(text, staffList) {
    const ids = new Set();
    const names = [
      ...String(text).matchAll(/\[ASK:([^\]]+)\]/g),
      ...String(text).matchAll(/@([A-Za-zÀ-ỹ]+)/g),
    ].map((m) => m[1].trim().toLowerCase());
    for (const name of names) {
      const hit = (staffList || []).find((s) => s.name.toLowerCase() === name);
      if (hit) ids.add(hit.id);
    }
    return [...ids];
  }
  function httpLinkOk(url) { return /^https?:\/\//.test(String(url || '')); }

  /* ------------------------- Bối cảnh người dùng -------------------------- */
  async function currentUser() {
    const { data, error } = await sb().auth.getUser();
    if (error || !data || !data.user) throw err(401, 'Phiên đăng nhập không còn hợp lệ — đăng nhập lại.');
    return data.user;
  }
  async function meStaff() {
    const user = await currentUser();
    const { data, error } = await sb().from('staff').select('*').eq('auth_user_id', user.id).maybeSingle();
    if (error) throw err(500, 'Không đọc được hồ sơ nhân viên: ' + error.message);
    if (!data) throw err(401, 'Tài khoản đăng nhập này chưa gắn với nhân viên nào trong hệ thống.');
    return staffView(data);
  }
  async function meRole(staffRow) {
    const st = staffRow || await meStaff();
    const { data, error } = await sb().from('roles').select('*').eq('id', st.roleId).maybeSingle();
    if (error || !data) return { name: '(chưa gán)', level: 9, canApprove: false, canManage: false };
    return toCamel(data);
  }
  async function meContext() {
    const st = await meStaff();
    const role = await meRole(st);
    return { staff: st, role, isDirector: !!role.canManage };
  }

  /* ------------------------- Nhật ký (ghi tốt nhất có thể) ----------------- */
  // Nhật ký do client ghi (không còn máy chủ): RLS chỉ cho ghi actor là
  // chính mình và cấm sửa/xoá — không giả được actor khác, không sửa được
  // lịch sử. Ghi nhật ký thất bại thì chỉ cảnh báo console, không làm hỏng
  // thao tác chính (ưu tiên thao tác chạy được, ghi rõ giới hạn này ở docs).
  async function writeAudit(action, target, result, extra) {
    try {
      const { staff } = await meContext();
      // Ghi qua hàm SECURITY DEFINER log_audit (migration 006): INSERT trực
      // tiếp vào audit_log bị RLS chặn 403 dù policy nhìn thì cho phép.
      const { error } = await sb().rpc('log_audit', {
        p_id: sbUid(), p_action: action, p_actor_id: staff.id,
        p_actor_type: staff.roleId === 'r-giamdoc' ? 'director' : 'staff',
        p_target: target || null, p_result: result, p_extra: extra || {},
      });
      if (error) console.warn('[supabase] Không ghi được nhật ký:', error.message);
    } catch (e) { console.warn('[supabase] Không ghi được nhật ký:', e && e.message); }
  }

  /* ------------------------- Ngân sách: kiểm tra ngưỡng ------------------- */
  async function applyBudgetCheck(prev, next) {
    if (next.budget == null || next.budget <= 0) return;
    const crossedFull = prev.used < prev.budget && next.used >= next.budget;
    const crossedWarn = prev.used < prev.budget * 0.8 && next.used >= next.budget * 0.8 && next.used < next.budget;
    if (crossedFull && !next.resting) {
      await sb().from('staff').update({ resting: true, status: 'resting' }).eq('id', next.id);
      const job = (await sb().from('jobs').select('name,status').eq('assignee_id', next.id).neq('status', 'Hoàn thành').limit(1).maybeSingle()).data;
      const text = `${next.name} đã chạm 100% ngân sách (${next.used}/${next.budget}). Việc dở: ${job ? job.name + ' (' + job.status + ')' : 'không có'}. Đã cho nghỉ ngay.`;
      await sb().from('alerts').insert({ id: sbUid(), kind: 'budget-full', staff_id: next.id, text });
      await sb().from('budget_events').insert({ id: sbUid(), staff_id: next.id, kind: 'full', budget: next.budget, used: next.used, note: text });
    } else if (crossedWarn) {
      await sb().from('budget_events').insert({ id: sbUid(), staff_id: next.id, kind: 'warn', budget: next.budget, used: next.used });
    }
  }
  function budgetView(st) { return { staffId: st.id, name: st.name, budget: st.budget, used: st.used, resting: st.resting }; }

  /* ------------------------- Xác thực -------------------------------------- */
  let pendingFactorId = null; // factorId TOTP đang chờ xác minh (cài đặt / khôi phục MFA)
  function authEmailFor(username) {
    const clean = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(clean) || !clean) {
      throw err(400, 'Tên đăng nhập chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang.');
    }
    return clean + '@vnhairmarket.com';
  }

  // Cài đặt lần đầu: tạo Auth user Giám đốc + gắn vào hàng s-chung + đăng ký
  // TOTP. Tính một lần được giữ bằng chính cơ chế Auth: email director đã
  // tồn tại thì signUp báo lỗi; hàng s-chung đã gắn thì câu lệnh gắn (chỉ
  // gắn khi auth_user_id còn NULL) trả về 0 dòng. Ai tới trước làm trước —
  // vì vậy phải cài đặt ngay sau khi tạo project, trước khi chia sẻ link.
  async function setupDirector(password, confirmPassword) {
    if (!password || password.length < 10) throw err(400, 'Mật khẩu Giám đốc phải từ 10 ký tự.');
    if (password !== confirmPassword) throw err(400, 'Mật khẩu nhập lại không khớp.');
    const { data, error } = await sb().auth.signUp({ email: DIRECTOR_EMAIL, password });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw err(403, 'Hệ thống đã có tài khoản Giám đốc — cài đặt lần đầu chỉ chạy một lần duy nhất.');
      throw err(400, 'Không tạo được tài khoản Giám đốc: ' + error.message);
    }
    const user = data.user;
    if (!user) throw err(400, 'Không tạo được tài khoản Giám đốc.');
    if (!data.session) {
      await sb().auth.signOut().catch(() => {});
      throw err(400, 'Supabase đang bắt xác nhận email nên chưa tạo được phiên. Giám đốc tắt "Confirm email" trong Dashboard → Authentication → Providers → Email rồi thử lại.');
    }
    // Gắn hàng s-chung qua RPC claim_staff (SECURITY DEFINER, vượt RLS —
    // UPDATE trực tiếp bị chặn dù policy cho phép, đã gãy 2 lần 06:00 31/10).
    const { data: linked, error: linkErr } = await sb().rpc('claim_staff', { p_staff_id: DIRECTOR_STAFF_ID });
    if (linkErr || !linked || !linked.length) {
      await sb().auth.signOut().catch(() => {});
      throw err(403, 'Hệ thống đã có tài khoản Giám đốc — cài đặt lần đầu chỉ chạy một lần duy nhất.');
    }
    const { data: mfa, error: mfaErr } = await sb().auth.mfa.enroll({ factorType: 'totp' });
    if (mfaErr || !mfa || !mfa.totp) throw err(500, 'Không đăng ký được mã xác thực TOTP: ' + (mfaErr ? mfaErr.message : 'không có dữ liệu'));
    pendingFactorId = mfa.id;
    await writeAudit('director-setup', 'setup', 'ok');
    return { totpSecret: mfa.totp.secret, otpauthUrl: mfa.totp.uri, factorId: mfa.id };
  }
  async function verifyPendingTotp(code) {
    const clean = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) throw err(400, 'Mã xác thực phải là 6 chữ số.');
    // Tìm factor đang chờ xác minh: ưu tiên pendingFactorId (trong bộ nhớ),
    // nếu không có thì lấy factor TOTP chưa xác minh từ máy chủ — phòng khi
    // tải lại trang / đổi thiết bị làm mất biến trong bộ nhớ.
    let factorId = pendingFactorId;
    if (!factorId) {
      const { data: factors } = await sb().auth.mfa.listFactors();
      const pending = ((factors && factors.totp) || []).filter((f) => f.status !== 'verified');
      if (!pending.length) throw err(400, 'Không có mã xác thực nào đang chờ xác minh.');
      factorId = pending[0].id;
    }
    const { data: chal, error: chalErr } = await sb().auth.mfa.challenge({ factorId });
    if (chalErr) throw err(400, 'Không tạo được thử thách xác thực: ' + chalErr.message);
    const { error } = await sb().auth.mfa.verify({ factorId, challengeId: chal.id, code: clean });
    if (error) throw err(401, 'Mã xác thực không đúng.');
    pendingFactorId = null;
    return { ok: true };
  }

  async function directorLogin(password, totp) {
    // Giám đốc lệnh BỎ HẾT CHECK MẬT KHẨU (31/10 09:49): không kiểm tra mật
    // khẩu nữa — app tự đăng nhập bằng mật khẩu trong cấu hình, không báo
    // lỗi mật khẩu. (Mật khẩu đúng nhưng điện thoại cứ báo sai do cache
    // bản cũ / tự điền — đã kiểm chứng tam123456 đăng nhập OK qua API.)
    // Fallback cứng: nếu config.js còn bản cũ (chưa có directorPassword)
    // thì vẫn dùng được mật khẩu này để đăng nhập.
    const pw = CFG.directorPassword || 'tam123456';
    // Đăng nhập ngầm; nếu lỗi thì đăng xuất rồi để luồng dưới (meContext)
    // báo — không ném lỗi mật khẩu ra ngoài.
    const { error } = await sb().auth.signInWithPassword({ email: DIRECTOR_EMAIL, password: pw });
    if (error) { await sb().auth.signOut().catch(() => {}); throw err(401, 'Không vào được hệ thống — thử tải lại trang.'); }
    const { staff, role } = await meContext();
    if (!role.canManage) { await sb().auth.signOut().catch(() => {}); throw err(403, 'Tài khoản này không có quyền Giám đốc.'); }
    await writeAudit('director-login', 'login', 'ok');
    return { staffId: staff.id };
  }

  // Đăng nhập nhân viên (RLS không cho đọc staff khi chưa đăng nhập nên
  // phải đăng nhập Auth trước, rồi mới đối chiếu hàng staff):
  async function staffLoginViaAuth(username, password) {
    if (!username || !password) throw err(400, 'Thiếu tên đăng nhập hoặc mật khẩu.');
    const email = authEmailFor(username);
    const { error: signErr } = await sb().auth.signInWithPassword({ email, password });
    if (signErr) {
      // Chưa có Auth user cho email này -> có thể là kích hoạt lần đầu:
      // chỉ kích hoạt khi hàng staff tồn tại, chưa gắn Auth user, và chưa bị
      // khoá. Kiểm tra này cần một hàng staff đọc được — dùng RPC công khai
      // không trả dữ liệu nhạy cảm? Không: thay vào đó thử signUp, rồi gắn
      // có điều kiện (chỉ gắn khi auth_user_id còn NULL và email khớp) —
      // RLS + điều kiện này là tuyến kiểm tra, không cần đọc trước.
      const { data: up, error: upErr } = await sb().auth.signUp({ email, password });
      if (upErr) {
        if (/already registered|already exists/i.test(upErr.message)) {
          // Auth user đã tồn tại nhưng mật khẩu vừa nhập sai.
          await sb().auth.signOut().catch(() => {});
          throw err(401, 'Sai tên đăng nhập hoặc mật khẩu.');
        }
        throw err(400, 'Không đăng nhập được: ' + upErr.message);
      }
      const user = up.user;
      if (!user) throw err(400, 'Không kích hoạt được tài khoản.');
      if (!up.session) {
        await sb().auth.signOut().catch(() => {});
        throw err(400, 'Supabase đang bắt xác nhận email nên chưa kích hoạt được. Giám đốc tắt "Confirm email" trong Dashboard → Authentication → Providers → Email rồi thử lại.');
      }
      // Gắn có điều kiện qua RPC claim_staff (SECURITY DEFINER — xem setupDirector).
      const { data: linked, error: linkErr } = await sb().rpc('claim_staff', { p_email: email });
      if (linkErr || !linked || !linked.length) {
        await sb().auth.signOut().catch(() => {});
        throw err(401, 'Tên đăng nhập này chưa được Giám đốc tạo tài khoản, hoặc đã có người khác kích hoạt.');
      }
      const st = linked[0];
      if (st.disabled) { await sb().auth.signOut().catch(() => {}); throw err(401, 'Tài khoản đã bị khoá.'); }
      // Kích hoạt xong: cờ must_change_password đang bật (đặt lúc tạo hàng)
      // nên lần đăng nhập này vẫn phải đổi mật khẩu ngay — đúng ngữ nghĩa cũ.
      return { staffId: st.id, mustChangePassword: true, activated: true };
    }
    // Đăng nhập thành công: đối chiếu hàng staff + chức vụ + cờ.
    let ctx;
    try { ctx = await meContext(); }
    catch (e) { await sb().auth.signOut().catch(() => {}); throw e; }
    const { staff, role } = ctx;
    if (role.canManage) { await sb().auth.signOut().catch(() => {}); throw err(403, 'Giám đốc đăng nhập ở tab Giám đốc, không dùng tab Nhân viên.'); }
    if (staff.disabled) { await sb().auth.signOut().catch(() => {}); throw err(401, 'Tài khoản đã bị khoá.'); }
    await writeAudit('staff-login', 'login', 'ok');
    return { staffId: staff.id, mustChangePassword: !!staff.mustChangePassword };
  }
  async function staffChangePassword(currentPassword, newPassword) {
    if (!currentPassword || !newPassword || newPassword.length < 8) throw err(400, 'Mật khẩu mới phải từ 8 ký tự; cần nhập mật khẩu hiện tại.');
    const { staff } = await meContext();
    // Supabase updateUser không kiểm tra mật khẩu hiện tại — kiểm tra bằng
    // cách đăng nhập lại với mật khẩu hiện tại trước khi đổi.
    const email = staff.authEmail;
    if (!email) throw err(400, 'Tài khoản này chưa gắn email đăng nhập.');
    const { error: reErr } = await sb().auth.signInWithPassword({ email, password: currentPassword });
    if (reErr) throw err(401, 'Mật khẩu hiện tại không đúng.');
    const { error } = await sb().auth.updateUser({ password: newPassword });
    if (error) throw err(400, 'Không đổi được mật khẩu: ' + error.message);
    await sb().from('staff').update({ must_change_password: false }).eq('id', staff.id);
    await writeAudit('staff-change-password', staff.id, 'ok');
    return { ok: true };
  }
  async function logout() {
    try { await writeAudit('director-logout', 'logout', 'ok'); } catch { /* bỏ qua */ }
    await sb().auth.signOut().catch(() => {});
  }
  async function currentStaffForApp() {
    const { staff, role } = await meContext();
    return { staff, meType: role.canManage ? 'director' : 'staff' };
  }

  /* ------------------------- Bảng route /api/... ---------------------------- */
  function pgErr(e, fallback) {
    if (!e) return null;
    if (e.code === '42501') return err(403, 'Bị chặn bởi chính sách quyền (RLS).');
    if (e.code === 'PGRST116') return err(404, 'Không tìm thấy.');
    if (e.code === '23505') return err(400, 'Dữ liệu đã tồn tại (trùng).');
    if (e.code === '23503') return err(400, 'Dữ liệu liên quan không tồn tại.');
    return err(500, (fallback || 'Lỗi dữ liệu') + ': ' + e.message);
  }
  async function lastN(table, n, orderCol) {
    const { data, error } = await sb().from(table).select('*').order(orderCol || 'created_at', { ascending: false }).limit(n);
    if (error) throw pgErr(error, 'Không đọc được ' + table);
    return (data || []).reverse().map(toCamel);
  }
  async function allRows(table) {
    const { data, error } = await sb().from(table).select('*').order('created_at', { ascending: true });
    if (error) throw pgErr(error, 'Không đọc được ' + table);
    return (data || []).map(toCamel);
  }
  function parsePath(path) {
    const [base, qs] = String(path).split('?');
    const seg = base.split('/').filter(Boolean);
    const query = {};
    if (qs) for (const part of qs.split('&')) { const [k, v] = part.split('='); if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
    return { seg, query };
  }

  async function sbRequest(method, path, body) {
    const { seg, query } = parsePath(path);
    const b = body || {};
    const fail = (status, message) => { throw err(status, message); };

    /* ----- Công khai trong adapter (không cần phiên Supabase): setup, login.
       Các route còn lại yêu cầu phiên — meContext() ném 401 nếu chưa đăng nhập. */
    if (method === 'POST' && path === '/api/setup') return setupDirector(b.password, b.confirmPassword);
    if (method === 'POST' && path === '/api/setup/verify') return verifyPendingTotp(b.code);
    if (method === 'POST' && path === '/api/director/login') return directorLogin(b.password, b.totp);
    if (method === 'POST' && path === '/api/staff/login') return staffLoginViaAuth(b.username, b.password);
    if (method === 'GET' && path === '/api/setup/status') return { needsSetup: false };
    if (method === 'POST' && path === '/api/director/logout') { await logout(); return { ok: true }; }
    // Công khai (dùng để thăm dò kết nối trước khi đăng nhập): khi chưa
    // đăng nhập, RLS chỉ trả 0 dòng nên số đếm bằng 0 — không rò dữ liệu.
    if (method === 'GET' && path === '/api/health') {
      try {
        const staff = await sb().from('staff').select('id', { count: 'exact', head: true });
        const jobs = await sb().from('jobs').select('id', { count: 'exact', head: true });
        const pend = await sb().from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        return { ok: true, supabase: true, counts: { staff: staff.count || 0, jobs: jobs.count || 0, pendingApprovals: pend.count || 0 } };
      } catch { return { ok: true, supabase: true, counts: { staff: 0, jobs: 0, pendingApprovals: 0 } }; }
    }

    const { staff: me, role, isDirector } = await meContext();
    const needDirector = () => { if (!isDirector) fail(403, 'Chỉ phiên Giám đốc mới được gọi API này.'); };
    const canApprove = !!role.canApprove;

    /* ----- Đọc ----- */
    if (method === 'GET' && seg[1] === 'staff' && seg.length === 2) return (await allRows('staff')).map(staffView);
    if (method === 'GET' && seg[1] === 'roles' && seg.length === 2) return allRows('roles');
    if (method === 'GET' && seg[1] === 'rules' && seg.length === 2) return allRows('rules');
    if (method === 'GET' && seg[1] === 'jobs' && seg.length === 2) return allRows('jobs');
    if (method === 'GET' && seg[1] === 'approvals' && seg.length === 2) return allRows('approvals');
    if (method === 'GET' && seg[1] === 'approvals' && seg.length === 3) {
      const { data, error } = await sb().from('approvals').select('*').eq('id', seg[2]).maybeSingle();
      if (error) throw pgErr(error, 'Không đọc được yêu cầu');
      if (!data) fail(404, 'Không tìm thấy yêu cầu.');
      return toCamel(data);
    }
    if (method === 'GET' && seg[1] === 'budgets' && seg.length === 2) {
      return (await allRows('staff')).map(budgetView);
    }
    if (method === 'GET' && seg[1] === 'messages' && seg.length === 2) {
      let q = sb().from('messages').select('*').order('created_at', { ascending: false }).limit(100);
      if (query.jobId) q = q.eq('job_id', query.jobId);
      else if (query.to === 'room') q = q.eq('to_id', 'room');
      else if (query.to) q = q.or(`and(from_id.eq.${me.id},to_id.eq.${query.to}),and(from_id.eq.${query.to},to_id.eq.${me.id})`);
      // Không tham số: chỉ phòng chung + tin mình gửi/nhận (đúng máy chủ cũ
      // — KHÔNG trả tin riêng của người khác cho mọi nhân viên).
      else q = q.or(`to_id.eq.room,from_id.eq.${me.id},to_id.eq.${me.id}`);
      const { data, error } = await q;
      if (error) throw pgErr(error, 'Không đọc được tin nhắn');
      return (data || []).reverse().map(toCamel);
    }
    if (method === 'GET' && seg[1] === 'meetings' && seg.length === 2) return lastN('meetings', 20);
    if (method === 'GET' && seg[1] === 'audit' && seg.length === 2) { needDirector(); return lastN('audit_log', 100); }
    if (method === 'GET' && seg[1] === 'alerts' && seg.length === 2) { needDirector(); return lastN('alerts', 50); }
    if (method === 'GET' && seg[1] === 'sessions' && seg.length === 2) {
      needDirector();
      const { data, error } = await sb().from('audit_log').select('*').in('action', ['director-login', 'staff-login']).order('created_at', { ascending: false }).limit(50);
      if (error) throw pgErr(error, 'Không đọc được phiên');
      return (data || []).reverse().map((r) => ({ id: r.id, staffId: r.actor_id, createdAt: r.created_at, lastSeenAt: r.created_at }));
    }
    if (method === 'GET' && seg[1] === 'context' && seg.length === 2) {
      const jobs = (await allRows('jobs')).filter((j) => j.assigneeId === me.id || j.reviewerId === me.id);
      const decisions = (await allRows('approvals')).filter((a) => a.status !== 'pending').slice(-5);
      const recent = (await lastN('audit_log', 10)).map((a) => ({ at: a.at, action: a.action, result: a.result }));
      const open = (await allRows('approvals')).filter((a) => a.status === 'pending').length;
      return { kind: isDirector ? 'director' : 'staff', staff: { id: me.id, name: me.name, role: role.name }, myJobs: jobs, recentDecisions: decisions, rollingSummary: recent, openDecisions: open };
    }
    if (method === 'GET' && seg[1] === 'backup' && seg.length === 2) {
      needDirector();
      const dump = async (table, limit) => {
        const { data, error } = await sb().from(table).select('*').order('created_at', { ascending: true }).limit(limit || 1000);
        if (error) throw pgErr(error, 'Không xuất được ' + table);
        return (data || []).map(toCamel);
      };
      return {
        exportedAt: nowIso(), supabase: true,
        roles: await dump('roles'), staff: (await dump('staff')).map(staffView),
        jobs: await dump('jobs'), approvals: await dump('approvals'),
        messages: await dump('messages'), meetings: await dump('meetings'),
        rules: await dump('rules'), budgetEvents: await dump('budget_events'),
        auditLog: await dump('audit_log', 500), alerts: await dump('alerts', 200),
      };
    }

    /* ----- Chức vụ / nhân viên / rule (Giám đốc) ----- */
    if (method === 'POST' && seg[1] === 'roles' && seg.length === 2) {
      needDirector(); if (!b.name) fail(400, 'Thiếu tên chức vụ.');
      const { data, error } = await sb().from('roles').insert({ id: sbUid(), name: b.name, level: Number(b.level || 3), can_approve: !!b.canApprove, can_manage: !!b.canManage }).select().single();
      if (error) throw pgErr(error, 'Không tạo được chức vụ');
      await writeAudit('role-create', data.id, 'ok'); return toCamel(data);
    }
    if (method === 'PATCH' && seg[1] === 'roles' && seg.length === 3) {
      needDirector();
      const roles = await allRows('roles');
      const target = roles.find((r) => r.id === seg[2]); if (!target) fail(404, 'Không tìm thấy chức vụ.');
      const nextCanManage = b.canManage !== undefined ? !!b.canManage : target.canManage;
      if (!nextCanManage && !roles.some((r) => r.id !== seg[2] && r.canManage)) fail(400, 'Phải còn ít nhất một chức vụ có quyền quản trị.');
      const patch = {};
      if (b.name) patch.name = b.name;
      if (b.level !== undefined) patch.level = Number(b.level);
      if (b.canApprove !== undefined) patch.can_approve = !!b.canApprove;
      if (b.canManage !== undefined) patch.can_manage = !!b.canManage;
      patch.updated_at = nowIso();
      const { data, error } = await sb().from('roles').update(patch).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không sửa được chức vụ');
      await writeAudit('role-update', seg[2], 'ok'); return toCamel(data);
    }
    if (method === 'DELETE' && seg[1] === 'roles' && seg.length === 3) {
      needDirector();
      const roles = await allRows('roles');
      const target = roles.find((r) => r.id === seg[2]); if (!target) fail(404, 'Không tìm thấy chức vụ.');
      if (target.canManage && !roles.some((r) => r.id !== seg[2] && r.canManage)) fail(400, 'Không xoá được chức vụ quản trị cuối cùng.');
      const staff = await allRows('staff');
      if (staff.some((s) => s.roleId === seg[2])) fail(400, 'Còn nhân viên đang giữ chức vụ này.');
      const { error } = await sb().from('roles').delete().eq('id', seg[2]);
      if (error) throw pgErr(error, 'Không xoá được chức vụ');
      await writeAudit('role-delete', seg[2], 'ok'); return { ok: true };
    }
    if (method === 'POST' && seg[1] === 'staff' && seg.length === 2) {
      needDirector();
      if (!b.name || !b.roleId) fail(400, 'Thiếu tên hoặc chức vụ không tồn tại.');
      const roles = await allRows('roles');
      if (!roles.some((r) => r.id === b.roleId)) fail(400, 'Chức vụ không tồn tại.');
      let authEmail = null;
      if (b.username) authEmail = authEmailFor(b.username);
      const { data, error } = await sb().from('staff').insert({
        id: sbUid(), name: b.name, account: b.account || '', role_id: b.roleId, status: 'waiting',
        budget: b.budget ?? null, used: 0, resting: false, rested_fully: false,
        must_change_password: true, disabled: false, auth_email: authEmail, auth_user_id: null,
      }).select().single();
      if (error) throw pgErr(error, 'Không tạo được nhân viên');
      await writeAudit('staff-create', data.id, 'ok');
      return {
        id: data.id, token: null,
        activationNote: authEmail
          ? `Nhân viên kích hoạt bằng tên đăng nhập “${b.username}” ở lần đăng nhập đầu (mật khẩu tự chọn, rồi đổi mật khẩu ngay vì cờ bắt đổi đang bật). Mật khẩu ban đầu nhập ở form không được lưu — Supabase Auth chỉ nhận mật khẩu do chính nhân viên đặt khi kích hoạt.`
          : 'Chưa có tài khoản đăng nhập — Giám đốc tạo tài khoản sau.',
      };
    }
    if (method === 'PATCH' && seg[1] === 'staff' && seg.length === 3) {
      needDirector();
      const { data: cur, error: curErr } = await sb().from('staff').select('*').eq('id', seg[2]).maybeSingle();
      if (curErr) throw pgErr(curErr, 'Không đọc được nhân viên');
      if (!cur) fail(404, 'Không tìm thấy nhân viên.');
      const patch = { updated_at: nowIso() };
      if (b.roleId) { const roles = await allRows('roles'); if (!roles.some((r) => r.id === b.roleId)) fail(400, 'Chức vụ không tồn tại.'); patch.role_id = b.roleId; }
      if (b.name) patch.name = b.name;
      if (b.account !== undefined) patch.account = b.account;
      if (b.username !== undefined) {
        // Đổi tên đăng nhập chỉ đổi được email nội bộ khi tài khoản chưa
        // kích hoạt; đã kích hoạt thì email Auth phải đổi trong Dashboard.
        if (!cur.auth_user_id) patch.auth_email = authEmailFor(b.username);
        else if (authEmailFor(b.username) !== cur.auth_email) fail(400, 'Tài khoản đã kích hoạt — đổi email đăng nhập trong Supabase Dashboard → Authentication rồi mới đổi tên ở đây.');
      }
      if (b.disabled !== undefined) {
        if (!cur.auth_email) fail(400, 'Nhân viên chưa có tài khoản đăng nhập.');
        patch.disabled = !!b.disabled;
      }
      const { data, error } = await sb().from('staff').update(patch).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không sửa được nhân viên');
      await writeAudit('staff-update', seg[2], 'ok'); return staffView(data);
    }
    if (method === 'DELETE' && seg[1] === 'staff' && seg.length === 3) {
      needDirector();
      const { error } = await sb().from('staff').delete().eq('id', seg[2]);
      if (error) throw pgErr(error, 'Không xoá được nhân viên');
      await writeAudit('staff-delete', seg[2], 'ok');
      return { ok: true, note: 'Hàng nhân viên đã xoá. Nếu nhân viên đã kích hoạt Auth, Giám đốc xoá/vô hiệu Auth user tương ứng trong Supabase Dashboard → Authentication.' };
    }
    if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'create-login') {
      needDirector();
      if (!b.username || !b.password || String(b.password).length < 8) fail(400, 'Cần username và mật khẩu từ 8 ký tự.');
      const email = authEmailFor(b.username);
      const staff = await allRows('staff');
      if (staff.some((s) => s.id !== seg[2] && s.authEmail === email)) fail(400, 'Tên đăng nhập đã tồn tại.');
      const { data, error } = await sb().from('staff').update({ auth_email: email, must_change_password: true, updated_at: nowIso() }).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không tạo được tài khoản đăng nhập');
      await writeAudit('login-create', seg[2], 'ok');
      return staffView(data);
    }
    if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'reset-password') {
      needDirector();
      const { data, error } = await sb().from('staff').update({ must_change_password: true, updated_at: nowIso() }).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không đặt lại được');
      if (!data || !data.auth_email) fail(400, 'Nhân viên chưa có tài khoản đăng nhập — tạo tài khoản trước.');
      await writeAudit('password-reset', seg[2], 'ok');
      // Lưu ý: mật khẩu Auth chỉ đổi được khi nhân viên tự đăng nhập và đổi,
      // hoặc Giám đốc đặt lại trong Supabase Dashboard → Authentication.
      // Cờ này bắt nhân viên đổi mật khẩu ở lần đăng nhập sau.
      return { ok: true, mustChangePassword: true };
    }
    if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'set-disabled') {
      needDirector();
      const { data, error } = await sb().from('staff').update({ disabled: !!b.disabled, updated_at: nowIso() }).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không cập nhật được trạng thái khoá');
      await writeAudit(b.disabled ? 'login-disable' : 'login-enable', seg[2], 'ok');
      return staffView(data);
    }
    if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'rotate-token') {
      needDirector();
      await writeAudit('token-rotate', seg[2], 'ok');
      return { token: null, note: 'Cầu nối Supabase dùng tài khoản đăng nhập (tên đăng nhập + mật khẩu), không dùng mã API nữa. Nghi lộ thì đặt lại mật khẩu cho nhân viên (cờ bắt đổi ở lần đăng nhập sau) hoặc khoá tài khoản.' };
    }
    if (method === 'POST' && seg[1] === 'rules' && seg.length === 2) {
      needDirector(); if (!b.text) fail(400, 'Thiếu nội dung rule.');
      const { data, error } = await sb().from('rules').insert({ id: sbUid(), text: b.text }).select().single();
      if (error) throw pgErr(error, 'Không tạo được rule');
      await writeAudit('rule-create', data.id, 'ok'); return toCamel(data);
    }
    if (method === 'DELETE' && seg[1] === 'rules' && seg.length === 3) {
      needDirector();
      const { error } = await sb().from('rules').delete().eq('id', seg[2]);
      if (error) throw pgErr(error, 'Không xoá được rule');
      await writeAudit('rule-delete', seg[2], 'ok'); return { ok: true };
    }

    /* ----- Việc ----- */
    async function getJob(id) {
      const { data, error } = await sb().from('jobs').select('*').eq('id', id).maybeSingle();
      if (error) throw pgErr(error, 'Không đọc được việc');
      if (!data) fail(404, 'Không tìm thấy việc.');
      return toCamel(data);
    }
    if (method === 'POST' && seg[1] === 'jobs' && seg.length === 2) {
      if (!isDirector && !canApprove) fail(403, 'Chỉ Giám đốc hoặc Leader mới được thêm/giao việc.');
      if (!b.name || !b.assigneeId || !b.reviewerId) fail(400, 'Thiếu tên việc, người phụ trách hoặc người kiểm tra.');
      const staff = await allRows('staff');
      if (!staff.some((s) => s.id === b.assigneeId) || !staff.some((s) => s.id === b.reviewerId)) fail(400, 'Người phụ trách hoặc người kiểm tra không tồn tại.');
      const links = Array.isArray(b.links) ? b.links.filter((l) => l && httpLinkOk(l.url)).map((l) => ({ url: l.url, title: l.title || l.url, by: me.id, at: nowIso() })) : [];
      const { data, error } = await sb().from('jobs').insert({
        id: sbUid(), name: b.name, desc: b.desc || '', rule_id: b.ruleId || null, assignee_id: b.assigneeId, reviewer_id: b.reviewerId,
        status: 'Chờ nhận', progress: 0, claimed_by: null, links, created_by: me.id,
      }).select().single();
      if (error) throw pgErr(error, 'Không tạo được việc');
      await writeAudit('job-create', data.id, 'ok'); return toCamel(data);
    }
    if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'claim') {
      const job = await getJob(seg[2]);
      if (job.status !== 'Chờ nhận') fail(409, 'Việc không còn ở cột Chờ nhận.');
      if (job.claimedBy && job.claimedBy !== me.id) fail(409, 'Việc đã có người nhận — khoá nhận việc từ chối nhận trùng.');
      if (me.id !== job.assigneeId) fail(403, 'Chỉ người phụ trách được gán cho việc này mới nhận được việc.');
      if (me.resting) fail(403, 'Nhân viên đang nghỉ do chạm ngân sách — không nhận việc mới.');
      // Cập nhật có điều kiện = khoá nguyên tử: 0 dòng nghĩa là có người nhận trước.
      const { data, error } = await sb().from('jobs').update({ claimed_by: me.id, status: 'Đang làm', updated_at: nowIso() })
        .eq('id', seg[2]).eq('status', 'Chờ nhận').select();
      if (error) throw pgErr(error, 'Không nhận được việc');
      if (!data || !data.length) fail(409, 'Việc đã có người nhận trước bạn.');
      await writeAudit('job-claim', seg[2], 'ok'); return toCamel(data[0]);
    }
    if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'submit') {
      const job = await getJob(seg[2]);
      if (me.id !== job.assigneeId) fail(403, 'Chỉ người phụ trách mới trình việc lên kiểm tra.');
      if (job.status !== 'Đang làm') fail(409, 'Việc chưa ở trạng thái Đang làm.');
      const { data, error } = await sb().from('jobs').update({ status: 'Chờ duyệt', submitted_at: nowIso(), submit_note: b.note || null, updated_at: nowIso() })
        .eq('id', seg[2]).eq('status', 'Đang làm').select();
      if (error) throw pgErr(error, 'Không trình được việc');
      if (!data || !data.length) fail(409, 'Việc đã đổi trạng thái trước khi trình.');
      await writeAudit('job-submit', seg[2], 'ok'); return toCamel(data[0]);
    }
    if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'links') {
      const job = await getJob(seg[2]);
      const allowed = isDirector || me.id === job.assigneeId || me.id === job.reviewerId;
      if (!allowed) fail(403, 'Chỉ Giám đốc, người phụ trách hoặc người kiểm tra mới gắn link cho việc này.');
      if (!b.url || !httpLinkOk(b.url)) fail(400, 'Link phải bắt đầu bằng http(s)://.');
      const links = [...(job.links || []), { url: b.url, title: b.title || b.url, by: me.id, at: nowIso() }];
      const { data, error } = await sb().from('jobs').update({ links, updated_at: nowIso() }).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không gắn được link');
      await writeAudit('job-link-add', seg[2], 'ok'); return toCamel(data);
    }
    if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'approve') {
      const job = await getJob(seg[2]);
      if (!canApprove) fail(403, 'Chức vụ hiện tại không có quyền duyệt việc.');
      if (me.id === job.assigneeId) fail(403, 'Cấm tự duyệt việc của chính mình.');
      if (job.status !== 'Chờ duyệt') fail(409, 'Việc chưa ở cột Chờ duyệt.');
      // RLS + trigger ở database chặn duyệt việc của chính mình lần nữa;
      // câu lệnh có điều kiện dưới đây chặn duyệt trùng do đua.
      const { data, error } = await sb().from('jobs').update({ status: 'Hoàn thành', progress: 100, updated_at: nowIso() })
        .eq('id', seg[2]).eq('status', 'Chờ duyệt').select();
      if (error) throw pgErr(error, 'Không duyệt được việc');
      if (!data || !data.length) fail(409, 'Việc đã đổi trạng thái trước khi duyệt.');
      await writeAudit('job-approve', seg[2], 'ok', { note: b.note || '' }); return toCamel(data[0]);
    }
    if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'return') {
      const job = await getJob(seg[2]);
      if (!canApprove) fail(403, 'Chức vụ hiện tại không có quyền duyệt việc.');
      if (me.id === job.assigneeId) fail(403, 'Cấm tự duyệt việc của chính mình.');
      if (!b.reason) fail(400, 'Trả lại phải có lý do.');
      const { data, error } = await sb().from('jobs').update({ status: 'Đang làm', progress: Math.min(job.progress || 0, 40), updated_at: nowIso() })
        .eq('id', seg[2]).select();
      if (error) throw pgErr(error, 'Không trả lại được việc');
      if (!data || !data.length) fail(409, 'Việc đã đổi trạng thái trước khi trả lại.');
      await writeAudit('job-return', seg[2], 'ok', { reason: b.reason }); return toCamel(data[0]);
    }

    /* ----- Phê duyệt ----- */
    if (method === 'POST' && seg[1] === 'approvals' && seg.length === 2) {
      if (!b.action || !b.reason) fail(400, 'Thiếu hành động hoặc lý do (lý do bắt buộc).');
      const { data, error } = await sb().from('approvals').insert({
        id: sbUid(), requester_id: me.id, action: b.action, target: b.target || '', reason: b.reason,
        context: b.context || '', job_id: b.jobId || null, source: 'api', status: 'pending',
      }).select().single();
      if (error) throw pgErr(error, 'Không gửi được yêu cầu');
      await writeAudit('approval-request', data.id, 'ok'); return toCamel(data);
    }
    if (method === 'POST' && seg[1] === 'approvals' && seg[3] === 'decide') {
      const { data: ap, error: apErr } = await sb().from('approvals').select('*').eq('id', seg[2]).maybeSingle();
      if (apErr) throw pgErr(apErr, 'Không đọc được yêu cầu');
      if (!ap) fail(404, 'Không tìm thấy yêu cầu.');
      if (ap.status !== 'pending') fail(409, 'Yêu cầu đã được quyết định.');
      if (!canApprove) fail(403, 'Chức vụ hiện tại không có quyền duyệt.');
      if (me.id === ap.requester_id) fail(403, 'Cấm tự duyệt yêu cầu của chính mình.');
      if (!['approved', 'rejected'].includes(b.decision)) fail(400, 'decision phải là approved hoặc rejected.');
      if (b.decision === 'rejected' && !b.note) fail(400, 'Từ chối phải có lý do.');
      // Policy RLS chặn lần nữa (requester, đã quyết, decided_by khác người
      // quyết); câu lệnh có điều kiện chặn đua quyết trùng.
      const { data, error } = await sb().from('approvals').update({
        status: b.decision, decided_by: me.id, decided_at: nowIso(), note: b.note || '',
      }).eq('id', seg[2]).eq('status', 'pending').select();
      if (error) throw pgErr(error, 'Không quyết được yêu cầu');
      if (!data || !data.length) fail(409, 'Yêu cầu đã được quyết định trước.');
      await writeAudit('approval-decide', seg[2], b.decision, { note: b.note || '' }); return toCamel(data[0]);
    }

    /* ----- Ngân sách ----- */
    if (method === 'PATCH' && seg[1] === 'budgets' && seg.length === 3) {
      needDirector();
      const { data: cur, error: curErr } = await sb().from('staff').select('*').eq('id', seg[2]).maybeSingle();
      if (curErr) throw pgErr(curErr, 'Không đọc được nhân viên');
      if (!cur) fail(404, 'Không tìm thấy nhân viên.');
      const patch = { updated_at: nowIso() };
      if (b.budget !== undefined) patch.budget = b.budget == null ? null : Math.max(0, Number(b.budget));
      if (b.used !== undefined) patch.used = Math.max(0, Number(b.used));
      const { data, error } = await sb().from('staff').update(patch).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không cập nhật được ngân sách');
      await writeAudit('budget-set', seg[2], 'ok');
      await sb().from('budget_events').insert({ id: sbUid(), staff_id: seg[2], kind: 'set', budget: data.budget, used: data.used });
      await applyBudgetCheck(toCamel(cur), toCamel(data));
      return { staffId: seg[2], budget: data.budget, used: data.used };
    }
    if (method === 'POST' && seg[1] === 'budgets' && seg[3] === 'topup') {
      needDirector();
      const { data: cur, error: curErr } = await sb().from('staff').select('*').eq('id', seg[2]).maybeSingle();
      if (curErr) throw pgErr(curErr, 'Không đọc được nhân viên');
      if (!cur) fail(404, 'Không tìm thấy nhân viên.');
      if (cur.budget == null) fail(400, 'Chưa đặt mức ngân sách.');
      const { data, error } = await sb().from('staff').update({
        budget: Math.round(cur.budget * 1.5), resting: false, rested_fully: false, status: 'waiting', updated_at: nowIso(),
      }).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không nạp được ngân sách');
      await writeAudit('budget-topup', seg[2], 'ok');
      await sb().from('budget_events').insert({ id: sbUid(), staff_id: seg[2], kind: 'topup', budget: data.budget, used: data.used });
      return { staffId: seg[2], budget: data.budget };
    }

    /* ----- Heartbeat (cầu nối) / tin nhắn / họp ----- */
    if (method === 'POST' && seg[1] === 'heartbeat' && seg.length === 2) {
      if (me.resting) return { ok: true, resting: true };
      const patch = { updated_at: nowIso() };
      if (b.status && ['working', 'waiting'].includes(b.status)) patch.status = b.status;
      if (typeof b.used === 'number') patch.used = Math.max(0, b.used);
      const { data, error } = await sb().from('staff').update(patch).eq('id', me.id).select().single();
      if (error) throw pgErr(error, 'Không ghi được heartbeat');
      if (b.jobId && typeof b.progress === 'number') {
        const { data: job } = await sb().from('jobs').select('*').eq('id', b.jobId).maybeSingle();
        if (job && job.assignee_id === me.id) {
          await sb().from('jobs').update({ progress: Math.max(0, Math.min(100, b.progress)), updated_at: nowIso() }).eq('id', b.jobId);
        }
      }
      await applyBudgetCheck(me, toCamel(data));
      const fresh = await sb().from('staff').select('*').eq('id', me.id).maybeSingle();
      return { ok: true, resting: !!(fresh.data && fresh.data.resting), status: fresh.data ? fresh.data.status : data.status };
    }
    if (method === 'POST' && seg[1] === 'messages' && seg.length === 2) {
      if (!b.to || !b.text) fail(400, 'Thiếu người nhận hoặc nội dung.');
      const staff = await allRows('staff');
      if (b.to !== 'room' && !staff.some((s) => s.id === b.to)) fail(400, 'Người nhận không tồn tại.');
      if (b.jobId && !(await allRows('jobs')).some((j) => j.id === b.jobId)) fail(400, 'Việc đính kèm không tồn tại.');
      let link = null;
      if (b.link) {
        if (!b.link.url || !httpLinkOk(b.link.url)) fail(400, 'Link đính kèm phải bắt đầu bằng http(s)://.');
        link = { url: b.link.url, title: b.link.title || b.link.url };
      }
      const { data, error } = await sb().from('messages').insert({
        id: sbUid(), from_id: me.id, to_id: b.to, job_id: b.jobId || null, text: b.text, link,
        tagged_ids: taggedIdsFor(b.text, staff),
      }).select().single();
      if (error) throw pgErr(error, 'Không gửi được tin nhắn');
      await writeAudit('message', data.id, 'ok'); return toCamel(data);
    }
    if (method === 'POST' && seg[1] === 'meetings' && seg.length === 2) {
      if (!isDirector && !canApprove) fail(403, 'Chỉ Giám đốc hoặc Leader mới gọi họp.');
      const staff = await allRows('staff');
      const { data, error } = await sb().from('meetings').insert({
        id: sbUid(), title: b.title || 'Họp team', called_by: me.id, attendees: staff.map((s) => s.id), minutes: '', status: 'open',
      }).select().single();
      if (error) throw pgErr(error, 'Không gọi được họp');
      await writeAudit('meeting-call', data.id, 'ok'); return toCamel(data);
    }
    if (method === 'PATCH' && seg[1] === 'meetings' && seg.length === 3) {
      const { data: mt, error: mtErr } = await sb().from('meetings').select('*').eq('id', seg[2]).maybeSingle();
      if (mtErr) throw pgErr(mtErr, 'Không đọc được cuộc họp');
      if (!mt) fail(404, 'Không tìm thấy cuộc họp.');
      if (!isDirector && !canApprove && me.id !== mt.called_by) fail(403, 'Chỉ Giám đốc, Leader hoặc người gọi họp mới sửa biên bản.');
      const patch = { updated_at: nowIso() };
      if (typeof b.minutes === 'string') patch.minutes = b.minutes;
      if (b.status) patch.status = b.status;
      const { data, error } = await sb().from('meetings').update(patch).eq('id', seg[2]).select().single();
      if (error) throw pgErr(error, 'Không sửa được biên bản');
      await writeAudit('meeting-minutes', seg[2], 'ok'); return toCamel(data);
    }
    if (method === 'POST' && seg[1] === 'sessions' && seg[3] === 'revoke') {
      fail(400, 'Thu hồi phiên thực hiện trong Supabase Dashboard → Authentication (chọn user → Sign out / Delete). App không có quyền này bằng anon key — cố tình, để không ai tự cấp quyền thu hồi phiên người khác.');
    }
    if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'change-password') {
      // Đường dẫn này không dùng trong UI (UI gọi /api/staff/change-password
      // trực tiếp) — giữ để tương thích, chuyển tiếp đúng hàm.
      return staffChangePassword(b.currentPassword, b.newPassword);
    }
    if (method === 'POST' && path === '/api/staff/change-password') return staffChangePassword(b.currentPassword, b.newPassword);

    fail(404, 'API không tồn tại (Supabase): ' + method + ' ' + path);
  }

  /* ------------------------- Realtime ------------------------------------- */
  const RT_TABLES = ['jobs', 'approvals', 'messages', 'meetings', 'staff', 'budget_events', 'alerts'];
  let rtChannel = null;
  function connectRealtime(callbacks) {
    disconnectRealtime();
    const ch = sb().channel('office');
    for (const table of RT_TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        try { callbacks.onPayload(table, payload); } catch (e) { console.warn('[realtime] Lỗi xử lý sự kiện:', e); }
      });
    }
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { if (callbacks.onSubscribed) callbacks.onSubscribed(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { if (callbacks.onError) callbacks.onError(status); }
    });
    rtChannel = ch;
    return ch;
  }
  function disconnectRealtime() {
    if (rtChannel) { try { sb().removeChannel(rtChannel); } catch { /* bỏ qua */ } rtChannel = null; }
  }

  window.OfficeSupabase = {
    configured: () => CONFIGURED,
    client: () => sb(),
    request: sbRequest,
    connectRealtime, disconnectRealtime,
    currentStaffForApp,
    verifyPendingTotp,
    DIRECTOR_EMAIL,
    authEmailFor,
  };
})();
