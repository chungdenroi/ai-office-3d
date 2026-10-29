/* ============================================================================
 * Máy chủ trung tâm — Hệ thống AI nhân viên, Công ty Enteesee
 * ----------------------------------------------------------------------------
 * Giai đoạn 1 (xương sống) theo phác thảo đã duyệt 29/10/2026, Mục 6-7-9:
 *  - Node.js thuần (chỉ dùng module có sẵn: http, crypto, fs, path).
 *  - Lưu trữ: SQLite (node:sqlite, Node >= 22) trong data/office.db; nếu
 *    node:sqlite không có thì tự rơi về file JSON (data/store.json) sau
 *    cùng một giao diện Store — không mất dữ liệu, không đổi API.
 *  - Xác thực: Giám đốc = phiên đăng nhập (mật khẩu + mã TOTP). Nhân viên =
 *    token API riêng theo từng tài khoản, giới hạn đúng phạm vi nhân viên.
 *  - Phân quyền KIỂM Ở MÁY CHỦ trước khi thực thi (không chỉ ẩn nút ở
 *    giao diện). Token nhân viên gọi API cấp Giám đốc -> 403 + ghi nhật ký
 *    cảnh báo + tạo bản ghi báo Giám đốc.
 *  - Mọi hành động đều gắn danh tính đã xác thực — không có hành động
 *    “nặc danh”, không ai ghi việc thay người khác được.
 *  - Kênh sự kiện SSE: đẩy ngay khi có sự kiện (tag/giao việc/gọi họp/
 *    kết quả duyệt/cảnh báo ngân sách). Heartbeat: sự kiện là chính, nhịp
 *    nền tự thích ứng — xem hàm adaptiveHeartbeat().
 *  - Sao lưu định kỳ: copy file dữ liệu sang thư mục sao lưu (mặc định
 *    ./backups, đổi bằng OFFICE_BACKUP_DIR), giữ 20 bản mới nhất.
 *
 * CẤU HÌNH (biến môi trường — KHÔNG ghi mật khẩu/token vào code):
 *  OFFICE_PORT                  cổng (mặc định 3101)
 *  OFFICE_DATA_DIR              thư mục dữ liệu (mặc định ./data)
 *  OFFICE_BACKUP_DIR            thư mục sao lưu (mặc định ./backups)
 *  OFFICE_BACKUP_INTERVAL_MS    chu kỳ sao lưu (mặc định 900000 = 15 phút)
 *  OFFICE_DIRECTOR_PASSWORD_HASH  chuỗi băm scrypt "salt:hash" của mật khẩu
 *    Giám đốc (cùng định dạng với mật khẩu nhân viên; chuỗi hex SHA-256 cũ
 *    vẫn chấp nhận kèm cảnh báo). Nếu không đặt, dùng Cài đặt lần đầu.
 *  OFFICE_DIRECTOR_TOTP_SECRET    secret base32 cho mã TOTP của Giám đốc
 * CÀI ĐẶT LẦN ĐẦU: nếu chưa có tài khoản Giám đốc ở đâu cả, GET
 *  /api/setup/status trả needsSetup=true và POST /api/setup (một lần duy
 *  nhất) tạo mật khẩu scrypt + secret TOTP, trả secret về MỘT LẦN.
 *  Web (thư mục web/) được phục vụ cùng nguồn với API — mở URL máy chủ là
 *  có đủ hệ thống thật kèm đăng nhập.
 *  OFFICE_SESSION_TTL_MS        thời hạn phiên (mặc định 12 giờ)
 *  OFFICE_ALERT_OUTBOX          file hộp thư cảnh báo (mặc định
 *    ./alerts/outbox.jsonl, một JSON mỗi dòng). Cảnh báo chạm ngân sách và
 *    truy cập trái phép được ghi vào đây để lịch giao việc của Muse chuyển
 *    tới WhatsApp của Giám đốc (quyết định 29/10/2026 23:23). KHÔNG có tích
 *    hợp API WhatsApp trực tiếp trong hệ thống này.
 * Nếu 2 biến Giám đốc chưa đặt, đăng nhập Giám đốc trả 503 và ghi rõ lý do
 * (không có mật khẩu mặc định nào trong code).
 *
 * HỘP PHÊ DUYỆT (quyết định 29/10/2026 23:23 + bổ sung 23:26): nhận MỌI yêu
 * cầu cần quyền của MỌI tài khoản Muse — đăng nhập, tải file, cài đặt
 * chương trình/ứng dụng, gửi tin ra ngoài nhóm, xoá dữ liệu, đổi cài đặt
 * tài khoản/bảo mật, truy cập ngoài phạm vi, chi tiêu. Yêu cầu gửi lên qua
 * POST /api/approvals (token nhân viên, kèm action + target + reason +
 * context); quyết định trả về qua SSE và GET /api/approvals/:id để tài
 * khoản xin phép tiếp tục việc. Hộp này KHÔNG chọc vào thẻ phê duyệt riêng
 * của app Muse — nó nhận yêu cầu do cầu nối/API gửi lên.
 * ========================================================================== */
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.OFFICE_PORT || 3101);
const DATA_DIR = process.env.OFFICE_DATA_DIR || path.join(__dirname, 'data');
const BACKUP_DIR = process.env.OFFICE_BACKUP_DIR || path.join(__dirname, 'backups');
const BACKUP_INTERVAL_MS = Number(process.env.OFFICE_BACKUP_INTERVAL_MS || 900000);
const SESSION_TTL_MS = Number(process.env.OFFICE_SESSION_TTL_MS || 12 * 3600 * 1000);
const ALERT_OUTBOX = process.env.OFFICE_ALERT_OUTBOX || path.join(__dirname, 'alerts', 'outbox.jsonl');
const WEB_DIR = path.join(__dirname, '..', 'web');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(path.dirname(ALERT_OUTBOX), { recursive: true });

/* ------------------------------ Tiện ích -------------------------------- */
const uid = () => crypto.randomBytes(12).toString('hex');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowIso = () => new Date().toISOString();
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1024 * 1024) { reject(new Error('Body quá lớn (giới hạn 1MB).')); req.destroy(); } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Body không phải JSON hợp lệ.')); } });
    req.on('error', reject);
  });
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

/* ------------------------------ TOTP (RFC 6238) -------------------------- */
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) { value = (value << 5) | alphabet.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function totpCode(secret, counter) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}
function verifyTotp(secret, code) {
  // Mã sai định dạng (không đúng 6 chữ số) trả về false — không bao giờ để
  // timingSafeEqual nổ 500 vì lệch độ dài (lỗi đã gặp ở bản cũ).
  const clean = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) {
    const expected = totpCode(secret, step + d);
    if (expected.length === 6 && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}
function base32Encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/* --------------------- Mật khẩu nhân viên (scrypt, có muối) --------------
 * Mật khẩu CHỈ lưu dạng băm scrypt có muối — không bao giờ lưu plaintext,
 * không bao giờ ghi vào nhật ký. Định dạng lưu: "saltHex:hashHex". */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const hash = crypto.scryptSync(password, parts[0], 64).toString('hex');
  if (hash.length !== parts[1].length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(parts[1]));
}
function sanitizeStaff(st) {
  const c = { ...st };
  delete c.tokenHash;
  if (c.login) c.login = { username: c.login.username, hasPassword: !!c.login.passwordHash, mustChangePassword: !!c.login.mustChangePassword, disabled: !!c.login.disabled };
  return c;
}

/* ------------------------------ Lưu trữ ---------------------------------- */
/* Một giao diện Store duy nhất. Backend SQLite nếu có, ngược lại JSON file.
 * Mỗi collection là một "bảng" (id -> doc JSON). Node chạy đơn luồng nên
 * chuỗi đọc-kiểm tra-ghi trong cùng một lượt xử lý là nguyên tử đối với
 * khoá nhận việc (không có hai lượt xử lý chạy song song). */
function createStore() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(DATA_DIR, 'office.db');
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (collection, id))');
    const qList = db.prepare('SELECT body FROM docs WHERE collection = ?');
    const qGet = db.prepare('SELECT body FROM docs WHERE collection = ? AND id = ?');
    const qPut = db.prepare('INSERT INTO docs (collection, id, body) VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET body = excluded.body');
    const qDel = db.prepare('DELETE FROM docs WHERE collection = ? AND id = ?');
    return {
      kind: 'sqlite', file: dbPath,
      list: (col) => qList.all(col).map((r) => JSON.parse(r.body)),
      get: (col, id) => { const r = qGet.get(col, id); return r ? JSON.parse(r.body) : null; },
      put: (col, doc) => { qPut.run(col, doc.id, JSON.stringify(doc)); return doc; },
      del: (col, id) => { qDel.run(col, id); },
      close: () => db.close(),
    };
  } catch (e) {
    const file = path.join(DATA_DIR, 'store.json');
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
    const persist = () => fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return {
      kind: 'json', file,
      list: (col) => Object.values(data[col] || {}),
      get: (col, id) => (data[col] && data[col][id]) || null,
      put: (col, doc) => { (data[col] = data[col] || {})[doc.id] = doc; persist(); return doc; },
      del: (col, id) => { if (data[col]) { delete data[col][id]; persist(); } },
      close: () => {},
    };
  }
}
const store = createStore();

/* ---- Tài khoản Giám đốc: mật khẩu băm scrypt (định dạng "salt:hash",
 * giống hệt mật khẩu nhân viên). Biến môi trường OFFICE_DIRECTOR_PASSWORD_HASH
 * giữ nguyên tên nhưng phải chứa chuỗi scrypt; chuỗi hex SHA-256 (64 ký tự)
 * của bản cũ vẫn được chấp nhận kèm cảnh báo chuyển đổi — không khuyến khích.
 * Nếu không có biến môi trường, tài khoản Giám đốc được tạo ở màn hình Cài đặt
 * lần đầu (POST /api/setup) và lưu trong store — không có mật khẩu mặc định. */
function verifyScryptFormat(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2 || !/^[0-9a-f]+$/.test(parts[0]) || !/^[0-9a-f]+$/.test(parts[1])) return false;
  const hash = crypto.scryptSync(password, parts[0], 64).toString('hex');
  if (hash.length !== parts[1].length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(parts[1]));
}
function directorCredentialFromEnv() {
  const h = process.env.OFFICE_DIRECTOR_PASSWORD_HASH;
  const s = process.env.OFFICE_DIRECTOR_TOTP_SECRET;
  if (!h || !s) return null;
  const legacy = /^[0-9a-f]{64}$/i.test(h);
  if (legacy) console.log('[office] CẢNH BÁO: mật khẩu Giám đốc đang dùng hàm băm SHA-256 cũ — hãy chuyển sang scrypt (xem README, mục Cài đặt lần đầu).');
  return { passwordHash: h, totpSecret: s, legacy, source: 'env' };
}
function getDirectorCredential() {
  return directorCredentialFromEnv() || store.get('director', 'credential') || null;
}
function directorNeedsSetup() { return !getDirectorCredential(); }
function verifyDirectorPassword(password, cred) {
  if (!cred) return false;
  if (/^[0-9a-f]{64}$/i.test(cred.passwordHash)) {
    const h = sha256(String(password));
    if (h.length !== cred.passwordHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(cred.passwordHash));
  }
  return verifyScryptFormat(password, cred.passwordHash);
}

/* Hạt giống: chức vụ + nhân viên là DỮ LIỆU (đổi được qua API Giám đốc).
 * Quyền nằm ở dữ liệu chức vụ, không ghi cứng theo tên người. Token của
 * nhân viên KHÔNG nằm trong hạt giống — Giám đốc cấp qua API, mã gốc chỉ
 * hiện một lần duy nhất lúc cấp. */
function seedIfEmpty() {
  if (store.list('roles').length) return;
  const roles = [
    { id: 'r-giamdoc', name: 'Giám đốc', level: 1, canApprove: true, canManage: true },
    { id: 'r-dieuphoi', name: 'Điều phối', level: 1, canApprove: true, canManage: false },
    { id: 'r-quanly', name: 'Quản lý', level: 2, canApprove: true, canManage: false },
    { id: 'r-thucthi', name: 'Thực thi', level: 3, canApprove: false, canManage: false },
  ];
  roles.forEach((r) => store.put('roles', r));
  const staff = [
    { id: 's-chung', name: 'Chung', account: 'teddyssk559@gmail.com', roleId: 'r-giamdoc', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false },
    { id: 's-muse', name: 'Muse', account: 'muse-dieu-phoi', roleId: 'r-dieuphoi', status: 'working', budget: 5000000000, used: 0, resting: false, restedFully: false },
    { id: 's-hung', name: 'Hùng', account: 'muse-hung', roleId: 'r-quanly', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false },
    { id: 's-tuan', name: 'Tuấn', account: 'muse-tuan', roleId: 'r-thucthi', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false },
    { id: 's-linh', name: 'Linh', account: 'muse-linh', roleId: 'r-thucthi', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false },
  ];
  staff.forEach((s) => store.put('staff', s));
  store.put('rules', { id: 'rule-1', text: 'Mọi việc phải qua kiểm tra trước khi trình duyệt' });
  store.put('rules', { id: 'rule-2', text: 'Duyệt / trả lại phải có lý do; cấm tự duyệt việc của mình' });
  // Kho việc rỗng lúc đầu (Module B) — Giám đốc thêm dần qua API.
}
seedIfEmpty();

/* ------------------------------ Hộp thư cảnh báo ---------------------------
 * Ghi cảnh báo ra file JSONL để lịch giao việc của Muse đọc và chuyển tới
 * WhatsApp của Giám đốc (kênh báo khẩn đã chốt). Máy chủ không tự gửi
 * WhatsApp. Điểm kiểm tra độc lập (healthcheck.js) ghi vào cùng file này. */
function writeOutbox(payload) {
  try {
    fs.appendFileSync(ALERT_OUTBOX, JSON.stringify({ at: nowIso(), ...payload }) + '\n');
  } catch (e) { console.error('[office] Không ghi được hộp thư cảnh báo:', e.message); }
}

/* ------------------------------ Sự kiện SSE ------------------------------ */
const sseClients = new Set();
function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify({ type, at: nowIso(), ...data })}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch { sseClients.delete(res); } }
}
function audit(action, actor, target, result, extra) {
  const entry = { id: uid(), at: nowIso(), action, actorId: actor ? actor.id : null, actorType: actor ? actor.type : 'anonymous', target: target || null, result, ...(extra || {}) };
  store.put('audit', entry);
  return entry;
}

/* ------------------------------ Xác thực ---------------------------------- */
function roleOfStaff(st) { return store.get('roles', st.roleId) || { name: '(chưa gán)', level: 9, canApprove: false, canManage: false }; }

async function authenticate(req, url) {
  // SSE dùng ?token= vì EventSource không gửi header Authorization.
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || url.searchParams.get('token');
  if (!token) throw new HttpError(401, 'Thiếu thông tin xác thực. Mọi hành động đều phải gắn danh tính đã xác thực.');
  const hash = sha256(token);
  const session = store.list('sessions').find((s) => s.tokenHash === hash);
  if (session) {
    if (session.revoked) throw new HttpError(401, 'Phiên đã bị thu hồi.');
    if (Date.now() > session.expiresAt) throw new HttpError(401, 'Phiên đã hết hạn — đăng nhập lại.');
    const st = store.get('staff', session.staffId);
    if (!st) throw new HttpError(401, 'Tài khoản của phiên này không còn tồn tại.');
    if (st.login && st.login.disabled) throw new HttpError(401, 'Tài khoản đã bị khoá.');
    // Phiên Giám đốc (mật khẩu + TOTP) và phiên nhân viên (username + mật khẩu)
    // là hai loại phiên khác nhau — chỉ phiên Giám đốc được gọi API cấp Giám đốc.
    const kind = session.kind || 'director';
    return { type: kind === 'staff' ? 'staff' : 'director', id: st.id, staff: st, role: roleOfStaff(st), sessionId: session.id, viaSession: true, mustChange: !!(st.login && st.login.mustChangePassword) };
  }
  const staff = store.list('staff').find((s) => {
    // timingSafeEqual nổ lỗi nếu lệch độ dài — kiểm tra độ dài trước.
    if (!s.tokenHash || s.tokenHash.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(s.tokenHash), Buffer.from(hash));
  });
  if (staff) {
    if (staff.login && staff.login.disabled) throw new HttpError(401, 'Tài khoản đã bị khoá.');
    return { type: 'staff', id: staff.id, staff, role: roleOfStaff(staff), sessionId: null, viaSession: false, mustChange: false };
  }
  throw new HttpError(401, 'Thông tin xác thực không hợp lệ.');
}
/* Chặn + ghi nhật ký khi token nhân viên cố gọi API cấp Giám đốc (§9). */
function requireDirector(identity, actionName) {
  if (identity.type !== 'director') {
    audit('director-api-denied', identity, actionName, 'blocked', { reason: 'Token nhân viên không có phạm vi Giám đốc.' });
    const alertDoc = { id: uid(), at: nowIso(), kind: 'security', text: `Token nhân viên (${identity.staff.name}) cố gọi API cấp Giám đốc: ${actionName} — đã chặn.` };
    store.put('alerts', alertDoc);
    writeOutbox({ kind: 'security', staffId: identity.id, staffName: identity.staff.name, action: actionName, text: alertDoc.text });
    broadcast('director-alert', { kind: 'security', text: alertDoc.text });
    throw new HttpError(403, 'Bị chặn: chỉ phiên Giám đốc mới được gọi API này. Sự kiện đã ghi vào nhật ký bảo mật và báo cho Giám đốc.');
  }
}
function canDecideApproval(identity, reqDoc) {
  if (!identity.role.canApprove) return 'Chức vụ hiện tại không có quyền duyệt (quyền tính theo chức vụ).';
  if (identity.id === reqDoc.requesterId) return 'Cấm tự duyệt yêu cầu của chính mình.';
  return null;
}
function checkBudgetAndRest(st) {
  if (st.budget == null || st.budget <= 0 || st.resting) return null;
  if (st.used >= st.budget) {
    st.resting = true; st.status = 'resting'; store.put('staff', st);
    const job = store.list('jobs').find((j) => j.assigneeId === st.id && j.status !== 'Hoàn thành');
    const text = `${st.name} đã chạm 100% ngân sách (${st.used}/${st.budget}). Việc dở: ${job ? job.name + ' (' + job.status + ')' : 'không có'}. Đã cho nghỉ ngay.`;
    store.put('alerts', { id: uid(), at: nowIso(), kind: 'budget-full', staffId: st.id, text });
    writeOutbox({ kind: 'budget-full', staffId: st.id, staffName: st.name, used: st.used, budget: st.budget, unfinishedJob: job ? job.name : null, text });
    broadcast('budget', { kind: 'full', staffId: st.id, text });
    broadcast('director-alert', { kind: 'budget', text });
    return { kind: 'full', text };
  }
  if (st.used >= st.budget * 0.8) {
    broadcast('budget', { kind: 'warn', staffId: st.id, used: st.used, budget: st.budget });
    return { kind: 'warn' };
  }
  return null;
}

/* --------------------------- Nhịp heartbeat thích ứng --------------------
 * Sự kiện là chính (đẩy ngay khi heartbeat báo đổi trạng thái); nhịp nền
 * của cầu nối tự thưa/dày theo trạng thái (xem bridge.js). Phía máy chủ
 * không ép một chu kỳ cố định nào — mọi lượt heartbeat đều được nhận và
 * phát tán ngay. */
function adaptiveHeartbeatNote(identity) {
  return identity.role.canApprove ? 'nhịp dày (đang làm việc)' : 'nhịp nền';
}

/* ------------------------------ Sao lưu ---------------------------------- */
function runBackup(reason) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `office-backup-${stamp}${store.kind === 'sqlite' ? '.db' : '.json'}`);
    fs.copyFileSync(store.file, dest);
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('office-backup-')).sort();
    while (files.length > 20) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    return { ok: true, file: dest, reason };
  } catch (e) { return { ok: false, error: e.message }; }
}
setInterval(() => runBackup('periodic'), BACKUP_INTERVAL_MS).unref();

/* ------------------------------ Định tuyến ------------------------------- */
const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.pattern.split('/').filter(Boolean);
    const segs = pathname.split('/').filter(Boolean);
    if (parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (parts[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

/* --- Công khai: kiểm tra sức khoẻ (điểm kiểm tra độc lập, Mục 7 lớp 3) --- */
route('GET', '/api/health', async () => ({
  ok: true, time: nowIso(), store: store.kind, uptimeSec: Math.round(process.uptime()),
  counts: { staff: store.list('staff').length, jobs: store.list('jobs').length, pendingApprovals: store.list('approvals').filter((a) => a.status === 'pending').length },
}));

/* --- Cài đặt lần đầu: chỉ chạy MỘT LẦN duy nhất, khi chưa có tài khoản
 * Giám đốc ở bất cứ đâu (biến môi trường hoặc store). Tạo mật khẩu băm
 * scrypt + secret TOTP ngẫu nhiên; secret chỉ trả về MỘT LẦN để quét vào
 * ứng dụng xác thực, không ghi vào nhật ký, không có giá trị mặc định. --- */
route('GET', '/api/setup/status', async () => ({ needsSetup: directorNeedsSetup() }));
route('POST', '/api/setup', async (req) => {
  if (!directorNeedsSetup()) throw new HttpError(403, 'Hệ thống đã có tài khoản Giám đốc — cài đặt lần đầu chỉ chạy một lần duy nhất.');
  const b = await readBody(req);
  if (!b.password || String(b.password).length < 10) throw new HttpError(400, 'Mật khẩu Giám đốc phải từ 10 ký tự.');
  if (b.password !== b.confirmPassword) throw new HttpError(400, 'Mật khẩu nhập lại không khớp.');
  const secret = base32Encode(crypto.randomBytes(20));
  store.put('director', { id: 'credential', passwordHash: hashPassword(String(b.password)), totpSecret: secret, source: 'setup', createdAt: nowIso() });
  if (!store.list('staff').some((s) => roleOfStaff(s).canManage)) {
    store.put('staff', { id: 's-chung', name: 'Chung', account: 'teddyssk559@gmail.com', roleId: 'r-giamdoc', status: 'waiting', budget: null, used: 0, resting: false, restedFully: false });
  }
  audit('director-setup', null, 'setup', 'ok');
  const issuer = 'Enteesee Office';
  return {
    ok: true,
    totpSecret: secret,
    otpauthUrl: `otpauth://totp/${encodeURIComponent(issuer)}:Giám đốc?secret=${secret}&issuer=${encodeURIComponent(issuer)}`,
    warning: 'Ghi lại secret / quét mã QR vào ứng dụng xác thực NGAY — secret này chỉ hiện một lần duy nhất và không hiện lại.',
  };
});

/* --- Giám đốc đăng nhập (mật khẩu scrypt + TOTP; không có mặc định) --- */
route('POST', '/api/director/login', async (req) => {
  const cred = getDirectorCredential();
  if (!cred) throw new HttpError(503, 'Chưa có tài khoản Giám đốc trên máy chủ này — mở trang web và làm theo màn hình Cài đặt lần đầu. Không có mật khẩu mặc định.');
  const body = await readBody(req);
  if (!body.password || !body.totp) throw new HttpError(400, 'Thiếu mật khẩu hoặc mã xác thực.');
  if (!verifyDirectorPassword(String(body.password), cred)) {
    audit('director-login-failed', null, 'login', 'failed', { reason: 'Sai mật khẩu.' });
    throw new HttpError(401, 'Sai mật khẩu hoặc mã xác thực.');
  }
  if (!verifyTotp(cred.totpSecret, String(body.totp))) {
    audit('director-login-failed', null, 'login', 'failed', { reason: 'Sai mã TOTP.' });
    throw new HttpError(401, 'Sai mật khẩu hoặc mã xác thực.');
  }
  const director = store.list('staff').find((s) => roleOfStaff(s).canManage) || store.list('staff')[0];
  const token = crypto.randomBytes(32).toString('hex');
  const session = { id: uid(), kind: 'director', tokenHash: sha256(token), staffId: director.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS, revoked: false };
  store.put('sessions', session);
  audit('director-login', { type: 'director', id: director.id }, 'login', 'ok');
  return { token, expiresAt: session.expiresAt, staffId: director.id };
});
/* --- Tài khoản đăng nhập của nhân viên: username + mật khẩu riêng ---
 * Mỗi tài khoản Muse là một nhân viên và có tài khoản đăng nhập RIÊNG vào hệ
 * thống (khác với token API của cầu nối). Giám đốc tạo tài khoản + đặt mật
 * khẩu ban đầu; nhân viên BẮT BUỘC đổi mật khẩu ở lần đăng nhập đầu tiên.
 * Xoá nhân viên thu hồi cả mật khẩu lẫn token API ngay lập tức. */
route('POST', '/api/staff/login', async (req) => {
  const b = await readBody(req);
  if (!b.username || !b.password) throw new HttpError(400, 'Thiếu tên đăng nhập hoặc mật khẩu.');
  const st = store.list('staff').find((s) => s.login && s.login.username === b.username);
  if (!st || !verifyPassword(b.password, st.login.passwordHash)) {
    audit('staff-login-failed', null, 'login', 'failed', { username: b.username });
    throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu.');
  }
  if (st.login.disabled) throw new HttpError(401, 'Tài khoản đã bị khoá.');
  const token = crypto.randomBytes(32).toString('hex');
  const session = { id: uid(), kind: 'staff', tokenHash: sha256(token), staffId: st.id, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS, revoked: false };
  store.put('sessions', session);
  audit('staff-login', { type: 'staff', id: st.id }, 'login', 'ok');
  return { token, expiresAt: session.expiresAt, staffId: st.id, mustChangePassword: !!st.login.mustChangePassword };
});
route('POST', '/api/staff/change-password', async (req, res, idn) => {
  if (idn.type !== 'staff' || !idn.viaSession) throw new HttpError(403, 'Chỉ phiên đăng nhập của nhân viên mới đổi được mật khẩu của chính mình.');
  const b = await readBody(req);
  if (!b.currentPassword || !b.newPassword || String(b.newPassword).length < 8) throw new HttpError(400, 'Mật khẩu mới phải từ 8 ký tự; cần nhập mật khẩu hiện tại.');
  const st = store.get('staff', idn.id);
  if (!st.login || !verifyPassword(b.currentPassword, st.login.passwordHash)) throw new HttpError(401, 'Mật khẩu hiện tại không đúng.');
  st.login.passwordHash = hashPassword(String(b.newPassword));
  st.login.mustChangePassword = false;
  store.put('staff', st);
  audit('staff-change-password', idn, st.id, 'ok');
  return { ok: true };
});
route('POST', '/api/director/logout', async (req, res, identity) => {
  if (identity.sessionId) { const s = store.get('sessions', identity.sessionId); if (s) { s.revoked = true; store.put('sessions', s); } }
  audit('director-logout', identity, 'logout', 'ok');
  return { ok: true };
});

/* --- Tổ chức: chức vụ / nhân viên / rule (Giám đốc) --- */
route('GET', '/api/roles', async (req, res, idn) => store.list('roles'));
route('POST', '/api/roles', async (req, res, idn) => {
  requireDirector(idn, 'create-role');
  const b = await readBody(req);
  if (!b.name) throw new HttpError(400, 'Thiếu tên chức vụ.');
  const role = { id: uid(), name: b.name, level: Number(b.level || 3), canApprove: !!b.canApprove, canManage: !!b.canManage };
  store.put('roles', role); audit('role-create', idn, role.id, 'ok'); broadcast('org', { change: 'role-create', role });
  return role;
});
route('DELETE', '/api/roles/:id', async (req, res, idn, p) => {
  requireDirector(idn, 'delete-role');
  const role = store.get('roles', p.id); if (!role) throw new HttpError(404, 'Không tìm thấy chức vụ.');
  if (role.canManage && !store.list('roles').some((r) => r.id !== p.id && r.canManage)) throw new HttpError(400, 'Không xoá được chức vụ quản trị cuối cùng.');
  if (store.list('staff').some((s) => s.roleId === p.id)) throw new HttpError(400, 'Còn nhân viên đang giữ chức vụ này.');
  store.del('roles', p.id); audit('role-delete', idn, p.id, 'ok'); broadcast('org', { change: 'role-delete', id: p.id });
  return { ok: true };
});
route('PATCH', '/api/roles/:id', async (req, res, idn, p) => {
  requireDirector(idn, 'update-role');
  const role = store.get('roles', p.id); if (!role) throw new HttpError(404, 'Không tìm thấy chức vụ.');
  const b = await readBody(req);
  const next = { ...role };
  if (b.name) next.name = b.name;
  if (b.level !== undefined) next.level = Number(b.level);
  if (b.canApprove !== undefined) next.canApprove = !!b.canApprove;
  if (b.canManage !== undefined) next.canManage = !!b.canManage;
  // Không được gỡ quyền quản trị khỏi chức vụ quản trị cuối cùng.
  if (!next.canManage && !store.list('roles').some((r) => r.id !== p.id && r.canManage)) throw new HttpError(400, 'Phải còn ít nhất một chức vụ có quyền quản trị.');
  store.put('roles', next); audit('role-update', idn, next.id, 'ok'); broadcast('org', { change: 'role-update', role: next });
  return next;
});
route('GET', '/api/staff', async (req, res, idn) => store.list('staff').map(sanitizeStaff));
route('POST', '/api/staff', async (req, res, idn) => {
  requireDirector(idn, 'create-staff');
  const b = await readBody(req);
  if (!b.name || !b.roleId || !store.get('roles', b.roleId)) throw new HttpError(400, 'Thiếu tên hoặc chức vụ không tồn tại.');
  let login = null;
  if (b.username) {
    if (store.list('staff').some((s) => s.login && s.login.username === b.username)) throw new HttpError(400, 'Tên đăng nhập đã tồn tại — mỗi tài khoản phải có username riêng.');
    if (!b.initialPassword || String(b.initialPassword).length < 8) throw new HttpError(400, 'Mật khẩu ban đầu phải từ 8 ký tự.');
    login = { username: b.username, passwordHash: hashPassword(String(b.initialPassword)), mustChangePassword: true, disabled: false };
  }
  const token = crypto.randomBytes(32).toString('hex');
  const st = { id: uid(), name: b.name, account: b.account || '', roleId: b.roleId, status: 'waiting', budget: b.budget ?? null, used: 0, resting: false, restedFully: false, login, tokenHash: sha256(token) };
  store.put('staff', st); audit('staff-create', idn, st.id, 'ok'); broadcast('org', { change: 'staff-create', id: st.id });
  return { id: st.id, token, warning: 'Mã token này chỉ hiện MỘT LẦN. Giao cho cầu nối của nhân viên và không ghi vào nhật ký.' };
});
route('POST', '/api/staff/:id/create-login', async (req, res, idn, p) => {
  requireDirector(idn, 'create-login');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  const b = await readBody(req);
  if (!b.username || !b.password || String(b.password).length < 8) throw new HttpError(400, 'Cần username và mật khẩu từ 8 ký tự.');
  if (store.list('staff').some((s) => s.id !== st.id && s.login && s.login.username === b.username)) throw new HttpError(400, 'Tên đăng nhập đã tồn tại.');
  st.login = { username: b.username, passwordHash: hashPassword(String(b.password)), mustChangePassword: true, disabled: false };
  store.put('staff', st); audit('login-create', idn, st.id, 'ok');
  return sanitizeStaff(st);
});
route('POST', '/api/staff/:id/reset-password', async (req, res, idn, p) => {
  requireDirector(idn, 'reset-password');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  if (!st.login) throw new HttpError(400, 'Nhân viên chưa có tài khoản đăng nhập — tạo tài khoản trước.');
  const b = await readBody(req);
  if (!b.password || String(b.password).length < 8) throw new HttpError(400, 'Mật khẩu mới phải từ 8 ký tự.');
  st.login.passwordHash = hashPassword(String(b.password));
  st.login.mustChangePassword = true;
  store.put('staff', st); audit('password-reset', idn, st.id, 'ok');
  return { ok: true, mustChangePassword: true };
});
route('POST', '/api/staff/:id/set-disabled', async (req, res, idn, p) => {
  requireDirector(idn, 'set-disabled');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  if (!st.login) throw new HttpError(400, 'Nhân viên chưa có tài khoản đăng nhập.');
  const b = await readBody(req);
  st.login.disabled = !!b.disabled;
  store.put('staff', st); audit(st.login.disabled ? 'login-disable' : 'login-enable', idn, st.id, 'ok');
  return sanitizeStaff(st);
});
route('PATCH', '/api/staff/:id', async (req, res, idn, p) => {
  requireDirector(idn, 'update-staff');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  const b = await readBody(req);
  if (b.roleId) { if (!store.get('roles', b.roleId)) throw new HttpError(400, 'Chức vụ không tồn tại.'); st.roleId = b.roleId; }
  if (b.name) st.name = b.name;
  if (b.account !== undefined) st.account = b.account;
  if (b.username !== undefined) {
    if (!st.login) throw new HttpError(400, 'Nhân viên chưa có tài khoản đăng nhập.');
    if (store.list('staff').some((s) => s.id !== st.id && s.login && s.login.username === b.username)) throw new HttpError(400, 'Tên đăng nhập đã tồn tại.');
    st.login.username = b.username;
  }
  if (b.disabled !== undefined) {
    if (!st.login) throw new HttpError(400, 'Nhân viên chưa có tài khoản đăng nhập.');
    st.login.disabled = !!b.disabled;
  }
  store.put('staff', st); audit('staff-update', idn, st.id, 'ok'); broadcast('org', { change: 'staff-update', id: st.id });
  return sanitizeStaff(st);
});
route('DELETE', '/api/staff/:id', async (req, res, idn, p) => {
  requireDirector(idn, 'delete-staff');
  store.del('staff', p.id); // Xoá nhân viên thu hồi cả mật khẩu lẫn token API ngay lập tức (doc chứa cả hai đều mất).
  store.list('sessions').filter((s) => s.staffId === p.id).forEach((s) => { s.revoked = true; store.put('sessions', s); });
  audit('staff-delete', idn, p.id, 'ok'); broadcast('org', { change: 'staff-delete', id: p.id });
  return { ok: true };
});
route('POST', '/api/staff/:id/rotate-token', async (req, res, idn, p) => {
  requireDirector(idn, 'rotate-token');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  const token = crypto.randomBytes(32).toString('hex');
  st.tokenHash = sha256(token); store.put('staff', st);
  audit('token-rotate', idn, st.id, 'ok');
  return { token, warning: 'Mã cũ vô hiệu tức thì. Mã mới chỉ hiện MỘT LẦN.' };
});
route('GET', '/api/rules', async (req, res, idn) => store.list('rules'));
route('POST', '/api/rules', async (req, res, idn) => {
  requireDirector(idn, 'create-rule');
  const b = await readBody(req);
  if (!b.text) throw new HttpError(400, 'Thiếu nội dung rule.');
  const rule = { id: uid(), text: b.text }; store.put('rules', rule);
  audit('rule-create', idn, rule.id, 'ok'); return rule;
});
route('DELETE', '/api/rules/:id', async (req, res, idn, p) => {
  requireDirector(idn, 'delete-rule');
  if (!store.get('rules', p.id)) throw new HttpError(404, 'Không tìm thấy rule.');
  store.del('rules', p.id); audit('rule-delete', idn, p.id, 'ok');
  return { ok: true };
});

/* --- Việc --- */
route('GET', '/api/jobs', async (req, res, idn) => store.list('jobs'));
route('POST', '/api/jobs', async (req, res, idn) => {
  if (idn.type !== 'director' && !idn.role.canApprove) throw new HttpError(403, 'Chỉ Giám đốc hoặc Leader mới được thêm/giao việc.');
  const b = await readBody(req);
  if (!b.name || !b.assigneeId || !b.reviewerId) throw new HttpError(400, 'Thiếu tên việc, người phụ trách hoặc người kiểm tra.');
  if (!store.get('staff', b.assigneeId) || !store.get('staff', b.reviewerId)) throw new HttpError(400, 'Người phụ trách hoặc người kiểm tra không tồn tại.');
  const links = Array.isArray(b.links) ? b.links.filter((l) => l && /^https?:\/\//.test(l.url)).map((l) => ({ url: l.url, title: l.title || l.url, by: idn.id, at: nowIso() })) : [];
  const job = { id: uid(), name: b.name, desc: b.desc || '', ruleId: b.ruleId || null, assigneeId: b.assigneeId, reviewerId: b.reviewerId, status: 'Chờ nhận', progress: 0, claimedBy: null, links, createdAt: nowIso(), createdBy: idn.id };
  store.put('jobs', job); audit('job-create', idn, job.id, 'ok');
  broadcast('job', { change: 'created', job });
  return job;
});
route('POST', '/api/jobs/:id/claim', async (req, res, idn, p) => {
  const job = store.get('jobs', p.id); if (!job) throw new HttpError(404, 'Không tìm thấy việc.');
  // Khoá nhận việc nguyên tử: kiểm tra + ghi trong cùng một lượt xử lý.
  if (job.status !== 'Chờ nhận') throw new HttpError(409, 'Việc không còn ở cột Chờ nhận.');
  if (job.claimedBy && job.claimedBy !== idn.id) throw new HttpError(409, 'Việc đã có người nhận — khoá nhận việc từ chối nhận trùng.');
  if (idn.id !== job.assigneeId) throw new HttpError(403, 'Chỉ người phụ trách được gán cho việc này mới nhận được việc.');
  const st = store.get('staff', idn.id);
  if (st.resting) throw new HttpError(403, 'Nhân viên đang nghỉ do chạm ngân sách — không nhận việc mới.');
  job.claimedBy = idn.id; job.status = 'Đang làm'; store.put('jobs', job);
  audit('job-claim', idn, job.id, 'ok'); broadcast('job', { change: 'claimed', job });
  return job;
});
route('POST', '/api/jobs/:id/submit', async (req, res, idn, p) => {
  // Chuyển Đang làm -> Chờ duyệt. Không có endpoint này ở bản cũ nên việc
  // không bao giờ lên được cột Chờ duyệt qua API (lỗi đã sửa).
  const job = store.get('jobs', p.id); if (!job) throw new HttpError(404, 'Không tìm thấy việc.');
  if (idn.id !== job.assigneeId) throw new HttpError(403, 'Chỉ người phụ trách mới trình việc lên kiểm tra.');
  if (job.status !== 'Đang làm') throw new HttpError(409, 'Việc chưa ở trạng thái Đang làm.');
  const b = await readBody(req);
  job.status = 'Chờ duyệt'; job.submittedAt = nowIso(); if (b.note) job.submitNote = b.note;
  store.put('jobs', job);
  audit('job-submit', idn, job.id, 'ok'); broadcast('job', { change: 'submitted', job });
  return job;
});
route('POST', '/api/jobs/:id/links', async (req, res, idn, p) => {
  const job = store.get('jobs', p.id); if (!job) throw new HttpError(404, 'Không tìm thấy việc.');
  const allowed = idn.type === 'director' || idn.id === job.assigneeId || idn.id === job.reviewerId;
  if (!allowed) throw new HttpError(403, 'Chỉ Giám đốc, người phụ trách hoặc người kiểm tra mới gắn link cho việc này.');
  const b = await readBody(req);
  if (!b.url || !/^https?:\/\//.test(b.url)) throw new HttpError(400, 'Link phải bắt đầu bằng http(s)://.');
  job.links = job.links || [];
  job.links.push({ url: b.url, title: b.title || b.url, by: idn.id, at: nowIso() });
  store.put('jobs', job);
  audit('job-link-add', idn, job.id, 'ok'); broadcast('job', { change: 'link-added', job });
  return job;
});
route('POST', '/api/jobs/:id/approve', async (req, res, idn, p) => {
  const job = store.get('jobs', p.id); if (!job) throw new HttpError(404, 'Không tìm thấy việc.');
  if (!idn.role.canApprove) throw new HttpError(403, 'Chức vụ hiện tại không có quyền duyệt việc.');
  if (idn.id === job.assigneeId) throw new HttpError(403, 'Cấm tự duyệt việc của chính mình.');
  if (job.status !== 'Chờ duyệt') throw new HttpError(409, 'Việc chưa ở cột Chờ duyệt.');
  const b = await readBody(req);
  job.status = 'Hoàn thành'; job.progress = 100; store.put('jobs', job);
  audit('job-approve', idn, job.id, 'ok', { note: b.note || '' });
  broadcast('job', { change: 'approved', job });
  return job;
});
route('POST', '/api/jobs/:id/return', async (req, res, idn, p) => {
  const job = store.get('jobs', p.id); if (!job) throw new HttpError(404, 'Không tìm thấy việc.');
  if (!idn.role.canApprove) throw new HttpError(403, 'Chức vụ hiện tại không có quyền duyệt việc.');
  if (idn.id === job.assigneeId) throw new HttpError(403, 'Cấm tự duyệt việc của chính mình.');
  const b = await readBody(req);
  if (!b.reason) throw new HttpError(400, 'Trả lại phải có lý do.');
  job.status = 'Đang làm'; job.progress = Math.min(job.progress, 40); store.put('jobs', job);
  audit('job-return', idn, job.id, 'ok', { reason: b.reason });
  broadcast('job', { change: 'returned', job, reason: b.reason });
  return job;
});

/* --- Phê duyệt: MỌI yêu cầu quyền của MỌI tài khoản Muse (quyết định 23:23+23:26) --- */
route('GET', '/api/approvals', async (req, res, idn) => store.list('approvals'));
route('GET', '/api/approvals/:id', async (req, res, idn, p) => {
  // Tài khoản xin phép tự đọc kết quả của chính yêu cầu của mình (để tiếp tục việc);
  // Giám đốc/Leader đọc được mọi yêu cầu. Nhân viên khác không đọc được yêu cầu của người khác.
  const ap = store.get('approvals', p.id); if (!ap) throw new HttpError(404, 'Không tìm thấy yêu cầu.');
  if (idn.type === 'staff' && ap.requesterId !== idn.id) throw new HttpError(403, 'Chỉ người yêu cầu và cấp duyệt mới đọc được yêu cầu này.');
  return ap;
});
route('POST', '/api/approvals', async (req, res, idn) => {
  const b = await readBody(req);
  if (!b.action || !b.reason) throw new HttpError(400, 'Thiếu hành động hoặc lý do (lý do bắt buộc).');
  const ap = { id: uid(), requesterId: idn.id, action: b.action, target: b.target || '', reason: b.reason, context: b.context || '', jobId: b.jobId || null, source: b.source || 'api', status: 'pending', at: nowIso() };
  store.put('approvals', ap); audit('approval-request', idn, ap.id, 'ok');
  broadcast('approval', { change: 'requested', approval: ap });
  return ap;
});
route('POST', '/api/approvals/:id/decide', async (req, res, idn, p) => {
  const ap = store.get('approvals', p.id); if (!ap) throw new HttpError(404, 'Không tìm thấy yêu cầu.');
  if (ap.status !== 'pending') throw new HttpError(409, 'Yêu cầu đã được quyết định.');
  const denied = canDecideApproval(idn, ap);
  if (denied) throw new HttpError(403, denied);
  const b = await readBody(req);
  if (!['approved', 'rejected'].includes(b.decision)) throw new HttpError(400, 'decision phải là approved hoặc rejected.');
  if (b.decision === 'rejected' && !b.note) throw new HttpError(400, 'Từ chối phải có lý do.');
  ap.status = b.decision; ap.decidedBy = idn.id; ap.decidedAt = nowIso(); ap.note = b.note || '';
  store.put('approvals', ap);
  audit('approval-decide', idn, ap.id, b.decision, { note: ap.note });
  broadcast('approval', { change: 'decided', approval: ap });
  return ap;
});

/* --- Ngân sách --- */
route('GET', '/api/budgets', async (req, res, idn) => store.list('staff').map((s) => ({ staffId: s.id, name: s.name, budget: s.budget, used: s.used, resting: s.resting })));
route('PATCH', '/api/budgets/:id', async (req, res, idn, p) => {
  requireDirector(idn, 'set-budget');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  const b = await readBody(req);
  if (b.budget !== undefined) st.budget = b.budget == null ? null : Math.max(0, Number(b.budget));
  // Giám đốc ghi nhận mức đã dùng (khi chưa có cầu nối đẩy số liệu) — có ghi nhật ký.
  if (b.used !== undefined) st.used = Math.max(0, Number(b.used));
  store.put('staff', st); audit('budget-set', idn, st.id, 'ok');
  checkBudgetAndRest(st);
  return { staffId: st.id, budget: st.budget, used: st.used };
});
route('POST', '/api/budgets/:id/topup', async (req, res, idn, p) => {
  requireDirector(idn, 'topup-budget');
  const st = store.get('staff', p.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  if (st.budget == null) throw new HttpError(400, 'Chưa đặt mức ngân sách.');
  st.budget = Math.round(st.budget * 1.5); st.resting = false; st.restedFully = false; st.status = 'waiting';
  store.put('staff', st); audit('budget-topup', idn, st.id, 'ok');
  broadcast('budget', { kind: 'topup', staffId: st.id, budget: st.budget });
  return { staffId: st.id, budget: st.budget };
});

/* --- Heartbeat + tin nhắn + ngữ cảnh --- */
route('POST', '/api/heartbeat', async (req, res, idn) => {
  const b = await readBody(req);
  const st = store.get('staff', idn.id); if (!st) throw new HttpError(404, 'Không tìm thấy nhân viên.');
  if (st.resting) {
    // Đang nghỉ: chỉ nhận nhịp "đang nghỉ", không nhận việc mới, không đổi trạng thái làm việc.
    broadcast('heartbeat', { staffId: st.id, status: 'resting', note: adaptiveHeartbeatNote(idn) });
    return { ok: true, resting: true };
  }
  if (b.status && ['working', 'waiting'].includes(b.status)) st.status = b.status;
  if (typeof b.used === 'number') st.used = Math.max(0, b.used);
  if (b.jobId) {
    const job = store.get('jobs', b.jobId);
    if (job && job.assigneeId === idn.id && typeof b.progress === 'number') { job.progress = Math.max(0, Math.min(100, b.progress)); store.put('jobs', job); }
  }
  store.put('staff', st);
  checkBudgetAndRest(st);
  broadcast('heartbeat', { staffId: st.id, status: st.status, progress: b.progress ?? null, blocked: b.blocked || null });
  return { ok: true, status: st.status };
});
/* --- Phòng chat: phòng chung ('room') + nhắn trực tiếp + gắn vào việc.
 * Mọi tin đều mang danh tính người gửi đã xác thực — không có tin nặc danh.
 * @tag: [ASK:Tên] hoặc @Tên trong nội dung -> taggedIds, người được nhắc
 * nhận thông báo ngay qua SSE và thấy tin trong mục "Nhắc tên tôi". */
function taggedIdsFor(text) {
  const ids = new Set();
  const staff = store.list('staff');
  const names = [
    ...String(text).matchAll(/\[ASK:([^\]]+)\]/g),
    ...String(text).matchAll(/@([A-Za-zÀ-ỹ]+)/g),
  ].map((m) => m[1].trim().toLowerCase());
  for (const name of names) {
    const hit = staff.find((s) => s.name.toLowerCase() === name);
    if (hit) ids.add(hit.id);
  }
  return [...ids];
}
route('POST', '/api/messages', async (req, res, idn) => {
  const b = await readBody(req);
  if (!b.to || !b.text) throw new HttpError(400, 'Thiếu người nhận hoặc nội dung.');
  if (b.to !== 'room' && !store.get('staff', b.to)) throw new HttpError(400, 'Người nhận không tồn tại.');
  if (b.jobId && !store.get('jobs', b.jobId)) throw new HttpError(400, 'Việc đính kèm không tồn tại.');
  let link = null;
  if (b.link) {
    if (!b.link.url || !/^https?:\/\//.test(b.link.url)) throw new HttpError(400, 'Link đính kèm phải bắt đầu bằng http(s)://.');
    link = { url: b.link.url, title: b.link.title || b.link.url };
  }
  const msg = { id: uid(), fromId: idn.id, toId: b.to, jobId: b.jobId || null, text: b.text, link, taggedIds: taggedIdsFor(b.text), at: nowIso() };
  store.put('messages', msg); audit('message', idn, msg.id, 'ok');
  broadcast('message', { message: msg });
  return msg;
});
route('GET', '/api/messages', async (req, res, idn, p, url) => {
  const jobId = url.searchParams.get('jobId');
  const to = url.searchParams.get('to');
  const all = store.list('messages');
  let out = all;
  if (jobId) out = out.filter((m) => m.jobId === jobId);
  else if (to === 'room') out = out.filter((m) => m.toId === 'room');
  else if (to) out = out.filter((m) => (m.fromId === idn.id && m.toId === to) || (m.fromId === to && m.toId === idn.id));
  else out = out.filter((m) => m.toId === 'room' || m.fromId === idn.id || m.toId === idn.id);
  return out.slice(-100);
});
route('GET', '/api/context', async (req, res, idn) => {
  // Gói ngữ cảnh NÉN (Module E): tóm tắt lăn + phần liên quan, không nạp toàn bộ lịch sử.
  const jobs = store.list('jobs').filter((j) => j.assigneeId === idn.id || j.reviewerId === idn.id);
  const decisions = store.list('approvals').filter((a) => a.status !== 'pending').slice(-5);
  const recent = store.list('audit').slice(-10).map((a) => ({ at: a.at, action: a.action, result: a.result }));
  return { kind: idn.type, staff: { id: idn.id, name: idn.staff.name, role: idn.role.name }, myJobs: jobs, recentDecisions: decisions, rollingSummary: recent, openDecisions: store.list('approvals').filter((a) => a.status === 'pending').length };
});
route('GET', '/api/audit', async (req, res, idn) => {
  requireDirector(idn, 'read-audit');
  return store.list('audit').slice(-100);
});
route('GET', '/api/alerts', async (req, res, idn) => {
  requireDirector(idn, 'read-alerts');
  return store.list('alerts').slice(-50);
});
route('GET', '/api/sessions', async (req, res, idn) => {
  requireDirector(idn, 'read-sessions');
  return store.list('sessions').map((s) => ({ id: s.id, staffId: s.staffId, createdAt: s.createdAt, expiresAt: s.expiresAt, revoked: s.revoked }));
});
route('POST', '/api/sessions/:id/revoke', async (req, res, idn, p) => {
  requireDirector(idn, 'revoke-session');
  const s = store.get('sessions', p.id); if (!s) throw new HttpError(404, 'Không tìm thấy phiên.');
  s.revoked = true; store.put('sessions', s);
  audit('session-revoke', idn, s.id, 'ok');
  return { ok: true };
});
route('POST', '/api/backup', async (req, res, idn) => {
  requireDirector(idn, 'manual-backup');
  const r = runBackup('manual');
  audit('backup', idn, 'backup', r.ok ? 'ok' : 'failed');
  return r;
});

/* --- Họp team: gọi họp, biên bản, việc phát sinh từ biên bản (tạo ở màn Việc) --- */
route('GET', '/api/meetings', async () => store.list('meetings').slice(-20));
route('POST', '/api/meetings', async (req, res, idn) => {
  if (idn.type !== 'director' && !idn.role.canApprove) throw new HttpError(403, 'Chỉ Giám đốc hoặc Leader mới gọi họp.');
  const b = await readBody(req);
  const mt = { id: uid(), title: b.title || 'Họp team', calledBy: idn.id, at: nowIso(), attendees: store.list('staff').map((s) => s.id), minutes: '', status: 'open' };
  store.put('meetings', mt); audit('meeting-call', idn, mt.id, 'ok'); broadcast('meeting', { change: 'called', meeting: mt });
  return mt;
});
route('PATCH', '/api/meetings/:id', async (req, res, idn, p) => {
  const mt = store.get('meetings', p.id); if (!mt) throw new HttpError(404, 'Không tìm thấy cuộc họp.');
  if (idn.type !== 'director' && !idn.role.canApprove && idn.id !== mt.calledBy) throw new HttpError(403, 'Chỉ Giám đốc, Leader hoặc người gọi họp mới sửa biên bản.');
  const b = await readBody(req);
  if (typeof b.minutes === 'string') mt.minutes = b.minutes;
  if (b.status) mt.status = b.status;
  store.put('meetings', mt); audit('meeting-minutes', idn, mt.id, 'ok'); broadcast('meeting', { change: 'minutes', meeting: mt });
  return mt;
});

/* --- Tải bộ kit cài cầu nối (cần đăng nhập; file trong thư mục kit/) --- */
const KIT_FILES = { 'bridge.js': 'bridge.js', 'install.sh': 'install.sh', 'install.bat': 'install.bat', 'config.example.json': 'config.example.json', 'README.md': 'README.md' };
route('GET', '/api/kit/:file', async (req, res, idn, p) => {
  const name = KIT_FILES[p.file]; if (!name) throw new HttpError(404, 'Không có file kit này.');
  const file = path.join(__dirname, '..', 'kit', name);
  const data = fs.readFileSync(file);
  res.writeHead(200, { 'Content-Type': name.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': data.length });
  res.end(data);
});

/* --- Kênh sự kiện SSE --- */
route('GET', '/api/events', async (req, res, idn, p, url) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`: connected ${nowIso()}\n\n`);
  sseClients.add(res);
  const keepalive = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { clearInterval(keepalive); } }, 25000);
  req.on('close', () => { clearInterval(keepalive); sseClients.delete(res); });
  // Giữ handler treo: trả về một promise không bao giờ resolve trong khi kết nối mở.
  await new Promise(() => {});
});

/* --------------------------- Phục vụ file tĩnh ---------------------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (rel.includes('..')) { sendJson(res, 400, { error: 'Đường dẫn không hợp lệ.' }); return true; }
  const file = path.join(WEB_DIR, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ------------------------------ Máy chủ HTTP ------------------------------ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      if (serveStatic(req, res, url.pathname)) return;
      sendJson(res, 404, { error: 'Không tìm thấy.' });
      return;
    }
    const m = matchRoute(req.method, url.pathname);
    if (!m) { sendJson(res, 404, { error: 'API không tồn tại.' }); return; }
    const isPublic = (req.method === 'GET' && url.pathname === '/api/health') || url.pathname === '/api/director/login' || url.pathname === '/api/staff/login' || url.pathname === '/api/setup/status' || url.pathname === '/api/setup';
    const identity = isPublic ? null : await authenticate(req, url);
    // Nhân viên đăng nhập bằng mật khẩu ban đầu BẮT BUỘC đổi mật khẩu trước
    // khi làm bất cứ việc gì khác (trừ đổi mật khẩu và đăng xuất).
    if (identity && identity.type === 'staff' && identity.viaSession && identity.mustChange &&
      url.pathname !== '/api/staff/change-password' && url.pathname !== '/api/director/logout') {
      sendJson(res, 403, { error: 'Bạn phải đổi mật khẩu ở lần đăng nhập đầu tiên trước khi làm việc khác.', mustChangePassword: true });
      return;
    }
    const out = await m.handler(req, res, identity, m.params, url);
    if (!res.writableEnded) sendJson(res, 200, out === undefined ? { ok: true } : out);
  } catch (e) {
    if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
    else { console.error(e); if (!res.writableEnded) sendJson(res, 500, { error: 'Lỗi máy chủ nội bộ.' }); }
  }
});
server.listen(PORT, () => {
  console.log(`[office] Máy chủ Trung tâm điều hành đang chạy: http://localhost:${PORT}`);
  console.log(`[office] Lưu trữ: ${store.kind} (${store.file})`);
  console.log(`[office] Sao lưu: ${BACKUP_DIR} (mỗi ${Math.round(BACKUP_INTERVAL_MS / 60000)} phút, giữ 20 bản)`);
  console.log(`[office] Kiểm tra sức khoẻ: curl http://localhost:${PORT}/api/health`);
  console.log(`[office] Hộp thư cảnh báo (WhatsApp qua lịch giao việc của Muse): ${ALERT_OUTBOX}`);
  console.log('[office] Điểm kiểm tra độc lập: chạy server/healthcheck.js trên một tiến trình/máy khác để phát hiện máy chủ ngừng.');
  if (directorNeedsSetup()) {
    console.log('[office] CHƯA CÓ TÀI KHOẢN GIÁM ĐỐC — mở trang web và làm theo màn hình Cài đặt lần đầu (đặt mật khẩu + quét mã TOTP). Không có mật khẩu mặc định. Hoặc đặt OFFICE_DIRECTOR_PASSWORD_HASH (scrypt) + OFFICE_DIRECTOR_TOTP_SECRET.');
  }
  console.log('[office] Tự khởi động lại: xem server/office.service.example (systemd) hoặc chạy cùng tài khoản. Watchdog: cầu nối tự hồi phục có lùi dần (server/bridge.js).');
});
process.on('SIGINT', () => { store.close(); process.exit(0); });
process.on('SIGTERM', () => { store.close(); process.exit(0); });
