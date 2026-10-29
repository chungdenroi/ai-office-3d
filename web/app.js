/* ============================================================================
 * Văn phòng 3D — Trung tâm điều hành AI nhân viên (bản tĩnh, dữ liệu local)
 * ----------------------------------------------------------------------------
 * NGUYÊN TẮC THIẾT KẾ (theo phác thảo đã duyệt 29/10/2026):
 *  - Chức vụ, công việc, rule, ngân sách đều là DỮ LIỆU do Giám đốc quản lý.
 *    Không có logic nào gán cứng "người này = chức vụ này / việc này".
 *    Mọi quyền đều tính từ dữ liệu chức vụ hiện tại (xem PERMISSIONS).
 *  - Số liệu "đã dùng" trong Mục 5 là SỐ MÔ PHỎNG, ghi rõ trong giao diện.
 *    Chỉ mức ngân sách 5.000.000.000 token của tài khoản điều phối là mức
 *    thật đã được cấp (quyết định đã chốt, Mục 5 + Mục 10).
 *  - Khóa Giám đốc ở bản tĩnh này chỉ là KHÓA DEMO để lái thử luồng.
 *    Xác thực thật (mật khẩu + TOTP, phiên, thu hồi) chỉ có ở server/.
 *  - Chu kỳ: SỰ KIỆN LÀ CHÍNH, nhịp nền tự thích ứng, có trần chi phí
 *    (xem AdaptivePulse ở cuối file).
 * ========================================================================== */
'use strict';

/* ------------------------------ Lưu trữ -------------------------------- */
const LS_KEY = 'ai-office-3d-v1';
const uid = () => 'id-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function seedState() {
  // Chức vụ mẫu: DỮ LIỆU do Giám đốc đặt, đổi/xoá được ngay tại Mục 1.
  // Quyền duyệt / quản trị nằm ở dữ liệu chức vụ, không nằm ở tên người.
  const roles = [
    { id: 'r-giamdoc',  name: 'Giám đốc',  level: 1, canApprove: true,  canManage: true  },
    { id: 'r-dieuphoi', name: 'Điều phối', level: 1, canApprove: true,  canManage: false },
    { id: 'r-quanly',   name: 'Quản lý',   level: 2, canApprove: true,  canManage: false },
    { id: 'r-thucthi',  name: 'Thực thi',  level: 3, canApprove: false, canManage: false },
  ];
  // Người thật của đội. Chức vụ gán kèm CHỈ LÀ MẪU BAN ĐẦU do Giám đốc đặt
  // (phác thảo §1); vai trò trong từng việc gán riêng ở Mục 2, độc lập.
  const staff = [
    { id: 's-chung', name: 'Chung', account: 'teddyssk559@gmail.com', roleId: 'r-giamdoc',  status: 'waiting',  budget: null,        used: 0,         resting: false, restedFully: false },
    { id: 's-muse',  name: 'Muse',  account: 'muse-dieu-phoi',        roleId: 'r-dieuphoi', status: 'working',  budget: 5000000000, used: 412000000, resting: false, restedFully: false },
    { id: 's-hung',  name: 'Hùng',  account: 'muse-hung',             roleId: 'r-quanly',   status: 'waiting',  budget: 100000000,  used: 12000000,  resting: false, restedFully: false },
    { id: 's-tuan',  name: 'Tuấn',  account: 'muse-tuan',             roleId: 'r-thucthi',  status: 'waiting',  budget: 100000000,  used: 8000000,   resting: false, restedFully: false },
    { id: 's-linh',  name: 'Linh',  account: 'muse-linh',             roleId: 'r-thucthi',  status: 'waiting',  budget: 100000000,  used: 5000000,   resting: false, restedFully: false },
  ];
  return {
    version: 1,
    roles,
    staff,
    // Kho việc RỖNG lúc đầu theo đúng nguyên tắc Module B — Giám đốc thêm dần.
    rules: [
      { id: uid(), text: 'Mọi việc phải qua kiểm tra trước khi trình duyệt' },
      { id: uid(), text: 'Duyệt / trả lại phải có lý do; cấm tự duyệt việc của mình' },
    ],
    jobs: [],
    approvals: [],
    approvalLog: [],
    minutes: [],
    activity: [],
    security: [],
    actingAsId: 's-chung',
    selectedId: 's-muse',
    demoSession: null, // phiên đăng nhập demo trên trình duyệt {staffId} — thật chỉ ở máy chủ
    budgetAlerts: [], // {staffId, at, kind: 'warn'|'full'}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) return s; }
  } catch (e) { /* dữ liệu hỏng -> dùng mẫu */ }
  return seedState();
}
let state = loadState();
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN'));
const nowTime = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const roleOf = (st) => state.roles.find((r) => r.id === st.roleId) || { name: '(chưa gán chức vụ)', level: 9, canApprove: false, canManage: false };
const staffById = (id) => state.staff.find((s) => s.id === id);
const actingAs = () => staffById(state.actingAsId) || state.staff[0];

/* ------------------------- Bộ quy tắc phân quyền -------------------------
 * MỘT bộ quy tắc duy nhất, dùng chung cho: nút duyệt trên thẻ việc (Mục 2),
 * nút Duyệt/Từ chối (Mục 3), demo kiểm tra quyền (Mục 9) và máy chủ
 * (server/server.js cài lại cùng bộ quy tắc này phía máy chủ).
 * Không có tên người nào được ghi cứng trong các hàm dưới đây. */
const PERMISSIONS = {
  canDecideApproval(actor, req) {
    if (!actor) return { ok: false, reason: 'Chưa xác định danh tính đang thao tác.' };
    const role = roleOf(actor);
    if (!role.canApprove) return { ok: false, reason: `Chức vụ “${role.name}” không có quyền duyệt (quyền duyệt tính theo chức vụ ở Mục 1).` };
    if (req && actor.id === req.requesterId) return { ok: false, reason: 'Cấm tự duyệt yêu cầu của chính mình — áp dụng ở mọi cấp.' };
    return { ok: true, reason: `Chức vụ “${role.name}” có quyền duyệt và không phải người yêu cầu.` };
  },
  canApproveJob(actor, job) {
    if (!actor) return { ok: false, reason: 'Chưa xác định danh tính đang thao tác.' };
    const role = roleOf(actor);
    if (!role.canApprove) return { ok: false, reason: `Chức vụ “${role.name}” không có quyền duyệt việc.` };
    if (job && actor.id === job.assigneeId) return { ok: false, reason: 'Cấm tự duyệt việc của chính mình.' };
    return { ok: true, reason: `Chức vụ “${role.name}” có quyền duyệt việc.` };
  },
  canGrant(actor) {
    const role = actor && roleOf(actor);
    if (!role || !role.canManage) return { ok: false, reason: 'Chỉ Giám đốc (chức vụ có quyền quản trị) mới được cấp ngân sách / cho nghỉ / gọi lại.' };
    return { ok: true, reason: 'Chức vụ có quyền quản trị (cấp Giám đốc).' };
  },
  canChangeRole(actor) {
    const role = actor && roleOf(actor);
    if (!role || !role.canManage) return { ok: false, reason: 'Chỉ Giám đốc (chức vụ có quyền quản trị) mới được tạo/sửa chức vụ, thêm/xoá nhân viên.' };
    return { ok: true, reason: 'Chức vụ có quyền quản trị (cấp Giám đốc).' };
  },
  canClaim(actor, job) {
    if (!actor) return { ok: false, reason: 'Chưa xác định danh tính.' };
    if (actor.resting) return { ok: false, reason: `${actor.name} đang nghỉ do chạm ngân sách — không nhận việc mới cho đến khi Giám đốc quyết định.` };
    if (job.status !== 'Chờ nhận') return { ok: false, reason: 'Việc không còn ở cột Chờ nhận.' };
    if (job.claimedBy && job.claimedBy !== actor.id) return { ok: false, reason: 'Việc đã có người nhận (khoá nhận việc nguyên tử) — không thể nhận trùng.' };
    if (actor.id !== job.assigneeId) return { ok: false, reason: 'Chỉ người phụ trách được gán cho việc này mới nhận được việc.' };
    return { ok: true, reason: 'Đủ điều kiện nhận việc.' };
  },
};

/* --------------------------- Nhật ký + trạng thái ------------------------ */
function logActivity(text, link) {
  // link (tuỳ chọn): {url, title} — chỉ nhận URL http(s); hiển thị dạng link
  // bấm được, ghi vào nhật ký. Quy ước trao đổi tài liệu: gửi LINK công khai
  // của Muse + tiêu đề + tóm tắt, không dán toàn bộ nội dung vào chat.
  const safeLink = link && /^https?:\/\//i.test(link.url || '') ? { url: link.url, title: link.title || link.url } : null;
  state.activity.unshift({ at: nowTime(), text, link: safeLink });
  state.activity = state.activity.slice(0, 60);
  save(); renderLog(); renderLiveStatus(); renderStatusbar();
}
function logSecurity(text) {
  state.security.unshift({ at: nowTime(), text });
  state.security = state.security.slice(0, 40);
  save(); renderSecurityLog();
}

const STATUS_META = {
  working:  { label: 'Đang làm',            cls: 'working',  ring: 0x1f9d55 },
  waiting:  { label: 'Đang chờ',            cls: 'waiting',  ring: 0xd69e00 },
  approval: { label: 'Cần duyệt',           cls: 'approval', ring: 0xd64545 },
  resting:  { label: 'Đang nghỉ (ngân sách)', cls: 'resting', ring: 0x7c8da6 },
};
function effectiveStatus(st) {
  if (st.resting) return 'resting';
  if (state.approvals.some((a) => a.status === 'pending' && a.requesterId === st.id)) return 'approval';
  return st.status;
}
function renderStatusbar() {
  const counts = { working: 0, waiting: 0, approval: 0, resting: 0 };
  state.staff.forEach((s) => { counts[effectiveStatus(s)]++; });
  $('#sb-counts').textContent = `${counts.working} đang làm · ${counts.waiting} đang chờ · ${counts.approval} cần duyệt · ${counts.resting} đang nghỉ (ngân sách)`;
}
function renderLiveStatus() {
  $('#livestatus').innerHTML = state.staff.map((s) => {
    const st = effectiveStatus(s);
    const m = STATUS_META[st];
    const job = state.jobs.find((j) => j.assigneeId === s.id && j.status !== 'Hoàn thành');
    return `<div class="row" style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed #e4e9ee;font-size:14px">
      <span><span class="dot ${m.cls === 'working' ? 'green' : m.cls === 'waiting' ? 'yellow' : m.cls === 'approval' ? 'red' : 'rest'}"></span><strong>${esc(s.name)}</strong> <span class="small">(${esc(roleOf(s).name)})</span></span>
      <span class="pill ${m.cls}">${m.label}</span></div>
      ${job ? `<div class="small" style="padding:0 0 4px 18px">Đang làm: ${esc(job.name)} — ${job.progress}%</div>` : ''}`;
  }).join('');
}
function renderLog() {
  $('#activity-log').innerHTML = state.activity.length
    ? state.activity.map((a) => `<div><time>${esc(a.at)}</time>${esc(a.text)}${a.link ? ` <a href="${esc(a.link.url)}" target="_blank" rel="noopener">📎 ${esc(a.link.title)}</a>` : ''}</div>`).join('')
    : '<p class="hint">Chưa có hoạt động nào.</p>';
}
function renderSecurityLog() {
  $('#security-log').innerHTML = state.security.length
    ? state.security.map((a) => `<div style="padding:5px 0;border-bottom:1px dashed #e4e9ee;font-size:14px"><time style="color:var(--muted);font-size:12px;margin-right:6px">${esc(a.at)}</time>${esc(a.text)}</div>`).join('')
    : '<p class="hint">Chưa có sự kiện bảo mật nào.</p>';
}

/* ------------------------------ Mục 1: Tổ chức --------------------------- */
function staffOptions(selectedId, placeholder) {
  return (placeholder ? `<option value="">${placeholder}</option>` : '') +
    state.staff.map((s) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)} — ${esc(roleOf(s).name)}</option>`).join('');
}
function roleOptions(selectedId) {
  return state.roles.slice().sort((a, b) => a.level - b.level)
    .map((r) => `<option value="${r.id}" ${r.id === selectedId ? 'selected' : ''}>${esc(r.name)} (cấp ${r.level})</option>`).join('');
}
function renderOrg() {
  const sorted = state.roles.slice().sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  $('#role-list').innerHTML = sorted.map((r) => `
    <div class="staffrow">
      <strong>${esc(r.name)}</strong>
      <span class="pill">Cấp ${r.level}</span>
      <span class="small">${r.canApprove ? 'Được duyệt' : 'Không duyệt'} · ${r.canManage ? 'Quyền quản trị' : 'Không quản trị'}</span>
      <span style="flex:1"></span>
      <button type="button" class="small" data-action="role-rename" data-id="${r.id}">Đổi tên</button>
      <button type="button" class="small danger" data-action="role-delete" data-id="${r.id}">Xoá</button>
    </div>`).join('') || '<p class="hint">Chưa có chức vụ nào.</p>';

  $('#staff-admin').innerHTML = state.staff.map((s) => {
    const lg = s.loginDemo;
    const loginText = !lg ? 'Chưa có tài khoản đăng nhập' : lg.disabled ? `Tài khoản ${lg.username} — ĐÃ KHOÁ` : `Tài khoản ${lg.username}${lg.mustChange ? ' — phải đổi mật khẩu lần đầu' : ''}`;
    return `
    <div class="staffrow">
      <div><strong>${esc(s.name)}</strong><div class="small">${esc(s.account || 'Chưa gắn tài khoản Muse')}</div><div class="small">${esc(loginText)}</div></div>
      <select data-role-for="${s.id}" aria-label="Chức vụ của ${esc(s.name)}">${roleOptions(s.roleId)}</select>
      <button type="button" class="small" data-action="staff-login-create" data-id="${s.id}">Tạo tài khoản</button>
      <button type="button" class="small" data-action="staff-login-reset" data-id="${s.id}">Đặt lại mật khẩu</button>
      <button type="button" class="small" data-action="staff-login-disable" data-id="${s.id}">${lg && lg.disabled ? 'Mở khoá' : 'Khoá'}</button>
      <button type="button" class="small danger" data-action="staff-delete" data-id="${s.id}">Xoá</button>
    </div>`;
  }).join('');
  $$('#staff-admin select[data-role-for]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const st = staffById(sel.dataset.roleFor);
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); renderOrg(); return; }
      st.roleId = sel.value; save();
      logActivity(`${actingAs().name} đổi chức vụ của ${st.name} thành “${roleOf(st).name}”.`);
      renderAll(); Pulse.kick('role-change');
    });
  });

  $('#staff-role').innerHTML = roleOptions(state.roles[0] && state.roles[0].id);
  renderActingAs();
  renderStaffList();
  renderProfile();
}
function renderActingAs() {
  const sel = $('#acting-as');
  const cur = sel.value || state.actingAsId;
  sel.innerHTML = state.staff.map((s) => `<option value="${s.id}">${esc(s.name)} — ${esc(roleOf(s).name)}</option>`).join('');
  sel.value = staffById(cur) ? cur : (state.staff[0] && state.staff[0].id);
  state.actingAsId = sel.value;
}
function renderStaffList() {
  $('#stafflist').innerHTML = state.staff.map((s) => {
    const st = effectiveStatus(s);
    return `<button type="button" data-action="select-staff" data-id="${s.id}">
      <span><strong>${esc(s.name)}</strong> <span class="small">${esc(roleOf(s).name)}</span></span>
      <span class="pill ${STATUS_META[st].cls}">${STATUS_META[st].label}</span></button>`;
  }).join('');
}
function renderProfile() {
  const s = staffById(state.selectedId) || state.staff[0];
  if (!s) { $('#profile-body').innerHTML = '<p>—</p>'; return; }
  const st = effectiveStatus(s);
  const job = state.jobs.find((j) => j.assigneeId === s.id && j.status !== 'Hoàn thành');
  $('#profile-body').innerHTML = `
    <div class="row"><span>Tên</span><strong>${esc(s.name)}</strong></div>
    <div class="row"><span>Chức vụ hiện tại</span><strong>${esc(roleOf(s).name)} (cấp ${roleOf(s).level})</strong></div>
    <div class="row"><span>Tài khoản Muse</span><span>${esc(s.account || '—')}</span></div>
    <div class="row"><span>Trạng thái</span><span class="pill ${STATUS_META[st].cls}">${STATUS_META[st].label}</span></div>
    <div class="row"><span>Việc đang làm</span><span>${job ? esc(job.name) + ' — ' + job.status : '—'}</span></div>
    <div class="row"><span>Ngân sách token</span><span>${s.budget == null ? 'Chưa đặt (chờ Giám đốc chốt)' : fmtNum(s.budget)}</span></div>
    <p class="small">Chức vụ trên đây là dữ liệu do Giám đốc đặt (mẫu ban đầu), đổi được ở Mục 1. Vai trò trong từng việc gán riêng ở Mục 2.</p>`;
}

/* --------------------------- Mục 2: Việc & Kanban ------------------------ */
const JOB_COLUMNS = ['Chờ nhận', 'Đang làm', 'Chờ duyệt', 'Hoàn thành'];
function renderJobs() {
  $('#rule-list').innerHTML = state.rules.map((r) => `
    <div class="staffrow"><span style="flex:1">${esc(r.text)}</span>
    <button type="button" class="small danger" data-action="rule-delete" data-id="${r.id}">Xoá</button></div>`).join('')
    || '<p class="hint">Chưa có rule nào.</p>';
  $('#job-rule').innerHTML = '<option value="">(không áp rule)</option>' +
    state.rules.map((r) => `<option value="${r.id}">${esc(r.text)}</option>`).join('');
  $('#job-assignee').innerHTML = staffOptions(null, '— Chọn người phụ trách —');
  $('#job-reviewer').innerHTML = staffOptions(null, '— Chọn người kiểm tra —');
  $('#ap-requester').innerHTML = staffOptions();
  $('#ask-to').innerHTML = staffOptions();

  $('#kanban').innerHTML = JOB_COLUMNS.map((col) => {
    const jobs = state.jobs.filter((j) => j.status === col);
    return `<div class="kcol"><h3>${col} (${jobs.length})</h3>${jobs.map(jobCard).join('') || '<p class="hint">Trống</p>'}</div>`;
  }).join('');
}
function jobCard(j) {
  const rule = state.rules.find((r) => r.id === j.ruleId);
  const asg = staffById(j.assigneeId), rev = staffById(j.reviewerId);
  const claimedBy = j.claimedBy ? staffById(j.claimedBy) : null;
  let actions = '';
  if (j.status === 'Chờ nhận') {
    actions += `<button type="button" class="small primary" data-action="job-run" data-id="${j.id}">Chạy luồng trong văn phòng 3D</button>`;
  }
  if (j.status === 'Chờ duyệt') {
    actions += `<button type="button" class="small primary" data-action="job-approve" data-id="${j.id}">Duyệt → Hoàn thành</button>
      <button type="button" class="small" data-action="job-return" data-id="${j.id}">Trả lại (có lý do)</button>`;
  }
  if (j.status !== 'Hoàn thành') {
    actions += `<button type="button" class="small danger" data-action="job-delete" data-id="${j.id}">Xoá việc</button>`;
  }
  return `<article class="jobcard">
    <strong>${esc(j.name)}</strong>
    <div class="meta">${esc(j.desc)}</div>
    ${j.linkUrl && /^https?:\/\//i.test(j.linkUrl) ? `<div class="meta">📎 Tài liệu: <a href="${esc(j.linkUrl)}" target="_blank" rel="noopener">${esc(j.linkTitle || j.linkUrl)}</a> (mở link khi cần — không dán nội dung vào chat)</div>` : ''}
    ${rule ? `<div class="meta">Rule: ${esc(rule.text)}</div>` : ''}
    <div class="meta">Phụ trách: ${asg ? esc(asg.name) : '—'} · Kiểm tra: ${rev ? esc(rev.name) : '—'}${claimedBy ? ` · Đã nhận bởi ${esc(claimedBy.name)}` : ''}</div>
    ${j.status === 'Đang làm' ? `<div class="progress"><i style="width:${j.progress}%"></i></div><div class="meta">Tiến độ: ${j.progress}%</div>` : ''}
    <div class="actions">${actions}</div>
  </article>`;
}
function setJobStatus(job, status, note) {
  job.status = status; save(); renderJobs(); renderLiveStatus(); renderStatusbar(); sync3D();
  logActivity(`Việc “${job.name}”: ${status}${note ? ' — ' + note : ''}.`);
  Pulse.kick('job-' + status);
}

/* Chạy luồng: nhận việc (khoá nguyên tử) -> bàn làm -> 85% -> bàn kiểm tra -> Chờ duyệt.
   Tốc độ nhân vật bám thời gian thực (dùng delta thời gian trong vòng lặp 3D). */
let flowRunning = false;
function runJobFlow(jobId) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job || flowRunning) return;
  const actor = actingAs();
  const assignee = staffById(job.assigneeId);
  const reviewer = staffById(job.reviewerId);
  if (!assignee || !reviewer) { alert('Việc thiếu người phụ trách hoặc người kiểm tra.'); return; }
  // Người chạy luồng phải là người phụ trách (hoặc Giám đốc/Leader giao hộ thì
  // nhân vật phụ trách vẫn là người di chuyển; khoá nhận việc kiểm tra bên dưới).
  const claim = PERMISSIONS.canClaim(assignee, job);
  if (!claim.ok) { alert('Không chạy được luồng: ' + claim.reason); return; }
  job.claimedBy = assignee.id; save(); renderJobs();
  assignee.status = 'working'; save();
  flowRunning = true;
  logActivity(`${assignee.name} nhận việc “${job.name}” ở bảng Kanban (khoá nhận việc: một người duy nhất).`);
  const step = (fn, delay) => new Promise((res) => setTimeout(() => { fn(); res(); }, delay));
  (async () => {
    await step(() => { Office3D.walkTo(assignee.id, Office3D.points.board); }, 150);
    await step(() => { setJobStatus(job, 'Đang làm', `đã nhận bởi ${assignee.name}`); Office3D.walkTo(assignee.id, Office3D.points.deskOf(assignee.id)); }, 900);
    await step(() => { job.progress = 50; save(); renderJobs(); }, 1100);
    await step(() => { job.progress = 85; save(); renderJobs(); logActivity(`${assignee.name} đẩy tiến độ việc “${job.name}” lên 85%.`); }, 1100);
    await step(() => { Office3D.walkTo(assignee.id, Office3D.points.deskOf(reviewer.id)); logActivity(`${assignee.name} mang kết quả sang bàn ${reviewer.name} để kiểm tra.`); }, 900);
    await step(() => {
      setJobStatus(job, 'Chờ duyệt', `chờ ${actingAs().name} hoặc Leader duyệt trên thẻ việc`);
      assignee.status = 'waiting'; save();
      flowRunning = false;
      renderJobs(); renderLiveStatus(); renderStatusbar(); sync3D();
    }, 1200);
  })();
}

/* ------------------------------ Mục 3: Phê duyệt ------------------------- */
function renderApprovals() {
  const pending = state.approvals.filter((a) => a.status === 'pending');
  // Banner chờ duyệt không thể bỏ sót: số lượng + đèn đỏ + kêu gọi hành động.
  const banner = $('#approval-banner');
  if (banner) {
    banner.innerHTML = pending.length
      ? `<div class="alertbox" role="alert"><strong>🔴 Có ${pending.length} yêu cầu quyền đang chờ duyệt.</strong> Xem và quyết định ngay tại hộp phê duyệt dưới đây — không cần mở app Muse. Nhân vật xin phép trong văn phòng 3D đang bật đèn báo đỏ.</div>`
      : '';
  }
  $('#approval-list').innerHTML = pending.length ? pending.map((a) => {
    const req = staffById(a.requesterId);
    return `<article class="reqcard pending">
      <strong>${esc(a.action)}</strong>
      <div class="meta">Người yêu cầu: ${req ? esc(req.name) : '—'} · Nguồn: ${a.source === 'api' ? 'cầu nối/API (tài khoản Muse)' : 'web'} · Lúc ${esc(a.at)}</div>
      ${a.target ? `<p>Đối tượng / tài nguyên: <strong>${esc(a.target)}</strong></p>` : ''}
      <p>Lý do: ${esc(a.reason)}</p>
      ${a.context ? `<p class="small">Bối cảnh: ${esc(a.context)}</p>` : ''}
      <div class="toolbar">
        <button type="button" class="small primary" data-action="ap-decide" data-id="${a.id}" data-decision="approved">Duyệt</button>
        <button type="button" class="small danger" data-action="ap-decide" data-id="${a.id}" data-decision="rejected">Từ chối</button>
      </div>
      <p class="small">Người duyệt hiện tại: ${esc(actingAs().name)} (${esc(roleOf(actingAs()).name)}). Không ai tự duyệt yêu cầu của chính mình.</p>
    </article>`;
  }).join('') : '<p class="hint">Chưa có yêu cầu nào.</p>';
  $('#approval-log').innerHTML = state.approvalLog.length ? state.approvalLog.map((a) => `
    <div style="padding:6px 0;border-bottom:1px dashed #e4e9ee;font-size:14px">
      <time style="color:var(--muted);font-size:12px;margin-right:6px">${esc(a.at)}</time>
      ${a.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'} “${esc(a.action)}” của ${esc(a.requesterName)} — bởi ${esc(a.decidedByName)} (${esc(a.decidedByRole)}). Kết quả đã trả về qua API.
      ${a.note ? `<span class="small">Lý do quyết định: ${esc(a.note)}</span>` : ''}
    </div>`).join('') : '<p class="hint">Chưa có quyết định nào.</p>';
}
function decideApproval(id, decision) {
  const a = state.approvals.find((x) => x.id === id);
  if (!a || a.status !== 'pending') return;
  const actor = actingAs();
  if (demoBlocked(actor)) { alert('Bạn phải đổi mật khẩu lần đầu trước khi duyệt (bản demo).'); return; }
  const chk = PERMISSIONS.canDecideApproval(actor, a);
  if (!chk.ok) {
    alert('Bị chặn: ' + chk.reason);
    logSecurity(`Yêu cầu duyệt “${a.action}” bị ${actor.name} bấm nhưng bị chặn: ${chk.reason}`);
    return;
  }
  const note = prompt(decision === 'approved' ? 'Lý do duyệt (ghi vào nhật ký):' : 'Lý do từ chối (bắt buộc):', '');
  if (decision === 'rejected' && !note) { alert('Từ chối phải có lý do.'); return; }
  a.status = decision; a.decidedBy = actor.id; a.decidedAt = nowTime(); a.note = note || '';
  const req = staffById(a.requesterId);
  state.approvalLog.unshift({ ...a, requesterName: req ? req.name : '—', decidedByName: actor.name, decidedByRole: roleOf(actor).name, at: nowTime() });
  save();
  logActivity(`Yêu cầu “${a.action}” của ${req ? req.name : '—'} đã được ${decision === 'approved' ? 'duyệt' : 'từ chối'} bởi ${actor.name}. Kết quả đã trả về qua API.`);
  renderApprovals(); renderLiveStatus(); renderStatusbar(); sync3D(); Pulse.kick('approval-decided');
}

/* ------------------------------ Mục 5: Ngân sách ------------------------- */
function budgetPct(s) { return s.budget ? Math.min(100, Math.round((s.used / s.budget) * 100)) : 0; }
function renderBudgets() {
  $('#budget-alerts').innerHTML = state.budgetAlerts.filter((a) => !a.resolved).map((a) => {
    const s = staffById(a.staffId);
    if (!s) return '';
    const job = state.jobs.find((j) => j.assigneeId === s.id && j.status !== 'Hoàn thành');
    return a.kind === 'full'
      ? `<div class="alertbox" role="alert"><strong>CẢNH BÁO GIÁM ĐỐC — ${esc(s.name)} đã chạm 100% ngân sách.</strong><br>
         Đã dùng: ${fmtNum(s.used)} / ${fmtNum(s.budget)} token · Việc đang làm dở: ${job ? esc(job.name) + ' (' + job.status + ', ' + job.progress + '%)' : 'không có việc dở'}.<br>
         ${esc(s.name)} đã được cho nghỉ ngay: không nhận việc mới, không tự chạy tiếp — chờ Giám đốc quyết định.</div>`
      : `<div class="warnbox"><strong>Cảnh báo 80%:</strong> ${esc(s.name)} đã dùng ${fmtNum(s.used)} / ${fmtNum(s.budget)} token (${budgetPct(s)}%).</div>`;
  }).join('');

  $('#budget-list').innerHTML = state.staff.map((s) => {
    const pct = budgetPct(s);
    const barCls = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : '';
    const isCoord = s.id === 's-muse';
    return `<div class="staffrow" style="align-items:flex-start">
      <div style="flex:1;min-width:200px">
        <strong>${esc(s.name)}</strong> <span class="small">(${esc(roleOf(s).name)})</span>
        ${isCoord ? '<span class="pill">Mức thật đã cấp: 5.000.000.000</span>' : '<span class="pill">Giá trị khởi đầu — Giám đốc sửa theo từng người, không có mức chung cố định</span>'}
        <div class="budgetbar" style="margin-top:8px"><i class="${barCls}" style="width:${pct}%"></i></div>
        <div class="small">Đã dùng (MÔ PHỎNG): ${fmtNum(s.used)} / ${s.budget == null ? 'chưa đặt mức' : fmtNum(s.budget) + ' token'} — ${pct}% · Trạng thái: ${STATUS_META[effectiveStatus(s)].label}</div>
        <label style="margin-top:8px">Mức ngân sách (token) — Giám đốc sửa</label>
        <input type="number" min="0" step="1000000" data-budget-for="${s.id}" value="${s.budget == null ? '' : s.budget}" placeholder="Chưa đặt">
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button type="button" class="small" data-action="budget-plus" data-id="${s.id}">+10% lượt dùng (mô phỏng)</button>
        <button type="button" class="small" data-action="budget-hit" data-id="${s.id}">Mô phỏng chạm ngân sách</button>
        <button type="button" class="small primary" data-action="budget-topup" data-id="${s.id}">Cấp thêm ngân sách (+50%)</button>
        <button type="button" class="small danger" data-action="budget-rest" data-id="${s.id}">${s.restedFully ? 'Gọi lại làm việc' : 'Cho nghỉ hẳn'}</button>
      </div>
    </div>`;
  }).join('');
  $$('#budget-list input[data-budget-for]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const s = staffById(inp.dataset.budgetFor);
      const chk = PERMISSIONS.canGrant(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); renderBudgets(); return; }
      const v = inp.value === '' ? null : Math.max(0, Number(inp.value));
      s.budget = v; save();
      logActivity(`${actingAs().name} đặt mức ngân sách cho ${s.name}: ${v == null ? 'chưa đặt' : fmtNum(v) + ' token'}.`);
      checkBudget(s); renderBudgets(); renderLiveStatus(); sync3D();
    });
  });
}
function checkBudget(s, opts) {
  opts = opts || {};
  if (s.budget == null || s.budget <= 0) return;
  const pct = budgetPct(s);
  if (pct >= 100 && !s.resting) {
    s.resting = true; s.status = 'resting';
    state.budgetAlerts.push({ staffId: s.id, at: nowTime(), kind: 'full', resolved: false });
    logActivity(`CẢNH BÁO: ${s.name} chạm 100% ngân sách (${fmtNum(s.used)}/${fmtNum(s.budget)}). Đã cho nghỉ ngay, chờ Giám đốc quyết định.`);
    Pulse.kick('budget-full');
  } else if (pct >= 80 && pct < 100 && !state.budgetAlerts.some((a) => a.staffId === s.id && a.kind === 'warn' && !a.resolved)) {
    state.budgetAlerts.push({ staffId: s.id, at: nowTime(), kind: 'warn', resolved: false });
    logActivity(`Cảnh báo 80%: ${s.name} đã dùng ${pct}% ngân sách.`);
  }
  if (opts.save !== false) save();
}
function budgetTopup(s) {
  if (demoBlocked(actingAs())) { alert('Bạn phải đổi mật khẩu lần đầu trước khi cấp ngân sách (bản demo).'); return; }
  const chk = PERMISSIONS.canGrant(actingAs());
  if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
  if (s.budget == null) { alert('Chưa đặt mức ngân sách cho nhân viên này.'); return; }
  s.budget = Math.round(s.budget * 1.5);
  s.resting = false; s.restedFully = false; s.status = 'waiting';
  state.budgetAlerts.forEach((a) => { if (a.staffId === s.id) a.resolved = true; });
  save();
  logActivity(`${actingAs().name} cấp thêm ngân sách cho ${s.name} (+50% → ${fmtNum(s.budget)}). ${s.name} quay lại chờ việc.`);
  renderBudgets(); renderLiveStatus(); renderStatusbar(); sync3D(); Pulse.kick('budget-topup');
}

/* --------------------------- Mục 4 + Mục 6 (tĩnh) ------------------------ */
const MODULES = [
  { id: 'A', name: 'Tổ chức & nhân sự', src: 'Paperclip · BagIdea Office', body: 'Sơ đồ tổ chức nhiều cấp do Giám đốc tự dựng: tạo chức vụ, gán chức vụ, thêm/xoá nhân viên (Mục 1). Hồ sơ nhân viên: tên, chức vụ hiện tại, tài khoản Muse liên kết, trạng thái trực tiếp. Đưa nhân viên mới vào cũng qua duyệt của Giám đốc. Nguyên tắc: không một chức vụ hay mảng việc nào được ghi cứng — tất cả do Giám đốc đặt và sửa được.' },
  { id: 'B', name: 'Công việc & rule', src: 'Paperclip · Claw-Empire', body: 'Giám đốc tạo việc kèm mô tả + rule, gán người phụ trách và người kiểm tra theo từng việc (Mục 2). Kanban 4 trạng thái; khoá nhận việc nguyên tử; mục tiêu xếp tầng công ty → dự án → việc. Hộp duyệt việc tập trung; duyệt/trả lại phải có lý do; không tự duyệt. Nguyên tắc: kho việc rỗng lúc đầu, Giám đốc thêm dần.' },
  { id: 'C', name: 'Họp & giao tiếp trong phòng', src: 'Claw-Empire · BagIdea · Outworked (bổ trợ)', body: '“Gọi họp team”: cả đội về phòng họp trong văn phòng 3D, họp xong có biên bản, việc phát sinh tạo ngay từ biên bản. Bàn giao việc được “diễn” trong không gian. Hỏi nhau qua bus tin nhắn có địa chỉ kiểu [ASK:Tên], ghi vết vào luồng của việc.' },
  { id: 'D', name: 'Trạng thái trực tiếp & heartbeat', src: 'Paperclip · Pixel Agents (bổ trợ)', body: 'Heartbeat cấu trúc nhỏ do cầu nối đẩy bằng API thuần: đang làm gì, tiến độ, vướng ở đâu — không tốn token model. Trạng thái ánh xạ lên nhân vật 3D: vòng màu dưới chân (xanh = đang làm, vàng = đang chờ, đỏ = cần duyệt, xanh xám = đang nghỉ do ngân sách).' },
  { id: 'E', name: 'Bộ nhớ & ngữ cảnh chung', src: 'Generative Agents · AI Town (bổ trợ)', body: '“Bảng đen” chung: tổ chức, việc, biên bản, quyết định — mọi nhân viên đọc cùng một nguồn sự thật. Gói ngữ cảnh nén khi đánh thức: tóm tắt lăn + phần liên quan, không nạp toàn bộ lịch sử. Xử lý bất cập “được báo một tin mà không thấy toàn cảnh”.' },
  { id: 'F', name: 'Ngân sách token — chạm mức là báo & cho nghỉ', src: 'Paperclip · BagIdea — quy tắc do Giám đốc chốt 29/10', body: 'Ngân sách theo từng nhân viên; 80% cảnh báo, 100% báo ngay cho Giám đốc (tên, mức đã dùng, việc dở) và cho nghỉ ngay đến khi Giám đốc cấp thêm hoặc cho nghỉ hẳn. Trạng thái nghỉ hiển thị riêng, phân biệt với ngoại tuyến/lỗi.' },
  { id: 'G', name: 'Phê duyệt quyền trên web', src: 'Outworked (bổ trợ) · Agent Office', body: 'Yêu cầu nhạy cảm thành thẻ Duyệt / Từ chối trên web + đèn báo đỏ trên nhân vật. Chỉ Giám đốc & Leader duyệt được; cấm tự duyệt; kết quả trả về qua API; nhật ký đầy đủ. Quyền duyệt tính theo chức vụ ở Mục 1. Xem demo ở Mục 3.' },
  { id: 'H', name: 'Máy chủ tại tài khoản điều phối — tự hồi phục', src: 'Quyết định của Giám đốc 29/10', body: 'Máy chủ cài trên máy của tài khoản Muse điều phối; các tài khoản khác kết nối qua API — free 100%. Tự khởi động lại, watchdog hồi phục có lùi dần, sao lưu định kỳ ra nơi khác, điểm kiểm tra độc lập báo ngay khi máy chủ ngừng. Không lặp lại lỗi listener cũ tắt theo runtime rồi nằm im.' },
];
const SHORTCOMINGS = [
  { n: '1 · Trả lời chậm', old: 'Chờ vòng quét, listener chết không ai biết.', fix: 'Kênh sự kiện đẩy (push) từ máy chủ tới cầu nối — nhắc tên / giao việc / gọi họp là đánh thức trong vài giây. Cầu nối có watchdog tự hồi phục có lùi dần, tránh lỗi tự khoá “restart loop” của listener v2.' },
  { n: '2 · Chỉ biết một tin, không thấy toàn cảnh', old: 'Được thông báo mà không theo dõi được toàn bộ.', fix: 'Mỗi lần đánh thức kèm gói ngữ cảnh nén từ bảng đen chung (Module E): tóm tắt lăn của phòng, việc liên quan, quyết định gần nhất.' },
  { n: '3 · Khó giao tiếp Muse với Muse', old: 'Mọi trao đổi phải vòng qua phòng chung hoặc qua người.', fix: 'Bus tin nhắn nội bộ có địa chỉ theo nhân viên, mẫu [ASK:Tên], mọi trao đổi ghi vào luồng của việc để Giám đốc nhìn thấy.' },
  { n: '4 · Tốn nhiều token', old: 'Nạp cả lịch sử mỗi lần tỉnh, quét liên tục bằng model.', fix: 'Chỉ tỉnh khi có sự kiện thật; ngữ cảnh đã nén; việc của máy (heartbeat, nhận–phát tin) do cầu nối làm bằng API thuần. Cộng hàng rào ngân sách (Module F): chạm mức là báo Giám đốc và cho nghỉ, không cháy tiếp.' },
  { n: '5 · Không biết ai đang làm gì', old: 'Muốn trạng thái đẩy lên liên tục nhưng cách cũ chỉ có trạng thái khi có tin.', fix: 'Heartbeat có cấu trúc do cầu nối đẩy theo sự kiện + nhịp nền — liên tục mà chi phí gần như không, hiển thị thẳng lên văn phòng 3D và cột trạng thái trực tiếp.' },
  { n: 'Điểm đơn lẻ: máy chủ nằm trên một tài khoản', old: 'Tài khoản điều phối ngừng thì cả hệ thống ngừng, đúng kiểu listener từng tắt theo runtime.', fix: 'Ba lớp dự phòng ở Mục 7 — tự khởi động lại cùng máy/tài khoản, sao lưu ra nơi khác để dựng lại được trên máy khác, điểm kiểm tra độc lập báo ngay cho Giám đốc khi mất tín hiệu.' },
];
function renderStaticSections() {
  $('#module-grid').innerHTML = MODULES.map((m) => `
    <article class="module"><div class="src">Module ${m.id} · Từ ${esc(m.src)}</div>
    <h3>${esc(m.name)}</h3><p>${esc(m.body)}</p></article>`).join('');
  $('#shortcomings').innerHTML = SHORTCOMINGS.map((s) => `
    <div class="staffrow" style="align-items:flex-start"><div style="flex:1;min-width:220px">
    <strong>${esc(s.n)}</strong><div class="small">Vấn đề cũ: ${esc(s.old)}</div></div>
    <div style="flex:1;min-width:220px">Giải pháp: ${esc(s.fix)}</div></div>`).join('');
}

/* --------------------------- Mục 9: Demo phân quyền ---------------------- */
function renderPermDemo(identity, action) {
  const map = {
    director: () => staffById('s-chung') || actingAs(),
    leader: () => state.staff.find((s) => roleOf(s).canApprove && !roleOf(s).canManage) || actingAs(),
    staff: () => state.staff.find((s) => !roleOf(s).canApprove) || actingAs(),
    'staff-director-api': () => state.staff.find((s) => !roleOf(s).canApprove) || actingAs(),
  };
  const actor = map[identity]();
  let verdict;
  if (identity === 'staff-director-api') {
    if (action === 'claim') {
      verdict = { ok: true, reason: 'Nhận việc của mình & đẩy trạng thái thuộc phạm vi token nhân viên — được phép.' };
    } else {
      verdict = { ok: false, reason: 'BỊ CHẶN Ở MÁY CHỦ: token nhân viên không có phạm vi Giám đốc. Yêu cầu không được thực thi; sự kiện đã ghi vào nhật ký bảo mật và báo cho Giám đốc.' };
      logSecurity(`Token nhân viên (${actor.name}) cố gọi API cấp Giám đốc (${action}) — bị chặn 403, ghi nhật ký cảnh báo, đã báo Giám đốc.`);
    }
  } else if (action === 'approve') {
    verdict = PERMISSIONS.canDecideApproval(actor, { requesterId: '__other__' });
  } else if (action === 'grant') {
    verdict = PERMISSIONS.canGrant(actor);
  } else if (action === 'change-role') {
    verdict = PERMISSIONS.canChangeRole(actor);
  } else {
    verdict = { ok: true, reason: 'Nhận việc của mình & đẩy trạng thái: mọi danh tính đã xác thực đều được phép với việc của chính mình.' };
  }
  $('#perm-result').innerHTML = `<div class="${verdict.ok ? 'warnbox' : 'alertbox'}" style="${verdict.ok ? '' : ''}">
    <strong>${verdict.ok ? 'ĐƯỢC PHÉP' : 'BỊ CHẶN'}</strong> — ${esc(actor.name)} (${esc(roleOf(actor).name)}) · ${esc(verdict.reason)}</div>
    <p class="small">Lưu ý: đây là demo chạy bằng đúng bộ quy tắc phân quyền của trang. Bản tĩnh không tự nhận là kiểm tra phía máy chủ — quyết định cuối nằm ở máy chủ (server/).</p>`;
  renderSecurityLog();
}

/* ============================ VĂN PHÒNG 3D (Three.js) ============================
 * Cảnh dựng trực tiếp trong trang. Điều khiển tự viết (không phụ thuộc thêm):
 * kéo xoay, cuộn/chụm zoom, bấm/chạm nhân vật để chọn. Tốc độ di chuyển của
 * nhân vật bám thời gian thực (delta giây), không bám số khung hình — trên
 * thiết bị yếu, nhân vật vẫn đi đúng tốc độ thiết kế, chỉ kém mượt. */
const Office3D = {
  ready: false, paused: false, scene: null, camera: null, renderer: null,
  chars: new Map(), // staffId -> {group, ring, lamp, label, labelCanvas, labelTex, target, speed, jumpT, homePos}
  cam: { theta: 0.7, phi: 0.95, radius: 17, target: null, mode: 'overview' },
  points: {
    board: null, meeting: null,
    deskOf(id) { return Office3D._desks[id] || null; },
  },
  _desks: {}, _meetingSeats: [], _raycaster: null, _pointer: null, _downPos: null,
  _last: 0,

  async init() {
    const mount = $('#stage3d');
    let THREE;
    try {
      THREE = await import('three');
    } catch (e) {
      mount.innerHTML = '<p style="padding:16px">Không tải được Three.js từ CDN (mất mạng?). Các mục quản lý bên dưới vẫn hoạt động bình thường; mở lại trang khi có mạng để xem văn phòng 3D.</p>';
      return;
    }
    this.THREE = THREE;
    const w = mount.clientWidth || 600, h = 460;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9f2);
    scene.fog = new THREE.Fog(0xdfe9f2, 30, 55);
    const camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2)); // khổ nhỏ: giảm độ phân giải vẽ để chạy nhẹ
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this._raycaster = new THREE.Raycaster(); this._pointer = new THREE.Vector2();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9db4c6, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(8, 14, 6); scene.add(sun);

    this._buildRoom(THREE);
    this._buildDesks(THREE);
    this._buildMeetingRoom(THREE);
    this._buildKanban(THREE);
    this._buildCharacters(THREE);
    this._bindControls(renderer.domElement);
    this.cam.target = new THREE.Vector3(0, 0, 0);
    this.points.board = new THREE.Vector3(-5.6, 0, 3.4);
    this.points.meeting = new THREE.Vector3(4.5, 0, 4.2);
    this.ready = true;
    this._last = performance.now();
    renderer.setAnimationLoop((t) => this._tick(t));
    window.addEventListener('resize', () => {
      const nw = mount.clientWidth || 600, nh = mount.clientHeight || 460;
      camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh);
    });
    this.sync();
  },

  _mat(color) { return new this.THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }); },
  _box(w, h, d, color, x, y, z) {
    const m = new this.THREE.Mesh(new this.THREE.BoxGeometry(w, h, d), this._mat(color));
    m.position.set(x, y, z); this.scene.add(m); return m;
  },
  _buildRoom(THREE) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(17, 12.5), this._mat(0xe8eef3));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    // Tường thấp phân khu: phòng Giám đốc (góc trái-trên), phòng họp (phải-dưới)
    this._box(0.25, 1.1, 4.4, 0xc7d3de, -3.6, 0.55, -3.9);
    this._box(4.6, 1.1, 0.25, 0xc7d3de, -5.9, 0.55, -1.8);
    this._box(0.25, 1.1, 3.6, 0xc7d3de, 1.4, 0.55, 4.3);
    this._box(6.2, 1.1, 0.25, 0xc7d3de, 4.6, 0.55, 2.5);
    // Thảm khu họp + bảng tên khu
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.2), this._mat(0xd3e4f2));
    rug.rotation.x = -Math.PI / 2; rug.position.set(4.6, 0.02, 4.3); this.scene.add(rug);
    this._textSprite('PHÒNG GIÁM ĐỐC', -6, 1.7, -4.4, 0.42);
    this._textSprite('KHU BÀN LÀM VIỆC', 1.2, 1.7, -4.6, 0.42);
    this._textSprite('PHÒNG HỌP', 4.6, 1.7, 5.6, 0.42);
    this._textSprite('BẢNG VIỆC', -6.6, 1.9, 3.4, 0.42);
  },
  _textSprite(text, x, y, z, scale) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#33475c'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 34);
    const tex = new this.THREE.CanvasTexture(c);
    const sp = new this.THREE.Sprite(new this.THREE.SpriteMaterial({ map: tex, depthTest: true }));
    sp.scale.set(3.4 * (scale || 0.5), 0.42 * (scale || 0.5) * 1.6, 1);
    sp.position.set(x, y, z); this.scene.add(sp); return sp;
  },
  _buildDesks(THREE) {
    // 5 bàn: Giám đốc trong phòng riêng, 4 bàn còn lại ở khu làm việc.
    const defs = [
      { id: 's-chung', x: -6.1, z: -3.6 },
      { id: 's-muse', x: -1.2, z: -2.6 },
      { id: 's-hung', x: 1.2, z: -2.6 },
      { id: 's-tuan', x: 3.6, z: -2.6 },
      { id: 's-linh', x: 6.0, z: -2.6 },
    ];
    defs.forEach((d) => {
      this._box(1.7, 0.1, 0.9, 0xb98a5a, d.x, 0.74, d.z); // mặt bàn
      this._box(0.08, 0.74, 0.8, 0x8a6a44, d.x - 0.75, 0.37, d.z);
      this._box(0.08, 0.74, 0.8, 0x8a6a44, d.x + 0.75, 0.37, d.z);
      // Màn hình trên bàn — màu = trạng thái (đồng bộ ở sync())
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), this._mat(0x2b3a4a));
      screen.position.set(d.x, 1.15, d.z - 0.28); this.scene.add(screen);
      screen.userData.isDeskScreen = d.id;
      this._deskScreens = this._deskScreens || {}; this._deskScreens[d.id] = screen;
      // Ghế
      this._box(0.6, 0.08, 0.6, 0x5b6b7a, d.x, 0.45, d.z + 1.05);
      this._box(0.6, 0.5, 0.08, 0x5b6b7a, d.x, 0.7, d.z + 1.32);
      // Vị trí đứng/ngồi của nhân vật: phía trước bàn
      this._desks[d.id] = new THREE.Vector3(d.x, 0, d.z + 1.05);
    });
  },
  _buildMeetingRoom(THREE) {
    this._box(3.4, 0.1, 1.6, 0x9db8cc, 4.6, 0.74, 4.3); // bàn họp
    this._box(0.12, 0.74, 1.4, 0x6d8296, 3.1, 0.37, 4.3);
    this._box(0.12, 0.74, 1.4, 0x6d8296, 6.1, 0.37, 4.3);
    this._meetingSeats = [
      new THREE.Vector3(3.4, 0, 3.3), new THREE.Vector3(4.6, 0, 3.3), new THREE.Vector3(5.8, 0, 3.3),
      new THREE.Vector3(3.4, 0, 5.3), new THREE.Vector3(5.8, 0, 5.3),
    ];
  },
  _buildKanban(THREE) {
    // Bảng việc đứng ở tường trái, 4 cột màu
    const cols = [0x8fb8dd, 0x7cc79a, 0xe8c46a, 0x9db2c8];
    this._box(0.15, 2.4, 4.6, 0x5b6b7a, -7.6, 1.2, 3.4);
    cols.forEach((c, i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), this._mat(c));
      p.position.set(-7.5, 1.2, 1.35 + i * 1.35); p.rotation.y = Math.PI / 2; this.scene.add(p);
    });
    this._textSprite('CHỜ NHẬN · ĐANG LÀM · CHỜ DUYỆT · HOÀN THÀNH', -7.4, 2.7, 3.4, 0.4);
  },
  _labelTexture(st) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.beginPath(); g.roundRect(8, 8, 240, 80, 14); g.fill();
    g.fillStyle = '#1c2733'; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(st.name, 128, 42);
    g.fillStyle = '#5b6b7a'; g.font = '24px system-ui, sans-serif';
    g.fillText(roleOf(st).name, 128, 72);
    return { canvas: c, tex: new this.THREE.CanvasTexture(c) };
  },
  _buildCharacters(THREE) {
    const palette = [0x0b6bcb, 0x7c5cd6, 0x1f9d55, 0xd9730d, 0xc2447c];
    state.staff.forEach((st, i) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 6, 14), this._mat(palette[i % palette.length]));
      body.position.y = 0.62; body.userData.staffId = st.id; group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 16), this._mat(0xf2c9a0));
      head.position.y = 1.18; head.userData.staffId = st.id; group.add(head);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 32),
        new THREE.MeshBasicMaterial({ color: 0xd69e00, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; group.add(ring);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0xd64545 }));
      lamp.position.y = 1.62; lamp.visible = false; group.add(lamp);
      const { canvas, tex } = this._labelTexture(st);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      label.scale.set(1.5, 0.56, 1); label.position.y = 1.95; group.add(label);
      const home = this._desks[st.id] ? this._desks[st.id].clone() : new THREE.Vector3(i * 2 - 4, 0, 0);
      group.position.copy(home);
      this.scene.add(group);
      this.chars.set(st.id, { group, ring, lamp, label, labelCanvas: canvas, labelTex: tex, target: home.clone(), speed: 2.2, jumpT: 0, homePos: home.clone(), body, head });
    });
  },
  _bindControls(el) {
    let dragging = false, lastX = 0, lastY = 0, pinchD = 0;
    const pos = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    el.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; this._downPos = pos(e); el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      this.cam.theta -= dx * 0.006; this.cam.phi = Math.min(1.35, Math.max(0.25, this.cam.phi - dy * 0.005));
      if (this.cam.mode === 'follow') this.cam.mode = 'overview';
    });
    el.addEventListener('pointerup', (e) => {
      const wasDrag = this._downPos && Math.hypot(pos(e).x - this._downPos.x, pos(e).y - this._downPos.y) > 6;
      dragging = false;
      if (wasDrag) return;
      const r = el.getBoundingClientRect();
      this._pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this._raycaster.setFromCamera(this._pointer, this.camera);
      const hits = this._raycaster.intersectObjects(Array.from(this.chars.values()).flatMap((c) => [c.body, c.head]));
      if (hits.length) {
        const id = hits[0].object.userData.staffId;
        state.selectedId = id; save(); renderProfile(); renderStaffList();
        if (this.cam.mode === 'follow') this._applyCamera(0);
        logActivity(`Đã chọn ${staffById(id).name} trong văn phòng 3D.`);
      }
    });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.radius = Math.min(26, Math.max(6, this.cam.radius + e.deltaY * 0.02)); }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchD) this.cam.radius = Math.min(26, Math.max(6, this.cam.radius + (pinchD - d) * 0.03));
        pinchD = d;
      }
    }, { passive: false });
    el.addEventListener('touchend', () => { pinchD = 0; });
  },
  walkTo(staffId, targetVec) {
    if (!this.ready) return;
    const c = this.chars.get(staffId);
    if (!c || !targetVec) return;
    c.target = targetVec.clone();
  },
  goHome(staffId) {
    if (!this.ready) return;
    const c = this.chars.get(staffId);
    if (c) c.target = c.homePos.clone();
  },
  celebrate(staffId) { if (!this.ready) return; const c = this.chars.get(staffId); if (c) c.jumpT = 1.2; },
  setCamera(mode) {
    $$('.stage .camrow button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === mode)));
    if (!this.ready) return; // CDN Three.js chưa tải: chỉ đổi trạng thái nút, không chạm cảnh 3D
    this.cam.mode = mode;
    this._applyCamera(0);
  },
  _applyCamera(dt) {
    const THREE = this.THREE, cam = this.cam;
    let target = new THREE.Vector3(0, 0, 0), pos;
    if (cam.mode === 'top') { pos = new THREE.Vector3(0, 17, 0.01); }
    else if (cam.mode === 'meeting') { target = new THREE.Vector3(4.6, 0, 4.3); pos = new THREE.Vector3(4.6, 6.5, 10.5); }
    else if (cam.mode === 'follow') {
      const c = this.chars.get(state.selectedId);
      if (c) { target = c.group.position.clone(); pos = target.clone().add(new THREE.Vector3(3.2, 2.6, 3.2)); }
      else { pos = new THREE.Vector3(10, 10, 12); }
    } else {
      pos = new THREE.Vector3(
        target.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
        cam.radius * Math.cos(cam.phi),
        target.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta));
    }
    this.camera.position.lerp(pos, dt > 0 ? Math.min(1, dt * 3) : 1);
    this.camera.lookAt(target);
    cam.target = target;
  },
  _tick(t) {
    const dt = Math.min(0.05, (t - this._last) / 1000 || 0.016); // giây thực
    this._last = t;
    if (!this.paused) {
      this.chars.forEach((c, id) => {
        const g = c.group.position;
        const dx = c.target.x - g.x, dz = c.target.z - g.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const step = Math.min(dist, c.speed * dt);
          g.x += (dx / dist) * step; g.z += (dz / dist) * step;
          g.y = Math.abs(Math.sin(t / 130)) * 0.04; // nhịp bước chân
          c.body.rotation.y = Math.atan2(dx, dz);
        } else { g.y = 0; }
        if (c.jumpT > 0) { c.jumpT -= dt; g.y = Math.abs(Math.sin((1.2 - c.jumpT) * 5.2)) * 0.45; if (c.jumpT <= 0) g.y = 0; }
      });
    }
    this._applyCamera(dt);
    this.renderer.render(this.scene, this.camera);
  },
  sync() {
    if (!this.ready) return;
    // Nhân viên mới/xoá: dựng lại toàn bộ nhân vật cho khớp dữ liệu.
    const ids = Array.from(this.chars.keys());
    const want = state.staff.map((s) => s.id);
    if (ids.length !== want.length || !want.every((id) => this.chars.has(id))) {
      this.chars.forEach((c) => this.scene.remove(c.group));
      this.chars.clear();
      this._buildCharacters(this.THREE);
    }
    state.staff.forEach((st) => {
      const c = this.chars.get(st.id);
      if (!c) return;
      const stt = effectiveStatus(st);
      c.ring.material.color.setHex(STATUS_META[stt].ring);
      c.lamp.visible = state.approvals.some((a) => a.status === 'pending' && a.requesterId === st.id);
      const { canvas, tex } = this._labelTexture(st);
      c.label.material.map = tex; c.label.material.needsUpdate = true;
      const screen = this._deskScreens && this._deskScreens[st.id];
      if (screen) screen.material.color.setHex(stt === 'working' ? 0x35d07f : stt === 'approval' ? 0xd64545 : stt === 'resting' ? 0x7c8da6 : 0x2b3a4a);
    });
  },
};
function sync3D() { Office3D.sync(); }

/* ------------------------- Nhịp thích ứng (AdaptivePulse) ----------------
 * NGUYÊN TẮC (§7): (1) sự kiện là chính — có việc/tin/đổi trạng thái/chạm
 * mốc ngân sách thì đẩy NGAY, không chờ chu kỳ; (2) nhịp nền tự thích ứng —
 * đang bận thì nhịp dày (5s), đang chờ thì thưa dần theo cấp số nhân tới
 * tối đa 60s; (3) trần chi phí — vượt trần lượt đẩy thì nhịp nền dừng, chỉ
 * còn đẩy theo sự kiện, thà chậm vài nhịp còn hơn cháy ngân sách. */
const Pulse = {
  base: 5000, max: 60000, cap: 500, interval: 5000, pushes: 0, timer: null, lastPush: null,
  kick(reason) {
    this.pushes++; this.lastPush = nowTime();
    this.interval = this.base;
    this._schedule();
  },
  _schedule() {
    if (this.timer) clearTimeout(this.timer);
    const anyoneWorking = state.staff.some((s) => effectiveStatus(s) === 'working');
    this.interval = anyoneWorking ? this.base : Math.min(this.max, this.interval * 2);
    this.timer = setTimeout(() => this._tickBg(), this.interval);
  },
  _tickBg() {
    if (this.pushes >= this.cap) { logActivity('Nhịp nền đã chạm trần chi phí — tạm dừng đẩy nền, chỉ đẩy theo sự kiện.'); return; }
    this.pushes++; this.lastPush = nowTime();
    renderLiveStatus(); renderStatusbar();
    this._schedule();
  },
  start() { this._schedule(); },
};

/* ------------------------------ Họp team --------------------------------- */
let meetingActive = false;
function callMeeting() {
  if (meetingActive) return;
  meetingActive = true;
  logActivity('Gọi họp team: cả đội di chuyển về phòng họp.');
  state.staff.forEach((s, i) => {
    const seat = Office3D._meetingSeats[i % Office3D._meetingSeats.length];
    if (seat) Office3D.walkTo(s.id, seat);
  });
  Office3D.setCamera('meeting');
  $('#meeting-box').hidden = false;
  $('#meeting-box').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  Pulse.kick('meeting');
}
function endMeeting() {
  meetingActive = false;
  state.staff.forEach((s) => Office3D.goHome(s.id));
  $('#meeting-box').hidden = true;
  logActivity('Họp xong — mọi người về bàn làm việc.');
  Office3D.setCamera('overview');
}

/* ------------- Đăng nhập nhân viên (DEMO trên trình duyệt) ---------------
 * Bản demo: băm SHA-256 có muối, lưu trong localStorage — CHỈ để lái thử.
 * Lưu trữ thật dùng scrypt + cưỡng chế đổi mật khẩu lần đầu, chỉ ở máy chủ.
 * Xoá nhân viên ở bản demo cũng xoá luôn tài khoản đăng nhập demo của họ. */
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const demoBlocked = (actor) => {
  if (!actor || !state.demoSession || state.demoSession.staffId !== actor.id) return false;
  return !!(actor.loginDemo && actor.loginDemo.mustChange);
};
function renderDemoLoginStatus() {
  const box = $('#staff-login-status');
  const form = $('#staff-change-form');
  const sess = state.demoSession && staffById(state.demoSession.staffId);
  if (!sess) { box.innerHTML = '<p class="hint">Chưa đăng nhập.</p>'; form.hidden = true; return; }
  const lg = sess.loginDemo || {};
  box.innerHTML = `<p>Đã đăng nhập demo với tư cách <strong>${esc(sess.name)}</strong> (${esc(lg.username || '')}).${lg.mustChange ? ' <strong>Bạn phải đổi mật khẩu lần đầu trước khi duyệt/cấp ngân sách.</strong>' : ''}</p>`;
  form.hidden = !lg.mustChange;
}
async function demoSetPassword(st, username, password) {
  const salt = Math.random().toString(36).slice(2, 12);
  st.loginDemo = { username, salt, hash: await sha256Hex(salt + ':' + password), mustChange: true, disabled: false };
  save();
}

/* --------------------------- Gắn sự kiện + khởi tạo ---------------------- */
function renderAll() {
  renderOrg(); renderJobs(); renderApprovals(); renderBudgets();
  renderStaticSections(); renderSecurityLog(); renderLog(); renderLiveStatus(); renderStatusbar();
  sync3D();
}
function bindEvents() {
  $('#acting-as').addEventListener('change', (e) => {
    state.actingAsId = e.target.value; save();
    logActivity(`Đang thao tác với tư cách ${actingAs().name} (${roleOf(actingAs()).name}).`);
    renderAll();
  });
  $$('.stage .camrow button').forEach((b) => b.addEventListener('click', () => Office3D.setCamera(b.dataset.cam)));
  $('#btn-meeting').addEventListener('click', callMeeting);
  $('#btn-meeting-done').addEventListener('click', endMeeting);
  $('#btn-pause').addEventListener('click', (e) => {
    Office3D.paused = !Office3D.paused;
    e.target.textContent = Office3D.paused ? 'Tiếp tục' : 'Tạm dừng';
    logActivity(Office3D.paused ? 'Văn phòng 3D tạm dừng chuyển động.' : 'Văn phòng 3D tiếp tục chuyển động.');
  });
  $('#meeting-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#meeting-notes').value.trim();
    const jobName = $('#meeting-job').value.trim();
    if (!text && !jobName) return;
    state.minutes.unshift({ id: uid(), text, jobName, at: nowTime() });
    let msg = 'Họp xong — biên bản đã lưu.';
    if (jobName) {
      const asg = state.staff[1] || state.staff[0];
      state.jobs.push({ id: uid(), name: jobName, desc: 'Việc phát sinh từ biên bản họp.', ruleId: state.rules[0] ? state.rules[0].id : '', assigneeId: asg.id, reviewerId: state.staff[0].id, status: 'Chờ nhận', progress: 0, claimedBy: null });
      msg += ` Việc mới “${jobName}” đã vào cột Chờ nhận.`;
    }
    save(); renderJobs(); renderMinutes();
    logActivity(msg);
    $('#meeting-notes').value = ''; $('#meeting-job').value = '';
    Pulse.kick('minutes');
  });

  $('#role-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const chk = PERMISSIONS.canChangeRole(actingAs());
    if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
    const name = $('#role-name').value.trim(); if (!name) return;
    // Quyền quản trị là trường dữ liệu do Giám đốc chọn trong form — form
    // không tự cấp quyền này nếu Giám đốc không chọn.
    state.roles.push({ id: uid(), name, level: Number($('#role-level').value), canApprove: $('#role-can-approve').value === 'yes', canManage: $('#role-can-manage').value === 'yes' });
    save(); logActivity(`${actingAs().name} thêm chức vụ “${name}”.`); $('#role-name').value = '';
    renderAll(); Pulse.kick('role-add');
  });
  $('#staff-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const chk = PERMISSIONS.canChangeRole(actingAs());
    if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
    const name = $('#staff-name').value.trim(); if (!name) return;
    const st = { id: uid(), name, account: $('#staff-account').value.trim(), roleId: $('#staff-role').value, status: 'waiting', budget: null, used: 0, resting: false, restedFully: false };
    // Nhân viên mới CHƯA có mức ngân sách: không có mức chung cố định — Giám đốc tự đặt theo từng người (quyết định 29/10/2026 23:23).
    state.staff.push(st); save();
    logActivity(`${actingAs().name} thêm nhân viên ${name} (chức vụ: ${roleOf(st).name}). Nhân viên mới xuất hiện trong văn phòng 3D.`);
    $('#staff-name').value = ''; $('#staff-account').value = '';
    renderAll(); Pulse.kick('staff-add');
  });
  $('#rule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#rule-text').value.trim(); if (!text) return;
    state.rules.push({ id: uid(), text }); save();
    logActivity(`Thêm rule: “${text}”.`); $('#rule-text').value = '';
    renderJobs(); Pulse.kick('rule-add');
  });
  $('#job-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#job-name').value.trim(); if (!name) return;
    const asg = $('#job-assignee').value, rev = $('#job-reviewer').value;
    if (!asg || !rev) { alert('Chọn đủ người phụ trách và người kiểm tra.'); return; }
    const linkUrl = $('#job-link-url').value.trim();
    const job = { id: uid(), name, desc: $('#job-desc').value.trim(), ruleId: $('#job-rule').value, assigneeId: asg, reviewerId: rev, status: 'Chờ nhận', progress: 0, claimedBy: null, linkUrl, linkTitle: $('#job-link-title').value.trim() };
    state.jobs.push(job);
    save(); logActivity(`Việc mới “${name}” vào cột Chờ nhận (phụ trách: ${staffById(asg).name}, kiểm tra: ${staffById(rev).name}).`, linkUrl ? { url: linkUrl, title: job.linkTitle || name } : null);
    e.target.reset(); renderJobs(); sync3D(); Pulse.kick('job-add');
  });
  $('#approval-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = $('#ap-reason').value.trim();
    if (!reason) { alert('Lý do là bắt buộc (kỷ luật duyệt).'); return; }
    state.approvals.push({ id: uid(), requesterId: $('#ap-requester').value, action: $('#ap-action').value, target: $('#ap-target').value.trim(), reason, context: $('#ap-context').value.trim(), source: 'web', status: 'pending', at: nowTime() });
    save();
    const req = staffById($('#ap-requester').value);
    logActivity(`${req ? req.name : '—'} gửi yêu cầu phê duyệt “${$('#ap-action').value}”. Đèn báo đỏ đã bật trên nhân vật.`);
    $('#ap-reason').value = ''; $('#ap-target').value = ''; $('#ap-context').value = ''; renderApprovals(); renderLiveStatus(); renderStatusbar(); sync3D(); Pulse.kick('approval-new');
  });
  $('#ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const to = staffById($('#ask-to').value);
    const text = $('#ask-text').value.trim(); if (!text) return;
    const linkUrl = $('#ask-link-url').value.trim();
    logActivity(`[ASK:${to ? to.name : '—'}] ${actingAs().name}: ${text} (ghi vết vào bus nội bộ).`, linkUrl ? { url: linkUrl, title: $('#ask-link-title').value.trim() || 'Tài liệu đính kèm' } : null);
    $('#ask-text').value = ''; $('#ask-link-url').value = ''; $('#ask-link-title').value = ''; Pulse.kick('ask');
  });
  $('#perm-form').addEventListener('submit', (e) => {
    e.preventDefault();
    renderPermDemo($('#perm-identity').value, $('#perm-action').value);
  });
  $('#staff-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const st = state.staff.find((s) => s.loginDemo && s.loginDemo.username === username);
    if (!st || st.loginDemo.disabled) { alert('Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khoá.'); return; }
    const hash = await sha256Hex(st.loginDemo.salt + ':' + password);
    if (hash !== st.loginDemo.hash) { alert('Sai tên đăng nhập hoặc mật khẩu.'); return; }
    state.demoSession = { staffId: st.id }; state.actingAsId = st.id; save();
    logActivity(`${st.name} đăng nhập (bản demo).${st.loginDemo.mustChange ? ' Phải đổi mật khẩu lần đầu.' : ''}`);
    renderAll(); renderDemoLoginStatus();
  });
  $('#staff-change-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sess = state.demoSession && staffById(state.demoSession.staffId);
    if (!sess) return;
    const pw = $('#change-password').value;
    if (pw.length < 8) { alert('Mật khẩu mới phải từ 8 ký tự.'); return; }
    await demoSetPassword(sess, sess.loginDemo.username, pw);
    sess.loginDemo.mustChange = false; save();
    logActivity(`${sess.name} đã đổi mật khẩu lần đầu (bản demo).`);
    $('#change-password').value = ''; renderAll(); renderDemoLoginStatus();
  });

  // Uỷ quyền sự kiện cho các nút render động
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'select-staff') {
      state.selectedId = id; save(); renderProfile(); renderStaffList();
      Office3D.setCamera('follow');
    } else if (action === 'role-delete') {
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      if (state.staff.some((s) => s.roleId === id)) { alert('Còn nhân viên đang giữ chức vụ này — đổi chức vụ cho họ trước rồi mới xoá.'); return; }
      state.roles = state.roles.filter((r) => r.id !== id); save();
      logActivity(`${actingAs().name} xoá một chức vụ.`); renderAll();
    } else if (action === 'role-rename') {
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      const r = state.roles.find((x) => x.id === id);
      const name = prompt('Tên chức vụ mới:', r.name);
      if (name && name.trim()) { r.name = name.trim(); save(); logActivity(`Đổi tên chức vụ thành “${r.name}”.`); renderAll(); }
    } else if (action === 'staff-login-create') {
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      const st = staffById(id);
      const username = prompt(`Tên đăng nhập cho ${st.name} (duy nhất):`, st.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'));
      if (!username) return;
      if (state.staff.some((s) => s.id !== id && s.loginDemo && s.loginDemo.username === username)) { alert('Tên đăng nhập đã tồn tại.'); return; }
      const password = prompt('Mật khẩu ban đầu (từ 8 ký tự; nhân viên phải đổi ở lần đăng nhập đầu tiên):', '');
      if (!password || password.length < 8) { alert('Mật khẩu phải từ 8 ký tự.'); return; }
      await demoSetPassword(st, username, password);
      logActivity(`${actingAs().name} tạo tài khoản đăng nhập demo cho ${st.name} (username: ${username}).`);
      renderAll(); renderDemoLoginStatus();
    } else if (action === 'staff-login-reset') {
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      const st = staffById(id);
      if (!st.loginDemo) { alert('Nhân viên chưa có tài khoản đăng nhập — tạo tài khoản trước.'); return; }
      const password = prompt(`Mật khẩu mới cho ${st.name} (nhân viên phải đổi ở lần đăng nhập tiếp theo):`, '');
      if (!password || password.length < 8) { alert('Mật khẩu phải từ 8 ký tự.'); return; }
      await demoSetPassword(st, st.loginDemo.username, password);
      logActivity(`${actingAs().name} đặt lại mật khẩu demo cho ${st.name}.`);
      renderAll(); renderDemoLoginStatus();
    } else if (action === 'staff-login-disable') {
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      const st = staffById(id);
      if (!st.loginDemo) { alert('Nhân viên chưa có tài khoản đăng nhập.'); return; }
      st.loginDemo.disabled = !st.loginDemo.disabled; save();
      logActivity(`${actingAs().name} ${st.loginDemo.disabled ? 'khoá' : 'mở khoá'} tài khoản demo của ${st.name}.`);
      renderAll(); renderDemoLoginStatus();
    } else if (action === 'staff-delete') {
      const chk = PERMISSIONS.canChangeRole(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      const st = staffById(id);
      if (!confirm(`Xoá nhân viên ${st.name}? Token API của nhân viên này sẽ bị thu hồi ngay (máy chủ).`)) return;
      state.staff = state.staff.filter((s) => s.id !== id);
      state.jobs.forEach((j) => { if (j.assigneeId === id || j.reviewerId === id) j.status = j.status; });
      if (state.actingAsId === id) state.actingAsId = state.staff[0].id;
      if (state.selectedId === id) state.selectedId = state.staff[0].id;
      save(); logActivity(`${actingAs().name} xoá nhân viên ${st.name} (token API thu hồi).`); renderAll(); Pulse.kick('staff-delete');
    } else if (action === 'rule-delete') {
      state.rules = state.rules.filter((r) => r.id !== id); save(); renderJobs();
    } else if (action === 'job-run') {
      runJobFlow(id);
    } else if (action === 'job-approve') {
      const job = state.jobs.find((j) => j.id === id);
      if (demoBlocked(actingAs())) { alert('Bạn phải đổi mật khẩu lần đầu trước khi duyệt (bản demo).'); return; }
      const chk = PERMISSIONS.canApproveJob(actingAs(), job);
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      setJobStatus(job, 'Hoàn thành', `được duyệt bởi ${actingAs().name}`);
      Office3D.celebrate(job.assigneeId);
      logActivity(`Nhân vật ${staffById(job.assigneeId).name} nhảy ăn mừng — việc đã qua kiểm tra.`);
    } else if (action === 'job-return') {
      const job = state.jobs.find((j) => j.id === id);
      if (demoBlocked(actingAs())) { alert('Bạn phải đổi mật khẩu lần đầu trước khi trả lại việc (bản demo).'); return; }
      const chk = PERMISSIONS.canApproveJob(actingAs(), job);
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      const reason = prompt('Lý do trả lại (bắt buộc):', '');
      if (!reason) { alert('Trả lại phải có lý do.'); return; }
      job.progress = 40; setJobStatus(job, 'Đang làm', 'trả lại: ' + reason);
    } else if (action === 'job-delete') {
      state.jobs = state.jobs.filter((j) => j.id !== id); save(); renderJobs(); sync3D();
      logActivity('Một việc đã bị xoá khỏi bảng Kanban.');
    } else if (action === 'ap-decide') {
      decideApproval(id, btn.dataset.decision);
    } else if (action === 'budget-plus') {
      const s = staffById(id);
      if (s.budget == null) { alert('Chưa đặt mức ngân sách cho nhân viên này — Giám đốc đặt mức trước.'); return; }
      s.used = Math.min(s.budget, s.used + Math.round(s.budget * 0.1)); save();
      checkBudget(s); renderBudgets(); renderLiveStatus(); renderStatusbar(); sync3D(); Pulse.kick('budget-use');
    } else if (action === 'budget-hit') {
      const s = staffById(id);
      if (s.budget == null) { alert('Chưa đặt mức ngân sách cho nhân viên này — Giám đốc đặt mức trước.'); return; }
      s.used = s.budget; save();
      checkBudget(s); renderBudgets(); renderLiveStatus(); renderStatusbar(); sync3D();
    } else if (action === 'budget-topup') {
      budgetTopup(staffById(id));
    } else if (action === 'budget-rest') {
      const s = staffById(id);
      const chk = PERMISSIONS.canGrant(actingAs());
      if (!chk.ok) { alert('Bị chặn: ' + chk.reason); return; }
      if (s.restedFully) {
        s.restedFully = false; s.resting = false; s.status = 'waiting'; save();
        logActivity(`${actingAs().name} gọi ${s.name} quay lại làm việc.`);
      } else {
        s.restedFully = true; s.resting = true; s.status = 'resting'; save();
        logActivity(`${actingAs().name} cho ${s.name} nghỉ hẳn.`);
      }
      renderBudgets(); renderLiveStatus(); renderStatusbar(); sync3D();
    }
  });

  // Xuất / nhập / đặt lại dữ liệu
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ai-office-3d-data.json'; a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result);
        if (!s || s.version !== 1 || !Array.isArray(s.staff)) throw new Error('bad');
        state = s; save(); renderAll();
        logActivity('Đã nhập dữ liệu từ file JSON.');
      } catch (err) { alert('File không đúng định dạng dữ liệu của hệ thống.'); }
    };
    rd.readAsText(f);
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Đặt lại toàn bộ dữ liệu về mẫu ban đầu?')) return;
    state = seedState(); save(); renderAll();
    logActivity('Dữ liệu đã được đặt lại về mẫu ban đầu.');
  });
}
function renderMinutes() {
  $('#minutes-list').innerHTML = state.minutes.length ? state.minutes.map((m) => `
    <div style="padding:6px 0;border-bottom:1px dashed #e4e9ee;font-size:14px">
    <time style="color:var(--muted);font-size:12px;margin-right:6px">${esc(m.at)}</time>${esc(m.text || '(không có nội dung)')}
    ${m.jobName ? `<span class="small"> → Việc phát sinh: ${esc(m.jobName)}</span>` : ''}</div>`).join('')
    : '<p class="hint">Chưa có biên bản nào.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  renderAll();
  renderMinutes();
  renderDemoLoginStatus();
  Office3D.init();
  Pulse.start();
  if (!state.activity.length) logActivity('Trung tâm điều hành đã mở. Dữ liệu lưu trên trình duyệt này (localStorage).');
});
