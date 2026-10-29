/* ============================================================================
 * Cầu nối (bridge) — chương trình mỏng chạy ở mỗi tài khoản Muse nhân viên.
 * ----------------------------------------------------------------------------
 * NHIỆM VỤ DUY NHẤT: giữ kết nối SSE tới máy chủ, nhận sự kiện, đẩy
 * heartbeat có cấu trúc bằng API thuần. KHÔNG chứa logic nghiệp vụ.
 *
 *  - Chỉ "tỉnh" (đánh thức tài khoản) khi có sự kiện thật gửi tới đúng
 *    tài khoản này (tag tên, giao việc, gọi họp, kết quả duyệt, cảnh báo
 *    ngân sách). Việc đánh thức thật do tài khoản Muse tự quyết — bridge
 *    chỉ ghi sự kiện ra stdout để tiến trình gọi nó xử lý.
 *  - Heartbeat: nhịp nền TỰ THÍCH ỨNG — đang làm việc thì dày, đang chờ
 *    thì thưa dần theo cấp số nhân (tối đa 120s). Sự kiện thì đẩy ngay,
 *    không chờ nhịp.
 *  - Watchdog tự hồi phục CÓ LÙI DẦN (exponential backoff, tối đa 60s),
 *    tránh lỗi tự khoá "restart loop" của listener v2 cũ.
 *  - Tự dừng khi chạm ngân sách: khi máy chủ báo resting, bridge chỉ còn
 *    gửi nhịp "đang nghỉ", không nhận việc mới, chờ Giám đốc quyết định.
 *
 * TRAO ĐỔI TÀI LIỆU (quy ước tiết kiệm token): nhân viên trao đổi tài liệu
 * bằng LINK CÔNG KHAI của Muse (link + tiêu đề + tóm tắt ngắn), không dán
 * toàn bộ nội dung tài liệu vào chat. Người nhận chỉ mở link khi cần.
 * Ví dụ qua bus tin nhắn: [ASK:Linh] Nhờ xem bản nháp: "Kế hoạch Q4"
 * https://muse.example/link — tóm tắt: 3 mục, chốt ngân sách. Xem chi
 * tiết trong docs/HUONG-DAN-CAI-DAT.md (mục "Trao đổi tài liệu bằng link").
 * Cầu nối không tải file — chỉ chuyển link (không có hệ thống tải file lên).
 *
 * CẤU HÌNH (biến môi trường hoặc cờ dòng lệnh):
 *  OFFICE_SERVER  URL máy chủ (mặc định http://localhost:3101)
 *  OFFICE_TOKEN   token API riêng của tài khoản (Giám đốc cấp, chỉ hiện 1 lần)
 *  OFFICE_NAME    tên hiển thị của tài khoản
 * Chạy: node bridge.js --server http://localhost:3101 --token <TOKEN> --name Linh
 *
 * XIN PHÊ DUYỆT MỘT LẦN (hộp phê duyệt nhận MỌI yêu cầu quyền — quyết định
 * 29/10/2026 23:23 + 23:26): khi tài khoản Muse cần quyền (đăng nhập, tải
 * file, cài đặt chương trình/ứng dụng, gửi tin ra ngoài nhóm, xoá dữ liệu,
 * đổi cài đặt, truy cập ngoài phạm vi, chi tiêu), nó gọi:
 *   node bridge.js --request-approval "Tải file xuống" --target "bao-cao.xlsx" --reason "..." [--context "..."]
 * Bridge gửi yêu cầu lên POST /api/approvals rồi chờ kết quả qua
 * GET /api/approvals/:id (tối đa 10 phút). Được duyệt -> thoát 0; bị từ
 * chối -> thoát 3; hết hạn chờ -> thoát 4. Quyết định của Giám đốc/Leader
 * trong hộp phê duyệt web là nguồn sự thật duy nhất.
 * ========================================================================== */
'use strict';

const SERVER = process.env.OFFICE_SERVER || 'http://localhost:3101';
const TOKEN = process.env.OFFICE_TOKEN || '';
const NAME = process.env.OFFICE_NAME || 'nhan-vien';

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) flags[args[i].slice(2)] = args[i + 1];
}
if (flags.server) process.env.OFFICE_SERVER = flags.server;
if (flags.token) process.env.OFFICE_TOKEN = flags.token;
if (flags.name) process.env.OFFICE_NAME = flags.name;
// File cấu hình (do kit/install.sh tạo, quyền 600): { "server": "...", "name": "...", "token": "..." }.
// Token/mật khẩu chỉ nhập lúc cài đặt, không bao giờ ghi sẵn trong file mẫu.
if (flags.config || process.env.OFFICE_CONFIG) {
  try {
    const cfg = JSON.parse(require('node:fs').readFileSync(flags.config || process.env.OFFICE_CONFIG, 'utf8'));
    if (cfg.server && !process.env.OFFICE_SERVER) process.env.OFFICE_SERVER = cfg.server;
    if (cfg.name && !process.env.OFFICE_NAME) process.env.OFFICE_NAME = cfg.name;
    if (cfg.token && !process.env.OFFICE_TOKEN) process.env.OFFICE_TOKEN = cfg.token;
  } catch (e) { console.error('[bridge] Không đọc được file cấu hình:', e.message); process.exit(2); }
}
const server = process.env.OFFICE_SERVER || SERVER;
const token = process.env.OFFICE_TOKEN || TOKEN;
const name = process.env.OFFICE_NAME || NAME;

if (!token) {
  console.error('[bridge] Thiếu OFFICE_TOKEN. Token do Giám đốc cấp qua POST /api/staff (chỉ hiện một lần). Không ghi token vào code.');
  process.exit(2);
}

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
let resting = false;
let failures = 0; // đếm lỗi liên tiếp cho lùi dần
let heartbeatTimer = null;
let status = 'waiting';
let currentJobId = null;
let progress = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString('vi-VN');

function log(...parts) { console.log(`[bridge ${stamp()} ${name}]`, ...parts); }

/* Đẩy heartbeat: sự kiện là chính — gọi ngay khi trạng thái đổi; nhịp nền
 * do vòng lặp bên dưới điều khiển (dày khi đang làm, thưa khi đang chờ). */
async function pushHeartbeat(reason) {
  try {
    const res = await fetch(`${server}/api/heartbeat`, {
      method: 'POST', headers, body: JSON.stringify({ status, jobId: currentJobId, progress, blocked: null }),
    });
    if (!res.ok) { log('heartbeat bị từ chối:', res.status, await res.text()); return; }
    const body = await res.json();
    if (body.resting && !resting) {
      resting = true;
      log('ĐÃ CHẠM NGÂN SÁCH — tự dừng, chuyển sang nhịp "đang nghỉ", chờ Giám đốc quyết định.');
    } else if (!body.resting && resting) {
      resting = false;
      log('Giám đốc đã cấp thêm / gọi lại — quay lại làm việc.');
    }
  } catch (e) { log('heartbeat lỗi:', e.message); }
}

async function heartbeatLoop() {
  // Nhịp nền tự thích ứng: đang làm -> 10s; đang chờ -> thưa dần tới 120s.
  let interval = 10000;
  for (;;) {
    await pushHeartbeat('background');
    interval = status === 'working' ? 10000 : Math.min(120000, interval * 2);
    await sleep(resting ? 60000 : interval);
  }
}

async function listenSSE() {
  // Vòng lặp tự hồi phục có lùi dần: lỗi -> đợi 2s, 4s, 8s... tối đa 60s.
  for (;;) {
    try {
      const res = await fetch(`${server}/api/events?token=${encodeURIComponent(token)}`, { headers: { Accept: 'text/event-stream' } });
      if (!res.ok) throw new Error(`SSE ${res.status}`);
      failures = 0;
      log('Đã nối kênh sự kiện.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(5).trim());
            handleEvent(ev);
          } catch { /* bỏ qua khung sự kiện hỏng */ }
        }
      }
      throw new Error('Kênh sự kiện đóng.');
    } catch (e) {
      failures += 1;
      const wait = Math.min(60000, 2000 * 2 ** Math.min(failures, 5));
      log(`Mất kết nối sự kiện (${e.message}). Thử lại sau ${Math.round(wait / 1000)}s (lần ${failures}, lùi dần).`);
      await sleep(wait);
    }
  }
}

function handleEvent(ev) {
  // Bridge chỉ GHI sự kiện + đẩy heartbeat ngay (sự kiện là chính).
  // Tài khoản Muse đọc stdout này để quyết định có "tỉnh" hay không.
  const mine = JSON.stringify(ev).includes(name);
  if (ev.type === 'job' && ev.job && ev.job.assigneeId) {
    // Không biết staffId của chính mình ở đây — sự kiện giao việc nào cũng
    // được ghi lại; tài khoản tự đối chiếu với việc của mình qua /api/context.
    log('SỰ KIỆN job:', ev.change, '-', ev.job.name);
    pushHeartbeat('job-event');
    return;
  }
  if (ev.type === 'approval' && ev.approval) {
    log('SỰ KIỆN phê duyệt:', ev.change, '-', ev.approval.action);
    pushHeartbeat('approval-event');
    return;
  }
  if (ev.type === 'budget' && ev.kind === 'full') {
    log('SỰ KIỆN ngân sách: có nhân viên chạm 100% — kiểm tra trạng thái của mình.');
    pushHeartbeat('budget-event');
    return;
  }
  if (ev.type === 'director-alert') { log('CẢNH BÁO GIÁM ĐỐC:', ev.text); return; }
  if (ev.type === 'message') { log('TIN NHẮN bus:', ev.message.text); pushHeartbeat('message-event'); return; }
  if (mine) log('SỰ KIỆN (liên quan tới tên này):', ev.type);
}

async function main() {
  // Chế độ xin phê duyệt một lần: gửi yêu cầu, chờ quyết định, thoát theo kết quả.
  if (flags['request-approval']) {
    if (!flags.reason) { console.error('[bridge] Thiếu --reason (lý do là bắt buộc).'); process.exit(2); }
    const res = await fetch(`${server}/api/approvals`, {
      method: 'POST', headers,
      body: JSON.stringify({ action: flags['request-approval'], target: flags.target || '', reason: flags.reason, context: flags.context || '', source: 'api' }),
    });
    if (!res.ok) { console.error('[bridge] Gửi yêu cầu thất bại:', res.status, await res.text()); process.exit(2); }
    const ap = await res.json();
    console.log(`[bridge] Yêu cầu đã lên hộp phê duyệt (id ${ap.id}). Đang chờ Giám đốc/Leader quyết định — xem tại trung tâm điều hành, không cần mở app Muse.`);
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(5000);
      const r = await fetch(`${server}/api/approvals/${ap.id}`, { headers });
      if (!r.ok) continue;
      const cur = await r.json();
      if (cur.status === 'approved') { console.log('[bridge] ĐÃ ĐƯỢC DUYỆT bởi', cur.decidedBy, '-', cur.note || ''); process.exit(0); }
      if (cur.status === 'rejected') { console.log('[bridge] BỊ TỪ CHỐI:', cur.note || '(không có lý do)'); process.exit(3); }
    }
    console.log('[bridge] Hết 10 phút chờ — yêu cầu vẫn đang chờ duyệt. Thoát 4.');
    process.exit(4);
  }
  log(`Khởi động. Máy chủ: ${server}`);
  // Lấy gói ngữ cảnh nén lúc khởi động (Module E) — không nạp toàn bộ lịch sử.
  try {
    const res = await fetch(`${server}/api/context`, { headers });
    if (res.ok) { const ctx = await res.json(); log('Ngữ cảnh nén lúc khởi động: vai trò', ctx.staff.role, '| việc của tôi:', ctx.myJobs.length); }
    else log('Không lấy được ngữ cảnh nén:', res.status);
  } catch (e) { log('Không nối được máy chủ lúc khởi động:', e.message); }
  heartbeatLoop();
  listenSSE();
}
main();
