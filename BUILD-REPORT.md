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

## 7. Sửa khung nhãn 3D 30/10 (chỉ `web/app.js` + `web/style.css` — CHƯA DEPLOY)

Lỗi do Giám đốc chụp từ bản live 30/10 04:36 +07 (nhãn vượt mép trên ở góc
Phòng họp, nhãn khổng lồ che nút ở góc Theo người) và kiểm chứng trình duyệt
thật 05:36–05:40 +07. Toàn bộ sửa nằm trong `fitLabels()` (`web/app.js`
dòng 1094–1299), camera (`applyCamera`, dòng 1062–1083), `makeLabel` (dòng
898–930) và 2 dòng CSS. Không đổi login/shell/chat/màn hình khác, `server/`,
`kit/`, `three.module.js`.

### 7.1. Nguyên nhân gốc (4 lỗi, đều đã đo được, không đoán)

1. **Nhãn tỉ lệ cố định, camera tới gần thì chiếu ra ngoài/khổng lồ.**
   Nhãn là sprite tỉ lệ cố định (2,6 × 0,88) gắn trên đầu nhân vật; camera
   Phòng họp nhìn thấp/gần nên nhãn chiếu lên trên mép khung, camera Theo
   người rất gần nên nhãn của người được theo chiếm gần hết khung và che
   hàng nút. Sửa: co giãn nhãn theo khoảng cách (mục tiêu ~40px ở khung
   480px, kẹp 32–46px) + dời camera ra xa/hướng lên để đầu + nhãn vào khung.
2. **Kẹp mép trên "không thể đạt được" đè mọi nhãn về một độ cao, phá tách
   chồng.** Ở màn hẹp (390px) hàng nút camera xuống 2 hàng (~110px); nhãn
   ở góc Từ trên/Phòng họp dù hạ tới sàn `MIN_Y` vẫn chiếu lên trên mép
   dưới hàng nút — vì nhìn gần thẳng đứng, đổi độ cao gần như không đổi vị
   trí chiếu (chỉ thu nhỏ). Kẹp cứng cũ (`Math.max(MIN_Y, …)`) đè tất cả
   về sàn, triệt tiêu tách dọc, nhãn chồng nhau 80–95%. Sửa: `pushScreenY`
   (dòng 1189) — hạ y trong `[MIN_Y, MAX_Y]`, phần vượt dịch dọc theo
   hướng "xuống màn hình" trong không gian thế giới (`shiftY`, `applyShift`
   dòng 1166); tách dọc và kẹp mép trên đều dùng chung cơ chế này.
3. **Đo kích thước nhãn bằng khoảng cách lúc chưa dịch.** Độ dịch ngang có
   thể kéo nhãn lại gần camera rất nhiều (góc Theo người: 4,98 → 2,64) nên
   đo bằng khoảng cách cũ đánh giá sai kích thước tới 2 lần (hh đo 17px
   trong khi thật 32px) và tách chồng tính sai. Sửa: `measure()` (dòng
   1142) tính lại khoảng cách + tỉ lệ từ vị trí thật sau mỗi lần dịch.
4. **Đua khởi tạo kép (Bug C) + bẫy min-content khi resize (tìm thêm lúc
   kiểm thử).** (a) `enterApp()` vừa gán hash vừa gọi `renderScreen()`
   nên `renderOffice` chạy 2 lần, 2 `init()` đua qua `loadThree()` bất
   đồng bộ; cảnh sau được dựng nhưng `sync()` thấy ids không đổi nên
   không dựng nhân vật — lần vào đầu chỉ có sàn + bàn. Sửa: bộ đếm thế hệ
   `_initGen` (dòng 690, 724–726), `sync()` dựng lại khi `_builtScene`
   khác cảnh hiện tại hoặc có nhân viên mà `chars` rỗng (dòng 963–988),
   `enterApp()` chỉ gọi `renderScreen()` khi hash đã đúng. (b) Live
   resize 1280 → 390px: `renderer.setSize()` ghi style inline 679px cho
   canvas, canvas giữ cột lưới (grid item `min-width:auto`) ở 679px —
   tràn ngang 694px, không tự hồi trong 6 giây. Sửa: `setSize(…, false)`
   (dòng 753, 796; cỡ hiển thị do CSS `width/height:100%` quyết) +
   `.office-layout>*{min-width:0}` và `.stage canvas{max-width:100%}`
   (`web/style.css` dòng 111, 131).

### 7.2. Thay đổi chính xác

- `web/app.js` dòng 1062–1076: camera Góc tổng `(1,2; 7,6; 11,2)` nhìn
  `(0,8; 0,5; -1,4)`; Phòng họp `(0,5; 4,3; 6,0)` nhìn `(0,5; 1,0; -0,8)`;
  Theo người `(p.x+2,9; 3,2; p.z+4,4)` nhìn `(p.x; 1,6; p.z)`. Góc Từ trên
  giữ nguyên `(0; 13,5; 0,6)`.
- `web/app.js` dòng 898–930 (`makeLabel`): canvas nhãn 448×152 → 400×152,
  thêm `fitFont` đo chữ và thu cỡ tên (56→32) / dòng phụ (36→22) để chữ
  dài không tràn viên nhãn.
- `web/app.js` dòng 1094–1299 (`fitLabels`, viết lại cơ chế): tỉ lệ nhãn
  theo khoảng cách + nhãn không được theo nhỏ/mờ 0,78×, độ mờ 0,8; kẹp
  mép trên đo bằng mép dưới THẬT của hàng nút; kẹp mép trái/phải TRƯỚC
  khi tách chồng; tách dọc 2 lượt + lượt nâng; tách ngang có kiểm tra
  biên (cho góc Từ trên); mọi lần đo đều tính lại từ vị trí thật; bỏ dòng
  debug tạm `window.__dbgLabels` (grep = 0).
- `web/style.css` dòng 111, 131: như §7.1(4b). Không dòng CSS nào khác đổi.

### 7.3. Bằng chứng kiểm thử (script `/tmp/labeltest/audit.mjs` + `resize-settle.mjs` + `resize-late.mjs`, chrome-headless-shell 153 qua CDP, SwiftShader, file vendor cùng nguồn, chặn cache; ảnh chụp `/tmp/labeltest/audit/`)

| Kiểm tra | 1280×900 | 390×844 |
|---|---|---|
| Vào lần đầu (profile mới, không reload): 5 nhân vật + 87 mesh, `ready:true` | PASS | PASS |
| Góc tổng: nhãn trong khung, không đè nút | 0 vượt biên, chồng 13% (góc chạm, tên đọc được) | 0 vượt biên, chồng 14% |
| Từ trên | 0 vượt biên, chồng 0% | 0 vượt biên, chồng 22% (Tuấn/Linh chạm góc, cả 2 tên đọc rõ — đã xem ảnh) |
| Phòng họp (lỗi A gốc) | 0 vượt biên, chồng 0% | 0 vượt biên, chồng 0% |
| Theo người (lỗi B gốc) | 0 vượt biên, chồng 0% (2 nhãn trong khung nhìn) | 0 vượt biên, chồng 0% |
| Chuyển camera nhanh 3 vòng × 4 góc (120ms) + resize | canvas nguyên, không màn trắng | canvas nguyên, không màn trắng |
| Resize sống 1280 → 390 (lấy mẫu 6 giây) | — | canvas 364×380, `docW = vw = 390`, không tràn ngang, không lỗi |
| Nhân viên mới vào sau (đường `S.staff` + `renderScreen()`) | 5 → 6 nhân vật + nhãn, không reload | (cùng đường code) |

- `node --check web/app.js`: PASS. Grep `TODO/FIXME/__dbgLabels/console.log`: sạch. Không secret mới (grep token/password chỉ ra code session có sẵn).
- DB thật `server/data/office.db` không chạm (mtime 29/10 21:57, trước phiên làm việc); máy chủ thật không chạy trong đợt này (chế độ DEMO ngoại tuyến qua máy chủ tĩnh tạm — `/api/*` 404 là nhiễu dự kiến, không ảnh hưởng cảnh 3D).
- Cạm bẫy gặp lúc kiểm thử (ghi để tránh lặp): file tĩnh mang mtime cũ nên Chrome dùng heuristic cache, không nhận CSS mới — kiểm thử resize đo nhầm "vẫn 679px" cho tới khi `Page.reload {ignoreCache:true}`; mọi số liệu cuối trong bảng trên đều đo sau khi chặn cache.

### 7.4. UNTESTED thêm của đợt này (cộng vào §5)

- Điện thoại thật (Safari iOS, cảm ứng kéo/chụm, xoay máy thật): kiểm chứng resize sống chỉ mới qua giả lập CDP — cổng kiểm chứng live sau deploy vẫn bắt buộc.
- Khung hình camera Theo người về mặt thị giác (có theo đúng người, có mượt khi đi bộ): chỉ kiểm chứng nhãn không lỗi, chưa xem chuyển động theo thời gian.
- Số nhân viên khác 5–6 người (đông hơn có thể lại chồng nhãn ở màn hẹp): chưa thử.

## 8. Ba phương án giao diện 30/10 (Giám đốc chê bản hiện tại "xấu" — chọn bằng mắt)

- Bối cảnh: 30/10/2026 06:41 +07, Giám đốc chê thẳng giao diện hiện tại. Không hỏi
  thuật ngữ thiết kế — làm 3 hướng nhìn thật trên ứng dụng thật, để Giám đốc
  chỉ tay chọn. Chỉ đổi lớp hình ảnh (màu, chữ, mặt phẳng, bảng màu cảnh 3D);
  cấu trúc vỏ, 9 màn hình, logic và `server/` KHÔNG đổi.
- Cơ chế chọn: tham số `?theme=dark|light|warm` (xem `web/index.html`, script
  nhỏ trong `<head>` — đặt `window.__THEME` + gắn stylesheet tương ứng SAU
  `style.css`). Không tham số = giữ nguyên y hệt hôm nay (đã kiểm chứng: nền
  `#f4f6f8`, chữ `#111827`, cảnh 3D mặc định). Bảng màu cảnh 3D: `SCENE_PALETTES`
  trong `web/app.js` + phương thức `Office3D.pal()`; bản `default` giữ nguyên
  từng giá trị màu cũ — `buildStage`/`buildRoom`/`buildBoard`/`buildDesk` chỉ
  đọc qua `P.*`, không còn literal màu cảnh rải rác.
- File: `web/themes/theme-dark.css`, `web/themes/theme-light.css`,
  `web/themes/theme-warm.css` (+ `web/index.html`, `web/app.js` sửa nhỏ).
  Không fork `app.js` thành 3 bản. Huy hiệu chờ duyệt đỏ giữ nguyên cả 3 bản.
- Ảnh chụp (12 ảnh, ứng dụng thật chạy chế độ DEMO, chrome-headless-shell qua
  CDP + SwiftShader, đã xem từng ảnh):
  `docs/theme-options/{dark,light,warm}/{office,chat}-{1440,390}.png`.
  Kiểm chứng kèm mỗi ảnh: không tràn ngang (scrollW = innerW), menu dưới cố
  định hiện ở 390px (đáy = chiều cao viewport), canvas 3D hiện, không lỗi JS
  (chỉ nhiễu 404 của `/api/health` trên máy chủ tĩnh tạm — dự kiến, vì chế độ
  DEMO yêu cầu không nối được máy chủ; máy chủ thật đã chạy riêng trên DB tạm
  và trả `/api/health` 200, 5 nhân sự, 0 việc).
- 1. DARK "Phòng điều hành tối": navy/đen, chữ sáng tương phản mạnh, trạng
  thái chọn nền sáng + chữ tối (rule riêng — không để chữ trắng trên nền
  trắng). Cảnh 3D: hoàng hôn, sàn gỗ tối, đèn ấm. Lúc xem ảnh đã sửa: tăng
  sáng bán cầu 0.85 → 1.0 và tường phải 0x182130 → 0x202e42 vì nửa phải cảnh
  tối quá, gần như đen.
- 2. LIGHT "Sáng sạch hiện đại": trắng/xám nhạt, một màu nhấn xanh, thẻ bo
  tròn 16px, thanh trên trắng (tên hệ thống màu nhấn). Cảnh 3D: ban ngày sáng.
- 3. WARM "Gỗ ấm văn phòng": kem + gỗ, xanh lá đậm, tiêu đề màn hình serif
  Georgia (chữ nội dung vẫn sans). Cảnh 3D: nắng chiều ấm, sàn gỗ sáng.
- Đã sửa sau khi xem ảnh: chỉ có điểm tối của bản dark (nêu trên). Nhãn 3D ở
  góc tổng vẫn chồng nhau một phần ở dòng phụ (hành vi có sẵn của bản hiện
  tại, giống nhau cả 3 bản — không phải do theme). Không sửa gì khác.
- UNTESTED: điện thoại thật (Safari iOS, cảm ứng), chuyển động theo thời
  gian, nhân viên > 6 người. Sau khi Giám đốc chọn, bản được chọn phải thành
  mặc định (bỏ tham số) rồi kiểm chứng live lại trước khi coi là xong.

### 8.1. File chờ deploy (gh-api put-file, KHÔNG git local)

`web/index.html`, `web/app.js`, `web/themes/theme-dark.css`,
`web/themes/theme-light.css`, `web/themes/theme-warm.css`,
`docs/theme-options/dark/*.png`, `docs/theme-options/light/*.png`,
`docs/theme-options/warm/*.png`, `BUILD-REPORT.md`, `PROGRESS.md`
(+ các file đợt trước nếu chưa push). Sau deploy, kiểm chứng live bằng
`?theme=dark|light|warm` trên trang thật rồi mới đưa Giám đốc chọn.

## 9. Thiết kế lại hiện đại 30/10 (Giám đốc: 3 bản theme "như trung tâm điều phối những năm 2000, thiết kế quá cổ" — 06:58 +07)

Tiền đề đúng: 3 theme cũ chỉ tô màu lại cùng một bố cục cũ. Đợt này KHÔNG tô
màu lại — viết lại ngôn ngữ thiết kế. Cùng ứng dụng, cùng 9 màn hình, cùng
chức năng, cùng chữ tiếng Việt; chỉ đổi lớp hình ảnh. Tham chiếu: sự tiết chế
của Linear / Vercel / Raycast / Notion.

### 9.1. Hệ thống thiết kế mới (toàn bộ trong `web/style.css` — viết lại)

- **Token:** nền `--bg:#FAFAF9`; mặt phẳng trắng; chữ `#18181B`; chữ mờ
  `#6B7280`; viền sợi tóc `rgba(17,24,39,.08)`; sidebar mực `#0C111D`; MỘT
  màu nhấn indigo-600 `#4F46E5` dùng dè sẻn (link, trạng thái chọn, vòng
  focus, bubble chat của mình); trạng thái giữ nguyên ngữ nghĩa nhưng dịu
  (đỏ `#DC2626`, xanh lá `#067647`, vàng `#B54708` + nền tint nhạt).
- **Chữ:** chồng Inter-first; tiêu đề tracking `-0.02em`, 3 tầng rõ
  (21px/16px/14px); thân 14px; nhãn mục nhỏ in hoa 11px, giãn chữ `.08em`,
  màu mờ. Không serif, không in đậm tràn lan.
- **Bề mặt:** thẻ trắng, viền 1px sợi tóc, bo 12–14px, MỘT bóng mềm
  (`0 1px 2px rgba(16,24,40,.05)`); số liệu KPI = số lớn tối giản + nhãn
  nhỏ in hoa (không còn hộp tô đầy); không gradient, không viền đôi, không
  bóng bevel.
- **Sidebar:** hẹp 232px, nền mực, icon + nhãn (icon qua thuộc tính
  `data-icon` vẽ bằng CSS), mục đang chọn = viên thuốc mờ trắng; chân sidebar
  tách bằng viền mờ. **Topbar:** cao 56px, trắng mờ + blur, viền dưới sợi
  tóc; huy hiệu chờ duyệt = viên thuốc đỏ + chấm trắng (vẫn không thể bỏ
  qua — đã đo màu nền `#DC2626`/chữ trắng).
- **Điều khiển:** nút bo 10px, chính = mực đặc, phụ = viền sợi tóc, ghost
  trong suốt; input bo 10px + vòng focus indigo nhạt; chuyển động 150ms ease;
  vòng focus nhìn thấy được ở mọi điều khiển, TRỪ `#screen` (xem §9.3).
- **Kanban:** làn phẳng `#F4F4F5`, thẻ trắng viền sợi tóc + vạch nhấn 3px.
  **Chat:** bubble bo 16px, bubble của mình nền indigo nhạt `#EEF2FF`;
  cuộc đang chọn = nền indigo nhạt + vạch nhấn trái 3px.
- **Sân 3D:** khung bo 16px + bóng mềm; cụm nút góc nhìn thành **viên thuốc
  nổi** giữa khung vẽ (nền trắng mờ + blur, bo 999px, bóng mềm), nút đang
  chọn = mực đặc; dòng gợi ý/ghi nguồn vẫn nằm dưới khung vẽ (không phủ).
- **Mobile 390px:** cùng hệ thống; menu dưới = trắng mờ + blur, viền trên
  sợi tóc, mục đang chọn = viên thuốc indigo nhạt; mục tiêu chạm ≥44px.

### 9.2. File đổi (chỉ lớp hình ảnh)

- `web/style.css` — viết lại hoàn toàn (211 dòng cũ → hệ thống mới; mọi class
  cũ vẫn được định nghĩa, không class nào của `app.js` bị bỏ).
- `web/index.html` — (1) **bỏ script chọn theme `?theme=...`**: giao diện
  hiện đại là mặc định duy nhất, không còn tham số; 3 file
  `web/themes/theme-*.css` còn trên đĩa nhưng không được tải nữa (chết lâm
  sàng, ghi rõ để đợt dọn sau xóa nếu muốn); (2) thêm `data-icon` cho 9 mục
  sidebar. Không đổi cấu trúc DOM nào khác.
- `web/app.js` — chỉ 2 chỗ: bảng `SCENE_PALETTES.default` (ban ngày dịu,
  sàn trung tính ấm `#DDD5C6`, gỗ trầm, sương nhẹ) và `makeLabel` (nhãn:
  nền trắng bóng mềm + viền nhạt 3px `#E3E6EA`, chữ Inter 650/550, dòng phụ
  xám `#6B7280`). Không đổi hình học, camera, `fitLabels`, luồng, API.
- Không động: `server/`, `kit/`, `web/vendor/`, `~/workspace/ai-company/`,
  nội dung tiếng Việt, mọi luồng nghiệp vụ.

### 9.3. Hai lỗi tìm thấy khi xem ảnh chụp — đã sửa và chụp lại

1. **Vòng focus tím quanh toàn bộ nội dung:** `#screen` (`<main>`,
   `tabindex="-1"`) được focus bằng mã và rule `:focus-visible` toàn cục vẽ
   vòng 2px indigo quanh cả vùng nội dung — trông như lỗi hiển thị. Sửa:
   `#screen:focus{outline:none}` (chỉ vùng này; vòng focus của nút/input/
   link giữ nguyên). Đã đo lại: không còn phần tử nào có outline trong
   probe CDP, ảnh chụp lại sạch.
2. **Viên thuốc góc nhìn xuống 2 hàng ở desktop:** phần tử absolute
   `left:50%` + `transform` bị giới hạn chiều rộng co-vừa trong 50% còn lại
   của khung chứa nên tự ngắt hàng. Sửa: `width:max-content` (giới hạn trên
   vẫn là `max-width:calc(100% - 20px)`). Ảnh chụp lại: 1 hàng đủ 4 nút ở
   1440px; ở 390px vẫn 2 hàng (đúng giới hạn chiều rộng, đã đo không tràn).

### 9.4. Kiểm thử — máy chủ thật + DB tạm + chrome-headless-shell qua CDP

Script `/tmp/modern-test/drive.mjs` (dựa trên driver đợt theme, sửa đường
dẫn Chrome sang bản ms-playwright + vào demo bằng cách trỏ API base lưu
trong localStorage tới cổng không tới được). Máy chủ thật chạy
`OFFICE_PORT=3299`, `OFFICE_DATA_DIR=/tmp/modern-test/data` (DB tạm):
`/api/health` 200 (`store:sqlite`, 5 nhân viên, 0 việc). 7 ảnh chụp, đã xem
từng ảnh bằng mắt:

| Ảnh | Kết quả xem |
|---|---|
| `login-1440.png` | Thẻ đăng nhập mới: dấu mực, tab phân đoạn, nút mực đặc — sạch |
| `office-1440.png` | Sidebar mực, KPI tối giản, viên thuốc góc nhìn 1 hàng, cảnh 3D sáng dịu, nhãn mới đọc được, không vòng focus lạ |
| `jobs-1440.png` | Làn Kanban phẳng, thẻ trắng, form sạch, không vòng focus lạ |
| `chat-1440.png` | Bubble của mình nền indigo nhạt + tag nhắc tên, cuộc đang chọn có vạch nhấn — sạch |
| `office-390.png` | Không tràn ngang, menu dưới cố định + mục đang chọn indigo nhạt, viên thuốc 2 hàng gọn trong khung |
| `chat-390.png` | Không tràn ngang, danh sách + bubble gọn, menu dưới đúng |
| `jobs-390.png` | Không tràn ngang, menu dưới đúng |

Đo bằng CDP trên cả 2 cỡ: `scrollWidth == innerWidth` (không tràn ngang);
menu dưới `display:flex`, `bottom == innerHeight`, cao 65px ở 390px; canvas
3D hiện (`canvasW` 726/360); chữ "Cảnh 3D đã sẵn sàng", không có
"THREE is not defined"; nút góc nhìn đang chọn nền `#111827`/chữ trắng;
huy hiệu chờ duyệt nền `#DC2626`/chữ trắng; `node --check web/app.js` PASS;
cân bằng ngoặc CSS PASS; 0 lỗi JS (chỉ 1 log `ERR_UNSAFE_PORT` — chính là
probe API cố tình trỏ tới cổng không tới được để vào demo mode, theo thiết
kế kiểm thử). Máy chủ thử nghiệm đã tắt; DB thật không chạm
(`server/data/office.db` giữ nguyên mtime 29/10 21:57).

### 9.5. Còn tồn tại / UNTESTED

- Dòng phụ của nhãn tên 3D ở góc tổng vẫn chồng nhau một phần (hành vi có
  sẵn từ các đợt trước, đã ghi ở §7/§8 — không phải do đợt thiết kế này,
  nhãn mới chỉ đổi kiểu chữ/viền/bóng).
- Điện thoại thật (Safari iOS, cảm ứng kéo/chụm, xoay), chuyển động theo
  thời gian, >6 nhân viên, kit/Windows, chạy 24/7: UNTESTED như trước.
- **Cổng kiểm chứng live sau deploy vẫn bắt buộc** (desktop + 390px thật)
  trước khi đưa Giám đốc nhìn — ảnh chụp ở đây là headless-shell +
  SwiftShader, không phải trình duyệt/điện thoại thật.
- Hệ thống dùng token CSS nên nếu Giám đốc gửi ảnh tham chiếu về thứ anh
  thấy đẹp, chỉ cần đổi token là khớp được — không cần viết lại.

### 9.6. File chờ deploy (gh-api put-file, KHÔNG git local)

`web/index.html`, `web/app.js`, `web/style.css`, `BUILD-REPORT.md`,
`PROGRESS.md`, `docs/redesign-modern/*.png` (7 ảnh). Không cần push 3 file
`web/themes/*` (không còn được tải).

## 10. Tích hợp thiết kế Obsidian của ChatGPT ("NEXUS") 30/10 — CHƯA DEPLOY

ChatGPT nhận xét bản hiện đại "quá cổ" ở 12 điểm (sidebar kiểu ERP,
topbar mỏng, không thứ bậc thị giác, KPI trần, nút không hệ thống, hộp
3D be, nhân vật đồ chơi, nhãn tooltip, không gian phẳng, không hệ màu
trạng thái, khoảng chết dưới nội dung, không cảm giác hệ thống sống).
Đợt này áp NGÔN NGỮ thiết kế đó vào app thật — thích ứng, không dán
bản demo (bản demo dùng CDN Three 0.169 + Google Fonts + dữ liệu giả +
tên "NEXUS": tất cả đều KHÔNG vào app).

### 10.1. Thay đổi (chỉ lớp hình ảnh + 3D, chức năng/API/server/kit giữ nguyên)

- `web/style.css` viết lại: token Obsidian (nền `#090E17`, sidebar/topbar
  `#0C1320`, mặt `#111B29`, viền `#263548`, chữ `#F1F5F9/#A3B2C5/
  #718096`, accent teal `#2DD4BF` tiết chế, blue/violet/amber/red/slate
  theo ngữ nghĩa); lưới 100dvh; sidebar nhóm WORKSPACE/OPERATIONS/SYSTEM
  + icon SVG vẽ tay 18px; topbar 64px 3 vùng; nút chuẩn
  (primary teal/chữ tối, secondary, ghost, danger); panel radius 12;
  login split layout cùng hệ thống. Không `@import` Google Fonts (Inter
  qua font stack + fallback hệ thống). Cơ chế `?theme` vẫn bỏ.
- `web/index.html`: vỏ app mới (topbar + breadcrumb + huy hiệu DEMO +
  huy hiệu chờ duyệt đỏ, sidebar nhóm + chân sidebar hồ sơ/kết nối,
  bottom nav 5 mục + trang "Thêm", trang trượt hồ sơ mobile).
- `web/app.js` (3D): bảng màu Obsidian duy nhất (sàn `#182431`, tường
  `#202E3C`, tường thấp 3.2, vật liệu matte theo tham chiếu, lưới sàn mờ);
  tone mapping ACES, FOV 38, đèn viền teal tiết chế + đèn lấp; nhãn
  kính tối (nền tối, chấm trạng thái, tên + chức vụ · trạng thái);
  góc Theo người hạ xuống ~25°; logic `fitLabels()` giữ nguyên, chỉ đổi
  sàn chiều cao nhãn 0.3 → 0.12 (nhãn gần camera không còn phóng to) và
  hệ số tách chồng 0.85 → 1.08 (nhãn chạm nhau 1px → hở ~8px).

### 10.2. Lỗi tìm thấy khi xem ảnh chụp — đã sửa và chụp lại

1. Nhãn người được theo (góc Theo người) phóng to che nhân vật: sàn
   `worldH` 0.3 quá lớn ở cự ly gần → hạ xuống 0.12 (2 chỗ trong
   `fitLabels`).
2. Nhãn Muse/Hùng/Tuấn/Linh chạm nhau ở góc tổng → hệ số tách 1.08.
3. Màn 390px lệch phải 220px: `.sidebar{display:none}` nhưng `.shell`
   giữ rãnh 220px và `.main{grid-column:2}` → một cột + `.main` cột 1.
4. Màn 390px vẫn rộng 446px: `#app-view` không có
   `grid-template-columns` (cột auto phình theo min-content của topbar)
   → `minmax(0,1fr)` + tên thương hiệu ellipsis + ẩn tên ở ≤560px.
5. Màn 390px với dữ liệu việc: thẻ hồ sơ 490px trong màn 358px —
   chuỗi min-content (dòng hiện diện nowrap → `.who` → `.fallback-item`
   → `.grid` → aside) → `min-width:0` ở mọi tầng
   (`.office-layout > *`, `#office-panel > .grid > *`,
   `.fallback-list > *`, `.run-list > *`, `.run-top b`).
6. Dòng chân khung cảnh nói "dữ liệu thật từ máy chủ" cả ở demo →
   theo chế độ (demo: "Dữ liệu mẫu chạy ngay trong trình duyệt").

### 10.3. Kiểm thử — máy chủ thật + DB tạm + chrome-headless-shell qua CDP

Script `/tmp/nexus-test/drive.mjs` (tạo trong phiên làm việc; `/tmp` là
vùng tạm, có thể bị dọn — logic: CDP + SwiftShader, vào demo mode bằng
cách trỏ API tới cổng không tới được, chụp mọi màn 1440px + văn
phòng/chat/việc 390px, đo NDC nhãn + tràn ngang). 0 lỗi JS (chỉ 2 log
`ERR_UNSAFE_PORT` — probe API cố tình trỏ cổng không tới được để vào
demo mode, theo thiết kế kiểm thử). `node --check` PASS. Nhãn NDC
trong khung ở cả 4 góc; không tràn ngang 390px (`scrollWidth ==
innerWidth`, menu dưới cố định đáy); dữ liệu demo gieo qua `DemoDB`
của đúng profile headless (xóa cùng profile), render qua đúng đường mã
thật. Máy chủ thử nghiệm đã tắt; DB thật không chạm.

### 10.4. UNTESTED thêm (cộng vào §9.5)

Điện thoại thật (Safari iOS), chuyển động theo thời gian, >6 nhân viên,
kit/Windows, chạy 24/7 — như trước. Cổng kiểm chứng live sau deploy vẫn
bắt buộc.

## 11. Mật độ vận hành (học từ ảnh tham chiếu của đối thủ) 30/10 — CHƯA DEPLOY

Giám đốc gửi ảnh hệ thống của bên khác ("Các bên cũng đang làm rất
mạnh"). Điểm mạnh lấy theo: mật độ vận hành — nhìn một cái biết xưởng
đang làm gì. KHÔNG sao chép bố cục/dữ liệu của họ; khuyết điểm nhãn
chồng nhau của họ KHÔNG lặp lại (fitLabels giữ nguyên).

### 11.1. Thay đổi (chỉ `web/app.js` + `web/style.css`, dữ liệu đã có)

- Dải "Xưởng đang làm gì" thay hàng KPI: số người đang làm / đang chờ /
  đang nghỉ, việc đang chạy, chờ phê duyệt (kèm số người gửi), ngân sách
  dùng nhiều nhất (% + số người ≥80%), và "Cập nhật HH:MM:SS" từ
  `S.lastSyncAt` (đặt trong `refreshAll`). Vẽ lại qua `updateOpsStrip()`
  mỗi lần `refreshOfficePanel()` (SSE/thăm dò 25s) nên số liệu luôn mới.
  Màu số theo ngữ nghĩa (lớp `.teal/.amber`), bỏ tô màu theo vị trí cũ.
- Hiện diện từng người: danh sách phòng + dạng 2D hiện việc đang làm +
  tiến độ + token (dùng % · còn N) qua `presenceLine()`/`currentJobOf()`/
  `budgetPct()`/`budgetLeft()`; hồ sơ thêm thanh tiến độ việc chính,
  thanh ngân sách (vàng ≥80%, đỏ 100%), số việc đã xong; trang trượt
  mobile thêm % ngân sách + số việc đã xong.
- Thẻ "Việc đang chạy" trong cột phải: tối đa 4 việc (Đang làm → Chờ
  duyệt → Chờ nhận), người phụ trách + tiến độ + pill trạng thái, bấm
  sang màn Việc.
- Nhãn 3D của người ĐANG ĐƯỢC CHỌN thêm dòng thứ ba (màu teal): tên
  việc đang làm, cắt ≤30 ký tự. Người khác giữ 2 dòng. Khung 400×152
  không đổi nên `fitLabels()` không phải sửa.

### 11.2. Khoảng trống dữ liệu — GHI NHẬN, KHÔNG BỊA

- Không có khái niệm "flow" nhiều bước, "phiên studio", "phiên chat
  đang mở": không có thực thể/trường nào trong API — dải tổng quan chỉ
  dùng trạng thái người + việc + phê duyệt + ngân sách.
- Không có thời lượng việc, thumbnail, "việc vừa xong · N phút": việc
  không có `startedAt/finishedAt/duration` — chỉ đếm số việc đã xong.
- Không có "token dự phòng" riêng: chỉ có `budget/used` — hiển thị còn
  lại = `budget - used`, tính trực tiếp, không bịa thêm.
- Phiên đăng nhập (`S.sessions`, chỉ Giám đốc) không nói ai đang làm gì
  nên không dùng làm "đang trực tuyến".

### 11.3. Kiểm thử — máy chủ thật + DB tạm + chrome-headless-shell qua CDP

Script `/tmp/nexus-test/drive.mjs` (tái tạo sau khi `/tmp` bị dọn):
gieo 5 việc + 1 phê duyệt + `used` của Muse = 3,1 tỷ vào kho DEMO của
riêng profile headless (xóa cùng profile), qua `DemoDB.load()/save()`,
render qua đúng đường mã. Bằng chứng: dải tổng quan đọc "1 đang làm ·
2 việc đang chạy · 1 chờ duyệt · 62% · Cập nhật 01:08:08"; nhãn NDC
trong khung ở góc tổng; 390px `scrollWidth == innerWidth`,
`appSW == 390`, menu dưới cố định đáy; 0 lỗi JS (chỉ 2 log
`ERR_UNSAFE_PORT` như mọi lần — probe demo). `node --check` PASS.
Ảnh chụp: `/tmp/nexus-test/shots/office-selected-1440.png` (nhãn Hùng
có dòng việc, các nhãn hở nhau) và `office-390.png` (dải vận hành
2 cột + nhãn 3D đọc được + menu dưới). Bản lưu trong repo:
`docs/ops-density/` (4 ảnh: `office-selected-1440.png`,
`office-390.png`, `sheet-390.png`, `office-follow-1440.png`).

### 11.4. File chờ deploy (gh-api put-file, KHÔNG git local)

`web/app.js`, `web/style.css`, `BUILD-REPORT.md`, `PROGRESS.md`,
`docs/ops-density/*.png` (cộng dồn với §9.6/§10: `web/index.html`
cũng đổi ở §10). Không cần push `web/themes/*`.


## 12. Migration backend sang Supabase (gói Free) 30/10 — CHƯA DEPLOY

Quyết định Giám đốc 30/10/2026 12:28–12:29: bỏ hướng MacBook + Tailscale,
chuyển backend sang Supabase Free (không thẻ, online 24/7, giữ dữ liệu,
phân quyền kiểm ở máy chủ bằng RLS, Realtime thay SSE). Web app giữ nguyên
là trang tĩnh trên GitHub Pages (cùng URL) — chỉ backend đổi. Máy chủ Node
cũ (`server/`) chuyển thành legacy (không chạy, không sửa, không xoá).

### 12.1. File mới/đổi (chi tiết đầy đủ ở `supabase/README.md` §6)

- `supabase/migrations/001_schema.sql` — 10 bảng, đúng ngữ nghĩa server.js.
- `supabase/migrations/002_rls.sql` — RLS mọi bảng + trigger cấm tự duyệt,
  trigger chặn sửa cột nhạy cảm, máy trạng thái việc, 3 hàm SECURITY DEFINER.
- `supabase/migrations/003_seed.sql` — 4 chức vụ + 5 nhân viên + 2 rule,
  y hệt seed máy chủ cũ (không mật khẩu nào trong seed).
- `supabase/migrations/004_realtime.sql` — publication + replica identity full.
- `web/config.js` (MỚI, giữ chỗ) + `web/vendor/supabase.min.js` (UMD
  v2.118.0, 218.544 byte, md5 f7ee2a8cc50df657f40bff109b9a544d, 0 CDN) +
  `web/supabase.js` (MỚI — dịch /api/... sang PostgREST/Auth/Realtime).
- `web/app.js` + `web/index.html` — sửa phẫu thuật: route sang Supabase khi
  đã cấu hình, Realtime thay SSE, thăm dò dự phòng 120s (web) / 60s (kit),
  cài đặt lần đầu (nút riêng + xác minh TOTP ngay), kit tải file tĩnh.
- `kit/` viết lại: bridge GoTrue JWT + Realtime WS + thăm dò 60s; install
  hỏi Supabase URL/anon key/username/mật khẩu; README viết lại.
- `docs/HUONG-DAN-CAI-DAT.md` viết lại Supabase-first; `server/LEGACY.md` mới.

### 12.2. Quyết định Auth/RLS/Realtime (tóm tắt — đầy đủ ở `supabase/README.md`)

- Giám đốc: 1 Auth user + TOTP MFA (AAL2), email nội bộ
  `director@office.internal`; cài đặt lần đầu tạo user → gắn `s-chung` →
  xác minh TOTP ngay (chặn nút tiếp theo cho tới khi xác minh xong).
- Nhân viên: Auth user `<username>@office.internal` (không phải email thật,
  không gửi mail, Confirm email TẮT); kích hoạt lần đầu tự gắn hàng (chỉ khi
  hàng còn trống + email trùng JWT); cờ `must_change_password` bắt đổi ngay.
- service_role key KHÔNG BAO GIỜ xuất hiện ở web/kit/docs/file commit.
- Tin nhắn: SELECT chỉ phòng chung + tin mình gửi/nhận (đúng máy chủ cũ).
- Mật khẩu ban đầu ở form tạo nhân viên KHÔNG được lưu (Supabase Auth chỉ
  nhận mật khẩu do chính nhân viên đặt khi kích hoạt) — adapter hiện ghi chú
  kích hoạt cho Giám đốc thay vì giả vờ đã cấp mật khẩu.
- Thu hồi phiên: chỉ làm trong Supabase Dashboard (app không có quyền này
  bằng anon key — cố tình).

### 12.3. Trạng thái kiểm chứng (nói thẳng)

- ĐÃ: `node --check` mọi JS đổi/mới (PASS); đối chiếu cột adapter/kit với
  schema; đối chiếu mọi route `/api/...` app gọi với adapter; rà 0 alert(),
  0 import CDN lúc chạy cho Supabase, không branding "NEXUS", 0 service_role,
  0 secret thật.
- CHƯA (parent làm sau khi project tồn tại): chạy 4 migration trên project
  thật (không có Postgres local để chạy thử — lỗi cú pháp (nếu có) chỉ lộ
  ở SQL Editor); điền `web/config.js` + deploy + kiểm chứng live (đăng nhập
  Giám đốc/TOTP, kích hoạt nhân viên, 9 màn, Realtime 2 tab, 390px, 4 góc
  camera); cầu nối GoTrue + Realtime WS với project thật; headless DEMO
  regression (lần chạy trong đợt này bị gián đoạn trước khi có kết quả).
- NỢ: nhật ký do client tự ghi (không chống được việc bỏ qua ghi bằng SQL
  trực tiếp — xem `supabase/README.md` §7); seed giữ email Giám đốc
  `teddyssk559@gmail.com` ở cột account của `s-chung` (câu hỏi ẩn email
  khỏi dữ liệu demo vẫn chưa được trả lời — không tự đổi).

### 12.4. File chờ deploy (gh-api put-file, KHÔNG git local)

`web/index.html`, `web/app.js`, `web/supabase.js`, `web/config.js`,
`web/vendor/supabase.min.js`, `kit/*`, `docs/HUONG-DAN-CAI-DAT.md`,
`supabase/*`, `server/LEGACY.md`, `BUILD-REPORT.md`, `PROGRESS.md`.
(cộng dồn với §9.6/§10/§11.4: `web/style.css`, `docs/ops-density/*.png`.)
