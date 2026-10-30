# Báo cáo kiểm thử — Thử đồ AI (CatVTON)

Ngày chạy: 30/10/2026. Môi trường: sandbox Linux trên cloud. **Không có GPU.**
Mọi mục ghi PASS bên dưới đều đã thực sự chạy. Mục nào chưa chạy được thì nằm ở phần "Chưa kiểm thử", không được ghi là đạt.

## Cách kiểm thử và giới hạn

| Thành phần | Chạy thật | Thay thế trong sandbox |
|---|---|---|
| CatVTON API (`api_server.py`, `tryon_api/job_queue.py`, `images.py`, `settings.py`) | Có, qua HTTP thật (uvicorn) | Lớp inference (`CatVTONEngine`) được thay bằng một **engine giả chỉ dùng cho test** (sinh ảnh màu, có độ trễ từng bước, có thể giả lập OOM). Engine giả nằm trong `tests/` và script test, **không có trong code production**. |
| Shop_API (Express, routes, giới hạn, khóa advisory) | Có, với PostgreSQL 16 thật | Prisma: máy chủ tải engine Prisma (`binaries.prisma.sh`) bị chặn trong sandbox, nên bản test dùng **Prisma 7.10.1 + `@prisma/adapter-pg`**, và bảng được tạo bằng DDL viết tay tương đương `schema.prisma`. Code của repo vẫn dùng Prisma 5.22; chỉ dòng khởi tạo `PrismaClient` trong bản sao test là khác. TypeScript `tsc --noEmit` đạt. |
| Frontend (`public/`) | Có, Chromium thật (Playwright), desktop 1280px + điện thoại 390px | Gọi backend local thay cho Render |

Lệnh tái chạy test CatVTON: `cd CatVTON-AI && python -m pytest tests -q`

## Kết quả — 13/13 test pytest của CatVTON API (đạt)

- Thiếu hoặc sai `X-API-Key` → 401. Không đặt key thì service từ chối khởi động.
- Luồng đầy đủ: 202 → completed → `/result` trả bytes PNG → lấy lại được trong thời gian ân hạn → DELETE giải phóng → 410.
- `job_id` trùng → trả lại job cũ (idempotent).
- 20 request đồng thời: tối đa 1 job chạy + 5 job chờ, còn lại 429, hàng đợi không vượt giới hạn.
- Vị trí hàng đợi đúng; hủy job đang chờ làm vị trí các job sau cập nhật lại.
- Hủy job đang chạy (dừng ở bước denoising kế tiếp) → `cancelled`.
- Timeout → `TIMEOUT`, hàng đợi vẫn chạy tiếp các job sau.
- `GPU_OOM` và exception bất kỳ trong inference: worker không chết, job sau vẫn chạy.
- Ảnh rỗng, file giả PNG, ảnh quá dung lượng, `cloth_type` sai, số bước sai → 400/413.
- Model không tải được (không có CUDA) → `/health` báo `unavailable`, `POST` trả 503, service không crash.
- Ảnh kết quả hết hạn bị xóa; metadata cũ bị dọn; ảnh đầu vào bị bỏ khỏi RAM ngay khi job kết thúc.
- Watchdog phát hiện worker treo → đánh dấu `TIMEOUT`, kết quả đến muộn bị bỏ.

## Kết quả — tích hợp Shop_API ↔ CatVTON (53/53 đạt)

**Chức năng và bảo mật**

- Chưa đăng nhập → 401.
- File không phải ảnh (MIME giả) → 400; ảnh > 10MB → 413; thiếu `Idempotency-Key` → 400.
- Phụ kiện → 400 `NOT_SUPPORTED`; sản phẩm đã ẩn → 404.
- Gửi `imageUrl` tùy ý → 400. Ảnh sản phẩm là URL ngoài chưa được cho phép → 422 (chống SSRF).
- Ảnh sản phẩm từ `/api/uploads/:id` và từ `/images/...` đều dùng được.
- `Product.tryOnType=lower` được dùng thay cho loại mặc định của danh mục (đã kiểm tra trong DB).
- Job hợp lệ → 202 kèm vị trí hàng đợi thật → completed → `GET /result` trả **PNG trực tiếp** (`Cache-Control: no-store, private`).
- Lấy lại ảnh lần 2 vẫn được → DELETE giải phóng → 410.
- Người dùng khác xem, lấy ảnh hoặc hủy job → 404.
- `/active` khôi phục đúng job đang chạy.
- Bảng `TryOnJob` không có cột bytea nào: database chỉ chứa metadata.
- Gọi thẳng CatVTON không có key → 401.
- Frontend không chứa URL máy AI hay khóa.

**Giới hạn và đồng thời**

- Gửi lại cùng `Idempotency-Key` → cùng job, không tạo job mới.
- Đang có job → 429 `ACTIVE_JOB_EXISTS`.
- **6 request đồng thời cùng tài khoản → đúng 1 job được tạo** (khóa `pg_advisory_xact_lock`).
- Lượt thứ 4 trong 10 phút → 429 `RATE_LIMITED`, `Retry-After` khoảng 595 giây.
- Giới hạn ngày (đặt `TRYON_DAILY_LIMIT=2` để test) → 429 `DAILY_LIMIT`.
- **9 tài khoản gửi cùng lúc → 6 được nhận, 3 bị 503 `QUEUE_FULL`**; các lượt bị từ chối không bị trừ.
- Hủy job đang chờ → `cancelled`; các job còn lại đều kết thúc, không kẹt.
- Lỗi đầu vào, máy AI tắt, timeout, OOM: đều không trừ lượt.

**Lỗi hạ tầng**

- Máy AI hoặc Tunnel tắt → 503 `SERVICE_OFFLINE` kèm `Retry-After`; backend không crash; các API mua sắm khác vẫn chạy; `/try-on/config` báo `online:false`.
- Tunnel đứt khi job đang chạy → `/status` vẫn trả về với `serviceReachable:false`, job giữ trạng thái chờ.
- CatVTON khởi động lại → job báo `failed`/`JOB_LOST` (không treo); người dùng thử lại được ngay.
- **Shop_API khởi động lại giữa chừng** → job vẫn được theo dõi tiếp và hoàn thành.
- Inference vượt `MAX_JOB_TIMEOUT` → `TIMEOUT`. OOM → `GPU_OOM`, service vẫn chạy.
- Dọn dẹp định kỳ: job treo 30 phút → `FAILED`; metadata 3 ngày tuổi → bị xóa.

**Không làm hỏng chức năng cũ**

- `GET /api/products`, `GET /api/products/:slug`, `GET /api/cart` vẫn hoạt động.
- CORS cho phép `https://shop-9be.pages.dev` (kèm header `Idempotency-Key`) và các domain preview `*.shop-9be.pages.dev`; chặn origin lạ.

## Kết quả — giao diện trên trình duyệt (17/17 đạt)

- Phụ kiện không có nút; Áo có nút "Thử đồ với AI" đặt cạnh nút Yêu thích, cùng kiểu với các nút có sẵn.
- Nút "Bắt đầu" bị khóa khi chưa chọn ảnh. Ảnh sai định dạng báo lỗi ngay mà không gửi request.
- Có xem trước, đổi ảnh và xóa ảnh; ảnh không tự gửi khi chưa xác nhận.
- Trạng thái thật: "Đang chờ đến lượt — vị trí thứ 1 trong hàng đợi", rồi "AI đang xử lý ảnh…".
- Tải lại trang khi job đang chạy → mở lại cửa sổ thì khôi phục đúng trạng thái.
- Ảnh kết quả hiển thị trực tiếp; nút "Tải ảnh về" tải được file `thu-do-ao-thun.png`.
- Double-click hoặc bấm liên tục → chỉ 1 request POST.
- Đóng cửa sổ (Esc) → gọi giải phóng ảnh trên máy AI.
- Màn hình điện thoại không bị tràn ngang.
- Chưa đăng nhập → chuyển sang trang đăng nhập.
- Không có lỗi JavaScript trên trang.

## Chưa kiểm thử (cần bạn chạy trên máy thật)

1. **Inference thật bằng CatVTON trên RTX 4060 Laptop 8GB.** Chưa đo được VRAM, thời gian mỗi ảnh, và lỗi OOM thật. Phần `CatVTONEngine` mới chỉ được kiểm tra cú pháp; bước `step_callback` trong `model/pipeline.py` chưa chạy với torch thật.
2. Cài đặt trên **Windows**, gồm `requirements.txt` gốc (`setuptools==51.0.0`, `pycocotools`) và `start_api.bat`.
3. **Cloudflare Quick Tunnel** thật, và **Render** thật (cold start của gói free, `npx prisma db push` trên database thật).
4. Hàm khởi tạo Prisma **5.22** chạy với code mới. Truy vấn giống hệt, nhưng chưa chạy được trong sandbox vì engine bị chặn.
5. Starlette mà gradio 4.41 kéo về có hỗ trợ `spool_max_size` (giữ ảnh upload trong RAM) hay không. Nếu không, log khởi động sẽ báo.

Gợi ý checklist khi chạy thật: mục 7 (curl với ảnh mẫu của repo), mục 13 và mục 14 trong `CATVTON_INTEGRATION.md`.
