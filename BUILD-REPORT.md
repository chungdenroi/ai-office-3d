# BÁO CÁO XÂY DỰNG — Hệ thống AI nhân viên, Văn phòng 3D (Giai đoạn 1 + demo 3D)

Ngày hoàn thành: 29/10/2026, 16:40 +07 (giờ Sài Gòn). Người xây: Muse (điều phối).
Repo đích: `chungdenroi/ai-office-3d` (public, GitHub Pages phục vụ thư mục `web/`).
Phòng họp cũ (`ai-company`) không bị động vào. Không chạy lệnh git/gh trong quá trình xây (phần deploy do agent cha đảm nhiệm).

Nguồn yêu cầu: `/tmp/spec.txt` (11 mục, trích từ bản phác thảo HTML của Linh đã được Giám đốc duyệt, 29/10/2026) + `~/workspace/ai-company/STATE.md` §§1–2 (chỉ đọc, không sửa) + 3 quyết định của Giám đốc ngày 29/10/2026 23:23 + 2 phụ lục (23:26, 23:27) + lệnh kiểm tra kỹ trước khi deploy (23:29).

## 1. File đã xây (17 file)

| File | Kích thước | Nội dung |
|---|---|---|
| `web/index.html` | 44.773 B | SPA một trang, toàn bộ nhãn tiếng Việt; import map Three.js qua CDN |
| `web/app.js` | 77.118 B | Toàn bộ logic: văn phòng 3D, tổ chức, việc, phê duyệt, ngân sách, quyền, chu kỳ thích ứng, localStorage |
| `web/style.css` | 7.735 B | Giao diện + responsive 390px (1 cột, nút 2 cột, không tràn ngang) |
| `server/server.js` | 46.909 B | Máy chủ Node 24, chỉ dùng `node:http` + `node:sqlite` (fallback file JSON), không phụ thuộc ngoài |
| `server/bridge.js` | 11.518 B | Cầu nối mỏng cho từng tài khoản nhân viên (SSE + heartbeat + watchdog + tự dừng khi chạm ngân sách) |
| `server/healthcheck.js` | 5.742 B | Trình kiểm tra độc lập: ghi cảnh báo `server-down`/`server-recovered` vào hộp thư `alerts/outbox.jsonl` |
| `server/package.json` | 334 B | Không dependencies, engines node ≥ 22, scripts `start`, `bridge` |
| `server/office.service.example` | 1.057 B | Mẫu systemd unit (tự khởi động lại) |
| `kit/bridge.js` | 11.518 B | Giống hệt `server/bridge.js` (đã kiểm tra `diff -q` — IDENTICAL) |
| `kit/config.example.json` | 107 B | Chỉ placeholder, không token thật |
| `kit/install.sh` | 3.479 B | Cài đặt Linux/macOS: kiểm tra Node ≥ 22, hỏi URL/tên/token không hiện chữ, ghi config quyền 600, đăng ký systemd user unit, hỗ trợ `--dry-run` |
| `kit/install.bat` | 1.814 B | Cài đặt Windows: nhập token bằng secure-string, ghi config JSON, đăng ký `schtasks` ONLOGON |
| `kit/README.md` | 3.963 B | Hướng dẫn cài cầu nối từng bước + xử lý sự cố (mất kết nối, token bị thu hồi, máy chủ sập) |
| `docs/HUONG-DAN-CAI-DAT.md` | 10.144 B | Hướng dẫn tiếng Việt: phía Giám đốc (tạo tài khoản, cấp token, đặt ngân sách, dùng hộp phê duyệt) + phía nhân viên (cài cầu nối, mẫu chia sẻ link, xử lý sự cố) |
| `README.md` | 11.569 B | Kiến trúc, cách chạy web + máy chủ, bảng demo-đối-thực, bảng API, deploy miễn phí |
| `LICENSE` | 1.065 B | MIT |
| `.gitignore` | 80 B | Loại `server/data/`, `server/backups/`, `server/alerts/`, `server/.env` |
| `BUILD-REPORT.md` | (file này) | Báo cáo xây dựng + bằng chứng kiểm tra |

## 2. Ba quyết định của Giám đốc — đã áp dụng (29/10/2026 23:23 + phụ lục 23:26, 23:27)

1. **Ngân sách token: KHÔNG có mức chung cố định.** Ngân sách là dữ liệu từng người, Giám đốc chỉnh bất cứ lúc nào (ô nhập + nút +50% trong mục ngân sách; server CRUD budgets). Tài khoản điều phối giữ con số thật được cấp: **5.000.000.000 token**. Các giá trị khởi đầu của nhân viên khác được ghi rõ là "giá trị khởi đầu, Giám đốc tự điều chỉnh", không phải quy tắc cố định. Mốc 80% cảnh báo, 100% → cảnh báo nổi bật + trạng thái nghỉ riêng (vòng xám-xanh + nhãn), dừng nhận việc cho tới khi Giám đốc nạp thêm hoặc cho nghỉ hẳn.
2. **Hộp phê duyệt bao phủ MỌI yêu cầu quyền của MỌI tài khoản Muse**, không chỉ duyệt việc trong web. Các loại yêu cầu hạng nhất trong UI + API: (a) quyền đăng nhập, (b) quyền tải file xuống, (c) quyền cài app/chương trình (một loại cài đặt duy nhất, gộp với danh mục cài chương trình mặc định), cộng 5 danh mục mặc định: gửi tin ra ngoài nhóm, xóa dữ liệu, đổi cài đặt tài khoản/bảo mật, truy cập dữ liệu ngoài phạm vi, bất kỳ khoản chi nào. Cơ chế nói thẳng: **hàng đợi nhận yêu cầu do cầu nối/API gửi lên** (người yêu cầu + loại hành động + đích/tài nguyên + lý do + ngữ cảnh); quyết định trả về qua API để tài khoản yêu cầu đọc (`GET /api/approvals/:id`); nhật ký kiểm toán đầy đủ. **Hàng đợi KHÔNG chọc vào thẻ phê duyệt của chính app Muse** — nó là nơi duy nhất Giám đốc cần kiểm tra, không cần mở app Muse. UI ghi nhãn đúng như vậy ("Mọi yêu cầu quyền của các tài khoản — xem và duyệt tại đây, không cần mở app Muse") và chỉ báo chờ duyệt không thể bỏ sót: banner đỏ + số lượng + đèn đỏ trên nhân vật. Duyệt việc Kanban (cột "Chờ duyệt") chỉ là một tập con.
3. **Kênh cảnh báo: WhatsApp + banner nổi bật trong trung tâm điều hành.** Trình kiểm tra độc lập (`server/healthcheck.js`) ghi payload cảnh báo (JSONL) vào `server/alerts/outbox.jsonl` (biến môi trường `OFFICE_ALERT_OUTBOX`); việc giao tới WhatsApp của Giám đốc chạy qua lịch giao việc của Muse (không có tích hợp API WhatsApp trực tiếp — không tuyên bố có). Máy chủ cũng tự ghi cảnh báo `budget-full` và `director-api-denied` vào cùng hộp thư. Banner trong web (`#approval-banner`, `#budget-alerts`) hiển thị ngay khi có sự kiện.

## 3. Phụ lục 2 — đã áp dụng (23:27)

1. **Tài khoản đăng nhập riêng cho nhân viên (server):** bảng staff có username duy nhất, mật khẩu chỉ lưu dạng băm scrypt có muối (không bao giờ plaintext, không ghi log); Giám đốc tạo tài khoản + đặt mật khẩu ban đầu; nhân viên bắt buộc đổi ở lần đăng nhập đầu (mọi endpoint khác trả 403 cho tới khi đổi xong); Giám đốc reset/vô hiệu hóa/thu hồi được; xóa nhân viên thu hồi cả mật khẩu lẫn token API ngay lập tức. Web UI có form đăng nhập nhân viên + quản trị tài khoản trong mục tổ chức (tạo tài khoản, reset, vô hiệu hóa, xóa). Mô hình xác thực ghi trong README: Giám đốc = mật khẩu + TOTP (phiên, có thu hồi); nhân viên = username/mật khẩu cho web + token API riêng cho cầu nối.
2. **Cài đặt cầu nối đã xác nhận:** mỗi tài khoản cài `kit/bridge.js` — thực sự chạy được bằng Node, có `--config`, chế độ một lần `--request-approval`, watchdog backoff hàm mũ, tự dừng khi chạm ngân sách.
3. **Bộ kit + hướng dẫn:** `kit/` (bridge, config mẫu, install.sh, install.bat, README) + `docs/HUONG-DAN-CAI-DAT.md` tiếng Việt, bao phủ cả phía Giám đốc và phía nhân viên. Không bí mật nào được nướng sẵn trong kit: token/mật khẩu chỉ nhập lúc cài.
4. **Trao đổi tài liệu bằng link công khai của Muse:** mẫu chia sẻ (link + tiêu đề + tóm tắt ngắn, không dán toàn bộ nội dung) có trong hướng dẫn + tài liệu cầu nối. Web UI: thẻ việc và khung soạn `[ASK:Tên]` có trường "link đính kèm" (URL + tiêu đề), hiển thị dạng link bấm được và ghi vào luồng việc/nhật ký. Không xây hệ thống tải file lên; chỉ link.

## 4. Demo so với thật (nói thẳng)

| Phần | Trạng thái |
|---|---|
| Web tĩnh (`web/`) | DEMO: trạng thái trong localStorage, khóa đăng nhập Giám đốc là khóa DEMO có ghi nhãn rõ ràng, không có xác thực thật phía máy chủ. Không tuyên bố web tĩnh ép buộc bảo mật phía máy chủ. |
| Máy chủ (`server/`) | THẬT: xác thực thật (mật khẩu băm + TOTP, token theo phạm vi, kiểm tra quyền phía máy chủ trước mọi API, cấm tự duyệt phía máy chủ, nhật ký kiểm toán, SSE, heartbeat, ép ngân sách). Mật khẩu Giám đốc + TOTP secret chỉ qua biến môi trường. Băm mật khẩu Giám đốc trong bản demo dùng SHA-256; băm mật khẩu nhân viên dùng scrypt (xem README — việc nâng băm Giám đốc lên scrypt/argon2 là việc theo dõi, không giấu). |
| Số liệu "đã dùng" trong web | MÔ PHỎNG, ghi nhãn rõ. Chỉ con số 5.000.000.000 của điều phối là thật (được cấp). |
| Văn phòng 3D | DEMO trực quan trên dữ liệu thật của trang (vai trò, trạng thái, đèn phê duyệt phản ánh đúng state); chưa nối API máy chủ — nối ở Giai đoạn 2/3 theo lộ trình §10. |
| Cảnh báo WhatsApp | Hộp thư file/endpoint thật; việc giao tin chạy qua lịch giao việc của Muse — không có API WhatsApp trực tiếp. |

## 5. Cổng kiểm tra (lệnh 23:29) — bằng chứng

### Cổng 1 — node --check + khởi động không phụ thuộc: PASS
`node --check` OK cho `web/app.js`, `server/server.js`, `server/bridge.js`, `server/healthcheck.js`, `kit/bridge.js`; `bash -n kit/install.sh` OK; không TODO/FIXME. Máy chủ khởi động với DB tạm, `/api/health` trả 200, tắt sạch exit 0.

### Cổng 2 — hợp đồng API (DB tạm, đã dọn): PASS
Sai mật khẩu Giám đốc → 401; không xác thực → 401; đăng nhập Giám đốc chưa cấu hình → 503; token nhân viên gọi endpoint Giám đốc → 403 + bản ghi `director-api-denied` trong nhật ký kiểm toán + cảnh báo bảo mật trong hộp thư; yêu cầu phê duyệt (loại quyền đăng nhập, có đích/ngữ cảnh/nguồn) do token nhân viên gửi → Giám đốc quyết → người yêu cầu đọc quyết định qua GET; heartbeat ngân sách 800/1000 → cảnh báo 80% rồi trạng thái nghỉ 100% + mục `budget-full` trong hộp thư; heartbeat chấp nhận; SSE giao sự kiện `job created`.

### Cổng 3 — xác thực (curl, DB tạm): PASS
Tạo nhân viên `gateuser` + mật khẩu ban đầu → đăng nhập trả `mustChangePassword:true` → các endpoint khác 403 cho tới khi đổi → đổi mật khẩu thành công → đọc được việc; sai mật khẩu 401; trùng username 400; Giám đốc reset → lại bắt đổi; vô hiệu hóa → cả token lẫn đăng nhập đều 401; bật lại được; xóa → cả token lẫn đăng nhập đều 401. Nhân viên có vai trò Leader (được duyệt) tự duyệt yêu cầu của chính mình → 403 (cấm tự duyệt phía máy chủ); Giám đốc duyệt → 200.

### Cổng 4 — luồng web (Playwright, Chromium headless shell, chạy 29/10/2026 ~16:40 +07): PASS ở mức DOM, 3D UNTESTED
Kết quả đo được (tất cả đều `true`): tràn ngang desktop 1440px = 0px; 5 nút nhân viên; thêm vai trò xuất hiện trong mọi menu vai trò; thêm việc → Kanban "Chờ nhận" → chạy luồng → "Đang làm" → "Chờ duyệt" → duyệt → "Hoàn thành"; link đính kèm hiển thị dạng `<a>` bấm được; yêu cầu phê duyệt → banner "1 yêu cầu quyền đang chờ duyệt" + thẻ chứa đích + trạng thái "Cần duyệt"; tự duyệt bị chặn bằng thông báo + yêu cầu vẫn chờ; duyệt bởi Giám đốc → ghi nhật ký; **ma trận quyền 16/16 đúng** (4 danh tính × 4 hành động); mô phỏng ngân sách 100% của Muse → banner 100% + trạng thái nghỉ + nạp thêm → trở lại chờ; localStorage bền qua reload (việc + vai trò còn); biên bản họp ghi được; tài khoản demo nhân viên: tạo → đăng nhập bắt đổi mật khẩu → đổi xong; mobile 390px tràn ngang = 0px, nút camera bấm được (`aria-pressed=true`), không lỗi trang.
**UNTESTED — render 3D trực quan:** CDN jsDelivr bị chặn trong sandbox (`ERR_TUNNEL_CONNECTION_FAILED`) nên không có canvas; thông báo dự phòng "Không tải được Three.js" hiển thị đúng; không có lỗi JS nào sau bản sửa guard (xem §6). Các hàm camera/di chuyển/ăn mừng có guard khi scene chưa sẵn sàng và cập nhật trạng thái nút. Việc kiểm tra hình ảnh 3D thật (5 nhân vật, bàn, phòng họp, bảng Kanban, đi bộ, nhảy ăn mừng) PHẢI làm lại trên site đã deploy có mạng — không được coi là đã qua.

### Cổng 5 — bí mật / placeholder / vai trò cứng: PASS (có ghi chú)
Grep toàn cây (gồm `kit/`, `docs/`): không TODO/FIXME, không literal mật khẩu/token/khóa API. Ghi chú trung thực: dữ liệu hạt giống gán `roleId` khởi đầu cho từng người (Hùng → Quản lý dự án, v.v.) — đây là DỮ LIỆU mẫu có nhãn "do Giám đốc đặt, đổi được ngay", không phải quy tắc cứng: mọi quyền (duyệt, cấp ngân sách, đổi vai trò) đều tính từ vai trò hiện tại trong dữ liệu, và đổi vai trò cập nhật ngay nhãn 3D + quyền. Không có ánh xạ tên→quyền nào trong logic kiểm tra quyền.

### Cổng 6 — kit + cầu nối: PASS (có giới hạn ghi rõ)
`kit/install.sh --dry-run` trong thư mục tạm: exit 0, kiểm tra Node v24.22.1 đạt, không ghi file. Cầu nối đã kết nối máy chủ thử nghiệm, nhận ngữ cảnh nén, tham gia SSE; chế độ một lần `--request-approval` ("Tải file xuống") chờ và in "ĐÃ ĐƯỢC DUYỆT bởi s-chung". Giới hạn: dry-run chỉ kiểm tra Node; đường cài đặt đầy đủ (nhập liệu, systemd) chưa chạy vì không có credential thật — ghi UNTESTED cho đường cài đầy đủ, không coi là đã qua. `install.bat` chưa chạy trên Windows thật — UNTESTED.

### §6. Lỗi tìm thấy trong quá trình kiểm tra — đã sửa
1. **Hàm 3D chạm `this.THREE` trước khi sẵn sàng** (lỗi `Cannot read properties of undefined (reading 'Vector3')` khi bấm camera lúc CDN lỗi): đã thêm guard — camera cập nhật trạng thái nút và trả về sớm khi scene chưa sẵn sàng. Đã kiểm tra lại: không còn lỗi trang.
2. **Healthcheck spam lỗi `ENOENT` khi thư mục file trạng thái chưa tồn tại** (lộ khi `OFFICE_ALERT_OUTBOX` trỏ sang `/tmp` trong khi file trạng thái mặc định ở `server/alerts/` chưa có): đã sửa — tạo cả thư mục của file trạng thái (`mkdir` đệ quy cho cả hai đường dẫn). Kiểm tra lại: chạy với máy chủ chết, hộp thư + file trạng thái đều được tạo trong thư mục tạm chưa tồn tại, cảnh báo `server-down` ghi đúng, không còn lỗi ENOENT.

## 6. Lộ trình §10 + ghi công §8
Trong trang web (chân trang): bảng ghi công 5 dự án (Claw3D 2.407★, Agent Office 831★, Claw-Empire 1.430★, BagIdea Office 259★, Paperclip 108.483★ — đã kiểm chứng trên GitHub 29/10/2026) + phần kế thừa ở đâu; lộ trình 4 giai đoạn; 3 quyết định hiển thị là **ĐÃ QUYẾT** (không còn "đang mở"). Các bẫy đã tránh: Project Sid, AutoGen (ghi trong spec).

## 7. Việc còn mở (sau deploy)
- Kiểm tra hình ảnh 3D thật trên site đã deploy (mục 4, UNTESTED) + đường cài kit đầy đủ + `install.bat` trên Windows thật.
- Nâng băm mật khẩu Giám đốc từ SHA-256 lên scrypt/argon2 cho đồng nhất với băm nhân viên (theo dõi, không chặn deploy demo).
- Giai đoạn 2/3: nối web tĩnh với API máy chủ (hiện web dùng localStorage), triển khai cầu nối cho từng tài khoản thật.

## 8. Cách chạy
- Web tĩnh: `cd web && python3 -m http.server 8080` (hoặc deploy thư mục `web/` lên GitHub Pages).
- Máy chủ: `cd server && OFFICE_DIRECTOR_PASSWORD='...' OFFICE_TOTP_SECRET='...' node server.js` (xem README để biết đầy đủ biến môi trường; in hướng dẫn rõ khi khởi động).
- Cầu nối: `node bridge.js --config kit/config.example.json` sau khi điền cấu hình lúc cài đặt (xem `kit/README.md`).
