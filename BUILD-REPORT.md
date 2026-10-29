# BÁO CÁO XÂY DỰNG — Rebuild: Trung tâm điều phối (hệ thống thật)

Ngày rebuild: 30/10/2026, ~05:00–06:30 +07 (giờ Sài Gòn). Người xây: Muse (subagent rebuild).
Repo đích: `chungdenroi/ai-office-3d` (public). Phòng họp cũ (`~/workspace/ai-company/`)
không bị động vào. Không push/deploy/touch git trong quá trình rebuild (phần deploy
do agent cha đảm nhiệm).

## 0. Vì sao rebuild

Bản build 29/10/2026 đã xây lại **file phác thảo** của Giám đốc thành một trang dài
kiểu landing page, đầy lỗi. Giám đốc từ chối thẳng (30/10/2026 04:37 +07): "web đó
có giống hệ thống ko? Ko hề. Nó như kiểu cái landing page trải dài. Lỗi thì 1 đống."
Kèm ảnh chụp mobile 390px cho thấy: nút camera đang chọn trắng tinh không đọc được
nhãn; bấm thêm thì trắng trang; nhãn tên nhân vật quá nhỏ; panel hồ sơ lệch/cắt chữ;
không có phòng chat; không giống trung tâm điều phối.

Bản này **thay toàn bộ `web/`** bằng vỏ ứng dụng thật, giữ + sửa `server/`, giữ `kit/`.

Nguồn yêu cầu: `/tmp/spec.txt` (11 mục) + `~/workspace/ai-company/STATE.md` §§1–2 +
3 quyết định Giám đốc 29/10/2026 23:23 + phụ lục 23:26/23:27 + ảnh chụp lỗi 30/10
04:36 + yêu cầu phòng chat 04:41.

## 1. Cái đã xây lại

### 1.1. Vỏ ứng dụng — `web/` (viết mới hoàn toàn)

| File | Vai trò |
|---|---|
| `web/index.html` | Màn hình đăng nhập/cài đặt lần đầu + vỏ app (topbar, sidebar, bottom nav cố định, modal, toast). Không nội dung hệ thống nào hiện trước khi đăng nhập. |
| `web/app.js` | Toàn bộ logic: API client, bản demo ngoại tuyến (ghi nhãn DEMO), SSE + thăm dò dự phòng, router, 9 màn hình, mô-đun 3D, chat. |
| `web/style.css` | Giao diện trung tâm điều phối: nền sáng, thẻ trắng, topbar tối, huy hiệu chờ duyệt đỏ không thể bỏ qua, nút chạm ≥44px, bottom nav cố định trên mobile. |

**9 màn hình làm việc thật** (không còn mục trình bày phác thảo trên các màn làm việc):

1. **Văn phòng 3D** (mặc định): sân 3D toàn chiều cao + panel hồ sơ/trạng thái/hoạt
   động; camera 4 góc + kéo xoay/pinch; bấm nhân vật xem hồ sơ; gọi họp + biên bản.
   Nội dung phác thảo chuyển hết vào màn Tài liệu.
2. **Phòng chat** (MỚI — Giám đốc yêu cầu 04:41): phòng chung + nhắn trực tiếp, tin
   tới live qua SSE, nhắc tên `[ASK:Tên]`/`@Tên` báo ngay (toast + mục "Nhắc tên
   tôi"), tin gắn vào việc (hiện trong luồng việc), link đính kèm, lịch sử lưu
   trên máy chủ. Quy tắc phòng hiển thị ngay trên màn hình.
3. **Việc**: Kanban 4 cột, tạo/giao việc, nhận nguyên tử, trình duyệt, duyệt/trả
   lại có lý do, link đính kèm, luồng trao đổi trong từng việc.
4. **Phê duyệt**: hàng đợi MỌI yêu cầu quyền (đăng nhập, tải file, cài app + 5 nhóm),
   duyệt/từ chối có lý do, cấm tự duyệt ở cả UI lẫn API, lịch sử quyết định.
5. **Nhân sự & chức vụ**: CRUD chức vụ (cấp, được duyệt, được quản trị), CRUD nhân
   viên, tạo tài khoản đăng nhập, đặt lại MK, khoá/mở, cấp/thu hồi mã API (hiện
   một lần). Quyền luôn tính từ dữ liệu chức vụ hiện tại — không ghi cứng theo tên.
6. **Ngân sách**: mức theo từng người (Giám đốc sửa), cảnh báo 80%, nghỉ ở 100%,
   nạp thêm 50%; số "đã dùng" do cầu nối đẩy lên hoặc Giám đốc ghi nhận có nhật ký.
7. **Nhật ký**: cảnh báo, phiên đăng nhập (thu hồi), nhật ký kiểm toán (Giám đốc).
8. **Cài đặt & kit**: địa chỉ API, tải file kit qua API, xuất dữ liệu JSON, đổi
   danh tính demo, thông tin phiên.
9. **Tài liệu**: nội dung phác thảo (mô-đun, ghi công §8, lộ trình, quyết định đã
   chốt, hướng dẫn cài cầu nối) — một màn riêng, không trộn vào màn làm việc.

**Dữ liệu:** máy chủ là nguồn sự thật duy nhất (cùng nguồn khi chạy `node server.js`;
địa chỉ API đổi được ở Cài đặt). localStorage chỉ là bản dùng thử ngoại tuyến, ghi
nhãn DEMO ở topbar + mọi màn hình, cùng ngữ nghĩa bảo mật (không tự duyệt, ngân
sách nghỉ/nạp) để lái thử luồng.

### 1.2. Máy chủ — `server/server.js` (giữ, sửa 10 điểm — xem §2)

Giữ nguyên kiến trúc zero-dependency (REST + SSE + SQLite `node:sqlite`, fallback
JSON, sao lưu, phân quyền ở máy chủ, phục vụ `web/` cùng nguồn). Thêm: cài đặt lần
đầu, endpoint trình việc + sửa chức vụ + họp + tải kit + phòng chat đầy đủ, mật khẩu
Giám đốc scrypt, các lỗi 500 đã vá.

### 1.3. Kit — giữ nguyên

`kit/bridge.js`, `config.example.json`, `install.sh`, `install.bat`, `README.md`
không đổi nội dung; `install.sh --dry-run` chạy đạt. Tải kit giờ làm được ngay
trong web qua `GET /api/kit/:file` (cần đăng nhập).

## 2. BUGS-FIXED — lỗi tìm thấy và cách sửa

### 2.1. Lỗi máy chủ (tìm bằng đọc code + kiểm thử hợp đồng)

| # | Lỗi | Sửa |
|---|---|---|
| S1 | Mật khẩu Giám đốc băm SHA-256 qua biến môi trường (yêu cầu: lên scrypt như nhân viên) | `verifyDirectorPassword` + `verifyScryptFormat`: chấp nhận chuỗi `salt:hash` scrypt; chuỗi hex SHA-256 cũ vẫn đăng nhập được kèm cảnh báo chuyển đổi (tương thích ngược, đã kiểm thử). |
| S2 | **Không có endpoint trình việc**: việc không bao giờ lên được cột "Chờ duyệt" qua API | Thêm `POST /api/jobs/:id/submit` (chỉ người phụ trách, chỉ từ "Đang làm"). |
| S3 | **Không có endpoint sửa chức vụ** | Thêm `PATCH /api/roles/:id` (Giám đốc), kèm chặn gỡ quyền quản trị khỏi chức vụ quản trị cuối cùng. |
| S4 | `verifyTotp` nổ 500 với mã sai độ dài (`timingSafeEqual` lệch độ dài) | Kiểm tra định dạng 6 chữ số trước, trả false — không bao giờ 500. Đã kiểm thử (mã 5 số, mã chữ → 401). |
| S5 | So sánh hash phiên Giám đốc nổ 500 khi biến môi trường không phải hex 64 ký tự | `verifyDirectorPassword` kiểm tra độ dài trước khi so sánh. |
| S6 | So sánh `tokenHash` nhân viên nổ 500 khi lệch độ dài | Kiểm tra độ dài trước `timingSafeEqual` trong `authenticate`. |
| S7 | `/api/context` trả `openDecisions: 0` ghi cứng | Đếm thật số phê duyệt đang chờ. |
| S8 | Không có endpoint họp team (luồng gọi họp/biên bản chỉ có ở UI cũ) | Thêm `GET/POST /api/meetings` + `PATCH /api/meetings/:id` (biên bản, đóng họp), kèm broadcast SSE. |
| S9 | Không có endpoint xoá rule | Thêm `DELETE /api/rules/:id` (Giám đốc). |
| S10 | Tin nhắn không gửi được vào phòng chung; không có tag/link; không lọc theo người nhận | `POST /api/messages` chấp nhận `to: 'room'`, tính `taggedIds` từ `[ASK:Tên]`/`@Tên`, nhận `link {url,title}`; `GET` lọc `?to=` / `?jobId=`. |
| S11 | Tạo nhân viên qua API cần `initialPassword`, web cũ gửi `password` (tìm thấy khi kiểm thử) | Web gửi đúng `initialPassword`. |
| S12 | `PATCH /api/budgets/:id` không ghi nhận được mức "đã dùng" thủ công | Thêm `used` (Giám đốc, có nhật ký, kích hoạt chuyển trạng thái nghỉ). |
| S13 | `/api/context` không nói rõ loại phiên, nên web phải thăm dò `/api/audit` để phân biệt Giám đốc/nhân viên — mỗi lần thăm dò bằng token nhân viên bị máy chủ ghi thành cảnh báo bảo mật (nhiễu hộp thư) | Thêm trường `kind: idn.type` vào `/api/context`; web đọc loại phiên từ đó, chỉ thăm dò audit khi máy chủ cũ không trả `kind`. |

### 2.2. Lỗi web — 6 lỗi trong ảnh chụp của Giám đốc (30/10 04:36, mobile ~390px)

| # | Lỗi trong ảnh | Nguyên nhân gốc (đã xác nhận bằng đọc code cũ) | Sửa + kiểm chứng |
|---|---|---|---|
| W1 | Nút camera đang chọn trắng tinh, mất nhãn | Xung đột độ ưu tiên CSS: `.stage .camrow button` (nền trắng) thắng rule toàn cục `button[aria-pressed="true"]` (chữ trắng) → chữ trắng trên nền trắng | Rule trạng thái chọn đặt CẢ nền + chữ trong cùng rule có độ ưu tiên cao nhất, cho mọi control (`style.css`). Kiểm chứng: bấm nhanh 5 vòng 4 nút camera, đo tương phản thực tế của nút đang chọn (tỷ lệ > 3) — PASS. |
| W2 | Bấm thêm thì trắng tinh cả khung nhìn | Bản cũ vẽ lại vùng quanh sân + không xử lý mất context WebGL / lỗi JS | Canvas tạo một lần, dữ liệu đổi chỉ cập nhật panel + đồng bộ 3D (không vẽ lại sân); `webglcontextlost` → chuyển dạng 2D + thông báo; `window.onerror` → banner chữ thường, không trắng trang. Kiểm chứng: bấm camera nhanh + xoay màn hình, sân không trống, 0 lỗi JS — PASS. |
| W3 | Nhãn tên/chức vụ trên nhân vật quá nhỏ, không đọc được | Sprite nhãn cũ 256×96 co về 1.5 đơn vị thế giới | Sprite 448×152, chữ tên 52px/chức vụ 34px, nền trắng đặc viền đậm, scale 2.6×0.88, `depthTest:false`. Đã kiểm chứng trực quan 30/10 (xem §2.4, ảnh `shot-office-3d-*.png`). |
| W4 | Panel hồ sơ: bảng 2 cột lệch, chữ cắt ở mép | Dùng bảng 2 cột trên mobile | Hàng định nghĩa xếp chồng (nhãn trên, giá trị dưới, `.kv`), không bảng. Kiểm chứng: mọi `dd` không tràn ở 390px — PASS. |
| W5 | Trông như landing page, không giống trung tâm điều phối | Trang dài trình bày phác thảo, không có vỏ ứng dụng | Vỏ app thật: topbar tối + trạng thái trực tuyến + huy hiệu chờ duyệt đỏ, sidebar/bottom nav, màn hình làm việc dày đặc có tổ chức, KPI. Ảnh chụp kiểm chứng ở `docs/screenshots-390px/`. |
| W6 | Menu mobile không cố định dưới | Không có bottom nav | Bottom nav `position:fixed` đáy viewport, ≥52px/mục, mục đang chọn nền tối + nhãn rõ, nội dung đệm đáy 110px. Kiểm chứng: cuộn tới cuối trang, nav vẫn dính đáy — PASS. |

### 2.3. Lỗi web khác tìm thấy khi kiểm thử trình duyệt

| # | Lỗi | Sửa |
|---|---|---|
| W7 | Form đăng nhập gửi theo cách truyền thống (tải lại trang) nếu người dùng bấm Đăng nhập trong lúc probe máy chủ chưa xong — vì `bindLogin()` chạy sau các lần fetch | `bindLogin()` chạy đồng bộ đầu `boot()`, kèm chặn gắn lặp (idempotent) vì `boot()` chạy lại sau đăng xuất. |
| W8 | Tab Nhân viên không gửi được form: trường `required` của khung Giám đốc đang ẩn vẫn chặn kiểm tra hợp lệ ở Chrome headless (gửi im lặng, không lỗi, không token) | Khi chuyển tab, vô hiệu hoá (`disabled`) trường ở khung ẩn + trạng thái ban đầu. Đã kiểm thử lại: đăng nhập nhân viên đi qua được. |
| W9 | Sau đổi mật khẩu lần đầu, `Session.me` không được gán → tin nhắn DM gửi đi không hiện trong log (bộ lọc dùng `Session.me.id`) | `enterApp()` lấy danh tính phiên qua `/api/context` nếu chưa có. Đã kiểm thử: DM 2 phiên live. |
| W10 | Nút camera/nhãn menu dưới "Văn phòng" bị ngắt dòng, chữ "phòng" cắt ở mép dưới khi mục đang chọn (phát hiện khi xem ảnh chụp kiểm thử) | `.bn-label` không ngắt dòng, cỡ 11px. |
| W11 | Nhật ký hoạt động ghi trùng lặp "Cảnh 3D không tải được" khi vào lại màn Văn phòng | `feedAdd` bỏ qua trùng lặp liên tiếp. |
| W12 | Mỗi lần nhân viên đăng nhập web bằng luồng đổi MK lần đầu, web thăm dò `/api/audit` để biết loại phiên → máy chủ ghi cảnh báo bảo mật giả vào hộp thư (3 cảnh báo trong lúc kiểm thử) | Web đọc `kind` từ `/api/context` (xem S13). Kiểm chứng: chạy lại luồng đăng nhập nhân viên, hộp thư cảnh báo không ghi thêm gì. |

### 2.4. Lỗi 3D fatal trên bản live (phát hiện khi kiểm chứng trình duyệt thật, 30/10 05:21–05:24 +07 — SAU khi rebuild xong)

| # | Lỗi | Nguyên nhân gốc (đã tái hiện và xác nhận) | Sửa + kiểm chứng |
|---|---|---|---|
| W13 | Màn Văn phòng 3D chết hẳn trên bản live: sau ~8 giây "Đang tải cảnh 3D…" toàn bộ màn hình bị thay bằng "Không tải được màn hình này / THREE is not defined" (tái hiện ổn định 3/3 lần). Dạng 2D không bật lên. | `buildRoom()` và `buildBoard()` trong `Office3D` dùng biến trần `THREE.*` trong khi chỉ khai báo `const T = this.three` — `THREE` chỉ tồn tại dưới dạng binding cục bộ trong `init()`, còn hai method kia ở ngoài phạm vi nên ném `ReferenceError`. Khi CDN bị chặn (môi trường thử nghiệm) thì `import()` thất bại trước, rơi về 2D nên lỗi bị che — chỉ khi CDN tải được (trình duyệt live) thì import thành công rồi `buildRoom()` mới ném lỗi, leo lên thành màn hình fatal. | (1) `buildRoom`/`buildBoard`: 39 chỗ `THREE.` → `T.`; sau sửa, grep còn `THREE.` chỉ trong `init()`/`buildStage()` nơi `THREE` là tham số/binding cục bộ. (2) Tách `buildStage()` khỏi `init()`: mọi lỗi dựng cảnh rơi vào catch của `init()` → trả `{ok:false}` → dạng 2D, không bao giờ leo lên màn hình fatal; vòng lặp vẽ có try/catch riêng → lỗi giữa chừng cũng chuyển 2D. (3) `renderOffice` bọc `await Office3D.init()` trong try/catch → 2D. (4) Thư viện Three.js r160 đưa vào repo: `web/vendor/three.module.js` (1.272.972 byte, MIT, md5 `a762b8588c6abf23cb87624360d014c4`) — loader thử file cùng nguồn trước, rồi jsDelivr → unpkg → cdnjs, mỗi lần thử trần 10 giây; importmap trỏ về file vendor. Kiểm chứng: tái hiện lỗi trước sửa bằng CDP + Fetch.fulfillRequest (CDN trả three thật) → đúng màn hình fatal "THREE is not defined"; sau sửa chạy lại 15/15 PASS (xem §3 Cổng 6). |
| W14 | Dòng "Đang tải cảnh 3D…" nằm lại trên đầu khung vẽ sau khi cảnh dựng xong, bị nút camera che một phần (thấy trên ảnh chụp kiểm thử desktop + 390px). | `buildStage` thêm canvas vào `#stage-box` mà không xoá đoạn `<p>` tải trang đã ghi trước đó. | `box.innerHTML = ''` trước `appendChild(canvas)`. Kiểm chứng: `loadingP === false` sau dựng cảnh. |
| W15 | Dòng gợi ý "Kéo để xoay…" (desktop) bị nút camera "Theo người" che một phần (ghi trong báo cáo kiểm chứng live). | `.stage-help` đặt tuyệt đối góc trên-phải, chồng lên `.camrow` khi hàng nút dài. | `.stage-help` + `.stage-credit` chuyển sang luồng thường dưới khung vẽ; đo rect: không còn chồng lấn (`helpOverlapCam === false`) ở cả desktop và 390px. |

## 3. Kiểm thử — bằng chứng theo cổng

Môi trường: Node v24.22.1, SQLite `node:sqlite`, DB tạm riêng cho từng bộ kiểm thử
(`OFFICE_DATA_DIR` trỏ thư mục tạm — lưu ý: biến đúng là `OFFICE_DATA_DIR`, không
phải `OFFICE_DIR`; xem §4.1 về sự cố DB thật trong lúc kiểm thử và cách dọn sạch).

### Cổng 1 — Cú pháp + vệ sinh code: PASS

- `node --check` đạt cho `server.js`, `bridge.js`, `healthcheck.js`, `web/app.js`.
- Grep: 0 `TODO`/`FIXME`/`XXX`/`HACK`; 0 secret (mật khẩu/token/khoá) trong
  `web/` + `server/` + `kit/` (email Giám đốc trong seed là dữ liệu danh tính theo
  STATE.md, không phải secret).

### Cổng 2 — Máy chủ khởi động + `/health`: PASS

- Khởi động với DB tạm, `/api/health` 200, `store: sqlite`, seed đúng 5 nhân viên /
  4 chức vụ / 2 rule.

### Cổng 3 — Hợp đồng API (script `/tmp/test-api.mjs`, DB tạm, 3 máy chủ): 70/70 PASS

Ma trận: 401 khi thiếu token; 403 ma trận quyền (nhân viên thường tạo việc/gọi họp/
đọc yêu cầu người khác/sửa ngân sách); 404/409/400 đúng chỗ. Bao gồm:

- Đăng nhập Giám đốc: sai MK → 401; TOTP 5 số/chữ → 401 (không 500); đúng → 200,
  phiên gắn `s-chung`; hash SHA-256 cũ vẫn vào được (cảnh báo).
- Cài đặt lần đầu (DB mới, không env): `needsSetup=true` → MK ngắn/không khớp → 400
  → tạo xong trả secret 1 lần → `needsSetup=false` → gọi lại → 403 → đăng nhập bằng
  tài khoản setup (scrypt trong store) → 200; credential trong SQLite đúng định dạng
  `salt:hash`.
- Chức vụ: tạo/sửa/xoá; chặn gỡ `canManage` khỏi chức vụ quản trị cuối (400).
- Nhân viên: tạo + đăng nhập lần đầu bắt đổi MK → đổi MK → vào được; `initialPassword`.
- Việc: nhận sai người → 403; nhận lần 2 → 409; submit → "Chờ duyệt" (endpoint mới);
  submit lần 2 → 409; tự duyệt → 403; trả lại không lý do → 400, có lý do → 200;
  gắn link đúng/sai scheme → 200/400.
- Phê duyệt: tạo → 201 trạng thái pending; tự duyệt → 403; người không liên quan đọc
  → 403; từ chối không lý do → 400; quyết định lần 2 → 409.
- Ngân sách: 79/100 → bình thường; 100/100 → `resting=true` + cảnh báo `budget-full`;
  nạp thêm → 150, hết nghỉ. `openDecisions` đếm thật.
- Chat: phòng chung + tag `[ASK:Tuấn]` → `taggedIds` có `s-tuan` + link; DM; người
  nhận không tồn tại → 400; link sai scheme → 400.
- Họp: nhân viên thường → 403; Leader → 200; sửa biên bản → 200.
- Kit: `bridge.js` tải được, nội dung thật; file lạ → 404.
- SSE: tạo việc → sự kiện `job` tới trong 8s.
- Bridge round-trip: `bridge.js --request-approval` gửi yêu cầu → duyệt qua API →
  bridge in "ĐÃ ĐƯỢC DUYỆT", thoát 0; người yêu cầu đọc lại được quyết định.
- Bền bỉ: khởi động lại cùng DB → việc + tin nhắn còn nguyên.

### Cổng 4 — Trình duyệt thật (chrome-headless-shell qua CDP, script `/tmp/cdp-test.mjs`): 28/28 PASS

Hai phiên song song (Giám đốc + nhân viên mới), viewport 390×844, gồm:

- Đăng nhập trước, nội dung app ẩn; trạng thái máy chủ "Đã nối"; đăng nhập Giám đốc
  qua UI; topbar + huy hiệu chờ duyệt ẩn khi 0 yêu cầu.
- Sân văn phòng có nội dung, không trắng; bấm camera nhanh 5 vòng: sân không trống,
  nút đang chọn tương phản tốt, 0 lỗi JS; xoay ngang 844px: không tràn ngang; menu
  dưới FIXED dính đáy khi cuộn; không tràn ngang 390px; mục menu đang chọn rõ nhãn;
  hồ sơ xếp chồng không tràn/cắt.
- Tạo việc qua UI → Kanban; gửi yêu cầu phê duyệt qua UI → huy hiệu 1; tự duyệt bị
  chặn ở UI; duyệt yêu cầu người khác → ghi nhận; gửi tin `[ASK:Tuấn]` → log + ghi
  nhắc tên.
- Nhân viên mới: bắt đổi MK lần đầu → đổi qua UI → vào app; DM 2 phiên tới live qua
  SSE không tải lại; `[ASK:Chung]` → toast thông báo ngay cho Giám đốc.
- Ngân sách 1000/850 qua UI → cảnh báo "Sắp chạm"; thêm chức vụ qua UI → hiện bảng.
- 0 lỗi JS/console-error trong cả 2 phiên.
- Ảnh chụp 390px: `docs/screenshots-390px/shot-office-390.png`,
  `docs/screenshots-390px/shot-chat-390.png` (xem trực tiếp để đối chiếu với ảnh lỗi cũ).

### Cổng 5 — Kit: PASS

- `bash kit/install.sh --dry-run` → đạt (Node v24 OK, không ghi file).

### Cổng 6 — Sửa lỗi 3D live (30/10, script `/tmp/verify-3d-fix.mjs` + `/tmp/verify-3d-fix2.mjs` + `/tmp/verify-bottomnav.mjs`, máy chủ thật + DB tạm, chrome-headless-shell qua CDP, WebGL phần mềm SwiftShader): 15/15 PASS + 8/9 PASS (1 FAIL là phép đo sai của script, xem ghi chú)

- Tái hiện trước sửa: Fetch.fulfillRequest trả three.module.js thật cho request jsDelivr → màn hình fatal "THREE is not defined", `Office3D.hasThree=true, hasRenderer=true, chars=0` (xem §2.4 W13).
- Sau sửa, GĐ A (chặn mọi CDN, chỉ file vendor cùng nguồn): canvas 3D dựng được, đủ 5 nhân vật, `ready=true`, không fatal, không "THREE is not defined", không ở dạng 2D; bấm nhanh 5 vòng 4 nút camera + đổi 390px: canvas còn nguyên, nút đang chọn đọc được, dòng gợi ý không chồng nút camera; 0 lỗi JS.
- GĐ B (chặn cả vendor lẫn CDN): dạng 2D đầy đủ thao tác, không fatal, không "THREE is not defined", không canvas dở dang.
- Kiểm chứng lần 2 (sau sửa W14): dòng "Đang tải" không còn trong khung vẽ; không tràn ngang ở 1280px (`scrollWidth 1265 ≤ innerWidth 1280`) và ở cửa sổ 390px thật (`scrollWidth 375 ≤ innerWidth 390`, khung 3D nằm trong viewport); menu dưới `position:fixed`, `bottom == innerHeight`, hiển thị đúng ở 390px.
- Ghi chú phép đo: ở lượt chạy `/tmp/verify-3d-fix2.mjs`, 1/9 FAIL (C9) do script so nhầm `bottom` (toạ độ Y) với `innerWidth` (chiều rộng) và do `Emulation.setDeviceMetricsOverride` trong headless-shell báo viewport 721px thay vì 390px; đã kiểm tra lại đúng bằng cửa sổ 390px thật (`/tmp/verify-bottomnav.mjs`): nav dính đáy đúng.
- Ảnh chụp: `docs/screenshots-390px/shot-office-3d-390.png` (390px, cảnh 3D + menu dưới), `docs/screenshots-390px/shot-office-3d-desktop.png` (desktop, cảnh 3D + nhãn đọc được).

## 4. Sự cố trong lúc kiểm thử (đã xử lý, ghi để tránh lặp lại)

### 4.1. Kiểm thử đã ghi nhầm vào DB thật — ĐÃ DỌN SẠCH

Bộ kiểm thử API ban đầu dùng nhầm biến `OFFICE_DIR` (máy chủ không đọc biến này;
biến đúng là `OFFICE_DATA_DIR`), nên 2 lượt chạy đầu ghi vào
`server/data/office.db` thật: 1 nhân viên thử nghiệm + 4 phiên + 45 dòng nhật ký
kiểm toán (toàn bộ trong khung giờ kiểm thử). Đã xoá hết bằng SQL trực tiếp
(backup file ô nhiễm giữ tại `/tmp/office.db.before-cleanup`), kiểm chứng lại:
DB thật chỉ còn seed gốc — 4 chức vụ, 2 rule, 5 nhân viên, không còn dòng nào khác.
Không có credential Giám đốc nào bị ghi vào DB thật. Các lượt kiểm thử sau dùng
`OFFICE_DATA_DIR` trỏ thư mục tạm và dùng tên thư mục duy nhất mỗi lượt.
Hộp thư cảnh báo `server/alerts/outbox.jsonl` cũng nhận 8 cảnh báo thử nghiệm
(5 budget-full + 3 thăm dò audit — xem W12); đã xoá hết, file về rỗng, và
nguyên nhân thăm dò audit đã sửa (S13/W12).

### 4.2. Máy chủ cũ còn chạy chiếm cổng làm sai kết quả

Các lượt chạy kiểm thử bị crash để lại tiến trình server mồ côi chiếm cổng, khiến
lượt sau đo nhầm máy chủ cũ (triệu chứng: số nhân viên "ma" tăng dần). Khắc phục:
diệt tiến trình mồ côi trước mỗi lượt + tên thư mục DB duy nhất mỗi lượt + bộ kiểm
thử tự diệt tiến trình con khi crash. Không ảnh hưởng code sản phẩm.

## 5. UNTESTED (ghi thật, không PASS)

1. **Render 3D trực quan trên trình duyệt thật có mạng + điện thoại thật** (Safari
   iPhone, cảm ứng kéo/chụm, hiệu ứng đi bộ/nhảy ăn mừng theo thời gian, khung
   camera theo người về mặt thị giác): **CHƯA KIỂM CHỨNG HẾT** — cảnh 3D đã được
   nhìn thấy chạy và chụp ảnh trong chrome-headless-shell với WebGL phần mềm
   (SwiftShader) dùng file vendor cùng nguồn (xem §3 Cổng 6 + ảnh
   `shot-office-3d-*.png`), nhưng chưa chạy trên trình duyệt thật của Giám đốc.
   **Cổng kiểm chứng live sau deploy vẫn bắt buộc** trước khi báo xong với Giám đốc.
2. **Đường cài kit đầy đủ + `install.bat` trên Windows thật**: UNTESTED (chỉ có
   `--dry-run` trên Linux). Bridge đã kiểm chứng vòng tròn xin duyệt qua API.
3. **Chạy 24/7 trên máy điều phối** (systemd, watchdog, sao lưu 15 phút): UNTESTED.
4. **Hiệu năng đa phiên đồng thời lớn** (nhiều cầu nối cùng lúc): UNTESTED.

## 6. Cách chạy hệ thống thật

```sh
cd server
# Cách A — cài đặt lần đầu qua web (khuyên dùng): chạy không cần biến môi trường,
# mở http://localhost:3101, làm theo màn hình Cài đặt lần đầu.
node server.js

# Cách B — biến môi trường (mật khẩu scrypt + TOTP):
# OFFICE_DIRECTOR_PASSWORD_HASH="<salt>:<scrypt hex>"  (tính bằng Node, xem README)
# OFFICE_DIRECTOR_TOTP_SECRET="<secret base32>"
# OFFICE_DATA_DIR (mặc định ./data), OFFICE_PORT (mặc định 3101)
node server.js
# Mở http://localhost:3101 — web + API + SSE cùng nguồn.
```

Nhân viên đăng nhập web bằng tài khoản Giám đốc tạo (`POST /api/staff` với
`username` + `initialPassword`); cầu nối dùng token API riêng
(`OFFICE_SERVER` + `OFFICE_TOKEN`, xem `kit/README.md`).

## 7. File thay đổi trong rebuild này

- `web/index.html`, `web/app.js`, `web/style.css` — viết mới hoàn toàn (vỏ ứng dụng).
- `web/vendor/three.module.js` (MỚI, 30/10) — Three.js r160 đi kèm cùng nguồn (MIT), loader thử file này trước rồi mới tới CDN; sửa lỗi fatal W13 (§2.4).
- `server/server.js` — sửa 12 điểm (§2.1) + ghi chú scrypt/cài đặt lần đầu.
- `README.md` — cập nhật chạy thật, scrypt, cài đặt lần đầu, bảng API, quyết định đã chốt.
- `docs/HUONG-DAN-CAI-DAT.md` — bổ sung mục rebuild 30/10.
- `docs/screenshots-390px/` — 4 ảnh chụp kiểm chứng (2 ảnh 390px bản rebuild + 2 ảnh cảnh 3D sau sửa lỗi live: `shot-office-3d-390.png`, `shot-office-3d-desktop.png`).
- `PROGRESS.md` — cập nhật trạng thái rebuild.
- Không đổi: `server/bridge.js`, `server/healthcheck.js`, `kit/*`, `LICENSE`,
  `.gitignore`, `server/office.service.example`, `~/workspace/ai-company/**`.
