// Headless CDP check for the redesigned chat screen (local server + demo mode).
// Node 24 native fetch + WebSocket. Usage: node cdp-test.js
const CDP = 'http://127.0.0.1:9223';
const BASE = 'http://127.0.0.1:8901/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let targets;
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(CDP + '/json/list'); targets = await r.json(); break; }
    catch { await sleep(500); }
  }
  if (!targets) throw new Error('no CDP targets');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') consoleErrors.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text || 'exception');
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map((a) => a.value || a.description || '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res) => { const m = ++id; pending.set(m, res); ws.send(JSON.stringify({ id: m, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r?.exceptionDetails) return { __error: r.exceptionDetails?.exception?.description || r.exceptionDetails?.text };
    return r?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE });
  // Wait for the login screen (probeServer may take a while offline).
  let boot = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    boot = await evalJs(`({loginVisible: !document.getElementById('login-view').hidden, demoVisible: !document.getElementById('demo-enter').hidden, serverState: document.getElementById('server-state').textContent, bootErr: document.getElementById('boot-error').textContent})`);
    if (boot && boot.loginVisible) break;
  }
  console.log('BOOT:', JSON.stringify(boot));
  // Enter demo mode.
  await evalJs(`document.getElementById('demo-enter').click(); 'ok'`);
  await sleep(1500);
  const inApp = await evalJs(`({appVisible: !document.getElementById('app-view').hidden, hash: location.hash})`);
  console.log('INAPP:', JSON.stringify(inApp));
  // Go to chat.
  await evalJs(`location.hash = '#/chat'; 'ok'`);
  await sleep(1500);
  const chat = await evalJs(`({hasLog: !!document.getElementById('chat-log'), hasForm: !!document.getElementById('chat-form'), hasToggle: !!document.getElementById('chat-link-toggle'), linkRowHidden: document.getElementById('chat-link-row')?.hidden, hasTagPick: !!document.getElementById('tag-pick'), hasJob: !!document.getElementById('chat-job'), hasText: !!document.getElementById('chat-text'), msgCount: document.querySelectorAll('#chat-log .msg').length, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, formBottom: Math.round(document.getElementById('chat-form').getBoundingClientRect().bottom), innerH: window.innerHeight, pageScrollH: document.documentElement.scrollHeight})`);
  console.log('CHAT:', JSON.stringify(chat));
  // Link toggle works?
  const toggle = await evalJs(`(function(){document.getElementById('chat-link-toggle').click(); return document.getElementById('chat-link-row').hidden;})()`);
  console.log('LINK ROW HIDDEN AFTER TOGGLE (expect false):', toggle);
  await evalJs(`document.getElementById('chat-link-toggle').click(); 'ok'`);
  // Send a message in demo mode — must appear exactly once.
  const before = await evalJs(`document.querySelectorAll('#chat-log .msg').length`);
  await evalJs(`(function(){const ta=document.getElementById('chat-text'); ta.value='Kiểm tra nhân đôi 06:35'; ta.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('chat-form').requestSubmit(); return 'sent';})()`);
  await sleep(1200);
  const after = await evalJs(`({count: document.querySelectorAll('#chat-log .msg').length, newOnes: [...document.querySelectorAll('#chat-log .msg')].filter(e=>e.textContent.includes('Kiểm tra nhân đôi')).length, scrollW: document.documentElement.scrollWidth})`);
  console.log('SEND before=', before, 'after=', JSON.stringify(after));
  // Screenshot of the chat screen.
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync('/tmp/chat-verify/chat-390.png', Buffer.from(shot.data, 'base64'));
  console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors));
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
