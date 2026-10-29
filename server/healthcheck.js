/* ============================================================================
 * Điểm kiểm tra độc lập — chạy NGOÀI máy chủ (Mục 7, lớp dự phòng 3).
 * ----------------------------------------------------------------------------
 * Gọi GET /api/health của máy chủ theo chu kỳ. Mất tín hiệu liên tiếp đủ
 * ngưỡng thì ghi cảnh báo "máy chủ ngừng" vào hộp thư cảnh báo
 * (alerts/outbox.jsonl) để lịch giao việc của Muse chuyển tới WhatsApp của
 * Giám đốc. Khi máy chủ sống lại thì ghi "máy chủ đã hồi phục".
 *
 * Nếu có OFFICE_DIRECTOR_TOKEN (token phiên Giám đốc), checker còn đọc
 * GET /api/alerts và chuyển mọi cảnh báo mới (chạm ngân sách, truy cập
 * trái phép) vào cùng hộp thư — để Giám đốc nhận được cả khi không mở
 * trung tâm điều hành. Checker KHÔNG tự gửi WhatsApp: việc chuyển tin đi
 * qua lịch giao việc của Muse (quyết định 29/10/2026 23:23). Không có tích
 * hợp API WhatsApp trực tiếp trong hệ thống này.
 *
 * CẤU HÌNH (biến môi trường):
 *  OFFICE_HEALTHCHECK_URL       URL /api/health (mặc định http://localhost:3101/api/health)
 *  OFFICE_HEALTHCHECK_INTERVAL_MS  chu kỳ kiểm tra (mặc định 60000)
 *  OFFICE_HEALTHCHECK_FAILS    số lần mất tín hiệu liên tiếp mới báo (mặc định 3)
 *  OFFICE_DIRECTOR_TOKEN       token phiên Giám đốc (tuỳ chọn, để đọc /api/alerts)
 *  OFFICE_ALERT_OUTBOX         file hộp thư (mặc định ./alerts/outbox.jsonl)
 *  OFFICE_HEALTHCHECK_STATE    file trạng thái (mặc định ./alerts/healthcheck-state.json)
 * Chạy: node healthcheck.js   (giữ chạy nền, ví dụ systemd riêng / cron)
 * ========================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HEALTH_URL = process.env.OFFICE_HEALTHCHECK_URL || 'http://localhost:3101/api/health';
const INTERVAL_MS = Number(process.env.OFFICE_HEALTHCHECK_INTERVAL_MS || 60000);
const FAIL_THRESHOLD = Number(process.env.OFFICE_HEALTHCHECK_FAILS || 3);
const DIRECTOR_TOKEN = process.env.OFFICE_DIRECTOR_TOKEN || '';
const OUTBOX = process.env.OFFICE_ALERT_OUTBOX || path.join(__dirname, 'alerts', 'outbox.jsonl');
const STATE_FILE = process.env.OFFICE_HEALTHCHECK_STATE || path.join(__dirname, 'alerts', 'healthcheck-state.json');
fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

const stamp = () => new Date().toISOString();
const log = (...a) => console.log(`[healthcheck ${new Date().toLocaleTimeString('vi-VN')}]`, ...a);

let state = { consecutiveFailures: 0, downReported: false, seenAlertIds: [] };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch { /* chạy lần đầu */ }
const saveState = () => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) { log('Không lưu được trạng thái:', e.message); } };
function writeOutbox(payload) {
  try { fs.appendFileSync(OUTBOX, JSON.stringify({ at: stamp(), source: 'healthcheck', ...payload }) + '\n'); }
  catch (e) { log('Không ghi được hộp thư cảnh báo:', e.message); }
}

async function checkOnce() {
  let ok = false;
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10000) });
    ok = res.ok;
  } catch { ok = false; }
  if (ok) {
    if (state.downReported) {
      writeOutbox({ kind: 'server-recovered', text: 'Máy chủ trung tâm đã hoạt động trở lại.' });
      log('Máy chủ đã hồi phục — đã ghi cảnh báo hồi phục vào hộp thư.');
      state.downReported = false;
    }
    state.consecutiveFailures = 0;
    saveState();
    await mirrorAlerts();
    return;
  }
  state.consecutiveFailures += 1;
  saveState();
  log(`Mất tín hiệu máy chủ (lần liên tiếp ${state.consecutiveFailures}/${FAIL_THRESHOLD}).`);
  if (state.consecutiveFailures >= FAIL_THRESHOLD && !state.downReported) {
    writeOutbox({ kind: 'server-down', healthUrl: HEALTH_URL, consecutiveFailures: state.consecutiveFailures, text: `Máy chủ trung tâm không phản hồi ${state.consecutiveFailures} lần kiểm tra liên tiếp — có thể đã ngừng hoạt động.` });
    log('Đã ghi cảnh báo MÁY CHỦ NGỪNG vào hộp thư (WhatsApp qua lịch giao việc của Muse).');
    state.downReported = true;
    saveState();
  }
}

/* Chuyển cảnh báo mới từ /api/alerts vào hộp thư — chỉ khi có token Giám đốc. */
async function mirrorAlerts() {
  if (!DIRECTOR_TOKEN) return;
  try {
    const base = HEALTH_URL.replace(/\/api\/health\/?$/, '');
    const res = await fetch(`${base}/api/alerts`, { headers: { Authorization: `Bearer ${DIRECTOR_TOKEN}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;
    const alerts = await res.json();
    for (const a of alerts) {
      if (state.seenAlertIds.includes(a.id)) continue;
      state.seenAlertIds.push(a.id);
      writeOutbox({ kind: a.kind || 'alert', alertId: a.id, staffId: a.staffId || null, text: a.text || '' });
      log('Đã chuyển cảnh báo vào hộp thư:', a.kind, '-', (a.text || '').slice(0, 80));
    }
    state.seenAlertIds = state.seenAlertIds.slice(-200);
    saveState();
  } catch (e) { log('Không đọc được /api/alerts:', e.message); }
}

log(`Bắt đầu. Kiểm tra ${HEALTH_URL} mỗi ${Math.round(INTERVAL_MS / 1000)}s, báo sau ${FAIL_THRESHOLD} lần mất tín hiệu. Hộp thư: ${OUTBOX}`);
checkOnce();
setInterval(checkOnce, INTERVAL_MS);
