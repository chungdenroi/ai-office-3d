/* ============================================================================
 * TRUNG TÂM ĐIỀU PHỐI — Hệ thống AI nhân viên (vỏ ứng dụng thật)
 * ----------------------------------------------------------------------------
 * Màn hình đăng nhập trước, vỏ ứng dụng sau. Máy chủ là nguồn sự thật duy
 * nhất khi nối được; localStorage CHỈ là bản dùng thử ngoại tuyến có ghi
 * nhãn DEMO. Mọi quyền đều tính từ dữ liệu chức vụ hiện tại — không ghi
 * cứng quyền theo tên người. Không số liệu giả: số "đã dùng" do cầu nối
 * đẩy lên (hoặc Giám đốc ghi nhận có nhật ký); bản demo ghi rõ mô phỏng.
 * ========================================================================== */
'use strict';

/* ------------------------------ Tiện ích --------------------------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const fmtNum = (n) => n == null ? '—' : Number(n).toLocaleString('vi-VN');
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return iso || ''; } };
/* Thư mục chứa app.js — để tính đường dẫn tuyệt đối tới thư viện 3D đi kèm
 * (vendor/) dù trang được mở ở / hay /web/ (GitHub Pages). */
const SCRIPT_BASE = (() => { try { const cs = document.currentScript; if (cs && cs.src) return cs.src; } catch { /* rơi xuống location */ } return location.href; })();
const STATUS_META = {
  working: { label: 'Đang làm', cls: 'working', dot: 'green', ring: 0x2dd4bf },
  waiting: { label: 'Đang chờ', cls: 'waiting', dot: 'yellow', ring: 0xfbbf24 },
  approval: { label: 'Cần duyệt', cls: 'approval', dot: 'red', ring: 0xf87171 },
  resting: { label: 'Đang nghỉ (ngân sách)', cls: 'resting', dot: 'rest', ring: 0x64748b },
};
/* Màu chấm trạng thái (CSS) dùng chung cho nhãn 3D + pill + dot — cùng một
 * hệ màu ngữ nghĩa ở mọi màn hình: teal đang làm, amber đang chờ, đỏ cần
 * chú ý, slate ngoại tuyến/nghỉ. */
const STATUS_DOT_CSS = { working: '#2DD4BF', waiting: '#FBBF24', approval: '#F87171', resting: '#64748B' };
const JOB_COLUMNS = ['Chờ nhận', 'Đang làm', 'Chờ duyệt', 'Hoàn thành'];
const APPROVAL_ACTIONS = [
  'Đăng nhập', 'Tải file xuống', 'Cài đặt ứng dụng / chương trình',
  'Gửi tin ra ngoài nhóm', 'Xoá dữ liệu', 'Thay đổi cài đặt tài khoản / bảo mật',
  'Truy cập dữ liệu ngoài phạm vi việc', 'Chi tiêu',
];

function effectiveStatus(st, approvals) {
  if (st.resting) return 'resting';
  if (approvals && approvals.some((a) => a.status === 'pending' && a.requesterId === st.id)) return 'approval';
  return st.status === 'working' ? 'working' : 'waiting';
}

/* ------------------------------ Phiên ------------------------------------ */
const Session = {
  token: sessionStorage.getItem('office.token') || '',
  demo: sessionStorage.getItem('office.demo') === '1',
  me: null, meType: '', apiBase: (localStorage.getItem('office.apiBase') || '').replace(/\/$/, ''),
  save(token, demo) { this.token = token; this.demo = !!demo; sessionStorage.setItem('office.token', token); sessionStorage.setItem('office.demo', demo ? '1' : ''); },
  clear() { this.token = ''; this.demo = false; this.me = null; this.meType = ''; sessionStorage.removeItem('office.token'); sessionStorage.removeItem('office.demo'); },
};
function apiBase() { return Session.apiBase; }

/* ------------------------- Chế độ Supabase ------------------------------- */
/* Khi web/config.js đã điền Project URL + anon key thật, app dùng tầng
 * Supabase (web/supabase.js) thay cho máy chủ Node cũ — không cần apiBase,
 * không cần token riêng (phiên nằm trong Supabase Auth). Chưa điền config
 * thì isSb() = false và app giữ đúng hành vi cũ (máy chủ Node / DEMO). */
const isSb = () => !!(window.OfficeSupabase && window.OfficeSupabase.configured());
let sbMfaVerified = false; // đã xác minh TOTP trong lượt cài đặt lần đầu này?
let sbDirectorContinue = false; // xác minh TOTP xong thì vào tiếp luồng Giám đốc?

/* --------------------- Bản dùng thử ngoại tuyến (DEMO) -------------------
 * Chỉ chạy khi KHÔNG nối được máy chủ. Cùng một giao diện gọi API, dữ liệu
 * mẫu lưu ở localStorage của trình duyệt này, ghi nhãn DEMO ở mọi màn hình.
 * Ngữ nghĩa bảo mật/phê duyệt/ngân sách giữ nguyên như máy chủ thật. */
const DemoDB = {
  KEY: 'office.demo.v1',
  data: null,
  seed() {
    const roles = [
      { id: 'r-giamdoc', name: 'Giám đốc', level: 1, canApprove: true, canManage: true },
      { id: 'r-dieuphoi', name: 'Điều phối', level: 1, canApprove: true, canManage: false },
      { id: 'r-quanly', name: 'Quản lý', level: 2, canApprove: true, canManage: false },
      { id: 'r-thucthi', name: 'Thực thi', level: 3, canApprove: false, canManage: false },
    ];
    const staff = [
      { id: 's-chung', name: 'Chung', account: 'teddyssk559@gmail.com', roleId: 'r-giamdoc', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false, login: { username: 'giamdoc', hasPassword: true, mustChangePassword: false, disabled: false } },
      { id: 's-muse', name: 'Muse', account: 'muse-dieu-phoi', roleId: 'r-dieuphoi', status: 'working', budget: 5000000000, used: 0, resting: false, restedFully: false, login: { username: 'muse', hasPassword: true, mustChangePassword: false, disabled: false } },
      { id: 's-hung', name: 'Hùng', account: 'muse-hung', roleId: 'r-quanly', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false, login: null },
      { id: 's-tuan', name: 'Tuấn', account: 'muse-tuan', roleId: 'r-thucthi', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false, login: null },
      { id: 's-linh', name: 'Linh', account: 'muse-linh', roleId: 'r-thucthi', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false, login: null },
    ];
    return { roles, staff, jobs: [], approvals: [], rules: [{ id: 'rule-1', text: 'Mọi việc phải qua kiểm tra trước khi trình duyệt' }], messages: [], meetings: [], audit: [], alerts: [], sessions: [] };
  },
  load() {
    if (!this.data) {
      try { this.data = JSON.parse(localStorage.getItem(this.KEY)) || this.seed(); }
      catch { this.data = this.seed(); }
    }
    return this.data;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch { /* bỏ qua */ } },
  reset() { this.data = this.seed(); this.save(); },
};
function demoAudit(d, action, actorId, target, result, extra) {
  d.audit.push({ id: uid(), at: new Date().toISOString(), action, actorId, actorType: 'demo', target: target || null, result, ...(extra || {}) });
}
function demoTaggedIds(d, text) {
  const ids = new Set();
  const names = [...String(text).matchAll(/\[ASK:([^\]]+)\]/g), ...String(text).matchAll(/@([A-Za-zÀ-ỹ]+)/g)].map((m) => m[1].trim().toLowerCase());
  for (const n of names) { const hit = d.staff.find((s) => s.name.toLowerCase() === n); if (hit) ids.add(hit.id); }
  return [...ids];
}
function demoRoleOf(d, st) { return d.roles.find((r) => r.id === st.roleId) || { name: '(chưa gán)', level: 9, canApprove: false, canManage: false }; }
function demoCanDecide(d, me, ap) {
  const role = demoRoleOf(d, d.staff.find((s) => s.id === me.id) || {});
  if (!role.canApprove) return 'Chức vụ hiện tại không có quyền duyệt.';
  if (me.id === ap.requesterId) return 'Cấm tự duyệt yêu cầu của chính mình.';
  return null;
}
function demoCheckBudget(d, st) {
  if (st.budget == null || st.budget <= 0 || st.resting) return;
  if (st.used >= st.budget) {
    st.resting = true; st.status = 'resting';
    d.alerts.push({ id: uid(), at: new Date().toISOString(), kind: 'budget-full', staffId: st.id, text: `${st.name} đã chạm 100% ngân sách (mô phỏng).` });
  }
}
async function demoRequest(method, path, body) {
  const d = DemoDB.load();
  const me = Session.me ? d.staff.find((s) => s.id === Session.me.id) : null;
  const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
  const seg = path.split('/').filter(Boolean);
  const q = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : new URLSearchParams();
  const base = seg.slice(0, 2).join('/');
  const needMe = !['setup', 'health'].includes(seg[1]);
  if (needMe && !me) fail(401, 'Chưa đăng nhập (bản demo).');
  // GET
  if (method === 'GET' && path.startsWith('/api/health')) return { ok: true, demo: true, counts: { staff: d.staff.length, jobs: d.jobs.length, pendingApprovals: d.approvals.filter((a) => a.status === 'pending').length } };
  if (method === 'GET' && base === 'api/roles') return d.roles;
  if (method === 'GET' && base === 'api/staff') return d.staff.map((s) => ({ ...s, login: s.login ? { ...s.login, passwordHash: undefined } : null }));
  if (method === 'GET' && base === 'api/rules') return d.rules;
  if (method === 'GET' && base === 'api/jobs') return d.jobs;
  if (method === 'GET' && base === 'api/approvals' && seg.length === 2) return d.approvals;
  if (method === 'GET' && base === 'api/approvals' && seg.length === 3) {
    const ap = d.approvals.find((a) => a.id === seg[2]); if (!ap) fail(404, 'Không tìm thấy yêu cầu.');
    if (Session.meType !== 'director' && ap.requesterId !== me.id) fail(403, 'Chỉ người yêu cầu và cấp duyệt mới đọc được.');
    return ap;
  }
  if (method === 'GET' && base === 'api/budgets') return d.staff.map((s) => ({ staffId: s.id, name: s.name, budget: s.budget, used: s.used, resting: s.resting }));
  if (method === 'GET' && base === 'api/audit') return d.audit.slice(-100);
  if (method === 'GET' && base === 'api/alerts') return d.alerts.slice(-50);
  if (method === 'GET' && base === 'api/sessions') return d.sessions;
  if (method === 'GET' && base === 'api/meetings') return d.meetings.slice(-20);
  if (method === 'GET' && base === 'api/messages') {
    let out = d.messages;
    const jobId = q.get('jobId'), to = q.get('to');
    if (jobId) out = out.filter((m) => m.jobId === jobId);
    else if (to === 'room') out = out.filter((m) => m.toId === 'room');
    else if (to) out = out.filter((m) => (m.fromId === me.id && m.toId === to) || (m.fromId === to && m.toId === me.id));
    return out.slice(-100);
  }
  if (method === 'GET' && base === 'api/context') {
    return { kind: demoRoleOf(d, me).canManage ? 'director' : 'staff', staff: { id: me.id, name: me.name, role: demoRoleOf(d, me).name }, myJobs: d.jobs.filter((j) => j.assigneeId === me.id || j.reviewerId === me.id), recentDecisions: d.approvals.filter((a) => a.status !== 'pending').slice(-5), rollingSummary: [], openDecisions: d.approvals.filter((a) => a.status === 'pending').length };
  }
  // POST / PATCH / DELETE
  const role = me ? demoRoleOf(d, me) : {};
  const needDirector = () => { if (Session.meType !== 'director') fail(403, 'Chỉ phiên Giám đốc mới được gọi API này (bản demo).'); };
  if (method === 'POST' && path === '/api/roles') {
    needDirector(); if (!body.name) fail(400, 'Thiếu tên chức vụ.');
    const r = { id: uid(), name: body.name, level: Number(body.level || 3), canApprove: !!body.canApprove, canManage: !!body.canManage };
    d.roles.push(r); demoAudit(d, 'role-create', me.id, r.id, 'ok'); DemoDB.save(); return r;
  }
  if (method === 'PATCH' && seg[1] === 'roles' && seg.length === 3) {
    needDirector(); const r = d.roles.find((x) => x.id === seg[2]); if (!r) fail(404, 'Không tìm thấy chức vụ.');
    Object.assign(r, { name: body.name || r.name, level: body.level !== undefined ? Number(body.level) : r.level, canApprove: body.canApprove !== undefined ? !!body.canApprove : r.canApprove, canManage: body.canManage !== undefined ? !!body.canManage : r.canManage });
    if (!d.roles.some((x) => x.canManage)) fail(400, 'Phải còn ít nhất một chức vụ có quyền quản trị.');
    demoAudit(d, 'role-update', me.id, r.id, 'ok'); DemoDB.save(); return r;
  }
  if (method === 'DELETE' && seg[1] === 'roles' && seg.length === 3) {
    needDirector();
    if (d.staff.some((s) => s.roleId === seg[2])) fail(400, 'Còn nhân viên đang giữ chức vụ này.');
    d.roles = d.roles.filter((r) => r.id !== seg[2]); demoAudit(d, 'role-delete', me.id, seg[2], 'ok'); DemoDB.save(); return { ok: true };
  }
  if (method === 'POST' && path === '/api/staff') {
    needDirector(); if (!body.name || !d.roles.find((r) => r.id === body.roleId)) fail(400, 'Thiếu tên hoặc chức vụ không tồn tại.');
    const st = { id: uid(), name: body.name, account: body.account || '', roleId: body.roleId, status: 'waiting', budget: body.budget ?? null, used: 0, resting: false, restedFully: false, login: body.username ? { username: body.username, hasPassword: true, mustChangePassword: true, disabled: false } : null };
    d.staff.push(st); demoAudit(d, 'staff-create', me.id, st.id, 'ok'); DemoDB.save();
    return { id: st.id, token: 'demo-token-' + uid(), warning: 'Bản demo: mã token hiển thị để lái thử luồng cấp mã.' };
  }
  if (method === 'PATCH' && seg[1] === 'staff' && seg.length === 3) {
    needDirector(); const st = d.staff.find((s) => s.id === seg[2]); if (!st) fail(404, 'Không tìm thấy nhân viên.');
    if (body.roleId) st.roleId = body.roleId; if (body.name) st.name = body.name; if (body.account !== undefined) st.account = body.account;
    demoAudit(d, 'staff-update', me.id, st.id, 'ok'); DemoDB.save(); return st;
  }
  if (method === 'DELETE' && seg[1] === 'staff' && seg.length === 3) {
    needDirector(); d.staff = d.staff.filter((s) => s.id !== seg[2]); demoAudit(d, 'staff-delete', me.id, seg[2], 'ok'); DemoDB.save(); return { ok: true };
  }
  if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'reset-password') {
    needDirector(); const st = d.staff.find((s) => s.id === seg[2]); if (!st || !st.login) fail(400, 'Nhân viên chưa có tài khoản đăng nhập.');
    st.login.mustChangePassword = true; demoAudit(d, 'password-reset', me.id, st.id, 'ok'); DemoDB.save(); return { ok: true, mustChangePassword: true };
  }
  if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'set-disabled') {
    needDirector(); const st = d.staff.find((s) => s.id === seg[2]); if (!st || !st.login) fail(400, 'Nhân viên chưa có tài khoản đăng nhập.');
    st.login.disabled = !!body.disabled; demoAudit(d, 'login-disable', me.id, st.id, 'ok'); DemoDB.save(); return st;
  }
  if (method === 'POST' && seg[1] === 'staff' && seg[3] === 'rotate-token') {
    needDirector(); demoAudit(d, 'token-rotate', me.id, seg[2], 'ok'); DemoDB.save(); return { token: 'demo-token-' + uid(), warning: 'Bản demo: mã mới hiển thị để lái thử.' };
  }
  if (method === 'POST' && path === '/api/rules') { needDirector(); const r = { id: uid(), text: body.text }; d.rules.push(r); DemoDB.save(); return r; }
  if (method === 'DELETE' && seg[1] === 'rules' && seg.length === 3) { needDirector(); d.rules = d.rules.filter((r) => r.id !== seg[2]); DemoDB.save(); return { ok: true }; }
  if (method === 'POST' && path === '/api/jobs') {
    if (Session.meType !== 'director' && !role.canApprove) fail(403, 'Chỉ Giám đốc hoặc Leader mới được thêm/giao việc.');
    if (!body.name || !body.assigneeId || !body.reviewerId) fail(400, 'Thiếu tên việc, người phụ trách hoặc người kiểm tra.');
    const job = { id: uid(), name: body.name, desc: body.desc || '', ruleId: body.ruleId || null, assigneeId: body.assigneeId, reviewerId: body.reviewerId, status: 'Chờ nhận', progress: 0, claimedBy: null, links: [], createdAt: new Date().toISOString(), createdBy: me.id };
    d.jobs.push(job); demoAudit(d, 'job-create', me.id, job.id, 'ok'); DemoDB.save(); return job;
  }
  const jobAct = (fn) => {
    const job = d.jobs.find((j) => j.id === seg[2]); if (!job) fail(404, 'Không tìm thấy việc.');
    return fn(job);
  };
  if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'claim') return jobAct((job) => {
    if (job.status !== 'Chờ nhận') fail(409, 'Việc không còn ở cột Chờ nhận.');
    if (job.claimedBy && job.claimedBy !== me.id) fail(409, 'Việc đã có người nhận.');
    if (me.id !== job.assigneeId) fail(403, 'Chỉ người phụ trách được gán mới nhận được việc.');
    const st = d.staff.find((s) => s.id === me.id); if (st.resting) fail(403, 'Nhân viên đang nghỉ do chạm ngân sách.');
    job.claimedBy = me.id; job.status = 'Đang làm'; demoAudit(d, 'job-claim', me.id, job.id, 'ok'); DemoDB.save(); return job;
  });
  if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'submit') return jobAct((job) => {
    if (me.id !== job.assigneeId) fail(403, 'Chỉ người phụ trách mới trình việc.');
    if (job.status !== 'Đang làm') fail(409, 'Việc chưa ở trạng thái Đang làm.');
    job.status = 'Chờ duyệt'; job.submittedAt = new Date().toISOString(); demoAudit(d, 'job-submit', me.id, job.id, 'ok'); DemoDB.save(); return job;
  });
  if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'approve') return jobAct((job) => {
    if (!role.canApprove) fail(403, 'Chức vụ hiện tại không có quyền duyệt việc.');
    if (me.id === job.assigneeId) fail(403, 'Cấm tự duyệt việc của chính mình.');
    if (job.status !== 'Chờ duyệt') fail(409, 'Việc chưa ở cột Chờ duyệt.');
    job.status = 'Hoàn thành'; job.progress = 100; demoAudit(d, 'job-approve', me.id, job.id, 'ok'); DemoDB.save(); return job;
  });
  if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'return') return jobAct((job) => {
    if (!role.canApprove) fail(403, 'Chức vụ hiện tại không có quyền duyệt việc.');
    if (me.id === job.assigneeId) fail(403, 'Cấm tự duyệt việc của chính mình.');
    if (!body.reason) fail(400, 'Trả lại phải có lý do.');
    job.status = 'Đang làm'; job.progress = Math.min(job.progress, 40); demoAudit(d, 'job-return', me.id, job.id, 'ok', { reason: body.reason }); DemoDB.save(); return job;
  });
  if (method === 'POST' && seg[1] === 'jobs' && seg[3] === 'links') return jobAct((job) => {
    if (!/^https?:\/\//.test(body.url || '')) fail(400, 'Link phải bắt đầu bằng http(s)://.');
    job.links = job.links || []; job.links.push({ url: body.url, title: body.title || body.url, by: me.id, at: new Date().toISOString() });
    DemoDB.save(); return job;
  });
  if (method === 'POST' && path === '/api/approvals') {
    if (!body.action || !body.reason) fail(400, 'Thiếu hành động hoặc lý do.');
    const ap = { id: uid(), requesterId: me.id, action: body.action, target: body.target || '', reason: body.reason, context: body.context || '', jobId: body.jobId || null, source: 'demo', status: 'pending', at: new Date().toISOString() };
    d.approvals.push(ap); demoAudit(d, 'approval-request', me.id, ap.id, 'ok'); DemoDB.save(); return ap;
  }
  if (method === 'POST' && seg[1] === 'approvals' && seg[3] === 'decide') {
    const ap = d.approvals.find((a) => a.id === seg[2]); if (!ap) fail(404, 'Không tìm thấy yêu cầu.');
    if (ap.status !== 'pending') fail(409, 'Yêu cầu đã được quyết định.');
    const denied = demoCanDecide(d, me, ap); if (denied) fail(403, denied);
    if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'decision phải là approved hoặc rejected.');
    if (body.decision === 'rejected' && !body.note) fail(400, 'Từ chối phải có lý do.');
    ap.status = body.decision; ap.decidedBy = me.id; ap.decidedAt = new Date().toISOString(); ap.note = body.note || '';
    demoAudit(d, 'approval-decide', me.id, ap.id, body.decision); DemoDB.save(); return ap;
  }
  if (method === 'PATCH' && seg[1] === 'budgets' && seg.length === 3) {
    needDirector(); const st = d.staff.find((s) => s.id === seg[2]); if (!st) fail(404, 'Không tìm thấy nhân viên.');
    if (body.budget !== undefined) st.budget = body.budget == null ? null : Math.max(0, Number(body.budget));
    if (body.used !== undefined) st.used = Math.max(0, Number(body.used));
    demoCheckBudget(d, st); demoAudit(d, 'budget-set', me.id, st.id, 'ok'); DemoDB.save();
    return { staffId: st.id, budget: st.budget, used: st.used };
  }
  if (method === 'POST' && seg[1] === 'budgets' && seg[3] === 'topup') {
    needDirector(); const st = d.staff.find((s) => s.id === seg[2]); if (!st) fail(404, 'Không tìm thấy nhân viên.');
    if (st.budget == null) fail(400, 'Chưa đặt mức ngân sách.');
    st.budget = Math.round(st.budget * 1.5); st.resting = false; st.restedFully = false; st.status = 'waiting';
    demoAudit(d, 'budget-topup', me.id, st.id, 'ok'); DemoDB.save(); return { staffId: st.id, budget: st.budget };
  }
  if (method === 'POST' && path === '/api/heartbeat') {
    const st = d.staff.find((s) => s.id === me.id);
    if (st.resting) return { ok: true, resting: true };
    if (body.status && ['working', 'waiting'].includes(body.status)) st.status = body.status;
    if (typeof body.used === 'number') st.used = Math.max(0, body.used);
    demoCheckBudget(d, st); DemoDB.save(); return { ok: true, status: st.status };
  }
  if (method === 'POST' && path === '/api/messages') {
    if (!body.to || !body.text) fail(400, 'Thiếu người nhận hoặc nội dung.');
    if (body.to !== 'room' && !d.staff.find((s) => s.id === body.to)) fail(400, 'Người nhận không tồn tại.');
    let link = null;
    if (body.link) { if (!/^https?:\/\//.test(body.link.url || '')) fail(400, 'Link phải bắt đầu bằng http(s)://.'); link = { url: body.link.url, title: body.link.title || body.link.url }; }
    const msg = { id: uid(), fromId: me.id, toId: body.to, jobId: body.jobId || null, text: body.text, link, taggedIds: demoTaggedIds(d, body.text), at: new Date().toISOString() };
    d.messages.push(msg); demoAudit(d, 'message', me.id, msg.id, 'ok'); DemoDB.save(); return msg;
  }
  if (method === 'POST' && path === '/api/meetings') {
    if (Session.meType !== 'director' && !role.canApprove) fail(403, 'Chỉ Giám đốc hoặc Leader mới gọi họp.');
    const mt = { id: uid(), title: body.title || 'Họp team', calledBy: me.id, at: new Date().toISOString(), attendees: d.staff.map((s) => s.id), minutes: '', status: 'open' };
    d.meetings.push(mt); demoAudit(d, 'meeting-call', me.id, mt.id, 'ok'); DemoDB.save(); return mt;
  }
  if (method === 'PATCH' && seg[1] === 'meetings' && seg.length === 3) {
    const mt = d.meetings.find((m) => m.id === seg[2]); if (!mt) fail(404, 'Không tìm thấy cuộc họp.');
    if (typeof body.minutes === 'string') mt.minutes = body.minutes;
    if (body.status) mt.status = body.status;
    demoAudit(d, 'meeting-minutes', me.id, mt.id, 'ok'); DemoDB.save(); return mt;
  }
  if (method === 'POST' && path === '/api/director/logout') return { ok: true };
  if (method === 'POST' && seg[1] === 'sessions' && seg[3] === 'revoke') return { ok: true };
  if (method === 'POST' && path === '/api/backup') return { ok: true, reason: 'demo' };
  fail(404, 'API không tồn tại (bản demo): ' + method + ' ' + path);
}

/* ------------------------------ Gọi API ---------------------------------- */
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function request(method, path, body) {
  if (Session.demo) return demoRequest(method, path, body);
  if (isSb()) {
    try { return await window.OfficeSupabase.request(method, path, body); }
    catch (e) { throw new ApiError(e.status || 500, e.message || 'Lỗi Supabase'); }
  }
  const res = await fetch(apiBase() + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(Session.token ? { Authorization: 'Bearer ' + Session.token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || ('Lỗi máy chủ ' + res.status));
  return data;
}
const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  patch: (p, b) => request('PATCH', p, b || {}),
  del: (p) => request('DELETE', p),
};

/* ------------------------------ Trạng thái ------------------------------- */
const S = {
  route: 'office',
  staff: [], roles: [], jobs: [], approvals: [], rules: [],
  budgets: [], audit: [], alerts: [], messages: [], meetings: [], sessions: [],
  health: null, selectedStaffId: null, chatTarget: 'room', chatJobId: '',
  feed: [], meetingActive: null, jobDraft: null, lastChatSeen: Number(localStorage.getItem('office.chatSeen') || 0),
  sseOk: false, sse: null, pollTimer: null,
};
function staffById(id) { return S.staff.find((s) => s.id === id); }
function roleOfStaff(st) { return S.roles.find((r) => r.id === (st && st.roleId)) || { name: '(chưa gán)', level: 9, canApprove: false, canManage: false }; }
function myRole() { return Session.me ? roleOfStaff(Session.me) : { name: '', level: 9, canApprove: false, canManage: false }; }
function isDirector() { return Session.meType === 'director'; }
function canManage() { return isDirector(); }
function pendingApprovals() { return S.approvals.filter((a) => a.status === 'pending'); }
function myName(id) { const s = staffById(id); return s ? s.name : '(đã xoá)'; }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.hidden = true; }, 4200);
}
function showError(e) {
  const msg = e && e.message ? e.message : 'Đã xảy ra lỗi không rõ.';
  toast(msg);
  return msg;
}
function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
  root.hidden = false;
  $('.modal-backdrop', root).addEventListener('click', (e) => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
}
function closeModal() { const root = $('#modal-root'); root.hidden = true; root.innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function feedAdd(text) {
  // Không ghi trùng lặp liên tiếp (vd: vào lại màn Văn phòng khi 3D lỗi).
  if (S.feed[0] && S.feed[0].text === text) return;
  S.feed.unshift({ at: new Date().toISOString(), text });
  S.feed = S.feed.slice(0, 40);
  const log = $('#activity-log');
  if (log) log.innerHTML = S.feed.map((f) => '<li><time>' + esc(fmtTime(f.at)) + '</time>' + esc(f.text) + '</li>').join('') || '<li>Chưa có hoạt động nào.</li>';
}

/* --------------------- Hiện diện làm việc (số liệu thật) -------------------- */
/* Việc "đang chạy" của một người: ưu tiên Đang làm, rồi Chờ duyệt, rồi
 * Chờ nhận. Chỉ dùng trạng thái + tiến độ đã có trong dữ liệu việc. */
function currentJobOf(staffId) {
  const mine = S.jobs.filter((j) => j.assigneeId === staffId && j.status !== 'Hoàn thành');
  return mine.find((j) => j.status === 'Đang làm') || mine[0] || null;
}
function budgetPct(st) {
  if (st.budget == null || st.budget <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(((st.used || 0) / st.budget) * 100)));
}
function budgetLeft(st) {
  if (st.budget == null) return null;
  return Math.max(0, st.budget - (st.used || 0));
}
/* Số liệu cho dải tổng quan "Xưởng đang làm gì": đếm từ trạng thái thật,
 * việc thật, phê duyệt thật, ngân sách thật. Không có khái niệm "flow",
 * "phiên studio" hay "phiên chat" trong dữ liệu — không bịa ra (xem
 * BUILD-REPORT.md). */
function opsCounts() {
  const c = { working: 0, waiting: 0, approval: 0, resting: 0 };
  for (const s of S.staff) { const es = effectiveStatus(s, S.approvals); if (c[es] != null) c[es]++; }
  const running = S.jobs.filter((j) => j.status === 'Đang làm').length;
  const open = S.jobs.filter((j) => j.status !== 'Hoàn thành').length;
  const pendList = pendingApprovals();
  const budgeted = S.staff.filter((s) => budgetPct(s) != null);
  return {
    ...c, running, open, pend: pendList.length,
    pendPeople: new Set(pendList.map((a) => a.requesterId)).size,
    budgeted: budgeted.length,
    over80: budgeted.filter((s) => budgetPct(s) >= 80).length,
    maxPct: budgeted.length ? Math.max.apply(null, budgeted.map((s) => budgetPct(s))) : null,
  };
}
const fmtClock = (d) => { try { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };
async function refreshAll() {
  const [staff, roles, jobs, approvals, rules] = await Promise.all([
    api.get('/api/staff'), api.get('/api/roles'), api.get('/api/jobs'), api.get('/api/approvals'), api.get('/api/rules'),
  ]);
  S.staff = staff; S.roles = roles; S.jobs = jobs; S.approvals = approvals; S.rules = rules;
  try { S.budgets = await api.get('/api/budgets'); } catch { S.budgets = []; }
  try { S.messages = await api.get('/api/messages'); } catch { S.messages = []; }
  try { S.meetings = await api.get('/api/meetings'); } catch { S.meetings = []; }
  if (isDirector()) {
    try { S.audit = await api.get('/api/audit'); } catch { S.audit = []; }
    try { S.alerts = await api.get('/api/alerts'); } catch { S.alerts = []; }
    try { S.sessions = await api.get('/api/sessions'); } catch { S.sessions = []; }
  }
  if (!S.selectedStaffId || !staffById(S.selectedStaffId)) S.selectedStaffId = (Session.me && Session.me.id) || (staff[0] && staff[0].id) || null;
  S.lastSyncAt = new Date();
  renderTopbar();
}
async function refreshHealth() {
  try { S.health = await api.get('/api/health'); } catch { S.health = null; }
  renderTopbar();
}

/* ------------------------------ SSE + thăm dò ----------------------------- */
/* Chế độ Supabase: Realtime (postgres_changes) thay SSE. Ánh xạ snake_case
 * sang camelCase để handleEvent dùng lại được đúng như cũ. */
function sbRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = row[k];
  if (out.createdAt && out.at === undefined) out.at = out.createdAt;
  return out;
}
function connectSSE() {
  if (Session.demo) return;
  if (isSb()) {
    try { if (S.sse && S.sse.close) S.sse.close(); } catch { /* bỏ qua */ }
    window.OfficeSupabase.connectRealtime({
      onSubscribed: () => { S.sseOk = true; renderTopbar(); },
      onError: () => { S.sseOk = false; renderTopbar(); },
      onPayload: (table, payload) => {
        const row = payload.new ? sbRow(payload.new) : null;
        if (!row) return;
        if (table === 'messages' && payload.eventType === 'INSERT') { handleEvent({ type: 'message', message: row }); return; }
        if (table === 'alerts' && payload.eventType === 'INSERT') { handleEvent({ type: 'director-alert', text: row.text }); return; }
        const typeMap = { jobs: 'job', approvals: 'approval', meetings: 'meeting', staff: 'org', budget_events: 'budget' };
        const t = typeMap[table]; if (!t) return;
        const ev = { type: t, change: t === 'approval' ? (row.status !== 'pending' ? 'decided' : 'created') : (payload.eventType === 'INSERT' ? 'created' : 'updated') };
        ev[t] = row;
        handleEvent(ev);
      },
    });
    S.sse = { close: () => window.OfficeSupabase.disconnectRealtime() };
    return;
  }
  if (!Session.token) return;
  try { if (S.sse) S.sse.close(); } catch { /* bỏ qua */ }
  const es = new EventSource(apiBase() + '/api/events?token=' + encodeURIComponent(Session.token));
  S.sse = es;
  es.onopen = () => { S.sseOk = true; renderTopbar(); };
  es.onerror = () => { S.sseOk = false; renderTopbar(); };
  es.onmessage = (ev) => handleEvent(JSON.parse(ev.data));
  es.addEventListener('job', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('approval', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('budget', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('message', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('meeting', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('org', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('heartbeat', (ev) => handleEvent(JSON.parse(ev.data)));
  es.addEventListener('director-alert', (ev) => handleEvent(JSON.parse(ev.data)));
}
function handleEvent(ev) {
  if (!ev || !ev.type) return;
  if (ev.type === 'message' && ev.message) {
    // Tránh trùng khi tin do chính mình gửi: POST đã trả về + SSE đẩy lại.
    if (!S.messages.some((m) => m.id === ev.message.id)) S.messages.push(ev.message);
    const taggedMe = ev.message.taggedIds && Session.me && ev.message.taggedIds.includes(Session.me.id);
    if (taggedMe) toast('Bạn được nhắc tên trong Phòng chat: ' + ev.message.text.slice(0, 80));
    if (S.route === 'chat') renderChatLog();
    updateChatBadge();
    return;
  }
  if (ev.type === 'director-alert') { toast('Cảnh báo: ' + (ev.text || '')); return; }
  if (ev.type === 'approval' && ev.approval) feedAdd((ev.change === 'decided' ? 'Phê duyệt đã quyết: ' : 'Yêu cầu phê duyệt mới: ') + ev.approval.action);
  if (ev.type === 'job' && ev.job) {
    feedAdd('Việc "' + ev.job.name + '" → ' + ev.job.status);
    if (S.route === 'office') Office3D.onJobEvent(ev.job, ev.change);
  }
  // Mọi sự kiện thay đổi dữ liệu: tải lại từ máy chủ rồi cập nhật đúng màn
  // đang mở — màn Văn phòng chỉ cập nhật panel + đồng bộ 3D, KHÔNG vẽ lại
  // khung cảnh (tránh lỗi trắng trang ở bản cũ).
  if (['job', 'approval', 'budget', 'meeting', 'org', 'heartbeat'].includes(ev.type)) {
    refreshAll().then(() => {
      if (S.route === 'office') refreshOfficePanel();
      else if (S.route === 'chat') renderChatLog();
      else if (['jobs', 'approvals', 'budgets', 'people', 'logs'].includes(S.route)) renderScreen(true);
    }).catch(() => { /* ngoại tuyến: giữ dữ liệu cũ */ });
  }
}
function startPolling() {
  if (S.pollTimer) clearInterval(S.pollTimer);
  S.pollTimer = setInterval(() => {
    if (document.hidden) return;
    refreshHealth();
    refreshAll().then(() => { if (S.route === 'office') refreshOfficePanel(); else renderScreen(true); }).catch(() => { /* ngoại tuyến: giữ dữ liệu cũ */ });
  }, isSb() ? 120000 : 25000); // Supabase: Realtime là kênh chính, thăm dò chỉ là dự phòng chậm (bài học Firebase 429).
}

/* ------------------------------ Vỏ + điều hướng --------------------------- */
const NAV = [
  ['office', 'Văn phòng 3D'], ['chat', 'Phòng chat'], ['jobs', 'Việc'],
  ['approvals', 'Phê duyệt'], ['people', 'Nhân sự & chức vụ'], ['budgets', 'Ngân sách'],
  ['logs', 'Nhật ký'], ['settings', 'Cài đặt & kit'], ['docs', 'Tài liệu thiết kế'],
];
function renderTopbar() {
  const st = $('#topbar-status');
  if (!st) return;
  const working = S.staff.filter((s) => effectiveStatus(s, S.approvals) === 'working').length;
  const waiting = S.staff.filter((s) => effectiveStatus(s, S.approvals) === 'waiting').length;
  const resting = S.staff.filter((s) => effectiveStatus(s, S.approvals) === 'resting').length;
  const pend = pendingApprovals().length;
  const conn = Session.demo ? 'DEMO NGOẠI TUYẾN' : (S.sseOk ? 'Trực tuyến · SSE' : 'Đã nối · đang thăm dò');
  st.textContent = '● ' + conn + '  ·  ' + working + ' đang làm · ' + waiting + ' đang chờ · ' + resting + ' đang nghỉ' + (S.health ? '  ·  ' + S.health.counts.jobs + ' việc' : '');
  $('#env-badge').hidden = !Session.demo;
  const badge = $('#approval-badge');
  badge.hidden = pend === 0;
  badge.textContent = pend + ' chờ duyệt';
  const nb = $('#nav-approval-badge'), nbm = $('#nav-approval-badge-m');
  [nb, nbm].forEach((b) => { if (b) { b.hidden = pend === 0; b.textContent = pend; } });
  updateChatBadge();
  $$('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === S.route;
    a.classList.toggle('active', on);
    if (a.getAttribute('aria-current') !== null || on) { if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  });
  const meLabel = $('#me-label');
  if (Session.me) meLabel.textContent = Session.me.name + ' — ' + myRole().name + (Session.demo ? ' (DEMO)' : '');
  /* Breadcrumb ở topbar + hồ sơ/kết nối ở chân sidebar: chỉ dữ liệu thật
   * đã có (danh tính phiên, trạng thái nối), không thêm số liệu mới. */
  const ROUTE_NAMES = { office: 'Văn phòng 3D', chat: 'Phòng chat', jobs: 'Việc', approvals: 'Phê duyệt', people: 'Nhân sự & chức vụ', budgets: 'Ngân sách', logs: 'Nhật ký', settings: 'Cài đặt & kit', docs: 'Tài liệu thiết kế' };
  const crumb = $('#crumb');
  if (crumb) crumb.textContent = ROUTE_NAMES[S.route] || 'Văn phòng 3D';
  const sideName = $('#side-me-name'), sideRole = $('#side-me-role'), sideAvatar = $('#side-avatar'), sideConn = $('#side-conn');
  if (Session.me) {
    if (sideName) sideName.textContent = Session.me.name;
    if (sideRole) sideRole.textContent = myRole().name + (Session.demo ? ' · DEMO' : '');
    if (sideAvatar) sideAvatar.textContent = Session.me.name.slice(0, 1).toUpperCase();
  }
  if (sideConn) sideConn.classList.toggle('off', !Session.demo && !S.sseOk);
}
function updateChatBadge() {
  const unread = S.messages.filter((m) => {
    const ts = new Date(m.at).getTime();
    if (ts <= S.lastChatSeen) return false;
    if (m.fromId === (Session.me && Session.me.id)) return false;
    const mine = m.toId === 'room' || m.toId === (Session.me && Session.me.id);
    const tagged = m.taggedIds && Session.me && m.taggedIds.includes(Session.me.id);
    return mine || tagged;
  }).length;
  [['#chat-badge'], ['#chat-badge-m']].forEach(([sel]) => {
    const b = $(sel); if (!b) return;
    b.hidden = unread === 0 || S.route === 'chat'; b.textContent = unread > 9 ? '9+' : String(unread);
  });
}
function markChatSeen() {
  S.lastChatSeen = Date.now();
  localStorage.setItem('office.chatSeen', String(S.lastChatSeen));
  updateChatBadge();
}
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return NAV.some(([r]) => r === h) ? h : 'office';
}
async function renderScreen(soft) {
  S.route = currentRoute();
  hideMobileSheet();
  renderTopbar();
  const screen = $('#screen');
  if (S.route !== 'office') Office3D.dispose();
  const fn = { office: renderOffice, chat: renderChat, jobs: renderJobs, approvals: renderApprovals, people: renderPeople, budgets: renderBudgets, logs: renderLogs, settings: renderSettings, docs: renderDocs }[S.route];
  try {
    await fn(screen);
    if (S.route === 'chat') markChatSeen();
  } catch (e) {
    screen.innerHTML = '<div class="card"><h1>Không tải được màn hình này</h1><p>' + esc(e.message || 'Lỗi không rõ.') + '</p><button class="btn" type="button" onclick="location.reload()">Tải lại trang</button></div>';
  }
  $('#more-sheet').hidden = true;
  $('#more-btn').setAttribute('aria-expanded', 'false');
  if (!soft) screen.focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => renderScreen());

/* ------------------------------ Đăng nhập --------------------------------- */
function showView(which) {
  $('#login-view').hidden = which !== 'login';
  $('#app-view').hidden = which !== 'app';
}
async function probeServer() {
  const stateEl = $('#server-state');
  if (isSb()) {
    try {
      await api.get('/api/health');
      stateEl.textContent = 'Đã nối Supabase (cấu hình trong web/config.js).';
      stateEl.className = 'server-state ok';
      return true;
    } catch {
      stateEl.textContent = 'Không nối được Supabase. Kiểm tra web/config.js (Project URL + anon key) và mạng, hoặc vào bản dùng thử ngoại tuyến bên dưới.';
      stateEl.className = 'server-state bad';
      $('#demo-enter').hidden = false; $('#demo-note').hidden = false;
      return false;
    }
  }
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(apiBase() + '/api/health', { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    stateEl.textContent = 'Đã nối máy chủ tại ' + (apiBase() || 'cùng địa chỉ trang web') + '.';
    stateEl.className = 'server-state ok';
    return true;
  } catch {
    stateEl.textContent = 'Không nối được máy chủ. Kiểm tra máy chủ đang chạy, hoặc vào bản dùng thử ngoại tuyến bên dưới.';
    stateEl.className = 'server-state bad';
    $('#demo-enter').hidden = false; $('#demo-note').hidden = false;
    return false;
  }
}
async function boot() {
  // Vào thẳng không cần đăng nhập (Giám đốc lệnh 31/10 10:08): thử vào thẳng
  // hệ thống với vai trò Giám đốc trước (meContext tự mặc định s-chung khi
  // chưa có phiên Auth); chỉ hiện màn đăng nhập khi vào thẳng thất bại.
  // Gắn lắng nghe form NGAY (đồng bộ) trước mọi lần fetch — tránh trường hợp
  // người dùng bấm Đăng nhập khi probe máy chủ còn đang chạy thì form gửi
  // theo cách truyền thống và tải lại trang.
  bindLogin();
  const ok = await probeServer();
  let needsSetup = false;
  if (ok) {
    try { const st = await api.get('/api/setup/status'); needsSetup = !!st.needsSetup; } catch { needsSetup = false; }
  }
  $('#setup-view').hidden = !needsSetup;
  $('#auth-view').hidden = needsSetup;
  if (needsSetup) $('#server-state').textContent = 'Máy chủ chưa có tài khoản Giám đốc — hoàn tất cài đặt lần đầu bên dưới.';
  // Chế độ Supabase: không thăm dò được "đã cài đặt chưa" khi chưa đăng
  // nhập (RLS chặn đọc khi chưa có phiên) nên luôn hiện nút cài đặt lần đầu
  // để Giám đốc tự mở khi cần — lần cài đặt thứ hai sẽ bị chặn ở máy chủ.
  const sbLink = $('#sb-setup-link');
  if (sbLink) sbLink.hidden = !isSb();
  if (ok && isSb() && !needsSetup) {
    // Vào thẳng: khôi phục phiên (hoặc mặc định Giám đốc khi chưa đăng nhập).
    try { await restoreSession(); return; } catch { Session.clear(); }
  }
  showView('login');
}
async function restoreSession() {
  const staff = await api.get('/api/staff');
  const ctx = await api.get('/api/context');
  const me = staff.find((s) => s.id === ctx.staff.id);
  if (!me) throw new Error('Phiên không còn hợp lệ.');
  Session.me = me;
  Session.meType = Session.demo ? (me.id === 's-chung' ? 'director' : 'staff') : await detectSessionKind();
  await enterApp();
}
async function detectSessionKind() {
  // Đọc loại phiên từ /api/context — KHÔNG thăm dò /api/audit (thăm dò đó
  // bị máy chủ ghi thành cảnh báo bảo mật, gây nhiễu hộp thư cảnh báo).
  try {
    const ctx = await api.get('/api/context');
    if (ctx.kind === 'director' || ctx.kind === 'staff') return ctx.kind;
  } catch { /* rơi xuống cách cũ */ }
  try { await api.get('/api/audit'); return 'director'; } catch (e) { if (e.status === 403) return 'staff'; throw e; }
}
function bindLogin() {
  // Gắn một lần duy nhất — boot() chạy lại sau mỗi lần đăng xuất.
  const form = $('#login-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
    $$('#login-form [data-pane]').forEach((p) => {
      const show = p.dataset.pane === tab.dataset.tab;
      p.hidden = !show;
      // Vô hiệu hoá trường ở khung đang ẩn: chỉ ẩn bằng `hidden` thì một số
      // trình duyệt vẫn tính trường required của khung ẩn vào kiểm tra hợp lệ
      // và chặn gửi form mà không báo gì (lỗi đã bắt được khi thử tab Nhân viên).
      p.querySelectorAll('input,select,textarea').forEach((el) => { el.disabled = !show; });
    });
    $('#login-error').hidden = true;
  }));
  // Trạng thái ban đầu: khung Nhân viên đang ẩn thì trường của nó phải bị vô hiệu hoá.
  $$('#login-form [data-pane]').forEach((p) => {
    const show = p.dataset.pane === 'director';
    p.querySelectorAll('input,select,textarea').forEach((el) => { el.disabled = !show; });
  });
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error'); err.hidden = true;
    const tab = $('.tab.active').dataset.tab;
    const fd = new FormData(e.target);
    try {
      if (tab === 'director') {
        const r = await api.post('/api/director/login', { password: fd.get('password') });
        if (r.needsMfaVerify) {
          // Tài khoản đã tạo nhưng chưa hoàn tất TOTP (cài đặt dở dang):
          // hiện lại mã mới để quét + xác minh trước khi vào hệ thống.
          sbDirectorContinue = true; sbMfaVerified = false;
          $('#login-form').hidden = true;
          $('#setup-view').hidden = false; $('#auth-view').hidden = true;
          $('#setup-form').hidden = true; $('#setup-result').hidden = false;
          $('#setup-secret').value = r.totpSecret;
          $('#setup-otpauth').textContent = r.otpauthUrl;
          const vw = $('#setup-verify-wrap'); if (vw) vw.hidden = false;
          toast('Tài khoản chưa hoàn tất xác thực 2 lớp — quét mã mới và nhập mã 6 số để xác minh.');
          return;
        }
        Session.save(r.token || (isSb() ? 'supabase' : ''), false);
        const staff = await api.get('/api/staff');
        Session.me = staff.find((s) => s.id === r.staffId) || staff[0];
        Session.meType = 'director';
      } else {
        const r = await api.post('/api/staff/login', { username: fd.get('username'), password: fd.get('passwordStaff') });
        Session.save(r.token || (isSb() ? 'supabase' : ''), false);
        // Kiểm tra bắt đổi mật khẩu TRƯỚC mọi lần gọi API khác: máy chủ từ
        // chối mọi API khác khi tài khoản đang bị bắt đổi mật khẩu.
        if (r.mustChangePassword) {
          $('#login-form').hidden = true; $('#change-form').hidden = false;
          return;
        }
        const staff = await api.get('/api/staff');
        Session.me = staff.find((s) => s.id === r.staffId);
        Session.meType = 'staff';
      }
      await enterApp();
    } catch (ex) { err.textContent = ex.message || 'Đăng nhập thất bại.'; err.hidden = false; }
  });
  $('#change-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#change-error'); err.hidden = true;
    const fd = new FormData(e.target);
    try {
      await api.post('/api/staff/change-password', { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') });
      $('#change-form').hidden = true; $('#login-form').hidden = false;
      await enterApp();
    } catch (ex) { err.textContent = ex.message || 'Đổi mật khẩu thất bại.'; err.hidden = false; }
  });
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      sbMfaVerified = false; sbDirectorContinue = false;
      const r = await api.post('/api/setup', { password: fd.get('password'), confirmPassword: fd.get('confirmPassword') });
      $('#setup-form').hidden = true;
      $('#setup-result').hidden = false;
      $('#setup-secret').value = r.totpSecret;
      $('#setup-otpauth').textContent = r.otpauthUrl;
      // Chế độ Supabase bắt xác minh TOTP ngay trong lượt cài đặt — nút
      // "tới màn hình đăng nhập" bị chặn cho tới khi xác minh xong.
      const vw = $('#setup-verify-wrap'); if (vw) vw.hidden = !isSb();
    } catch (ex) { toast(ex.message || 'Cài đặt thất bại.'); }
  });
  const sbVerifyBtn = $('#setup-verify');
  if (sbVerifyBtn) sbVerifyBtn.addEventListener('click', async () => {
    const code = ($('#setup-code').value || '').replace(/\s/g, '');
    try {
      await api.post('/api/setup/verify', { code });
      sbMfaVerified = true;
      toast('Đã xác minh mã xác thực.');
      if (sbDirectorContinue) {
        sbDirectorContinue = false;
        $('#setup-view').hidden = true; $('#auth-view').hidden = false;
        $('#login-form').hidden = false;
        Session.save('supabase', false);
        const staff = await api.get('/api/staff');
        const ctx = await api.get('/api/context');
        Session.me = staff.find((s) => s.id === ctx.staff.id) || staff[0];
        Session.meType = 'director';
        await enterApp();
      }
    } catch (ex) { toast(ex.message || 'Xác minh thất bại.'); }
  });
  $('#setup-done').addEventListener('click', () => {
    if (isSb() && !sbMfaVerified) { toast('Nhập mã 6 số từ ứng dụng xác thực và bấm “Xác minh mã” trước khi tới màn hình đăng nhập.'); return; }
    $('#setup-view').hidden = true; $('#auth-view').hidden = false;
    probeServer();
  });
  const sbLink = $('#sb-setup-link');
  if (sbLink) sbLink.addEventListener('click', () => {
    $('#setup-view').hidden = false; $('#auth-view').hidden = true;
    $('#setup-form').hidden = false; $('#setup-result').hidden = true;
  });
  $('#demo-enter').addEventListener('click', async () => {
    DemoDB.load();
    Session.save('demo', true);
    Session.me = DemoDB.data.staff[0];
    Session.meType = 'director';
    await enterApp();
  });
  $('#logout-btn').addEventListener('click', async () => {
    try { if (!Session.demo) await api.post('/api/director/logout', {}); } catch { /* bỏ qua */ }
    // Chế độ Supabase: đăng xuất trực tiếp thêm một lớp — nếu gọi API đăng
    // xuất ở trên lỗi mạng thì phiên Supabase còn lưu sẽ tự khôi phục ở
    // lần boot sau (người dùng bấm đăng xuất mà vẫn thấy mình đăng nhập).
    try { if (isSb()) await window.OfficeSupabase.client().auth.signOut(); } catch { /* bỏ qua */ }
    try { if (S.sse) S.sse.close(); } catch { /* bỏ qua */ }
    Session.clear(); Office3D.dispose();
    showView('login'); boot();
  });
  $('#approval-badge').addEventListener('click', () => { location.hash = '#/approvals'; });
  const sheetClose = $('#mobile-sheet-close');
  if (sheetClose) sheetClose.addEventListener('click', hideMobileSheet);
  $('#more-btn').addEventListener('click', () => {
    const sheet = $('#more-sheet'); const open = sheet.hidden;
    sheet.hidden = !open; $('#more-btn').setAttribute('aria-expanded', String(open));
    $('#more-btn').classList.toggle('active', open);
  });
  $$('#more-sheet a').forEach((a) => a.addEventListener('click', () => { $('#more-sheet').hidden = true; }));
}
async function enterApp() {
  showView('app');
  // Luồng đổi mật khẩu lần đầu đi qua form riêng và chưa gán danh tính —
  // lấy danh tính của phiên hiện tại trước khi vẽ màn hình, nếu chưa có.
  if (!Session.me) {
    const ctx = await api.get('/api/context');
    const staff = await api.get('/api/staff');
    Session.me = staff.find((s) => s.id === ctx.staff.id) || null;
    if (!Session.me) throw new Error('Không xác định được danh tính của phiên đăng nhập.');
    Session.meType = Session.demo ? (Session.me.id === 's-chung' ? 'director' : 'staff') : await detectSessionKind();
  }
  await refreshAll();
  await refreshHealth();
  connectSSE();
  startPolling();
  /* Chỉ gọi renderScreen() trực tiếp khi hash đã đúng — nếu vừa gán hash
   * mới thì sự kiện hashchange sẽ tự gọi renderScreen(); gọi thêm ở đây
   * sẽ thành hai lần renderOffice chồng nhau (đua init 3D, Bug C). */
  if (!location.hash) location.hash = '#/office';
  else await renderScreen();
  feedAdd('Đã đăng nhập: ' + Session.me.name + ' (' + myRole().name + ')' + (Session.demo ? ' — bản DEMO ngoại tuyến.' : ''));
}
document.addEventListener('DOMContentLoaded', boot);

/* ------------------------------ Văn phòng 3D ------------------------------ */
/* Cảnh 3D giữ lại từ bản trước (phòng, bàn, bảng Kanban, nhân vật, nhãn,
 * camera) nhưng đã sửa các lỗi ở ảnh chụp 30/10: nhãn TO + tương phản mạnh,
 * camera chuyển cảnh không bao giờ xoá khung hình, mất context WebGL thì
 * chuyển sang dạng 2D thay vì trang trắng, canvas chỉ tạo một lần và
 * không bị vẽ lại khi dữ liệu đổi. */
/* Bảng màu cảnh 3D "Obsidian" (theo hướng dẫn của ChatGPT, đã kiểm chứng
 * trực quan theo tỉ lệ cảnh này): sàn graphite, tường tối, bàn xám thép,
 * ánh sáng trắng lạnh + viền teal tiết chế. Chỉ một bảng duy nhất — cơ chế
 * ?theme= cũ đã bỏ. Không đổi hình học hay hành vi của cảnh. */
const SCENE_PALETTES = {
  default: { bg: 0x111b29, hemiSky: 0xc8d8e8, hemiGround: 0x172331, hemiInt: 1.55, sun: 0xf2f7ff, sunInt: 2.15, floor: 0x182431, wall: 0x202e3c, wall2: 0x1b2836, rug: 0x22384a, table: 0x647b8e, tableLeg: 0x26384b, chair: 0x34475d, shelf: 0x3a4a5c, pot: 0x4a5a68, bush: 0x3d6b4f, glass: 0x8fb4dd, boardFrame: 0x101c2c, deskTop: 0x53677a, deskLeg: 0x26384b, screen: 0x0e1620 },
};
const Office3D = {
  ready: false, mount: null, three: null, renderer: null, scene: null, camera: null,
  chars: new Map(), desks: new Map(), seats: [], mode: 'overview',
  orbit: { yaw: 0.55, pitch: 0.62, dist: 13.5, target: null },
  _raf: 0, _ro: null, _handlers: [], _builtIds: '', _builtScene: null, _initGen: 0,
  /* Bảng màu cảnh duy nhất (Obsidian). */
  pal() {
    return SCENE_PALETTES.default;
  },
  THREE_URLS: [
    new URL('vendor/three.module.js', SCRIPT_BASE).href,
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
  ],

  /* Thử từng nguồn thư viện 3D theo thứ tự: file đi kèm cùng nguồn trước
   * (không phụ thuộc mạng/CDN), rồi các CDN. Mỗi lần thử có trần 10 giây —
   * CDN treo không được giữ màn hình ở "Đang tải" mãi. Trả về null nếu tất
   * cả đều thất bại; bên gọi phải chuyển sang dạng 2D, không bao giờ ném lỗi. */
  async loadThree() {
    for (const url of this.THREE_URLS) {
      try {
        const mod = await Promise.race([
          import(url),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
        ]);
        if (mod && mod.Scene && mod.WebGLRenderer) return mod;
      } catch { /* thử nguồn tiếp theo */ }
    }
    return null;
  },

  async init(mount) {
    this.dispose();
    this.mount = mount;
    /* Chống hai lần init() chạy chồng nhau (bài học live 30/10, Bug C):
     * enterApp vừa gán location.hash vừa gọi renderScreen() nên
     * renderOffice chạy hai lần; lần init trước có thể dựng cảnh xong
     * sau khi lần sau đã dọn, hoặc ngược lại. Mỗi lần init lấy một số
     * thế hệ; sau mỗi lần chờ (await), nếu đã có thế hệ mới hơn thì lần
     * này là lần cũ — dừng lại, không dựng cảnh, không đụng vào DOM. */
    const gen = ++this._initGen;
    const THREE = await this.loadThree();
    if (gen !== this._initGen || this.mount !== mount) return { ok: false, aborted: true };
    if (!THREE) return { ok: false, reason: 'Không tải được thư viện 3D. Dạng 2D vẫn làm việc đầy đủ.' };
    this.three = THREE;
    try {
      return this.buildStage(mount, THREE);
    } catch (e) {
      this.dispose();
      return { ok: false, reason: 'Không dựng được cảnh 3D (' + (e.message || 'lỗi không rõ') + '). Dạng 2D vẫn làm việc đầy đủ.' };
    }
  },

  /* Dựng khung vẽ + cảnh. Tách riêng khỏi init() để mọi lỗi dựng cảnh đều
   * rơi vào catch của init() và chuyển sang dạng 2D — không bao giờ để lỗi
   * dựng cảnh leo lên thành màn hình lỗi fatal (bài học live 30/10:
   * buildRoom dùng biến THREE ngoài phạm vi nên "THREE is not defined"). */
  buildStage(mount, THREE) {
    const box = mount;
    const w = Math.max(200, box.clientWidth), h = Math.max(240, box.clientHeight);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    } catch (e) { return { ok: false, reason: 'Trình duyệt không tạo được khung vẽ WebGL. Dạng 2D vẫn làm việc đầy đủ.' }; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    /* updateStyle=false: cỡ hiển thị do CSS (.stage canvas width/height
     * 100%) quyết — setSize chỉ đổi bộ đệm vẽ + tỉ lệ. Để three.js ghi
     * style inline (679px) thì canvas giữ cột lưới ở cỡ cũ, trang
     * không thu hẹp được khi resize/xoay (tràn ngang 390px, 30/10). */
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* Ánh xạ tông ACES + phơi sáng 1.05 (tham chiếu của GPT): ánh sáng dịu,
     * vùng tối không bị chết đen, vùng sáng không cháy. */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    box.innerHTML = ''; // Xoá dòng "Đang tải cảnh 3D…" — nếu không nó nằm lại trên đầu khung vẽ, bị nút camera che một phần.
    box.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const P = this.pal();
    scene.background = new THREE.Color(P.bg);    scene.fog = new THREE.Fog(P.bg, 18, 34);
    this.scene = scene;
    /* FOV 38 (tham chiếu GPT) thay cho 46: khung nhìn điện ảnh hơn, nhân
     * vật lớn hơn trong khung; các preset camera đã nằm trong khoảng nhìn
     * xuống 25–35°, fitLabels() giữ nhãn ổn định nên không cần đổi preset. */
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    this.camera = camera;
    this.applyCamera(0);

    scene.add(new THREE.HemisphereLight(P.hemiSky, P.hemiGround, P.hemiInt));
    const sun = new THREE.DirectionalLight(P.sun, P.sunInt);
    sun.position.set(7, 12, 6); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0002;
    scene.add(sun);
    /* Viền teal TIẾT CHẾ (một nguồn duy nhất, góc sau-trái) + ánh sáng
     * lấp xanh dịu phía đối diện — đúng vai trò accent, không nhuộm cả phòng. */
    const rimLight = new THREE.PointLight(0x2dd4bf, 16, 18, 2);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight(0x7899c7, 7, 15, 2);
    fillLight.position.set(5, 3, 4);
    scene.add(fillLight);
    /* Lưới sàn rất mờ, đúng kích thước sàn — tạo cảm giác mặt phẳng mở
     * mà không vẽ thêm hình học. */
    const grid = new THREE.GridHelper(16, 16, 0x496075, 0x2d4052);
    grid.position.set(0, -0.018, -1.4);
    grid.material.transparent = true; grid.material.opacity = 0.19;
    scene.add(grid);

    this.buildRoom();
    this.buildBoard();
    this.sync();
    this.bindControls();
    const canvas = renderer.domElement;
    const onLost = (e) => {
      e.preventDefault();
      this.showStageError('Khung vẽ 3D bị thu hồi (thường do thiếu bộ nhớ). Đã chuyển sang dạng 2D — dữ liệu không mất.');
      this.dispose();
      renderOfficeFallback();
    };
    canvas.addEventListener('webglcontextlost', onLost, false);
    this._handlers.push(['webglcontextlost', canvas, onLost]);
    const onRestored = () => { this.hideStageError(); this.sync(); };
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    this._handlers.push(['webglcontextrestored', canvas, onRestored]);

    this._ro = new ResizeObserver(() => {
      if (!this.renderer || !this.mount) return;
      const nw = Math.max(200, this.mount.clientWidth), nh = Math.max(240, this.mount.clientHeight);
      this.camera.aspect = nw / nh; this.camera.updateProjectionMatrix();
      this.renderer.setSize(nw, nh, false);
    });
    this._ro.observe(box);

    const clock = new THREE.Clock();
    const tick = () => {
      /* Vòng lặp của lần init cũ (đã bị lần init mới thay thế) phải dừng
       * ngay, không vẽ lên khung vẽ đã bị dọn — nếu không hai vòng lặp
       * cùng chạy, khung hình của cảnh cũ đè lên cảnh mới. */
      if (this.renderer !== renderer) return;
      this._raf = requestAnimationFrame(tick);
      try {
        const dt = Math.min(clock.getDelta(), 0.05);
        this.animate(dt);
        if (this.mode === 'follow') this.applyCamera(dt);
        this.fitLabels();
        renderer.render(scene, camera);
      } catch (e) {
        /* Lỗi trong vòng lặp vẽ (VD: mất context WebGL giữa chừng) không
         * được để thành trang trắng hay màn hình lỗi: dừng vòng lặp, dọn
         * khung vẽ và chuyển sang dạng 2D đầy đủ thao tác. */
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = 0;
        this.showStageError('Khung vẽ 3D gặp sự cố khi đang chạy. Đã chuyển sang dạng 2D — dữ liệu không mất.');
        this.dispose();
        renderOfficeFallback();
      }
    };
    tick();
    this.ready = true;
    return { ok: true };
  },

  buildRoom() {
    const T = this.three, scene = this.scene, P = this.pal();
    const floorMat = new T.MeshStandardMaterial({ color: P.floor, roughness: 0.90, metalness: 0.04 });
    const floor = new T.Mesh(new T.PlaneGeometry(16, 11), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -1.4); floor.receiveShadow = true;
    scene.add(floor);
    /* Tường thấp (3.2 thay cho 4.2) + màu tối: giảm sự áp đảo của tường,
     * cảm giác không gian mở hơn, bảng Kanban và nhân vật nổi lên. */
    const wallMat = new T.MeshStandardMaterial({ color: P.wall, roughness: 0.88, metalness: 0.03 });
    const back = new T.Mesh(new T.PlaneGeometry(16, 3.2), wallMat);
    back.position.set(0, 1.6, -6.9); back.receiveShadow = true; scene.add(back);
    const left = new T.Mesh(new T.PlaneGeometry(11, 3.2), new T.MeshStandardMaterial({ color: P.wall2, roughness: 0.88, metalness: 0.03 }));
    left.rotation.y = Math.PI / 2; left.position.set(-8, 1.6, -1.4); scene.add(left);
    const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = 8; scene.add(right);
    const rug = new T.Mesh(new T.CircleGeometry(2.6, 40), new T.MeshStandardMaterial({ color: P.rug, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.5, 0.02, -0.6); rug.receiveShadow = true; scene.add(rug);
    // Bàn họp + ghế
    const table = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 0.12, 36), new T.MeshStandardMaterial({ color: P.table, roughness: 0.67, metalness: 0.12 }));
    table.position.set(0.5, 0.78, -0.6); table.castShadow = true; scene.add(table);
    const leg = new T.Mesh(new T.CylinderGeometry(0.16, 0.22, 0.78, 16), new T.MeshStandardMaterial({ color: P.tableLeg }));
    leg.position.set(0.5, 0.39, -0.6); scene.add(leg);
    this.seats = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const p = { x: 0.5 + Math.cos(a) * 2.2, z: -0.6 + Math.sin(a) * 2.2, angle: a + Math.PI };
      this.seats.push(p);
      const chair = new T.Mesh(new T.BoxGeometry(0.55, 0.5, 0.55), new T.MeshStandardMaterial({ color: P.chair, roughness: 0.8 }));
      chair.position.set(p.x, 0.25, p.z); chair.castShadow = true; scene.add(chair);
    }
    // Kệ + cây cảnh góc
    const shelf = new T.Mesh(new T.BoxGeometry(2.6, 1.8, 0.4), new T.MeshStandardMaterial({ color: P.shelf, roughness: 0.8 }));
    shelf.position.set(-6.4, 0.9, -6.6); scene.add(shelf);
    const pot = new T.Mesh(new T.CylinderGeometry(0.32, 0.26, 0.5, 16), new T.MeshStandardMaterial({ color: P.pot }));
    pot.position.set(6.9, 0.25, -6.1); scene.add(pot);
    const bush = new T.Mesh(new T.SphereGeometry(0.55, 16, 12), new T.MeshStandardMaterial({ color: P.bush, roughness: 1 }));
    bush.position.set(6.9, 0.95, -6.1); scene.add(bush);
    // Phòng Giám đốc: vách kính mờ phía trái — mờ hơn để không chặn tầm nhìn.
    const glass = new T.Mesh(new T.PlaneGeometry(3.6, 3.0), new T.MeshStandardMaterial({ color: P.glass, transparent: true, opacity: 0.18, roughness: 0.2 }));
    glass.position.set(-5.9, 1.5, -3.4); glass.rotation.y = Math.PI / 2; scene.add(glass);
  },

  buildBoard() {
    const T = this.three, scene = this.scene, P = this.pal();
    const frame = new T.Mesh(new T.BoxGeometry(4.6, 2.2, 0.08), new T.MeshStandardMaterial({ color: P.boardFrame, roughness: 0.6 }));
    frame.position.set(1.2, 1.7, -6.82); scene.add(frame);
    const cols = ['#f2c14e', '#4aa3df', '#e67e22', '#35d07f'];
    cols.forEach((c, i) => {
      const col = new T.Mesh(new T.BoxGeometry(1.0, 1.8, 0.05), new T.MeshStandardMaterial({ color: new T.Color(c), roughness: 0.8 }));
      col.position.set(-0.55 + i * 1.16, 1.7, -6.76); scene.add(col);
    });
  },

  deskPosition(st, index) {
    const role = roleOfStaff(st);
    if (role.canManage) return { x: -6.3, z: -4.6, angle: 0.6 };
    const i = index;
    return { x: -1.3 + (i % 5) * 2.35, z: -4.7 + Math.floor(i / 5) * 1.6, angle: 0 };
  },
  buildDesk(p, color) {
    const T = this.three, P = this.pal();
    const g = new T.Group();
    const top = new T.Mesh(new T.BoxGeometry(1.7, 0.08, 0.85), new T.MeshStandardMaterial({ color: P.deskTop, roughness: 0.67, metalness: 0.12 }));
    top.position.y = 0.74; top.castShadow = true; g.add(top);
    const legM = new T.MeshStandardMaterial({ color: P.deskLeg });
    [[-0.75, -0.32], [0.75, -0.32], [-0.75, 0.32], [0.75, 0.32]].forEach(([x, z]) => {
      const leg = new T.Mesh(new T.BoxGeometry(0.08, 0.74, 0.08), legM);
      leg.position.set(x, 0.37, z); g.add(leg);
    });
    /* Màn hình hơi phát sáng như đang bật — điểm sáng nhỏ giúp bàn làm
     * việc không còn là khối chết trong cảnh tối. */
    const screen = new T.Mesh(new T.BoxGeometry(0.7, 0.45, 0.04), new T.MeshStandardMaterial({ color: P.screen, roughness: 0.42, metalness: 0.15, emissive: 0x0b2527, emissiveIntensity: 0.35 }));
    screen.position.set(0, 1.02, -0.28); g.add(screen);
    const chair = new T.Mesh(new T.BoxGeometry(0.6, 0.55, 0.6), new T.MeshStandardMaterial({ color, roughness: 0.85 }));
    chair.position.set(0, 0.28, 0.85); chair.castShadow = true; g.add(chair);
    g.position.set(p.x, 0, p.z); g.rotation.y = p.angle || 0;
    return g;
  },
  /* Nhãn kính tối (theo mẫu của GPT): nền tối gần đặc, viền sáng mảnh,
   * chấm trạng thái màu ngữ nghĩa + tên trắng + dòng phụ xám. Kích thước
   * khung 400×152 giữ nguyên để logic fitLabels() (tỉ lệ khung, kẹp mép,
   * tách chồng) không phải sửa. Người đang được chọn (mở rộng) có thêm
   * dòng thứ ba là việc đang làm — tên việc thật, cắt ngắn, không số
   * liệu bịa; người khác giữ 2 dòng như cũ. */
  makeLabel(name, roleName, statusLabel, dotCss, task) {
    const T = this.three;
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 152;
    const ctx = canvas.getContext('2d');
    const round = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    ctx.clearRect(0, 0, 400, 152);
    round(4, 8, 392, 136, 26);
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(15,23,42,0.88)'; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.stroke();
    /* Co chữ vừa khung: tên/chức vụ dài không được vẽ tràn ra ngoài hộp. */
    const fitFont = (text, start, min, weight) => {
      let size = start;
      ctx.font = weight + ' ' + size + 'px Inter, system-ui, sans-serif';
      while (size > min && ctx.measureText(text).width > 336) { size -= 2; ctx.font = weight + ' ' + size + 'px Inter, system-ui, sans-serif'; }
      return size;
    };
    const taskText = task ? (task.length > 30 ? task.slice(0, 29) + '…' : task) : '';
    const nameSize = fitFont(name, taskText ? 46 : 52, 28, '650');
    ctx.font = '650 ' + nameSize + 'px Inter, system-ui, sans-serif';
    const nameW = ctx.measureText(name).width;
    /* Chấm trạng thái đứng trước tên, cùng hàng — đo từ giữa khung để
     * cả cụm chấm + tên luôn căn giữa. */
    const dotX = 200 - nameW / 2 - 16;
    ctx.beginPath(); ctx.arc(dotX, taskText ? 46 : 52, 9, 0, Math.PI * 2);
    ctx.fillStyle = dotCss || '#2DD4BF'; ctx.fill();
    ctx.fillStyle = '#F1F5F9'; ctx.textAlign = 'center';
    ctx.fillText(name, 200, taskText ? 60 : 68);
    const sub = roleName + (statusLabel ? ' · ' + statusLabel : '');
    const subSize = fitFont(sub, taskText ? 30 : 34, 18, '550');
    ctx.fillStyle = '#A3B2C5'; ctx.font = '550 ' + subSize + 'px Inter, system-ui, sans-serif';
    ctx.fillText(sub, 200, taskText ? 94 : 118);
    if (taskText) {
      const taskSize = fitFont(taskText, 26, 16, '500');
      ctx.fillStyle = '#2DD4BF'; ctx.font = '500 ' + taskSize + 'px Inter, system-ui, sans-serif';
      ctx.fillText(taskText, 200, 128);
    }
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new T.Sprite(mat);
    sprite.scale.set(2.6, 0.88, 1);
    sprite.renderOrder = 20;
    return sprite;
  },
  buildChar(st, deskPos) {
    const T = this.three;
    const g = new T.Group();
    const palette = { 's-chung': 0x1f3a5f, 's-muse': 0x0b6bcb };
    const color = palette[st.id] || [0x2f6f4f, 0x8a5a33, 0x6b4f9e, 0x9e3d64, 0x3d7a8a][Math.abs([...st.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 5];
    const body = new T.Mesh(new T.CapsuleGeometry(0.30, 0.62, 6, 14), new T.MeshStandardMaterial({ color, roughness: 0.75 }));
    body.position.y = 0.95; body.castShadow = true; g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.26, 20, 16), new T.MeshStandardMaterial({ color: 0xf2c89b, roughness: 0.7 }));
    head.position.y = 1.72; head.castShadow = true; g.add(head);
    const ringMat = new T.MeshBasicMaterial({ color: 0x35d07f });
    const ring = new T.Mesh(new T.TorusGeometry(0.48, 0.045, 10, 32), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    const lamp = new T.Mesh(new T.SphereGeometry(0.11, 12, 10), new T.MeshBasicMaterial({ color: 0xe5484d }));
    lamp.position.y = 2.45; lamp.visible = false; g.add(lamp);
    const hit = new T.Mesh(new T.BoxGeometry(1.1, 2.3, 1.1), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.1; hit.userData.staffId = st.id; g.add(hit);
    g.position.set(deskPos.x, 0, deskPos.z + 0.95);
    g.userData = { staffId: st.id, home: new T.Vector3(deskPos.x, 0, deskPos.z + 0.95), target: null, queue: [], jump: 0, label: null, ringMat, lamp, hit };
    this.scene.add(g);
    return g;
  },
  refreshLabel(char, st) {
    const T = this.three;
    const es = effectiveStatus(st, S.approvals);
    const status = STATUS_META[es];
    if (char.userData.label) { char.remove(char.userData.label); char.userData.label.material.map.dispose(); char.userData.label.material.dispose(); }
    /* Chỉ người đang được chọn mới hiện việc đang làm trên nhãn (dạng mở
     * rộng) — tránh mọi nhãn đều dài gây chồng lấn như bản tham chiếu. */
    const task = S.selectedStaffId === st.id ? (currentJobOf(st.id) || {}).name || null : null;
    const label = this.makeLabel(st.name, roleOfStaff(st).name, status.label, STATUS_DOT_CSS[es], task);
    label.position.y = 2.85;
    char.add(label);
    char.userData.label = label;
    char.userData.ringMat.color.setHex(status.ring);
    char.userData.lamp.visible = pendingApprovals().some((a) => a.requesterId === st.id);
  },
  sync() {
    if (!this.scene || !this.three) return;
    const ids = S.staff.map((s) => s.id).join(',');
    /* Dựng lại khi tập nhân vật đổi HOẶC khi cảnh hiện tại không phải cảnh
     * mà nhân vật đã dựng (hai lần init chồng nhau: lần init sau dựng cảnh
     * mới nhưng sync() thấy ids không đổi nên không dựng lại — nhân vật
     * nằm lại trong cảnh cũ đã bị tháo, cảnh mới chỉ có sàn + bàn họp).
     * Trường hợp nhân vật chưa có mà danh sách đã có (dữ liệu tới muộn)
     * cũng dựng lại — không bao giờ để cảnh trống âm thầm. */
    if (ids !== this._builtIds || this._builtScene !== this.scene || (S.staff.length && this.chars.size === 0)) {
      // Tập nhân vật đổi: dựng lại (canvas giữ nguyên — không xoá khung vẽ).
      for (const [, ch] of this.chars) { this.scene.remove(ch); }
      for (const [, dk] of this.desks) { this.scene.remove(dk); }
      this.chars.clear(); this.desks.clear();
      let k = 0;
      for (const st of S.staff) {
        const p = this.deskPosition(st, k);
        if (!roleOfStaff(st).canManage) k++;
        const desk = this.buildDesk(p, 0x2f6f4f);
        this.scene.add(desk); this.desks.set(st.id, desk);
        const ch = this.buildChar(st, p);
        this.chars.set(st.id, ch);
        this.refreshLabel(ch, st);
      }
      this._builtIds = ids;
      this._builtScene = this.scene;
      if (S.selectedStaffId && this.chars.has(S.selectedStaffId)) this.focusStaff(S.selectedStaffId, true);
    } else {
      for (const st of S.staff) {
        const ch = this.chars.get(st.id);
        if (ch) this.refreshLabel(ch, st);
      }
    }
  },
  walkTo(staffId, pos, then) {
    const ch = this.chars.get(staffId); if (!ch) return;
    ch.userData.queue.push({ pos, then: then || null });
    if (!ch.userData.target && ch.userData.queue.length) { const n = ch.userData.queue.shift(); ch.userData.target = n; }
  },
  goHome(staffId) {
    const ch = this.chars.get(staffId); if (!ch) return;
    this.walkTo(staffId, ch.userData.home.clone());
  },
  goToSeat(staffId, seatIndex) {
    const seat = this.seats[seatIndex % this.seats.length]; if (!seat) return;
    const T = this.three;
    const ch = this.chars.get(staffId); if (!ch) return;
    this.walkTo(staffId, new T.Vector3(seat.x, 0, seat.z));
    ch.userData.seatAngle = seat.angle;
  },
  celebrate(staffId) {
    const ch = this.chars.get(staffId); if (ch) ch.userData.jump = 0.55;
  },
  onJobEvent(job, change) {
    if (!this.ready) return;
    if (change === 'claimed' && job.claimedBy) {
      const board = this.three.Vector3 ? new this.three.Vector3(1.2, 0, -5.6) : null;
      this.walkTo(job.claimedBy, board);
      this.goHome(job.claimedBy);
    } else if (change === 'submitted') {
      const rv = this.chars.get(job.reviewerId);
      if (rv) this.walkTo(job.assigneeId, rv.position.clone());
      this.goHome(job.assigneeId);
    } else if (change === 'approved') {
      this.celebrate(job.assigneeId);
      this.goHome(job.assigneeId);
    }
  },
  animate(dt) {
    for (const [, ch] of this.chars) {
      const u = ch.userData;
      if (u.jump > 0) { u.jump -= dt; ch.position.y = Math.max(0, Math.sin((0.55 - u.jump) / 0.55 * Math.PI)) * 0.5; if (u.jump <= 0) ch.position.y = 0; }
      const target = u.target ? u.target.pos : null;
      if (target) {
        const dx = target.x - ch.position.x, dz = target.z - ch.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.08) {
          ch.position.x = target.x; ch.position.z = target.z;
          const done = u.target; u.target = null;
          if (u.queue.length) u.target = u.queue.shift();
          if (done && done.then) done.then();
          if (u.seatAngle !== undefined && !u.target) ch.rotation.y = u.seatAngle;
        } else {
          const step = Math.min(dist, 2.4 * dt);
          ch.position.x += (dx / dist) * step; ch.position.z += (dz / dist) * step;
          ch.rotation.y = Math.atan2(dx, dz);
          ch.position.y = Math.abs(Math.sin(performance.now() / 130)) * 0.03;
        }
      }
    }
  },
  applyCamera() {
    const T = this.three, cam = this.camera;
    if (!cam) return;
    const o = this.orbit;
    if (this.mode === 'overview') { cam.position.set(1.2, 7.6, 11.2); cam.lookAt(0.8, 0.5, -1.4); return; }
    if (this.mode === 'top') { cam.position.set(0, 13.5, 0.6); cam.lookAt(0, 0, -1.2); return; }
    /* Góc Phòng họp: lùi ra + nâng điểm nhìn lên (từ 0.4 lên 1.0) để
     * hàng ghế sau và nhãn tên còn trong khung — bản cũ nhìn thấp nên
     * nhãn vượt lên mép trên khung cảnh, chỉ còn thấy một dải dưới. */
    if (this.mode === 'meeting') { cam.position.set(0.5, 4.3, 6.0); cam.lookAt(0.5, 1.0, -0.8); return; }
    if (this.mode === 'follow') {
      const ch = this.chars.get(S.selectedStaffId);
      if (ch) {
        const p = ch.position;
        /* Góc Theo người: lùi xa hơn + nhìn xuống ~25° để nhãn của người
         * đang theo không phóng to và không bị cắt ở mép trên; fitLabels()
         * giữ kích thước nhãn ổn định theo khoảng cách. */
        cam.position.set(p.x + 2.4, 3.6, p.z + 3.8);
        cam.lookAt(p.x, 1.5, p.z);
      }
      return;
    }
    // Chế độ tự do sau khi kéo: quỹ đạo quanh tâm phòng.
    const cx = 0, cz = -1.2;
    cam.position.set(cx + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, 0.6 + Math.sin(o.pitch) * o.dist, cz + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    cam.lookAt(cx, 0.8, cz);
  },
  /* Giữ nhãn tên LUÔN đọc được ở mọi góc nhìn — chạy mỗi khung hình, tính
   * lại từ đầu (không cộng dồn) nên không bao giờ trôi vị trí:
   * 1) Kích thước theo khoảng cách: nhãn xa thu nhỏ theo đúng tỉ lệ phối
   *    cảnh để chiều cao trên màn hình gần như không đổi (~46px ở khung
   *    480px) — góc gần (Theo người) không còn phóng to, góc xa (Góc
   *    tổng) không còn tí hon. Kẹp trong khoảng để không quá nhỏ/to.
   * 2) Kẹp mép trên: nhãn không bao giờ vượt lên vùng hàng nút camera
   *    (đo chiều cao thật của .camrow, vì nó xuống hai hàng ở màn hẹp)
   *    — nếu chiếu lên quá cao thì hạ nhãn xuống, tối thiểu ngang đầu.
   * 3) Tách nhãn chồng nhau: nhãn nào chiếu lên đè nhau thì đẩy cái dưới
   *    xuống / cái trên lên trong khoảng cho phép, rồi kẹp lại mép trên.
   * Ở góc Theo người, nhãn của người khác mờ + nhỏ đi để không đè lên
   * nhãn người đang theo. Nhãn sau camera thì giữ nguyên, không chạm. */
  fitLabels() {
    const cam = this.camera, T = this.three;
    if (!cam || !this.scene || !this.chars.size) return;
    const mount = this.mount;
    const H = Math.max(240, mount ? mount.clientHeight : 480);
    const W = Math.max(200, mount ? mount.clientWidth : 640);
    let marginPx = 64;
    try {
      const stage = mount ? mount.closest('.stage') : null;
      const row = stage ? stage.querySelector('.camrow') : null;
      if (row && mount) marginPx = Math.max(56, row.getBoundingClientRect().bottom - mount.getBoundingClientRect().top + 8);
    } catch { /* giữ mặc định */ }
    const topLimit = 1 - (2 * (marginPx + 4)) / H; // NDC y tối đa của MÉP TRÊN nhãn
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const aspect = cam.aspect || W / H;
    const targetPx = Math.max(32, Math.min(46, H * 0.084));
    const followed = this.mode === 'follow' ? this.chars.get(S.selectedStaffId) : null;
    const v = new T.Vector3();
    cam.updateMatrixWorld();
    const BASE_Y = 2.85, MIN_Y = 2.3, MAX_Y = 3.35;
    const items = [];
    for (const [, ch] of this.chars) {
      const lab = ch.userData.label;
      if (!lab) continue;
      lab.position.set(0, BASE_Y, 0);
      lab.getWorldPosition(v);
      const dist = Math.max(1, cam.position.distanceTo(v));
      /* Nhãn quá gần mặt phẳng camera hoặc sau camera thì phép chiếu
       * cho ra toạ độ gương/khổng lồ — chạm vào sẽ tính ra độ dịch
       * điên rồ và quăng nhãn đi xa (lỗi góc Theo người). Bỏ qua hẳn:
       * nhãn đó vốn đã ngoài khung nhìn, three.js tự loại khỏi khung vẽ. */
      const viewZ = v.clone().applyMatrix4(cam.matrixWorldInverse).z;
      if (viewZ > -0.5 || dist > 40) continue;
      const p = v.clone().project(cam);
      const dim = followed && ch !== followed;
      const worldH = Math.max(0.12, Math.min(1.05, ((targetPx * (dim ? 0.78 : 1)) / H) * 2 * dist * tanHalf));
      const worldW = worldH * (400 / 152);
      lab.scale.set(worldW, worldH, 1);
      if (lab.material) lab.material.opacity = dim ? 0.8 : 1;
      items.push({ ch, lab, dist, y: BASE_Y, shift: 0, shiftY: 0, dim, worldH, worldW });
    }
    if (!items.length) return;
    // Đo vị trí chiếu lên màn hình với y/hiện tại (đặt vị trí rồi mới đo).
    // QUAN TRỌNG: khoảng cách + kích thước nhãn tính lại từ VỊ TRÍ THẬT
    // sau khi dịch ngang — độ dịch có thể kéo nhãn lại gần/xa camera
    // rất nhiều (góc Theo người: 4,98 → 2,64), dùng khoảng cách lúc
    // chưa dịch sẽ đánh giá sai kích thước trên màn hình tới 2 lần và
    // tách chồng tính sai (lỗi đo được 30/10: hh 17px trong khi thật 32px).
    const measure = (it) => {
      applyShift(it);
      it.lab.getWorldPosition(v);
      // Nhãn trôi tới gần/sau mặt phẳng camera trong lúc chỉnh: dừng
      // ngay, không đo tiếp bằng phép chiếu gương.
      if (v.clone().applyMatrix4(cam.matrixWorldInverse).z > -0.5) { it.dead = true; return; }
      it.dead = false;
      it.dist = Math.max(1, cam.position.distanceTo(v));
      it.worldH = Math.max(0.12, Math.min(1.05, ((targetPx * (it.dim ? 0.78 : 1)) / H) * 2 * it.dist * tanHalf));
      it.worldW = it.worldH * (400 / 152);
      it.lab.scale.set(it.worldW, it.worldH, 1);
      const p = v.clone().project(cam);
      const halfH = it.worldH / 2 / (it.dist * tanHalf);
      const halfW = it.worldW / 2 / (it.dist * tanHalf * aspect);
      it.ndcX = p.x; it.ndcY = p.y; it.halfH = halfH; it.halfW = halfW;
      it.cx = ((p.x + 1) / 2) * W; it.cy = ((1 - p.y) / 2) * H;
      it.hw = halfW * (W / 2); it.hh = halfH * (H / 2);
    };
    // Dịch ngang theo hướng phải của camera (đổi ra hệ toạ độ của nhóm
    // nhân vật, vì nhãn là con của nhóm có thể đã xoay) — dùng để kéo
    // nhãn khỏi mép trái/phải khung cảnh.
    const right = new T.Vector3();
    const quat = new T.Quaternion();
    const fwd = new T.Vector3();
    const applyShift = (it) => {
      cam.getWorldQuaternion(quat);
      fwd.set(0, 0, -1).applyQuaternion(quat); // hướng camera đang nhìn
      right.crossVectors(fwd, cam.up);
      if (right.lengthSq() < 0.0001) right.set(1, 0, 0); else right.normalize();
      // Hướng "xuống màn hình" trong không gian thế giới: dùng khi hạ
      // độ cao y đã chạm sàn mà nhãn vẫn vượt mép trên (góc Từ trên/
      // Phòng họp ở màn hẹp — hạ y gần như không đổi vị trí chiếu
      // khi nhìn gần thẳng đứng). Độ dịch dọc shiftY dịch nhãn xuống
      // màn hình mà không cần đổi độ cao.
      const down = new T.Vector3().crossVectors(right, fwd).normalize().negate();
      const wx = right.x * it.shift + down.x * it.shiftY;
      const wy = right.y * it.shift + down.y * it.shiftY;
      const wz = right.z * it.shift + down.z * it.shiftY;
      const local = new T.Vector3(wx, wy, wz).applyAxisAngle(new T.Vector3(0, 1, 0), -it.ch.rotation.y);
      it.lab.position.set(local.x, it.y + local.y, local.z);
    };
    // Dịch nhãn dọc màn hình một lượng px (dương = xuống dưới): ưu
    // tiên đổi độ cao y trong [MIN_Y, MAX_Y]; phần vượt thì dịch dọc
    // shiftY (hướng xuống màn hình trong không gian thế giới). BẮT
    // BUỘC ở góc nhìn gần thẳng đứng, nơi đổi y gần như không đổi
    // vị trí chiếu của nhãn (chỉ thu nhỏ) — tách dọc bằng y thuần
    // không bao giờ tách được (lỗi Từ trên/Phòng họp 390px, 30/10).
    const pushScreenY = (it, pxDown) => {
      const world = (pxDown / (H / 2)) * it.dist * tanHalf;
      const yTarget = it.y - world;
      if (yTarget >= MIN_Y && yTarget <= MAX_Y) { it.y = yTarget; return; }
      if (yTarget < MIN_Y) {
        it.shiftY = Math.max(-4, Math.min(4, it.shiftY + (MIN_Y - yTarget)));
        it.y = MIN_Y;
      } else {
        it.shiftY = Math.max(-4, Math.min(4, it.shiftY - (yTarget - MAX_Y)));
        it.y = MAX_Y;
      }
    };
    const clampTop = (it) => {
      measure(it);
      if (it.dead) return;
      const over = it.ndcY + it.halfH - topLimit;
      if (over > 0) pushScreenY(it, over * (H / 2));
    };
    items.forEach(clampTop);
    // Kẹp mép trái/phải TRƯỚC khi tách chồng: độ dịch ngang đổi hẳn vị
    // trí chiếu của nhãn — tách chồng phải đo trên vị trí đã dịch, nếu
    // không nhãn bị kéo ngang vào nhau sau khi tách xong mà không ai
    // tách lại (lỗi góc Theo người: nhãn Muse bị kéo từ mép phải về
    // đè lên nhãn Chung).
    // Độ dịch kẹp trong 4 đơn vị thế giới — vượt quá là số liệu chiếu
    // hỏng, không được quăng nhãn đi xa. (Chắn dưới này chỉ chặn số
    // liệu hỏng: chắn gần mặt phẳng camera ở trên đã loại phép chiếu
    // gương, và độ dịch tính lại từ 0 mỗi khung hình nên không cộng dồn.)
    items.forEach(measure);
    for (const it of items) {
      if (it.dead) continue;
      const overR = it.cx + it.hw - (W - 4);
      const overL = 4 - (it.cx - it.hw);
      if (overR > 0) it.shift -= (overR / (W / 2)) * it.dist * tanHalf * aspect;
      else if (overL > 0) it.shift += (overL / (W / 2)) * it.dist * tanHalf * aspect;
      it.shift = Math.max(-4, Math.min(4, it.shift));
    }
    // Tách nhãn chồng nhau: duyệt từ trên xuống, nhãn nào đè lên nhãn
    // đã đặt (trùng cả ngang lẫn dọc) thì hạ xuống cho tới khi đủ hở —
    // chỉ hạ xuống, không đẩy lên, để không triệt tiêu lẫn nhau như
    // kiểu đẩy hai chiều. Tối đa hai lượt đo lại.
    for (let round = 0; round < 2; round++) {
      items.forEach(measure);
      const sorted = [...items].filter((it) => !it.dead).sort((a, b) => a.cy - b.cy);
      const placed = [];
      for (const it of sorted) {
        let floorPx = -Infinity;
        for (const prev of placed) {
          const overlapX = Math.abs(it.cx - prev.cx) < (it.hw + prev.hw) * 1.08;
          if (overlapX) floorPx = Math.max(floorPx, prev.cy + prev.hh + 3);
        }
        const top = it.cy - it.hh;
        if (floorPx > -Infinity && top < floorPx) {
          pushScreenY(it, floorPx - top);
          measure(it);
        }
        placed.push(it);
      }
    }
    // Lượt 2: nếu vẫn đè nhau (thường do nhãn dưới đã chạm sàn
    // MIN_Y), nhích nhãn trên lên tới MAX_Y — kẹp mép trên ở cuối sẽ
    // giữ nó không vượt lên vùng nút camera.
    items.forEach(measure);
    const sorted2 = [...items].filter((it) => !it.dead).sort((a, b) => a.cy - b.cy);
    const placed2 = [];
    for (const it of sorted2) {
      for (const prev of placed2) {
        const overlapX = Math.abs(it.cx - prev.cx) < (it.hw + prev.hw) * 1.08;
        const overlapY = Math.abs(it.cy - prev.cy) < (it.hh + prev.hh) * 1.08;
        if (overlapX && overlapY) {
          const need = (prev.hh + it.hh) * 1.08 - Math.abs(it.cy - prev.cy);
          pushScreenY(prev, -need);
          measure(prev);
        }
      }
      placed2.push(it);
    }
    // Tách ngang — BẮT BUỘC cho góc Từ trên: khi nhìn gần như thẳng
    // đứng, hạ độ cao y gần như không đổi vị trí chiếu của nhãn (chỉ
    // thu nhỏ), nên tách dọc không tách được hai nhãn cùng một cột.
    // Dịch ngang dọc theo hướng phải của camera, mỗi bên tối đa một
    // lượt, và chỉ giữ lại độ dịch nào không đẩy nhãn ra ngoài khung.
    items.forEach(measure);
    const sortedX = [...items].filter((it) => !it.dead).sort((a, b) => a.cx - b.cx);
    for (let i = 0; i < sortedX.length; i++) {
      for (let j = i + 1; j < sortedX.length; j++) {
        const A = sortedX[i], B = sortedX[j];
        const overlapX = Math.abs(A.cx - B.cx) < (A.hw + B.hw) * 1.08;
        const overlapY = Math.abs(A.cy - B.cy) < (A.hh + B.hh) * 1.08;
        if (!overlapX || !overlapY) continue;
        const needPx = (A.hw + B.hw) * 1.08 - Math.abs(A.cx - B.cx);
        const toWorld = (px, it) => (px / (W / 2)) * it.dist * tanHalf * aspect;
        const inBounds = (it) => it.cx - it.hw >= 4 && it.cx + it.hw <= W - 4;
        // Thử đẩy B sang phải trước.
        const oldB = B.shift;
        B.shift = Math.max(-4, Math.min(4, B.shift + toWorld(needPx, B)));
        measure(B);
        if (!inBounds(B)) { B.shift = oldB; measure(B); }
        // Nếu B không đi được (chạm mép), đẩy A sang trái.
        measure(A); measure(B);
        if (Math.abs(A.cx - B.cx) < (A.hw + B.hw) * 1.08 && Math.abs(A.cy - B.cy) < (A.hh + B.hh) * 1.08) {
          const oldA = A.shift;
          A.shift = Math.max(-4, Math.min(4, A.shift - toWorld(needPx, A)));
          measure(A);
          if (!inBounds(A)) { A.shift = oldA; measure(A); }
        }
      }
    }
    // Kẹp lại mép trên sau khi tách/dịch (hạ y có thể đổi vị trí chiếu).
    items.forEach(clampTop);
    items.forEach((it) => { if (!it.dead) { it.lab.position.y = it.y; applyShift(it); } });
  },
  setMode(mode) {
    this.mode = mode;
    if (mode !== 'free') this.applyCamera();
    $$('.stage .camrow button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === mode)));
  },
  focusStaff(id, silent) {
    S.selectedStaffId = id;
    if (this.mode === 'follow') this.applyCamera();
    if (!silent) refreshOfficePanel();
  },
  bindControls() {
    const canvas = this.renderer.domElement;
    const pointers = new Map();
    let downAt = 0, downX = 0, downY = 0, moved = 0, pinchDist = 0;
    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { downAt = performance.now(); downX = e.clientX; downY = e.clientY; moved = 0; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
      if (pointers.size === 1 && moved > 4) {
        this.mode = 'free';
        this.orbit.yaw -= dx * 0.006; this.orbit.pitch = Math.max(0.15, Math.min(1.25, this.orbit.pitch + dy * 0.005));
        this.applyCamera();
        $$('.stage .camrow button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.orbit.dist = Math.max(6, Math.min(20, this.orbit.dist * (pinchDist / d)));
        pinchDist = d; this.mode = 'free'; this.applyCamera();
      }
    };
    const onUp = (e) => {
      const wasTap = pointers.size === 1 && moved <= 6 && performance.now() - downAt < 400;
      pointers.delete(e.pointerId);
      if (wasTap) this.pick(e);
    };
    const onWheel = (e) => {
      e.preventDefault();
      this.mode = 'free';
      this.orbit.dist = Math.max(6, Math.min(20, this.orbit.dist + (e.deltaY > 0 ? 1 : -1)));
      this.applyCamera();
      $$('.stage .camrow button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this._handlers.push(['pointerdown', canvas, onDown], ['pointermove', canvas, onMove], ['pointerup', canvas, onUp], ['pointercancel', canvas, onUp], ['wheel', canvas, onWheel]);
  },
  pick(e) {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new this.three.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const hits = [];
    for (const [, ch] of this.chars) hits.push(ch.userData.hit);
    const found = ray.intersectObjects(hits, false);
    if (found.length) {
      const id = found[0].object.userData.staffId;
      this.focusStaff(id);
      showMobileSheet(id);
      toast(myName(id) + ' — ' + roleOfStaff(staffById(id)).name);
    }
  },
  showStageError(msg) {
    const el = $('#stage-error'); if (el) { el.textContent = msg; el.hidden = false; }
  },
  hideStageError() { const el = $('#stage-error'); if (el) el.hidden = true; },
  dispose() {
    /* Tăng số thế hệ để mọi lần init() đang chờ (await loadThree) biết
     * mình đã cũ và dừng lại, không dựng cảnh đè lên cảnh mới. */
    this._initGen++;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    for (const [type, el, fn] of this._handlers) { try { el.removeEventListener(type, fn); } catch { /* bỏ qua */ } }
    this._handlers = [];
    if (this.renderer) {
      try { this.scene && this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } }); } catch { /* bỏ qua */ }
      try { this.renderer.dispose(); } catch { /* bỏ qua */ }
      if (this.renderer.domElement && this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer = null; this.scene = null; this.camera = null; this.three = null;
    this.chars.clear(); this.desks.clear(); this._builtIds = ''; this._builtScene = null; this.ready = false; this.mount = null;
  },
};

/* --------------------------- Màn hình Văn phòng --------------------------- */
/* Dải tổng quan vận hành: vẽ lại từ opsCounts() mỗi khi dữ liệu đổi
 * (SSE/thăm dò → refreshOfficePanel) để con số luôn là trạng thái mới
 * nhất, không phải ảnh chụp lúc mở màn. */
function updateOpsStrip() {
  const strip = $('#ops-strip');
  if (!strip) return;
  const c = opsCounts();
  const kpiIco = (paths) => '<span class="kpi-ico" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">' + paths + '</svg></span>';
  strip.innerHTML =
    '<div class="kpi-item"><div><div class="kpi-num teal">' + c.working + '</div><div class="kpi-label">Đang làm việc</div><div class="kpi-sub">' + S.staff.length + ' nhân sự · ' + c.waiting + ' đang chờ · ' + c.resting + ' đang nghỉ</div></div>' + kpiIco('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>') + '</div>' +
    '<div class="kpi-item"><div><div class="kpi-num teal">' + c.running + '</div><div class="kpi-label">Việc đang chạy</div><div class="kpi-sub">' + c.open + ' việc đang mở · ' + c.pend + ' chờ duyệt</div></div>' + kpiIco('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16m0-11h13"/>') + '</div>' +
    '<div class="kpi-item"><div><div class="kpi-num ' + (c.pend ? 'amber' : '') + '">' + c.pend + '</div><div class="kpi-label">Chờ phê duyệt</div><div class="kpi-sub">' + (c.pend ? 'Từ ' + c.pendPeople + ' người' : 'Không có yêu cầu nào đang chờ') + '</div></div>' + kpiIco('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>') + '</div>' +
    '<div class="kpi-item"><div><div class="kpi-num ' + (c.maxPct != null && c.maxPct >= 80 ? 'amber' : '') + '">' + (c.maxPct == null ? '—' : c.maxPct + '%') + '</div><div class="kpi-label">Ngân sách cao nhất</div><div class="kpi-sub">' + (c.budgeted ? c.budgeted + ' người đã đặt mức · ' + c.over80 + ' người ≥ 80%' : 'Chưa ai đặt mức ngân sách') + '</div></div>' + kpiIco('<path d="M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9z"/>') + '</div>';
  const upd = $('#ops-updated');
  if (upd) upd.textContent = S.lastSyncAt ? 'Cập nhật ' + fmtClock(S.lastSyncAt) : '';
}
/* Dòng hiện diện của một người trong danh sách phòng: việc đang làm +
 * tiến độ + trạng thái ngân sách — toàn số liệu thật đã có. */
function presenceLine(s) {
  const job = currentJobOf(s.id);
  const pct = budgetPct(s);
  const bits = [];
  if (job) bits.push(esc(job.name) + ' · ' + (job.progress || 0) + '%');
  else bits.push('Chưa có việc đang làm');
  if (pct != null) bits.push('Token ' + pct + '% · còn ' + fmtNum(budgetLeft(s)));
  const prog = job ? Math.max(0, Math.min(100, job.progress || 0)) : 0;
  return '<span class="presence">' + bits.join(' · ') + '</span>' +
    (job ? '<span class="mini-progress" aria-hidden="true"><i style="width:' + prog + '%"></i></span>' : '');
}
function officePanelHTML() {
  const st = staffById(S.selectedStaffId) || S.staff[0];
  const pend = pendingApprovals();
  const staffList = S.staff.map((s) => {
    const es = effectiveStatus(s, S.approvals);
    const meta = STATUS_META[es];
    const lamp = pend.some((a) => a.requesterId === s.id);
    return '<button type="button" class="fallback-item" data-select-staff="' + esc(s.id) + '" aria-pressed="' + String(S.selectedStaffId === s.id) + '">' +
      '<span class="dot ' + meta.dot + '"></span>' +
      '<span class="who"><b>' + esc(s.name) + '</b><span>' + esc(roleOfStaff(s).name) + ' · ' + meta.label + '</span>' + presenceLine(s) + '</span>' +
      (lamp ? '<span class="lamp" title="Đang có yêu cầu chờ duyệt"></span>' : '') +
      '</button>';
  }).join('');
  let profile = '';
  if (st) {
    const es = effectiveStatus(st, S.approvals);
    const myJobs = S.jobs.filter((j) => j.assigneeId === st.id && j.status !== 'Hoàn thành');
    const mainJob = currentJobOf(st.id);
    const mainProg = mainJob ? Math.max(0, Math.min(100, mainJob.progress || 0)) : 0;
    const pct = budgetPct(st);
    const doneCount = S.jobs.filter((j) => j.assigneeId === st.id && j.status === 'Hoàn thành').length;
    const budgetBar = pct == null ? '' : '<span class="mini-progress ' + (pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '') + '" aria-hidden="true"><i style="width:' + pct + '%"></i></span>';
    profile = '<div class="card"><h2>Hồ sơ đang chọn</h2>' +
      '<dl class="kv">' +
      '<div class="row"><dt>Tên</dt><dd>' + esc(st.name) + '</dd></div>' +
      '<div class="row"><dt>Chức vụ</dt><dd>' + esc(roleOfStaff(st).name) + '</dd></div>' +
      '<div class="row"><dt>Trạng thái</dt><dd><span class="pill ' + STATUS_META[es].cls + '">' + STATUS_META[es].label + '</span></dd></div>' +
      '<div class="row"><dt>Tài khoản</dt><dd>' + esc(st.account || '—') + '</dd></div>' +
      '<div class="row"><dt>Việc đang làm</dt><dd>' + (myJobs.length ? myJobs.map((j) => esc(j.name) + ' (' + esc(j.status) + ' · ' + (j.progress || 0) + '%)').join('<br>') : 'Không có việc đang làm') + '</dd></div>' +
      (mainJob ? '<div class="row"><dt>Tiến độ</dt><dd><div class="progress"><i style="width:' + mainProg + '%"></i></div><span class="small">' + mainProg + '% — ' + esc(mainJob.name) + '</span></dd></div>' : '') +
      '<div class="row"><dt>Ngân sách</dt><dd>' + (pct == null ? 'Chưa đặt mức' : fmtNum(st.used) + ' / ' + fmtNum(st.budget) + ' token (' + pct + '% · còn ' + fmtNum(budgetLeft(st)) + ')') + budgetBar + '</dd></div>' +
      '<div class="row"><dt>Đã hoàn thành</dt><dd>' + doneCount + ' việc</dd></div>' +
      '</dl>' +
      '<div class="toolbar"><button class="btn small" type="button" data-goto-chat="' + esc(st.id) + '">Nhắn tin</button>' +
      '<button class="btn small" type="button" data-goto-jobs="' + esc(st.id) + '">Xem việc</button></div></div>';
  }
  /* Việc đang chạy: Đang làm trước, rồi Chờ duyệt, rồi Chờ nhận — tối đa
   * 4 việc, bấm để sang màn Việc. Không có thời lượng/thumbnail: dữ liệu
   * việc không có các trường đó nên không bịa. */
  const runningJobs = S.jobs.filter((j) => j.status !== 'Hoàn thành')
    .sort((a, b) => ({ 'Đang làm': 0, 'Chờ duyệt': 1, 'Chờ nhận': 2 }[a.status] - { 'Đang làm': 0, 'Chờ duyệt': 1, 'Chờ nhận': 2 }[b.status]) || (b.progress || 0) - (a.progress || 0))
    .slice(0, 4);
  const runningCard = '<div class="card"><h2>Việc đang chạy</h2>' +
    (runningJobs.length ? '<div class="run-list">' + runningJobs.map((j) => {
      const prog = Math.max(0, Math.min(100, j.progress || 0));
      return '<button type="button" class="run-item" data-goto-jobs="' + esc(j.id) + '">' +
        '<span class="run-top"><b>' + esc(j.name) + '</b><span class="pill small ' + (j.status === 'Đang làm' ? 'working' : j.status === 'Chờ duyệt' ? 'approval' : 'waiting') + '">' + esc(j.status) + '</span></span>' +
        '<span class="run-meta">' + esc(myName(j.assigneeId)) + ' · ' + prog + '%</span>' +
        '<span class="mini-progress" aria-hidden="true"><i style="width:' + prog + '%"></i></span></button>';
    }).join('') + '</div>' : '<p class="hint">Chưa có việc nào đang chạy.</p>') +
    '<div class="toolbar"><button class="btn small ghost" type="button" data-goto-jobs="">Xem tất cả việc</button></div></div>';
  const meeting = S.meetings[S.meetings.length - 1];
  return '<div class="grid" style="gap:12px">' + profile +
    '<div class="card"><h2>Nhân sự trong phòng</h2><div class="fallback-list">' + staffList + '</div></div>' +
    runningCard +
    (meeting && meeting.status === 'open' ? '<div class="card"><h2>Đang họp: ' + esc(meeting.title) + '</h2><p class="hint">Gọi bởi ' + esc(myName(meeting.calledBy)) + ' · ' + esc(fmtTime(meeting.at)) + '</p></div>' : '') +
    '<div class="card"><h2>Hoạt động mới nhất</h2><ul class="log" id="activity-log">' + (S.feed.map((f) => '<li><time>' + esc(fmtTime(f.at)) + '</time>' + esc(f.text) + '</li>').join('') || '<li>Chưa có hoạt động nào.</li>') + '</ul></div>' +
    '</div>';
}
function refreshOfficePanel() {
  if (S.route !== 'office') return;
  updateOpsStrip();
  const panel = $('#office-panel');
  if (panel) { panel.innerHTML = officePanelHTML(); bindOfficePanel(panel); }
  const sheet = $('#mobile-sheet');
  if (sheet && !sheet.hidden && S.selectedStaffId) { const st = staffById(S.selectedStaffId); if (st) fillMobileSheet(st); }
  Office3D.sync();
}
function bindOfficePanel(root) {
  $$('[data-select-staff]', root).forEach((b) => b.addEventListener('click', () => {
    S.selectedStaffId = b.dataset.selectStaff;
    Office3D.focusStaff(b.dataset.selectStaff, true);
    refreshOfficePanel();
    showMobileSheet(b.dataset.selectStaff);
  }));
  $$('[data-goto-chat]', root).forEach((b) => b.addEventListener('click', () => { S.chatTarget = b.dataset.gotoChat; location.hash = '#/chat'; }));
  $$('[data-goto-jobs]', root).forEach((b) => b.addEventListener('click', () => { location.hash = '#/jobs'; }));
}
/* Trang trượt mobile: bấm nhân vật ở màn hẹp thì hiện đúng nội dung hồ sơ
 * (việc hiện tại + tiến độ + ngân sách từ dữ liệu thật) dạng trang trượt
 * dưới cùng. Chỉ mở khi bấm chọn rõ ràng — không tự bật khi dữ liệu đổi. */
function fillMobileSheet(st) {
  const body = $('#mobile-sheet-body'); if (!body) return;
  const es = effectiveStatus(st, S.approvals);
  const meta = STATUS_META[es];
  const job = S.jobs.find((j) => j.assigneeId === st.id && j.status !== 'Hoàn thành');
  const prog = job ? Math.max(0, Math.min(100, job.progress || 0)) : 0;
  const pct = budgetPct(st);
  const doneCount = S.jobs.filter((j) => j.assigneeId === st.id && j.status === 'Hoàn thành').length;
  body.innerHTML = '<div class="sheet-profile"><div class="avatar">' + esc(st.name.slice(0, 1).toUpperCase()) + '</div>' +
    '<div><strong>' + esc(st.name) + '</strong><span>' + esc(roleOfStaff(st).name) + '</span></div>' +
    '<span class="pill ' + meta.cls + '" style="margin-left:auto">' + meta.label + '</span></div>' +
    '<dl class="kv" style="margin-top:12px">' +
    '<div class="row"><dt>Việc hiện tại</dt><dd>' + (job ? esc(job.name) + ' (' + esc(job.status) + ')' : 'Không có việc đang làm') + '</dd></div>' +
    (job ? '<div class="row"><dt>Tiến độ</dt><dd><div class="progress"><i style="width:' + prog + '%"></i></div><span class="small">' + prog + '%</span></dd></div>' : '') +
    '<div class="row"><dt>Ngân sách</dt><dd>' + (pct == null ? 'Chưa đặt mức' : fmtNum(st.used) + ' / ' + fmtNum(st.budget) + ' token (' + pct + '% · còn ' + fmtNum(budgetLeft(st)) + ')') + '</dd></div>' +
    '<div class="row"><dt>Đã hoàn thành</dt><dd>' + doneCount + ' việc</dd></div></dl>' +
    '<div class="sheet-actions"><button class="btn small primary" type="button" data-sheet-chat="' + esc(st.id) + '">Nhắn tin</button>' +
    '<button class="btn small" type="button" data-sheet-jobs="' + esc(st.id) + '">Xem việc</button></div>';
  $$('[data-sheet-chat]', body).forEach((b) => b.addEventListener('click', () => { S.chatTarget = b.dataset.sheetChat; hideMobileSheet(); location.hash = '#/chat'; }));
  $$('[data-sheet-jobs]', body).forEach((b) => b.addEventListener('click', () => { hideMobileSheet(); location.hash = '#/jobs'; }));
}
function showMobileSheet(id) {
  if (!window.matchMedia('(max-width: 820px)').matches) return;
  const st = staffById(id); if (!st) return;
  fillMobileSheet(st);
  const sheet = $('#mobile-sheet'); if (!sheet) return;
  sheet.hidden = false; sheet.classList.add('is-open');
}
function hideMobileSheet() {
  const sheet = $('#mobile-sheet'); if (!sheet) return;
  sheet.hidden = true; sheet.classList.remove('is-open');
}
function renderOfficeFallback() {
  const box = $('#stage-box'); if (!box) return;
  const items = S.staff.map((s, i) => {
    const es = effectiveStatus(s, S.approvals);
    const meta = STATUS_META[es];
    const lamp = pendingApprovals().some((a) => a.requesterId === s.id);
    return '<button type="button" class="fallback-item" data-select-staff="' + esc(s.id) + '">' +
      '<span class="dot ' + meta.dot + '"></span>' +
      '<span class="who"><b>' + esc(s.name) + '</b><span>' + esc(roleOfStaff(s).name) + ' · ' + meta.label + '</span>' + presenceLine(s) + '</span>' +
      (lamp ? '<span class="lamp"></span>' : '') + '<span aria-hidden="true">›</span></button>';
  }).join('');
  box.innerHTML = '<div class="stage-fallback"><p class="hint"><strong>Dạng danh sách 2D</strong> — bấm một người để xem hồ sơ.</p>' +
    '<div class="fallback-list">' + items + '</div>' +
    '<div class="toolbar"><button class="btn small" type="button" id="retry-3d">Thử lại cảnh 3D</button></div></div>';
  bindOfficePanel(box);
  const retry = $('#retry-3d');
  if (retry) retry.addEventListener('click', () => {
    S.office2D = false;
    try { sessionStorage.removeItem('office.force2d'); } catch { /* bỏ qua */ }
    renderOffice($('#screen'));
  });
}
async function renderOffice(screen) {
  let use2D = !!S.office2D;
  try { if (sessionStorage.getItem('office.force2d') === '1') use2D = true; } catch { /* bỏ qua */ }
  screen.innerHTML =
    '<div class="page-heading"><div><h1>Văn phòng 3D</h1>' +
    '<p class="hint">Số liệu thật, cập nhật theo thời gian thực.</p></div></div>' +
    '<div class="ops-head"><strong>Xưởng đang làm gì</strong><span id="ops-updated"></span></div>' +
    '<div class="kpi" id="ops-strip"></div>' +
    '<div class="office-layout"><section>' +
    '<div class="toolbar"><button class="btn primary" type="button" id="call-meeting">Gọi họp team</button>' +
    '<button class="btn" type="button" id="toggle-2d">' + (use2D ? 'Về cảnh 3D' : 'Dạng danh sách 2D') + '</button>' +
    '<span class="spacer"></span><span class="hint" id="office-mode-note">' + (use2D ? 'Đang ở dạng 2D.' : 'Đang tải cảnh 3D…') + '</span></div>' +
    '<div class="stage"><div class="stage-box" id="stage-box"></div>' +
    '<div class="camrow" role="group" aria-label="Góc nhìn">' +
    '<button type="button" data-cam="overview" aria-pressed="true">Góc tổng</button>' +
    '<button type="button" data-cam="top" aria-pressed="false">Từ trên</button>' +
    '<button type="button" data-cam="meeting" aria-pressed="false">Phòng họp</button>' +
    '<button type="button" data-cam="follow" aria-pressed="false">Theo người</button>' +
    '</div>' +
    '<div class="stage-help">Kéo để xoay · Cuộn để thu phóng · Bấm nhân vật xem hồ sơ</div>' +
    '<div class="stage-credit">' + (Session.demo ? 'Dữ liệu mẫu — bản DEMO ngoại tuyến.' : 'Dữ liệu thật từ máy chủ.') + '</div>' +
    '<div class="stage-error" id="stage-error" hidden></div>' +
    '</div>' +
    '<div id="meeting-box"></div>' +
    '</section><aside id="office-panel">' + officePanelHTML() + '</aside></div>';
  bindOfficePanel($('#office-panel'));
  updateOpsStrip();
  $$('.stage .camrow button', screen).forEach((b) => b.addEventListener('click', () => {
    Office3D.setMode(b.dataset.cam);
    const note = $('#office-mode-note'); if (note) note.textContent = 'Góc nhìn: ' + b.textContent + '.';
  }));
  $('#toggle-2d').addEventListener('click', () => {
    S.office2D = !S.office2D;
    if (S.office2D) Office3D.dispose();
    renderOffice(screen);
  });
  $('#call-meeting').addEventListener('click', async () => {
    try {
      const mt = await api.post('/api/meetings', { title: 'Họp team' });
      S.meetingActive = mt; S.meetings.push(mt);
      S.staff.forEach((s, i) => Office3D.goToSeat(s.id, i));
      Office3D.setMode('meeting');
      feedAdd('Đã gọi họp team (' + S.staff.length + ' người).');
      renderMeetingBox();
      refreshOfficePanel();
      toast('Đã gọi họp.');
    } catch (e) { showError(e); }
  });
  renderMeetingBox();
  if (use2D) { renderOfficeFallback(); return; }
  const box = $('#stage-box');
  box.innerHTML = '<p class="hint" style="padding:16px">Đang tải cảnh 3D…</p>';
  let res;
  try { res = await Office3D.init(box); }
  catch (e) { res = { ok: false, reason: 'Không dựng được cảnh 3D. Dạng 2D vẫn làm việc đầy đủ.' }; }
  if (res.aborted) {
    /* Lần init cũ bị lần init mới hơn thay thế (hai lần renderOffice
     * chồng nhau): không làm gì cả — lần mới đang sở hữu màn hình.
     * TUYỆT ĐỐI không ép sang 2D ở đây, nếu không lần cũ sẽ phá cảnh
     * của lần mới. */
    return;
  }
  if (!res.ok) {
    S.office2D = true;
    try { sessionStorage.setItem('office.force2d', '1'); } catch { /* bỏ qua */ }
    Office3D.showStageError(res.reason);
    renderOfficeFallback();
    const note = $('#office-mode-note'); if (note) note.textContent = 'Cảnh 3D không tải được — đang ở dạng 2D.';
    feedAdd('Cảnh 3D không tải được: ' + res.reason);
    return;
  }
  const note = $('#office-mode-note'); if (note) note.textContent = 'Cảnh 3D đã sẵn sàng.';
  Office3D.setMode('overview');
}
function renderMeetingBox() {
  const box = $('#meeting-box'); if (!box) return;
  const mt = S.meetingActive || S.meetings[S.meetings.length - 1];
  if (!mt || mt.status !== 'open') { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="card"><h2>Biên bản họp: ' + esc(mt.title) + '</h2>' +
    '<p class="hint">Sau khi lưu, có thể tạo việc ngay từ biên bản.</p>' +
    '<label>Biên bản<textarea id="meeting-minutes" rows="4">' + esc(mt.minutes || '') + '</textarea></label>' +
    '<div class="toolbar"><button class="btn primary" type="button" id="save-minutes">Lưu biên bản</button>' +
    '<button class="btn" type="button" id="job-from-minutes">Tạo việc từ biên bản</button>' +
    '<button class="btn" type="button" id="end-meeting">Họp xong</button></div></div>';
  $('#save-minutes').addEventListener('click', async () => {
    try {
      const m = await api.patch('/api/meetings/' + mt.id, { minutes: $('#meeting-minutes').value });
      Object.assign(mt, m); toast('Đã lưu biên bản.'); feedAdd('Đã lưu biên bản họp.');
    } catch (e) { showError(e); }
  });
  $('#job-from-minutes').addEventListener('click', () => {
    S.jobDraft = { name: '', desc: $('#meeting-minutes').value || '' };
    location.hash = '#/jobs';
  });
  $('#end-meeting').addEventListener('click', async () => {
    try {
      const m = await api.patch('/api/meetings/' + mt.id, { minutes: $('#meeting-minutes').value, status: 'closed' });
      Object.assign(mt, m); S.meetingActive = null;
      S.staff.forEach((s) => Office3D.goHome(s.id));
      Office3D.setMode('overview');
      renderMeetingBox(); refreshOfficePanel();
      toast('Đã kết thúc cuộc họp.');
    } catch (e) { showError(e); }
  });
}

/* -------------------------------- Màn Việc -------------------------------- */
function jobCardHTML(job) {
  const assignee = myName(job.assigneeId), reviewer = myName(job.reviewerId);
  const canClaim = job.status === 'Chờ nhận' && Session.me && Session.me.id === job.assigneeId;
  const canSubmit = job.status === 'Đang làm' && Session.me && Session.me.id === job.assigneeId;
  const canReview = job.status === 'Chờ duyệt' && myRole().canApprove && Session.me && Session.me.id !== job.assigneeId;
  const links = (job.links || []).map((l) => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.title) + '</a>').join(' · ');
  return '<article class="jobcard">' +
    '<strong>' + esc(job.name) + '</strong>' +
    '<div class="meta">Phụ trách: ' + esc(assignee) + ' · Kiểm tra: ' + esc(reviewer) + (job.claimedBy ? ' · Đã nhận: ' + esc(myName(job.claimedBy)) : '') + '</div>' +
    (job.desc ? '<div>' + esc(job.desc) + '</div>' : '') +
    (links ? '<div class="meta">Link: ' + links + '</div>' : '') +
    '<div class="progress" aria-label="Tiến độ ' + job.progress + '%"><i style="width:' + Math.max(0, Math.min(100, job.progress || 0)) + '%"></i></div>' +
    '<div class="actions">' +
    '<button class="btn small" type="button" data-job-detail="' + esc(job.id) + '">Chi tiết</button>' +
    (canClaim ? '<button class="btn small primary" type="button" data-job-claim="' + esc(job.id) + '">Nhận việc</button>' : '') +
    (canSubmit ? '<button class="btn small primary" type="button" data-job-submit="' + esc(job.id) + '">Trình duyệt</button>' : '') +
    (canReview ? '<button class="btn small primary" type="button" data-job-approve="' + esc(job.id) + '">Duyệt xong</button>' +
      '<button class="btn small" type="button" data-job-return="' + esc(job.id) + '">Trả lại</button>' : '') +
    '</div></article>';
}
function openJobDetail(jobId) {
  const job = S.jobs.find((j) => j.id === jobId); if (!job) return;
  const thread = S.messages.filter((m) => m.jobId === jobId);
  const canAttach = isDirector() || (Session.me && (Session.me.id === job.assigneeId || Session.me.id === job.reviewerId));
  openModal('<h1>' + esc(job.name) + '</h1>' +
    '<dl class="kv">' +
    '<div class="row"><dt>Trạng thái</dt><dd>' + esc(job.status) + ' · ' + (job.progress || 0) + '%</dd></div>' +
    '<div class="row"><dt>Phụ trách / Kiểm tra</dt><dd>' + esc(myName(job.assigneeId)) + ' / ' + esc(myName(job.reviewerId)) + '</dd></div>' +
    '<div class="row"><dt>Mô tả</dt><dd>' + esc(job.desc || '—') + '</dd></div>' +
    '<div class="row"><dt>Rule đính kèm</dt><dd>' + esc((S.rules.find((r) => r.id === job.ruleId) || {}).text || '—') + '</dd></div>' +
    '</dl>' +
    '<h2>Link đính kèm</h2>' +
    ((job.links || []).map((l) => '<p><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.title) + '</a> <span class="small">— ' + esc(myName(l.by)) + '</span></p>').join('') || '<p class="hint">Chưa có link.</p>') +
    (canAttach ? '<form id="job-link-form"><label>Link mới<input name="url" type="url" placeholder="https://…" required></label><label>Tiêu đề<input name="title" placeholder="Tiêu đề ngắn"></label><button class="btn small" type="submit">Gắn link</button></form>' : '') +
    '<h2>Trao đổi trong việc này</h2>' +
    (thread.map((m) => '<p><strong>' + esc(myName(m.fromId)) + ':</strong> ' + esc(m.text) + ' <span class="small">' + esc(fmtTime(m.at)) + '</span></p>').join('') || '<p class="hint">Chưa có tin nhắn nào.</p>') +
    '<form id="job-msg-form"><label>Gửi tin<textarea name="text" required rows="2"></textarea></label><button class="btn small primary" type="submit">Gửi</button></form>' +
    '<div class="toolbar"><button class="btn small" type="button" onclick="document.querySelector(\'#modal-root\').hidden=true">Đóng</button></div>');
  const lf = $('#job-link-form');
  if (lf) lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(lf);
    try {
      const updated = await api.post('/api/jobs/' + job.id + '/links', { url: fd.get('url'), title: fd.get('title') });
      Object.assign(job, updated); closeModal(); await refreshAll(); renderScreen();
      toast('Đã gắn link vào việc.');
    } catch (ex) { showError(ex); }
  });
  const mf = $('#job-msg-form');
  if (mf) mf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(mf);
    try {
      await api.post('/api/messages', { to: 'room', jobId: job.id, text: fd.get('text') });
      closeModal(); await refreshAll(); renderScreen();
      toast('Đã gửi tin vào luồng việc.');
    } catch (ex) { showError(ex); }
  });
}
async function renderJobs(screen) {
  const canCreate = isDirector() || myRole().canApprove;
  const draft = S.jobDraft || {};
  S.jobDraft = null;
  const staffOpts = S.staff.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' — ' + esc(roleOfStaff(s).name) + '</option>').join('');
  const cols = JOB_COLUMNS.map((col) => {
    const items = S.jobs.filter((j) => j.status === col);
    return '<section class="kcol"><h3>' + esc(col) + ' <span>' + items.length + '</span></h3>' +
      (items.map(jobCardHTML).join('') || '<p class="hint">Không có việc.</p>') + '</section>';
  }).join('');
  screen.innerHTML = '<h1>Việc</h1>' +
    '<p class="hint">Chờ nhận → Đang làm → Chờ duyệt → Hoàn thành. Nhận việc chỉ một người được. Không tự duyệt việc của mình.</p>' +
    (canCreate ? '<div class="card"><h2>Thêm / giao việc mới</h2><form id="job-form">' +
      '<label>Tên việc<input name="name" required value="' + esc(draft.name || '') + '"></label>' +
      '<label>Mô tả<textarea name="desc" rows="2">' + esc(draft.desc || '') + '</textarea></label>' +
      '<div class="row2"><label>Người phụ trách<select name="assigneeId">' + staffOpts + '</select></label>' +
      '<label>Người kiểm tra<select name="reviewerId">' + staffOpts + '</select></label></div>' +
      '<label>Rule đính kèm<select name="ruleId"><option value="">— Không có —</option>' + S.rules.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.text) + '</option>').join('') + '</select></label>' +
      '<label>Link đính kèm<input name="link" type="url" placeholder="https://…"></label>' +
      '<button class="btn primary" type="submit">Tạo việc</button></form></div>' : '<p class="hint">Bạn chưa có quyền tạo việc.</p>') +
    '<div class="kanban">' + cols + '</div>';
  const form = $('#job-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { name: fd.get('name'), desc: fd.get('desc'), assigneeId: fd.get('assigneeId'), reviewerId: fd.get('reviewerId'), ruleId: fd.get('ruleId') || null };
    if (fd.get('link')) body.links = [{ url: fd.get('link'), title: fd.get('link') }];
    try { await api.post('/api/jobs', body); await refreshAll(); renderScreen(); toast('Đã tạo việc.'); }
    catch (ex) { showError(ex); }
  });
  $$('[data-job-detail]', screen).forEach((b) => b.addEventListener('click', () => openJobDetail(b.dataset.jobDetail)));
  $$('[data-job-claim]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/jobs/' + b.dataset.jobClaim + '/claim', {}); await refreshAll(); renderScreen(); toast('Bạn đã nhận việc.'); }
    catch (ex) { showError(ex); }
  }));
  $$('[data-job-submit]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/jobs/' + b.dataset.jobSubmit + '/submit', {}); await refreshAll(); renderScreen(); toast('Đã trình việc lên kiểm tra.'); }
    catch (ex) { showError(ex); }
  }));
  $$('[data-job-approve]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/jobs/' + b.dataset.jobApprove + '/approve', {}); await refreshAll(); renderScreen(); toast('Đã duyệt xong việc.'); }
    catch (ex) { showError(ex); }
  }));
  $$('[data-job-return]', screen).forEach((b) => b.addEventListener('click', () => {
    openModal('<h1>Trả lại việc</h1><p class="hint">Trả lại cần có lý do.</p>' +
      '<form id="return-form"><label>Lý do<textarea name="reason" required rows="3"></textarea></label>' +
      '<button class="btn primary" type="submit">Trả lại việc</button></form>');
    $('#return-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/jobs/' + b.dataset.jobReturn + '/return', { reason: new FormData(e.target).get('reason') });
        closeModal(); await refreshAll(); renderScreen(); toast('Đã trả lại việc.');
      } catch (ex) { showError(ex); }
    });
  }));
}

/* ----------------------------- Màn Phê duyệt ------------------------------ */
async function renderApprovals(screen) {
  const pend = pendingApprovals();
  const decided = S.approvals.filter((a) => a.status !== 'pending').slice(-20).reverse();
  const canDecide = (ap) => {
    if (!myRole().canApprove) return 'Chức vụ hiện tại không có quyền duyệt.';
    if (Session.me && Session.me.id === ap.requesterId) return 'Không tự duyệt yêu cầu của mình — kể cả Giám đốc.';
    return null;
  };
  screen.innerHTML = '<h1>Phê duyệt</h1>' +
    '<p class="hint">Mọi yêu cầu cấp quyền của mọi tài khoản Muse đều về đây — quyết định ngay tại đây. Từ chối cần có lý do. Không tự duyệt yêu cầu của mình.</p>' +
    '<div class="card"><h2>Gửi yêu cầu mới</h2><form id="ap-form">' +
    '<label>Hành động<select name="action">' + APPROVAL_ACTIONS.map((a) => '<option>' + esc(a) + '</option>').join('') + '</select></label>' +
    '<label>Mục tiêu<input name="target" placeholder="VD: file bao-cao.pdf, ứng dụng X…"></label>' +
    '<label>Lý do<textarea name="reason" required rows="2"></textarea></label>' +
    '<label>Việc liên quan<select name="jobId"><option value="">— Không có —</option>' + S.jobs.map((j) => '<option value="' + esc(j.id) + '">' + esc(j.name) + '</option>').join('') + '</select></label>' +
    '<button class="btn primary" type="submit">Gửi yêu cầu</button></form></div>' +
    '<h2>Đang chờ quyết định (' + pend.length + ')</h2>' +
    (pend.length ? pend.map((ap) => {
      const block = canDecide(ap);
      return '<div class="card"><div class="toolbar"><strong>' + esc(ap.action) + '</strong><span class="pill approval">Chờ duyệt</span><span class="spacer"></span><span class="small">' + esc(fmtTime(ap.at)) + '</span></div>' +
        '<dl class="kv"><div class="row"><dt>Người yêu cầu</dt><dd>' + esc(myName(ap.requesterId)) + '</dd></div>' +
        '<div class="row"><dt>Mục tiêu</dt><dd>' + esc(ap.target || '—') + '</dd></div>' +
        '<div class="row"><dt>Lý do</dt><dd>' + esc(ap.reason) + '</dd></div>' +
        (ap.jobId ? '<div class="row"><dt>Việc liên quan</dt><dd>' + esc((S.jobs.find((j) => j.id === ap.jobId) || {}).name || '—') + '</dd></div>' : '') +
        (ap.source ? '<div class="row"><dt>Nguồn</dt><dd>' + esc(ap.source) + '</dd></div>' : '') + '</dl>' +
        (block ? '<p class="hint">' + esc(block) + '</p>' :
          '<form class="decide-form" data-ap="' + esc(ap.id) + '"><label>Ghi chú (bắt buộc khi từ chối)<input name="note"></label>' +
          '<div class="toolbar"><button class="btn primary" type="submit" data-decision="approved">Duyệt</button>' +
          '<button class="btn danger" type="submit" data-decision="rejected">Từ chối</button></div></form>') +
        '</div>';
    }).join('') : '<p class="hint">Không có yêu cầu nào đang chờ.</p>') +
    '<h2>Đã quyết định gần đây</h2>' +
    (decided.map((ap) => '<div class="card"><strong>' + esc(ap.action) + '</strong> — ' + (ap.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối') + ' bởi ' + esc(myName(ap.decidedBy)) + ' · ' + esc(fmtTime(ap.decidedAt || ap.at)) + (ap.note ? '<div class="hint">Ghi chú: ' + esc(ap.note) + '</div>' : '') + '</div>').join('') || '<p class="hint">Chưa có quyết định nào.</p>');
  $('#ap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.post('/api/approvals', { action: fd.get('action'), target: fd.get('target'), reason: fd.get('reason'), jobId: fd.get('jobId') || null });
      await refreshAll(); renderScreen(); toast('Đã gửi yêu cầu phê duyệt.');
    } catch (ex) { showError(ex); }
  });
  $$('.decide-form', screen).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const decision = e.submitter ? e.submitter.dataset.decision : 'approved';
    const note = new FormData(f).get('note');
    try {
      await api.post('/api/approvals/' + f.dataset.ap + '/decide', { decision, note });
      await refreshAll(); renderScreen(); toast(decision === 'approved' ? 'Đã duyệt yêu cầu.' : 'Đã từ chối yêu cầu.');
    } catch (ex) { showError(ex); }
  }));
}

/* ------------------------- Màn Nhân sự & chức vụ --------------------------- */
async function renderPeople(screen) {
  const director = isDirector();
  const roleRows = S.roles.map((r) => {
    const holders = S.staff.filter((s) => s.roleId === r.id).length;
    return '<tr><td data-label="Tên"><strong>' + esc(r.name) + '</strong></td><td data-label="Cấp">' + r.level + '</td><td data-label="Được duyệt">' + (r.canApprove ? 'Có' : 'Không') + '</td><td data-label="Được quản trị">' + (r.canManage ? 'Có' : 'Không') + '</td><td data-label="Người giữ">' + holders + ' người</td>' +
      (director ? '<td data-label="Thao tác" class="tbl-actions"><button class="btn small" type="button" data-role-edit="' + esc(r.id) + '">Sửa</button> <button class="btn small danger" type="button" data-role-del="' + esc(r.id) + '">Xoá</button></td>' : '<td data-label="Thao tác">—</td>') + '</tr>';
  }).join('');
  const staffRows = S.staff.map((s) => {
    const login = s.login || {};
    return '<tr><td data-label="Người"><strong>' + esc(s.name) + '</strong><div class="small">' + esc(s.account || '') + '</div></td>' +
      '<td data-label="Chức vụ">' + esc(roleOfStaff(s).name) + '</td>' +
      '<td data-label="Trạng thái"><span class="pill ' + STATUS_META[effectiveStatus(s, S.approvals)].cls + '">' + STATUS_META[effectiveStatus(s, S.approvals)].label + '</span></td>' +
      '<td data-label="Đăng nhập">' + (login.username ? esc(login.username) + (login.disabled ? ' (đã khoá)' : '') + (login.mustChangePassword ? ' (phải đổi MK)' : '') : 'Chưa có') + '</td>' +
      (director ? '<td data-label="Thao tác" class="tbl-actions"><button class="btn small" type="button" data-staff-role="' + esc(s.id) + '">Đổi chức vụ</button> ' +
        (login.username ? '<button class="btn small" type="button" data-staff-reset="' + esc(s.id) + '">Đặt lại MK</button> ' +
        '<button class="btn small" type="button" data-staff-disable="' + esc(s.id) + '" data-disabled="' + String(!!login.disabled) + '">' + (login.disabled ? 'Mở khoá' : 'Khoá') + '</button> ' +
        '<button class="btn small" type="button" data-staff-token="' + esc(s.id) + '">Cấp mã API</button> ' : '') +
        '<button class="btn small danger" type="button" data-staff-del="' + esc(s.id) + '">Xoá</button></td>' : '<td data-label="Thao tác">—</td>') + '</tr>';
  }).join('');
  screen.innerHTML = '<h1>Nhân sự &amp; chức vụ</h1>' +
    '<p class="hint">Đổi chức vụ thì quyền đổi theo ngay. ' + (director ? '' : 'Chỉ đọc — chỉ Giám đốc mới sửa được.') + '</p>' +
    '<h2>Chức vụ</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên</th><th>Cấp</th><th>Được duyệt</th><th>Được quản trị</th><th>Người giữ</th>' + (director ? '<th>Thao tác</th>' : '') + '</tr></thead><tbody>' + roleRows + '</tbody></table></div>' +
    (director ? '<div class="card"><h2>Thêm chức vụ</h2><form id="role-form"><label>Tên chức vụ<input name="name" required></label><div class="row2"><label>Cấp (số nhỏ càng cao)<input name="level" type="number" value="3" min="1" max="9"></label></div><label><input type="checkbox" name="canApprove" style="width:auto"> Được duyệt</label><label><input type="checkbox" name="canManage" style="width:auto"> Được quản trị</label><button class="btn primary" type="submit">Thêm chức vụ</button></form></div>' : '') +
    '<h2>Nhân viên</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Người</th><th>Chức vụ</th><th>Trạng thái</th><th>Đăng nhập</th>' + (director ? '<th>Thao tác</th>' : '') + '</tr></thead><tbody>' + staffRows + '</tbody></table></div>' +
    (director ? '<div class="card"><h2>Thêm nhân viên</h2><form id="staff-form"><div class="row2"><label>Tên hiển thị<input name="name" required></label><label>Tài khoản / email<input name="account"></label></div><label>Chức vụ<select name="roleId">' + S.roles.map((r) => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('') + '</select></label><div class="row2"><label>Tên đăng nhập<input name="username" placeholder="Để trống = chưa có tài khoản"></label><label>Mật khẩu ban đầu<input name="password" type="password" placeholder="Từ 8 ký tự"></label></div><label>Ngân sách token ban đầu<input name="budget" type="number" min="0"></label><button class="btn primary" type="submit">Thêm nhân viên</button></form></div>' : '');
  const rf = $('#role-form');
  if (rf) rf.addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(rf);
    try { await api.post('/api/roles', { name: fd.get('name'), level: Number(fd.get('level')), canApprove: !!fd.get('canApprove'), canManage: !!fd.get('canManage') }); await refreshAll(); renderScreen(); toast('Đã thêm chức vụ.'); }
    catch (ex) { showError(ex); }
  });
  const sf = $('#staff-form');
  if (sf) sf.addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(sf);
    try {
      const r = await api.post('/api/staff', { name: fd.get('name'), account: fd.get('account'), roleId: fd.get('roleId'), username: fd.get('username') || undefined, initialPassword: fd.get('password') || undefined, budget: fd.get('budget') ? Number(fd.get('budget')) : undefined });
      await refreshAll(); renderScreen();
      if (r.token) openModal('<h1>Đã tạo nhân viên</h1><p class="warnbox">Mã API chỉ hiện <strong>một lần</strong>. Ghi lại và đưa cho nhân viên qua kênh an toàn.</p><p class="mono">' + esc(r.token) + '</p><div class="toolbar"><button class="btn primary" type="button" onclick="document.querySelector(\'#modal-root\').hidden=true">Đã ghi lại</button></div>');
      else if (r.activationNote) openModal('<h1>Đã tạo nhân viên</h1><p>' + esc(r.activationNote) + '</p><div class="toolbar"><button class="btn primary" type="button" onclick="document.querySelector(\'#modal-root\').hidden=true">Đã rõ</button></div>');
      else toast('Đã thêm nhân viên.');
    } catch (ex) { showError(ex); }
  });
  $$('[data-role-edit]', screen).forEach((b) => b.addEventListener('click', () => {
    const r = S.roles.find((x) => x.id === b.dataset.roleEdit);
    openModal('<h1>Sửa chức vụ: ' + esc(r.name) + '</h1><form id="role-edit-form"><label>Tên<input name="name" value="' + esc(r.name) + '" required></label><label>Cấp<input name="level" type="number" value="' + r.level + '" min="1" max="9"></label><label><input type="checkbox" name="canApprove" style="width:auto" ' + (r.canApprove ? 'checked' : '') + '> Được duyệt</label><label><input type="checkbox" name="canManage" style="width:auto" ' + (r.canManage ? 'checked' : '') + '> Được quản trị</label><button class="btn primary" type="submit">Lưu</button></form>');
    $('#role-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await api.patch('/api/roles/' + r.id, { name: fd.get('name'), level: Number(fd.get('level')), canApprove: !!fd.get('canApprove'), canManage: !!fd.get('canManage') }); closeModal(); await refreshAll(); renderScreen(); toast('Đã sửa chức vụ.'); }
      catch (ex) { showError(ex); }
    });
  }));
  $$('[data-role-del]', screen).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Xoá chức vụ này? Chỉ xoá được khi không còn ai giữ.')) return;
    try { await api.del('/api/roles/' + b.dataset.roleDel); await refreshAll(); renderScreen(); toast('Đã xoá chức vụ.'); }
    catch (ex) { showError(ex); }
  }));
  $$('[data-staff-role]', screen).forEach((b) => b.addEventListener('click', () => {
    const s = staffById(b.dataset.staffRole);
    openModal('<h1>Đổi chức vụ: ' + esc(s.name) + '</h1><form id="staff-role-form"><label>Chức vụ mới<select name="roleId">' + S.roles.map((r) => '<option value="' + esc(r.id) + '" ' + (r.id === s.roleId ? 'selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select></label><button class="btn primary" type="submit">Lưu</button></form>');
    $('#staff-role-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.patch('/api/staff/' + s.id, { roleId: new FormData(e.target).get('roleId') }); closeModal(); await refreshAll(); renderScreen(); toast('Đã đổi chức vụ.'); }
      catch (ex) { showError(ex); }
    });
  }));
  $$('[data-staff-reset]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/staff/' + b.dataset.staffReset + '/reset-password', {}); await refreshAll(); renderScreen(); toast('Đã đặt lại — nhân viên phải đổi mật khẩu ở lần đăng nhập sau.'); }
    catch (ex) { showError(ex); }
  }));
  $$('[data-staff-disable]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/staff/' + b.dataset.staffDisable + '/set-disabled', { disabled: b.dataset.disabled !== 'true' }); await refreshAll(); renderScreen(); toast('Đã cập nhật trạng thái khoá.'); }
    catch (ex) { showError(ex); }
  }));
  $$('[data-staff-token]', screen).forEach((b) => b.addEventListener('click', async () => {
    try {
      const r = await api.post('/api/staff/' + b.dataset.staffToken + '/rotate-token', {});
      if (r.token) openModal('<h1>Mã API mới</h1><p class="warnbox">Mã cũ đã hết hiệu lực. Mã mới chỉ hiện <strong>một lần</strong> — ghi lại ngay.</p><p class="mono">' + esc(r.token) + '</p><div class="toolbar"><button class="btn primary" type="button" onclick="document.querySelector(\'#modal-root\').hidden=true">Đã ghi lại</button></div>');
      else if (r.note) openModal('<h1>Cầu nối Supabase</h1><p>' + esc(r.note) + '</p><div class="toolbar"><button class="btn primary" type="button" onclick="document.querySelector(\'#modal-root\').hidden=true">Đã rõ</button></div>');
      else toast('Đã cập nhật.');
    } catch (ex) { showError(ex); }
  }));
  $$('[data-staff-del]', screen).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Xoá nhân viên này? Hành động không hoàn tác được.')) return;
    try { await api.del('/api/staff/' + b.dataset.staffDel); await refreshAll(); renderScreen(); toast('Đã xoá nhân viên.'); }
    catch (ex) { showError(ex); }
  }));
}

/* ----------------------------- Màn Ngân sách ------------------------------ */
async function renderBudgets(screen) {
  const rows = S.budgets.map((b) => {
    const st = staffById(b.staffId); if (!st) return '';
    const pct = b.budget ? Math.min(100, Math.round((b.used / b.budget) * 100)) : 0;
    const state = b.resting ? '<span class="pill resting">Đang nghỉ</span>' : (b.budget && pct >= 80 ? '<span class="pill waiting">Sắp chạm (' + pct + '%)</span>' : '<span class="pill working">Bình thường</span>');
    return '<tr><td data-label="Người"><strong>' + esc(b.name) + '</strong></td>' +
      '<td data-label="Mức">' + (b.budget == null ? 'Chưa đặt mức' : fmtNum(b.budget)) + '</td>' +
      '<td data-label="Đã dùng">' + fmtNum(b.used) + '</td>' +
      '<td data-label="Tiến độ"><div class="budgetbar"><i class="' + (pct >= 100 ? 'full' : pct >= 80 ? 'warn' : '') + '" style="width:' + pct + '%"></i></div><span class="small">' + pct + '%</span></td>' +
      '<td data-label="Trạng thái">' + state + '</td>' +
      (isDirector() ? '<td data-label="Thao tác" class="tbl-actions"><button class="btn small" type="button" data-budget-edit="' + esc(b.staffId) + '">Đặt mức / ghi nhận</button>' + (b.resting ? ' <button class="btn small primary" type="button" data-budget-topup="' + esc(b.staffId) + '">Nạp thêm 50%</button>' : '') + '</td>' : '<td data-label="Thao tác">—</td>') + '</tr>';
  }).join('');
  screen.innerHTML = '<h1>Ngân sách token</h1>' +
    '<p class="hint">Giám đốc đặt mức cho từng người, không có mức chung. 80% cảnh báo, 100% tự nghỉ. Nạp thêm +50% để làm tiếp. Số “đã dùng” do cầu nối đẩy lên, hoặc Giám đốc ghi nhận thủ công.</p>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Người</th><th>Mức</th><th>Đã dùng</th><th>Tiến độ</th><th>Trạng thái</th>' + (isDirector() ? '<th>Thao tác</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (Session.demo ? '<p class="hint">Bản DEMO: số liệu mô phỏng, không phải số thật.</p>' : '');
  $$('[data-budget-edit]', screen).forEach((b) => b.addEventListener('click', () => {
    const st = staffById(b.dataset.budgetEdit);
    openModal('<h1>Ngân sách: ' + esc(st.name) + '</h1><form id="budget-form"><label>Mức ngân sách token<input name="budget" type="number" min="0" value="' + (st.budget == null ? '' : st.budget) + '"></label><label>Đã dùng<input name="used" type="number" min="0" value="' + st.used + '"></label><button class="btn primary" type="submit">Lưu</button></form>');
    $('#budget-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      try {
        await api.patch('/api/budgets/' + st.id, { budget: fd.get('budget') === '' ? null : Number(fd.get('budget')), used: Number(fd.get('used')) });
        closeModal(); await refreshAll(); renderScreen(); toast('Đã cập nhật ngân sách.');
      } catch (ex) { showError(ex); }
    });
  }));
  $$('[data-budget-topup]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/budgets/' + b.dataset.budgetTopup + '/topup', {}); await refreshAll(); renderScreen(); toast('Đã nạp thêm 50% và cho làm tiếp.'); }
    catch (ex) { showError(ex); }
  }));
}

/* ----------------------------- Màn Phòng chat ------------------------------ */
function chatTargets() {
  const list = [{ id: 'room', name: 'Phòng chung', sub: 'Cả team' }];
  for (const s of S.staff) {
    if (Session.me && s.id === Session.me.id) continue;
    list.push({ id: s.id, name: s.name, sub: roleOfStaff(s).name + ' · ' + STATUS_META[effectiveStatus(s, S.approvals)].label });
  }
  return list;
}
function renderChatLog() {
  const log = $('#chat-log'); if (!log) return;
  // Chống trùng hiển thị: cùng một id chỉ vẽ một lần, dù S.messages có lỡ
  // chứa 2 bản (đường đua POST trả về vs realtime INSERT, 31/10).
  const seen = new Set();
  const msgs = S.messages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    if (S.chatTarget === 'room') return m.toId === 'room';
    return (m.fromId === (Session.me && Session.me.id) && m.toId === S.chatTarget) || (m.fromId === S.chatTarget && m.toId === (Session.me && Session.me.id));
  });
  if (!msgs.length) { log.innerHTML = '<p class="hint">Chưa có tin nhắn nào. Nhắc tên bằng @Tên hoặc [ASK:Tên] để báo ngay.</p>'; return; }
  log.innerHTML = msgs.map((m) => {
    const mine = Session.me && m.fromId === Session.me.id;
    const taggedMe = m.taggedIds && Session.me && m.taggedIds.includes(Session.me.id);
    const job = m.jobId ? S.jobs.find((j) => j.id === m.jobId) : null;
    return '<div class="msg' + (mine ? ' mine' : '') + '">' +
      '<div class="msg-meta">' + esc(myName(m.fromId)) + ' · ' + esc(fmtTime(m.at)) +
      (taggedMe ? ' <span class="msg-tag">Nhắc tên bạn</span>' : '') +
      (job ? ' · Việc: ' + esc(job.name) : '') + '</div>' +
      '<div>' + esc(m.text) + '</div>' +
      (m.link ? '<a class="msg-link" href="' + esc(m.link.url) + '" target="_blank" rel="noopener">Link: ' + esc(m.link.title) + '</a>' : '') +
      (m.taggedIds && m.taggedIds.length ? '<div class="small">Nhắc tới: ' + m.taggedIds.map((id) => esc(myName(id))).join(', ') + '</div>' : '') +
      '</div>';
  }).join('');
  log.scrollTop = log.scrollHeight;
}
async function renderChat(screen) {
  const targets = chatTargets();
  if (!targets.some((t) => t.id === S.chatTarget)) S.chatTarget = 'room';
  const cur = targets.find((t) => t.id === S.chatTarget);
  const myMentions = S.messages.filter((m) => m.taggedIds && Session.me && m.taggedIds.includes(Session.me.id)).slice(-5).reverse();
  screen.innerHTML = '<div class="chat-head"><h1>Phòng chat</h1>' +
    '<p class="hint chat-rules">Quy tắc: nhắc tên bằng <code>@Tên</code> hoặc <code>[ASK:Tên]</code> thì người đó nhận thông báo <strong>ngay</strong>; thời gian trả lời tuỳ câu hỏi. Tin nhắn gắn vào việc sẽ hiện trong luồng của việc đó.</p></div>' +
    '<div class="chat-layout"><div class="chat-side"><h2>Người nhận</h2><div class="conv-list">' +
    targets.map((t) => '<button type="button" class="conv-item' + (t.id === S.chatTarget ? ' active' : '') + '" data-chat-target="' + esc(t.id) + '">' +
      '<span class="dot ' + (t.id === 'room' ? 'green' : STATUS_META[effectiveStatus(staffById(t.id), S.approvals)].dot) + '"></span>' +
      '<span class="who"><b>' + esc(t.name) + '</b><span class="small muted">' + esc(t.sub) + '</span></span></button>').join('') +
    '</div>' +
    '<details class="chat-mentions"><summary>Nhắc tên tôi' + (myMentions.length ? ' (' + myMentions.length + ')' : '') + '</summary>' +
    (myMentions.map((m) => '<p class="small"><strong>' + esc(myName(m.fromId)) + ':</strong> ' + esc(m.text.slice(0, 80)) + '</p>').join('') || '<p class="hint">Chưa ai nhắc tên bạn.</p>') +
    '</details></div>' +
    '<div class="chat-pane"><div class="chat-pane-head"><h2>' + esc(cur.name) + '</h2><span class="small">' + esc(cur.sub) + '</span></div>' +
    '<div class="chat-log" id="chat-log"></div>' +
    '<form class="composer" id="chat-form">' +
    '<div class="composer-tools">' +
    '<select id="tag-pick" title="Nhắc tên nhanh"><option value="">@ Nhắc tên</option>' + S.staff.filter((s) => !Session.me || s.id !== Session.me.id).map((s) => '<option value="' + esc(s.name) + '">[ASK:' + esc(s.name) + ']</option>').join('') + '</select>' +
    '<select id="chat-job" title="Gắn vào việc"><option value="">Gắn việc…</option>' + S.jobs.map((j) => '<option value="' + esc(j.id) + '">' + esc(j.name) + '</option>').join('') + '</select>' +
    '<button type="button" class="btn small" id="chat-link-toggle" aria-expanded="false">＋ Link</button>' +
    '</div>' +
    '<div class="composer-linkrow" id="chat-link-row" hidden><input id="chat-link" type="url" placeholder="https://…"><input id="chat-link-title" placeholder="Tiêu đề link"></div>' +
    '<div class="composer-main"><textarea id="chat-text" rows="1" required placeholder="Nhắn tin…"></textarea>' +
    '<button class="btn primary send" type="submit">Gửi</button></div></form></div></div>';
  $$('[data-chat-target]', screen).forEach((b) => b.addEventListener('click', () => { S.chatTarget = b.dataset.chatTarget; renderScreen(); }));
  renderChatLog();
  const tagPick = $('#tag-pick');
  tagPick.addEventListener('change', () => {
    if (!tagPick.value) return;
    const ta = $('#chat-text');
    ta.value = (ta.value ? ta.value + ' ' : '') + '[ASK:' + tagPick.value + '] ';
    ta.focus();
  });
  const linkToggle = $('#chat-link-toggle');
  linkToggle.addEventListener('click', () => {
    const row = $('#chat-link-row');
    const open = row.hidden;
    row.hidden = !open;
    linkToggle.setAttribute('aria-expanded', String(open));
    if (open) $('#chat-link').focus();
  });
  // Ô nhập tự cao dần theo nội dung (tối đa 120px), kiểu messenger.
  const taGrow = $('#chat-text');
  const autogrow = () => { taGrow.style.height = 'auto'; taGrow.style.height = Math.min(taGrow.scrollHeight, 120) + 'px'; };
  taGrow.addEventListener('input', autogrow);
  autogrow();
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#chat-text').value.trim();
    if (!text) return;
    const linkUrl = $('#chat-link').value.trim();
    const body = { to: S.chatTarget, text, jobId: $('#chat-job').value || null };
    if (linkUrl) body.link = { url: linkUrl, title: $('#chat-link-title').value.trim() || linkUrl };
    try {
      const msg = await api.post('/api/messages', body);
      // Tránh trùng: realtime INSERT có thể về trước khi POST trả về (đã
      // đẩy tin này vào S.messages rồi) — chỉ push khi chưa có id này.
      if (msg && !S.messages.some((m) => m.id === msg.id)) S.messages.push(msg);
      renderChatLog();
      $('#chat-text').value = ''; $('#chat-text').style.height = 'auto'; $('#chat-link').value = ''; $('#chat-link-title').value = '';
      feedAdd('Đã gửi tin tới ' + cur.name + '.');
    } catch (ex) { showError(ex); }
  });
}

/* ------------------------------ Màn Nhật ký ------------------------------- */
async function renderLogs(screen) {
  if (!isDirector()) {
    screen.innerHTML = '<h1>Nhật ký</h1><p class="hint">Chỉ Giám đốc mới xem được nhật ký.</p>';
    return;
  }
  const auditRows = S.audit.slice(-60).reverse().map((a) => '<tr><td data-label="Thời gian">' + esc(fmtTime(a.at)) + '</td><td data-label="Hành động">' + esc(a.action) + '</td><td data-label="Người">' + esc(myName(a.actorId)) + '</td><td data-label="Đối tượng">' + esc(a.target || '—') + '</td><td data-label="Kết quả">' + esc(a.result) + '</td></tr>').join('');
  const alertRows = S.alerts.slice(-30).reverse().map((a) => '<tr><td data-label="Thời gian">' + esc(fmtTime(a.at)) + '</td><td data-label="Loại">' + esc(a.kind) + '</td><td data-label="Nội dung">' + esc(a.text) + '</td></tr>').join('');
  const sessionRows = S.sessions.map((s) => '<tr><td data-label="Phiên">' + esc(s.id) + '</td><td data-label="Người">' + esc(myName(s.staffId)) + '</td><td data-label="Tạo lúc">' + esc(fmtTime(s.createdAt)) + '</td><td data-label="Thấy lần cuối">' + esc(fmtTime(s.lastSeenAt)) + '</td><td data-label="Thao tác" class="tbl-actions"><button class="btn small danger" type="button" data-revoke="' + esc(s.id) + '">Thu hồi</button></td></tr>').join('');
  screen.innerHTML = '<h1>Nhật ký</h1>' +
    '<h2>Cảnh báo</h2>' + (alertRows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Thời gian</th><th>Loại</th><th>Nội dung</th></tr></thead><tbody>' + alertRows + '</tbody></table></div>' : '<p class="hint">Chưa có cảnh báo nào.</p>') +
    '<h2>Phiên đăng nhập đang mở</h2>' + (sessionRows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Phiên</th><th>Người</th><th>Tạo lúc</th><th>Thấy lần cuối</th><th></th></tr></thead><tbody>' + sessionRows + '</tbody></table></div>' : '<p class="hint">Không có phiên nào.</p>') +
    '<h2>Nhật ký kiểm toán</h2>' + (auditRows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Thời gian</th><th>Hành động</th><th>Người</th><th>Đối tượng</th><th>Kết quả</th></tr></thead><tbody>' + auditRows + '</tbody></table></div>' : '<p class="hint">Chưa có dòng nhật ký nào.</p>');
  $$('[data-revoke]', screen).forEach((b) => b.addEventListener('click', async () => {
    try { await api.post('/api/sessions/' + b.dataset.revoke + '/revoke', {}); await refreshAll(); renderScreen(); toast('Đã thu hồi phiên.'); }
    catch (ex) { showError(ex); }
  }));
}

/* ---------------------------- Màn Cài đặt & kit --------------------------- */
async function renderSettings(screen) {
  const apiCard = isSb()
    ? '<div class="card"><h2>Địa chỉ Supabase</h2><p class="hint">Project URL và anon key nằm trong web/config.js — không sửa ở đây.</p></div>'
    : '<div class="card"><h2>Địa chỉ máy chủ (API)</h2><form id="api-form"><label>API base URL (để trống = cùng địa chỉ trang web)<input name="apiBase" value="' + esc(Session.apiBase) + '" placeholder="https://may-chu-cua-ban:3101"></label><button class="btn" type="submit">Lưu và nối lại</button></form></div>';
  screen.innerHTML = '<h1>Cài đặt &amp; kit</h1>' +
    (Session.demo ? '<p class="warnbox"><strong>Bản DEMO ngoại tuyến.</strong> Dữ liệu chỉ nằm trên trình duyệt này.</p>' : (isSb() ? '<p class="hint">Đang nối Supabase.</p>' : '<p class="hint">Đang nối máy chủ tại ' + esc(apiBase() || 'cùng địa chỉ trang web') + '.</p>')) +
    apiCard +
    '<div class="card"><h2>Bộ kit cài cầu nối</h2><p class="hint">Mỗi tài khoản Muse cài một cầu nối mỏng để nối vào hệ thống. Hướng dẫn đầy đủ trong Tài liệu thiết kế.</p>' +
    '<div class="toolbar">' + ['bridge.js', 'install.sh', 'install.bat', 'config.example.json', 'README.md'].map((f) => '<button class="btn small" type="button" data-kit="' + f + '">' + f + '</button>').join('') + '</div>' +
    (Session.demo ? '<p class="hint">Tải kit cần nối máy chủ thật.</p>' : '') + '</div>' +
    '<div class="card"><h2>Xuất dữ liệu</h2><p class="hint">Xuất toàn bộ dữ liệu hệ thống thành một file JSON để sao lưu.</p><button class="btn" type="button" id="export-btn">Tải file JSON</button></div>' +
    (Session.demo ? '<div class="card"><h2>Bản demo</h2><p class="hint">Đổi danh tính để lái thử các vai trò.</p><div class="toolbar"><select id="demo-identity">' + DemoDB.load().staff.map((s) => '<option value="' + esc(s.id) + '" ' + (Session.me && s.id === Session.me.id ? 'selected' : '') + '>' + esc(s.name) + ' — ' + esc(demoRoleOf(DemoDB.data, s).name) + '</option>').join('') + '</select><button class="btn" type="button" id="demo-switch">Đổi danh tính</button><button class="btn danger" type="button" id="demo-reset">Đặt lại dữ liệu mẫu</button></div></div>' : '') +
    '<div class="card"><h2>Phiên hiện tại</h2><dl class="kv"><div class="row"><dt>Người dùng</dt><dd>' + esc(Session.me ? Session.me.name : '—') + '</dd></div><div class="row"><dt>Vai trò</dt><dd>' + esc(myRole().name) + '</dd></div><div class="row"><dt>Loại phiên</dt><dd>' + (Session.demo ? 'Demo ngoại tuyến' : Session.meType === 'director' ? 'Giám đốc' : 'Nhân viên') + '</dd></div></dl></div>';
  const apiForm = $('#api-form');
  if (apiForm) apiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = new FormData(e.target).get('apiBase').trim().replace(/\/$/, '');
    localStorage.setItem('office.apiBase', v);
    Session.apiBase = v;
    toast('Đã lưu địa chỉ máy chủ. Đang nối lại…');
    const ok = await probeServer();
    if (ok) { await refreshAll(); renderScreen(); }
  });
  $$('[data-kit]', screen).forEach((b) => b.addEventListener('click', async () => {
    if (Session.demo) { toast('Tải kit cần nối máy chủ thật.'); return; }
    try {
      // Chế độ Supabase: kit là file tĩnh trong repo, tải thẳng từ GitHub
      // Pages (thư mục kit/ cạnh thư mục web/) — không qua API máy chủ.
      if (isSb()) {
        const res = await fetch('../kit/' + b.dataset.kit);
        if (!res.ok) throw new Error('Không tải được file kit (HTTP ' + res.status + ').');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = b.dataset.kit; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        return;
      }
      const res = await fetch(apiBase() + '/api/kit/' + b.dataset.kit, { headers: { Authorization: 'Bearer ' + Session.token } });
      if (!res.ok) throw new Error('Không tải được file kit (HTTP ' + res.status + ').');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = b.dataset.kit; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (ex) { showError(ex); }
  }));
  $('#export-btn').addEventListener('click', async () => {
    try {
      const data = Session.demo ? DemoDB.load() : await api.get('/api/backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'office-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Đã tải file sao lưu.');
    } catch (ex) { showError(ex); }
  });
  const sw = $('#demo-switch');
  if (sw) sw.addEventListener('click', async () => {
    const id = $('#demo-identity').value;
    Session.me = DemoDB.data.staff.find((s) => s.id === id);
    Session.meType = id === 's-chung' ? 'director' : 'staff';
    await refreshAll(); renderScreen(); toast('Đã đổi danh tính demo: ' + Session.me.name + '.');
  });
  const rs = $('#demo-reset');
  if (rs) rs.addEventListener('click', () => { DemoDB.reset(); location.reload(); });
}

/* ------------------------------ Màn Tài liệu ------------------------------ */
function renderDocs(screen) {
  screen.innerHTML = '<div class="docs"><h1>Tài liệu thiết kế</h1>' +
    '<p class="hint">Phác thảo hệ thống — quyết định đã chốt ở bên dưới.</p>' +
    '<h2>Quyết định đã chốt (29/10/2026)</h2>' +
    '<ul><li><strong>Ngân sách token:</strong> Giám đốc tự đặt cho từng người, không mức chung. Tài khoản điều phối: 5.000.000.000 token.</li>' +
    '<li><strong>Hộp phê duyệt:</strong> nhận MỌI yêu cầu cấp quyền của MỌI tài khoản Muse. Quyết định ngay trên web.</li>' +
    '<li><strong>Báo khẩn:</strong> qua WhatsApp + biểu ngữ nổi bật trong trung tâm điều hành.</li>' +
    '<li><strong>Tài khoản:</strong> mỗi tài khoản Muse là một nhân viên có tên đăng nhập + mật khẩu riêng, cài một cầu nối mỏng.</li>' +
    '<li><strong>Trao đổi tài liệu:</strong> qua link công khai của Muse, không dán nội dung vào phòng.</li>' +
    '<li><strong>Vai trò linh hoạt:</strong> chức vụ theo từng việc, không gắn cứng theo người.</li></ul>' +
    '<h2>Các mô-đun</h2>' +
    '<table><thead><tr><th>Mô-đun</th><th>Việc nó làm</th></tr></thead><tbody>' +
    '<tr><td data-label="Mô-đun">Quản trị tổ chức</td><td data-label="Việc nó làm">Quản lý chức vụ và nhân viên (tạo, đặt lại mật khẩu, khoá, xoá, cấp mã API).</td></tr>' +
    '<tr><td data-label="Mô-đun">Văn phòng 3D</td><td data-label="Việc nó làm">Nhân vật, trạng thái, đèn đỏ khi có yêu cầu chờ, gọi họp, biên bản.</td></tr>' +
    '<tr><td data-label="Mô-đun">Quản lý việc</td><td data-label="Việc nó làm">Việc 4 cột, nhận nguyên tử, không tự duyệt, đính kèm rule và link.</td></tr>' +
    '<tr><td data-label="Mô-đun">Phê duyệt</td><td data-label="Việc nó làm">Hàng đợi mọi yêu cầu cấp quyền; duyệt/từ chối có lý do; cấm tự duyệt.</td></tr>' +
    '<tr><td data-label="Mô-đun">Phòng chat</td><td data-label="Việc nó làm">Nhắc tên [ASK:Tên] báo ngay, gắn tin vào việc, link đính kèm.</td></tr>' +
    '<tr><td data-label="Mô-đun">Ngân sách token</td><td data-label="Việc nó làm">Mức theo từng người, cảnh báo 80%, nghỉ ở 100%, nạp thêm 50%.</td></tr>' +
    '<tr><td data-label="Mô-đun">Máy chủ + cầu nối</td><td data-label="Việc nó làm">Máy chủ Node.js + SQLite, SSE đẩy trực tiếp, cầu nối gửi nhịp tim và xin duyệt.</td></tr>' +
    '</tbody></table>' +
    '<h2>Ghi công (theo phác thảo gốc)</h2>' +
    '<p>Dựa trên nghiên cứu 23 dự án mã nguồn mở (Claw-Empire, Paperclip, BagIdea Office, Agent Office, Claw3D). Ý tưởng lấy cảm hứng, triển khai viết mới — không sao chép mã.</p>' +
    '<h2>Lộ trình</h2>' +
    '<ol><li><strong>Giai đoạn 1:</strong> khung tổ chức + việc + phê duyệt + ngân sách (đang chạy).</li>' +
    '<li><strong>Giai đoạn 2:</strong> phòng chat, họp, cầu nối đầy đủ cho mọi tài khoản.</li>' +
    '<li><strong>Giai đoạn 3:</strong> báo cáo, thống kê, tích hợp thêm công cụ.</li></ol>' +
    '<h2>Cài cầu nối (tóm tắt)</h2>' +
    '<ol><li>Tải bộ kit ở màn Cài đặt &amp; kit.</li>' +
    '<li>Xin Giám đốc cấp mã API (màn Nhân sự → Cấp mã API) — mã chỉ hiện một lần.</li>' +
    '<li>Chạy <code>install.sh</code> (macOS/Linux) hoặc <code>install.bat</code> (Windows), nhập địa chỉ máy chủ + mã API.</li>' +
    '<li>Cầu nối chạy nền, gửi nhịp tim mỗi 30 giây.</li></ol>' +
    '<p class="hint">Hướng dẫn chi tiết: xem file docs/HUONG-DAN-CAI-DAT.md trong kho mã nguồn.</p></div>';
}
