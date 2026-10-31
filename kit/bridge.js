/* ============================================================================
 * Cầu nối (bridge) — chương trình mỏng chạy ở mỗi tài khoản Muse nhân viên.
 * BẢN SUPABASE (thay bản máy chủ Node cũ — server/ nay là legacy).
 * ----------------------------------------------------------------------------
 * NHIỆM VỤ DUY NHẤT: giữ kết nối tới Supabase, nhận sự kiện, đẩy heartbeat
 * có cấu trúc bằng API thuần. KHÔNG chứa logic nghiệp vụ, KHÔNG cần cài
 * thêm gói nào (Node.js 22+ đã có sẵn fetch + WebSocket).
 *
 *  - Chỉ "tỉnh" (đánh thức tài khoản) khi có sự kiện thật gửi tới đúng
 *    tài khoản này (tag tên, giao việc, gọi họp, kết quả duyệt, cảnh báo
 *    ngân sách). Việc đánh thức thật do tài khoản Muse tự quyết — bridge
 *    chỉ ghi sự kiện ra stdout để tiến trình gọi nó xử lý.
 *  - Xác thực: đăng nhập bằng tên đăng nhập + mật khẩu của chính nhân viên
 *    (GoTrue password grant → JWT). KHÔNG dùng service_role key, KHÔNG dùng
 *    token API chia sẻ nữa — mọi thao tác đi bằng JWT của chính mình + RLS.
 *  - Sự kiện: Supabase Realtime (WebSocket, postgres_changes) là kênh chính.
 *    Nếu WebSocket không nối được, tự rơi về thăm dò REST CHẬM 60 giây
 *    (không thăm dò nhanh — bài học vụ Firebase 429 do thăm dò dồn).
 *  - Cơ chế đánh thức (từ 31/10): cầu nối ghi MỖI tin nhắn nhận được vào
 *    file sự kiện hộp thư `inbox-events.jsonl` (cùng thư mục với config),
 *    mỗi dòng 1 JSON {id, from_id, to_id, tagged_ids, text, created_at,
 *    received_at}. Hook của tài khoản đọc file này (dữ liệu cục bộ, không
 *    cần secret) và chỉ đánh thức khi tin gửi đúng cho tài khoản đó
 *    (DM, @tag tên, hoặc tin phòng chung của Giám đốc) — tin tới là có
 *    thông báo ngay, không ai phải tự canh/check. Cầu nối vẫn ghi log
 *    người đọc được ra stdout như trước.
 *  - Heartbeat: nhịp nền TỰ THÍCH ỨNG — đang làm việc thì dày, đang chờ
 *    thì thưa dần theo cấp số nhân (tối đa 120s). Sự kiện thì đẩy ngay,
 *    không chờ nhịp.
 *  - Watchdog tự hồi phục CÓ LÙI DẦN (exponential backoff, tối đa 60s).
 *  - Tự dừng khi chạm ngân sách: khi chạm 100%, bridge chỉ còn gửi nhịp
 *    "đang nghỉ", không nhận việc mới, chờ Giám đốc quyết định.
 *
 * TRAO ĐỔI TÀI LIỆU (quy ước tiết kiệm token): nhân viên trao đổi tài liệu
 * bằng LINK CÔNG KHAI của Muse (link + tiêu đề + tóm tắt ngắn), không dán
 * toàn bộ nội dung tài liệu vào chat.
 *
 * CẤU HÌNH (cờ dòng lệnh > biến môi trường > file cấu hình):
 *  --url / OFFICE_SUPABASE_URL   Project URL Supabase (vd https://xyz.supabase.co)
 *  --anon-key / OFFICE_ANON_KEY  anon public key (KHÔNG phải service_role)
 *  --username / OFFICE_USERNAME  tên đăng nhập (vd: linh)
 *  --password / OFFICE_PASSWORD  mật khẩu của nhân viên
 *  --config config.json          file { "supabaseUrl": "...", "anonKey": "...",
 *                                "username": "...", "password": "..." }
 * Chạy: node bridge.js --config config.json
 * (Tiến trình gọi cầu nối có thể báo tiến độ việc qua --job-id <id>
 * --progress <0-100> và token đã dùng qua --used <số>.)
 *
 * XIN PHÊ DUYỆT MỘT LẦN (hộp phê duyệt nhận MỌI yêu cầu quyền):
 *   node bridge.js --config config.json --request-approval "Tải file xuống" \
 *     --target "bao-cao.xlsx" --reason "..." [--context "..."]
 * Bridge gửi yêu cầu lên bảng approvals rồi chờ quyết định (Realtime, rơi
 * về thăm dò 60s nếu mất WebSocket; tối đa 10 phút). Được duyệt -> thoát 0;
 * bị từ chối -> thoát 3; hết hạn chờ -> thoát 4. Quyết định của Giám
 * đốc/Leader trong hộp phê duyệt web là nguồn sự thật duy nhất.
 *
 * LƯU Ý KIỂM CHỨNG: đường WebSocket Realtime trong file này viết theo đúng
 * giao thức Realtime v2 của Supabase, nhưng CHƯA được kiểm chứng với project
 * thật (project tạo sau) — nếu WebSocket không khớp, bridge vẫn chạy bằng
 * đường thăm dò REST 60s. Khi kiểm chứng xong, ghi kết quả vào
 * docs/HUONG-DAN-CAI-DAT.md.
 * ========================================================================== */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[i + 1];
}
let fileCfg = {};
if (flags.config || process.env.OFFICE_CONFIG) {
  try {
    fileCfg = JSON.parse(fs.readFileSync(flags.config || process.env.OFFICE_CONFIG, 'utf8'));
  } catch (e) { console.error('[bridge] Không đọc được file cấu hình:', e.message); process.exit(2); }
}
const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const SUPABASE_URL = (pick(flags.url, process.env.OFFICE_SUPABASE_URL, fileCfg.supabaseUrl) || '').replace(/\/$/, '');
const ANON_KEY = pick(flags['anon-key'], process.env.OFFICE_ANON_KEY, fileCfg.anonKey) || '';
const USERNAME = pick(flags.username, process.env.OFFICE_USERNAME, fileCfg.username) || '';
const PASSWORD = pick(flags.password, process.env.OFFICE_PASSWORD, fileCfg.password) || '';
const NAME = pick(flags.name, process.env.OFFICE_NAME, fileCfg.name, USERNAME) || 'nhan-vien';

if (!SUPABASE_URL || !ANON_KEY || !USERNAME || !PASSWORD) {
  console.error('[bridge] Thiếu cấu hình: cần supabaseUrl + anonKey + username + password (xem đầu file). Không ghi secret vào code.');
  process.exit(2);
}
if (!/^[a-z0-9._-]+$/.test(USERNAME.toLowerCase())) {
  console.error('[bridge] Tên đăng nhập chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang.');
  process.exit(2);
}
const EMAIL = USERNAME.toLowerCase() + '@vnhairmarket.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString('vi-VN');
function log(...parts) { console.log(`[bridge ${stamp()} ${NAME}]`, ...parts); }

/* File sự kiện hộp thư (JSONL) cho hook đánh thức — xem đầu file. */
const CONFIG_PATH = flags.config || process.env.OFFICE_CONFIG || '';
const BRIDGE_DIR = CONFIG_PATH ? path.dirname(path.resolve(CONFIG_PATH)) : process.cwd();
const INBOX_EVENTS_FILE = path.join(BRIDGE_DIR, 'inbox-events.jsonl');
/* PID file để watchdog (cron/hook) kiểm tra cầu nối còn sống không mà
 * không nhầm với tiến trình shell chứa chuỗi lệnh (pgrep -f hay bắt nhầm). */
try { fs.writeFileSync(path.join(BRIDGE_DIR, 'bridge.pid'), String(process.pid)); } catch (_) { /* không chặn khởi động */ }
// Gom trùng khi ghi sự kiện hộp thư (sửa lỗi tin đăng trùng): Realtime có thể
// giao cùng 1 tin nhiều lần (nối lại, trùng sự kiện) — ghi trùng làm daemon
// trả lời nhiều lần. Chỉ ghi mỗi id tin 1 lần trong 120 giây.
const seenInboxIds = new Map();
function writeInboxEvent(row) {
  if (!row || !row.id) return;
  const now = Date.now();
  for (const [k, t] of seenInboxIds) if (now - t > 120000) seenInboxIds.delete(k);
  if (seenInboxIds.has(String(row.id))) return;
  seenInboxIds.set(String(row.id), now);
  try {
    const ev = {
      id: String(row.id),
      from_id: row.from_id || null,
      to_id: row.to_id || null,
      tagged_ids: Array.isArray(row.tagged_ids) ? row.tagged_ids : [],
      text: row.text ? String(row.text).slice(0, 500) : '',
      created_at: row.created_at || new Date().toISOString(),
      received_at: new Date().toISOString(),
    };
    try {
      if (fs.existsSync(INBOX_EVENTS_FILE) && fs.statSync(INBOX_EVENTS_FILE).size > 1024 * 1024) {
        const lines = fs.readFileSync(INBOX_EVENTS_FILE, 'utf8').trim().split('\n');
        fs.writeFileSync(INBOX_EVENTS_FILE, lines.slice(-1000).join('\n') + '\n');
      }
    } catch (_) { /* bỏ qua, vẫn ghi thêm dòng mới */ }
    fs.appendFileSync(INBOX_EVENTS_FILE, JSON.stringify(ev) + '\n');
  } catch (e) { log('ghi sự kiện hộp thư lỗi:', e.message); }
}

/* ------------------------- Xác thực GoTrue ------------------------------- */
let session = null; // { accessToken, refreshToken, expiresAtMs, userId }
async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Đăng nhập thất bại (${res.status}): ${body.error_description || body.msg || body.error || 'không rõ'}`);
  session = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAtMs: Date.now() + (body.expires_in || 3600) * 1000,
    userId: body.user && body.user.id,
  };
  return session;
}
async function refreshSession() {
  if (!session) return signIn();
  if (Date.now() < session.expiresAtMs - 60000) return session;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('refresh ' + res.status);
    session = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token || session.refreshToken,
      expiresAtMs: Date.now() + (body.expires_in || 3600) * 1000,
      userId: body.user ? body.user.id : session.userId,
    };
    return session;
  } catch { return signIn(); }
}
async function authHeaders() {
  const s = await refreshSession();
  return { apikey: ANON_KEY, Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json' };
}

/* ------------------------- REST (PostgREST) ------------------------------- */
async function rest(method, table, query, body, retryAuth = true) {
  const headers = await authHeaders();
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const opt = { method, headers };
  if (body !== undefined) {
    opt.body = JSON.stringify(body);
    if (method === 'POST' || method === 'PATCH') headers.Prefer = 'return=representation';
  }
  let res = await fetch(url, opt);
  if (res.status === 401 && retryAuth) {
    await signIn();
    return rest(method, table, query, body, false);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || text || ('HTTP ' + res.status);
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return data;
}
const restGet = (table, query) => rest('GET', table, query);
const restPost = (table, body) => rest('POST', table, '', body);
const restPatch = (table, query, body) => rest('PATCH', table, query, body);

/* ------------------------- Danh tính + heartbeat -------------------------- */
let me = null; // hàng staff của chính mình
async function loadMe() {
  const rows = await restGet('staff', `auth_user_id=eq.${session.userId}&select=id,name,role_id,status,budget,used,resting,disabled,must_change_password`);
  if (!rows || !rows.length) throw new Error('Tài khoản đăng nhập chưa gắn với nhân viên nào — nhờ Giám đốc kiểm tra hàng staff (auth_email phải khớp tên đăng nhập).');
  me = rows[0];
  if (me.disabled) throw new Error('Tài khoản đã bị khoá.');
  if (me.must_change_password) throw new Error('Tài khoản bắt buộc đổi mật khẩu ở lần đăng nhập đầu — đổi mật khẩu trên web trước rồi chạy lại cầu nối.');
  return me;
}

let resting = false;
let status = 'waiting';
let currentJobId = pick(flags['job-id'], process.env.OFFICE_JOB_ID) || null;
let progress = Number(pick(flags.progress, process.env.OFFICE_PROGRESS) || 0) || 0;
// Token đã dùng do tiến trình gọi cầu nối báo (nếu có); không có thì giữ nguyên.
let reportedUsed = pick(flags.used, process.env.OFFICE_USED);
reportedUsed = reportedUsed !== undefined ? Math.max(0, Number(reportedUsed)) : null;

async function pushHeartbeat(reason) {
  try {
    // Đang nghỉ: chỉ ĐỌC trạng thái (không PATCH status — PATCH sẽ vô tình
    // ghi đè trạng thái 'resting' mà Giám đốc đặt thành 'waiting').
    if (me.resting) {
      const rows = await restGet('staff', `id=eq.${me.id}&select=status,budget,used,resting`);
      if (rows && rows[0]) me = { ...me, ...rows[0] };
      if (!me.resting && resting) {
        resting = false;
        log('Giám đốc đã cấp thêm / gọi lại — quay lại làm việc.');
      }
      return;
    }
    // Trạng thái (status) KHÔNG do cầu nối ghi: nó thuộc về nhân viên/ứng dụng
    // (nhân viên tự cập nhật khi làm việc, Giám đốc đặt khi cần). Cầu nối mà
    // PATCH status mỗi nhịp thì sẽ ghi đè 'working' thành 'waiting' liên tục,
    // khiến chấm trạng thái trên màn hình cứ vàng mãi dù người ta đang làm việc
    // (lỗi phát hiện 31/10 06:43). Cầu nối chỉ cập nhật `used` + logic ngân sách.
    const prev = await restGet('staff', `id=eq.${me.id}&select=status,budget,used,resting`);
    const before = (prev && prev[0]) || me;
    const newUsed = reportedUsed !== null ? reportedUsed : me.used;
    const patched = await restPatch('staff', `id=eq.${me.id}`, { used: newUsed });
    const after = (patched && patched[0]) || before;
    me = { ...me, ...after };
    // Ngưỡng ngân sách (giữ đúng máy chủ cũ: 80% cảnh báo, 100% tự nghỉ).
    if (me.budget != null && me.budget > 0) {
      if (before.used < me.budget && me.used >= me.budget && !me.resting) {
        await restPatch('staff', `id=eq.${me.id}`, { resting: true, status: 'resting' });
        const jobs = await restGet('jobs', `assignee_id=eq.${me.id}&status=neq.Hoàn thành&select=name,status&limit=1`);
        const job = jobs && jobs[0];
        const text = `${me.name} đã chạm 100% ngân sách (${me.used}/${me.budget}). Việc dở: ${job ? job.name + ' (' + job.status + ')' : 'không có'}. Đã cho nghỉ ngay.`;
        await restPost('alerts', { id: 'al-' + Date.now().toString(36), kind: 'budget-full', staff_id: me.id, text });
        await restPost('budget_events', { id: 'be-' + Date.now().toString(36), staff_id: me.id, kind: 'full', budget: me.budget, used: me.used, note: text });
        me.resting = true; me.status = 'resting';
      } else if (before.used < me.budget * 0.8 && me.used >= me.budget * 0.8 && me.used < me.budget) {
        await restPost('budget_events', { id: 'be-' + Date.now().toString(36), staff_id: me.id, kind: 'warn', budget: me.budget, used: me.used });
      }
    }
    if (me.resting && !resting) {
      resting = true;
      log('ĐÃ CHẠM NGÂN SÁCH — tự dừng, chuyển sang nhịp "đang nghỉ", chờ Giám đốc quyết định.');
    } else if (!me.resting && resting) {
      resting = false;
      log('Giám đốc đã cấp thêm / gọi lại — quay lại làm việc.');
    }
    if (currentJobId && typeof progress === 'number') {
      const jobs = await restGet('jobs', `id=eq.${currentJobId}&select=assignee_id`);
      if (jobs && jobs[0] && jobs[0].assignee_id === me.id) {
        await restPatch('jobs', `id=eq.${currentJobId}`, { progress: Math.max(0, Math.min(100, progress)) });
      }
    }
  } catch (e) { log('heartbeat lỗi:', e.message); }
}

async function heartbeatLoop() {
  let interval = 10000;
  for (;;) {
    await pushHeartbeat('background');
    interval = status === 'working' ? 10000 : Math.min(120000, interval * 2);
    await sleep(resting ? 60000 : interval);
  }
}

/* ------------------------- Sự kiện ---------------------------------------- */
let wsUp = false;
let approvalDecision = null; // { id, status, decidedBy, note } — cho chế độ chờ duyệt
const RT_TABLES = ['jobs', 'approvals', 'messages', 'meetings', 'staff', 'budget_events', 'alerts'];

function handleRealtimeRow(table, eventType, row) {
  if (!row) return;
  if (table === 'messages') {
    log('TIN NHẮN:', row.text ? String(row.text).slice(0, 120) : '(không có nội dung)');
    writeInboxEvent(row);
    pushHeartbeat('message-event');
    return;
  }
  if (table === 'approvals') {
    log('SỰ KIỆN phê duyệt:', eventType, '-', row.action || row.id, row.status || '');
    if (approvalDecision === null || approvalDecision.id === row.id) {
      if (row.status === 'approved' || row.status === 'rejected') {
        approvalDecision = { id: row.id, status: row.status, decidedBy: row.decided_by, note: row.note || '' };
      }
    }
    pushHeartbeat('approval-event');
    return;
  }
  if (table === 'jobs') {
    log('SỰ KIỆN job:', eventType, '-', row.name || row.id, row.status || '');
    pushHeartbeat('job-event');
    return;
  }
  if (table === 'alerts') { log('CẢNH BÁO:', row.text || row.kind); return; }
  if (table === 'budget_events' && row.kind === 'full') {
    log('SỰ KIỆN ngân sách: có nhân viên chạm 100% — kiểm tra trạng thái của mình.');
    pushHeartbeat('budget-event');
    return;
  }
  log('SỰ KIỆN', table + ':', eventType, '-', row.id || '');
}

function realtimeWsUrl() {
  const u = new URL(SUPABASE_URL);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/realtime/v1/websocket?apikey=${encodeURIComponent(ANON_KEY)}&vsn=1.0.0`;
}

async function listenRealtime() {
  let failures = 0;
  for (;;) {
    let ws = null;
    try {
      const s = await refreshSession();
      ws = new WebSocket(realtimeWsUrl());
      await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('WebSocket timeout')), 15000);
        ws.onopen = () => { clearTimeout(to); resolve(); };
        ws.onerror = () => { clearTimeout(to); reject(new Error('WebSocket error')); };
      });
      const joinPayload = {
        user_token: s.accessToken,
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: RT_TABLES.map((t) => ({ event: '*', schema: 'public', table: t })),
        },
      };
      ws.send(JSON.stringify({ topic: 'realtime:office', event: 'phx_join', payload: joinPayload, ref: '1' }));
      const hb = setInterval(() => {
        try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' })); } catch { /* đóng rồi */ }
      }, 30000);
      wsUp = true; failures = 0;
      log('Đã nối kênh Realtime.');
      await new Promise((resolve) => {
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.event === 'postgres_changes') {
              const p = data.payload || {};
              const d = p.data || p;
              const table = d.table || '';
              const eventType = d.eventType || d.event || '';
              const row = d.newRecord || d.new || d.record || null;
              if (table && row) handleRealtimeRow(table, eventType, row);
            }
          } catch { /* bỏ qua khung sự kiện hỏng */ }
        };
        ws.onclose = resolve;
        ws.onerror = resolve;
      });
      clearInterval(hb);
      wsUp = false;
      throw new Error('Kênh Realtime đóng.');
    } catch (e) {
      wsUp = false;
      if (ws) { try { ws.close(); } catch { /* bỏ qua */ } }
      failures += 1;
      const wait = Math.min(60000, 2000 * 2 ** Math.min(failures, 5));
      log(`Mất kết nối Realtime (${e.message}). Thử lại sau ${Math.round(wait / 1000)}s (lần ${failures}, lùi dần). Trong lúc đó dùng thăm dò REST 60s.`);
      await sleep(wait);
    }
  }
}

/* Thăm dò REST chậm (dự phòng khi mất WebSocket — KHÔNG thăm dò nhanh). */
async function fallbackPollLoop() {
  const seen = new Map(); // key -> chữ ký trạng thái
  for (;;) {
    await sleep(60000);
    if (wsUp) continue;
    try {
      const jobs = await restGet('jobs', 'select=id,name,status,updated_at&order=updated_at.desc&limit=20');
      for (const j of jobs || []) {
        const key = 'job:' + j.id; const sig = j.status;
        if (seen.has(key) && seen.get(key) !== sig) log('SỰ KIỆN job (thăm dò):', j.name, '→', sig);
        seen.set(key, sig);
      }
      const aps = await restGet('approvals', 'select=id,action,status,updated_at&order=updated_at.desc&limit=20');
      for (const a of aps || []) {
        const key = 'ap:' + a.id; const sig = a.status;
        if (seen.has(key) && seen.get(key) !== sig) {
          log('SỰ KIỆN phê duyệt (thăm dò):', a.action, '→', sig);
          if ((sig === 'approved' || sig === 'rejected') && (approvalDecision === null || approvalDecision.id === a.id)) {
            approvalDecision = { id: a.id, status: sig, decidedBy: null, note: '' };
          }
        }
        seen.set(key, sig);
      }
      const msgs = await restGet('messages', 'select=id,from_id,to_id,tagged_ids,text,created_at&order=created_at.desc&limit=20');
      for (const m of msgs || []) {
        const key = 'msg:' + m.id;
        if (!seen.has(key)) { log('TIN NHẮN (thăm dò):', String(m.text || '').slice(0, 120)); writeInboxEvent(m); }
        seen.set(key, '1');
      }
    } catch (e) { log('thăm dò REST lỗi:', e.message); }
  }
}

/* ------------------------- Chạy chính ------------------------------------- */
async function main() {
  // Chế độ xin phê duyệt một lần.
  if (flags['request-approval']) {
    if (!flags.reason) { console.error('[bridge] Thiếu --reason (lý do là bắt buộc).'); process.exit(2); }
    try {
      await signIn();
      await loadMe();
      const ap = await restPost('approvals', {
        id: 'ap-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        requester_id: me.id, action: flags['request-approval'], target: flags.target || '',
        reason: flags.reason, context: flags.context || '', source: 'api', status: 'pending',
      });
      const apId = (Array.isArray(ap) ? ap[0] : ap).id;
      console.log(`[bridge] Yêu cầu đã lên hộp phê duyệt (id ${apId}). Đang chờ Giám đốc/Leader quyết định — xem tại trung tâm điều hành, không cần mở app Muse.`);
      listenRealtime(); // chạy nền để nhận quyết định ngay khi có
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        if (approvalDecision && approvalDecision.id === apId) {
          if (approvalDecision.status === 'approved') { console.log('[bridge] ĐÃ ĐƯỢC DUYỆT.'); process.exit(0); }
          console.log('[bridge] BỊ TỪ CHỐI:', approvalDecision.note || '(không có lý do)'); process.exit(3);
        }
        await sleep(60000); // thăm dò chậm; Realtime sẽ rút ngắn bằng biến decision
        const rows = await restGet('approvals', `id=eq.${apId}&select=id,status,decided_by,note`);
        const cur = rows && rows[0];
        if (cur && cur.status === 'approved') { console.log('[bridge] ĐÃ ĐƯỢC DUYỆT.'); process.exit(0); }
        if (cur && cur.status === 'rejected') { console.log('[bridge] BỊ TỪ CHỐI:', cur.note || '(không có lý do)'); process.exit(3); }
      }
      console.log('[bridge] Hết 10 phút chờ — yêu cầu vẫn đang chờ duyệt. Thoát 4.');
      process.exit(4);
    } catch (e) { console.error('[bridge] Gửi yêu cầu thất bại:', e.message); process.exit(2); }
  }

  log(`Khởi động. Supabase: ${SUPABASE_URL}`);
  try {
    await signIn();
    await loadMe();
    log(`Đã đăng nhập: ${me.name} (vai trò ${me.role_id}, trạng thái ${me.status}).`);
  } catch (e) {
    console.error('[bridge] Không khởi động được:', e.message);
    process.exit(2);
  }
  heartbeatLoop();
  listenRealtime();
  fallbackPollLoop();
}
main();
