# Cập nhật repo Shop_API: sửa 3 lỗi (xóa sản phẩm, đổi thứ tự bộ sưu tập, tải ảnh lên)

## 1. File cần đưa lên GitHub (giữ đúng đường dẫn)
| File | Việc cần làm |
|---|---|
| `prisma/schema.prisma` | Thay thế |
| `src/index.ts` | Thay thế |
| `src/routes/admin.ts` | Thay thế |
| `src/routes/orders.ts` | Thay thế |
| `src/routes/uploads.ts` | Thêm mới |
| `public/api.js` | Thay thế |
| `public/app.js` | Thay thế |
| `.gitignore` | Thay thế |

Các file còn lại trong repo (kể cả `check-admin.ts`, `create-admin.ts`, `seed.ts`, `index.html`, `style.css`, logo và ảnh) giữ nguyên.

## 2. Sau khi đẩy code: chạy MỘT lần `npx prisma db push`
Trên Render: mở tab **Shell** của service rồi chạy lệnh này, hoặc đổi Build Command thành
`npm install && npx prisma db push`.
Lệnh này chỉ thay đổi cấu trúc, không xóa dữ liệu:
- thêm bảng `Upload` (lưu ảnh tải lên ngay trong database, không mất khi Render khởi động lại);
- cho phép `OrderItem.variantId` để trống và xóa theo kiểu "giữ lịch sử đơn" (nội dung đơn hàng cũ vẫn còn tên, giá, số lượng);
- mục trong giỏ hàng tự xóa khi sản phẩm bị xóa.

Nếu deploy code mà chưa chạy lệnh trên: xóa sản phẩm đã có đơn sẽ chuyển thành "ẩn", và tải ảnh sẽ báo lỗi cho tới khi chạy xong.

## 3. Điều đã sửa
**Không xóa được sản phẩm có sẵn (thắt lưng da, khăn lụa...).** Các sản phẩm này đã có trong đơn hàng hoặc giỏ hàng nên database chặn xóa, và trước đây hệ thống chỉ ẩn đi mà không báo rõ. Giờ xóa hẳn được, lịch sử đơn vẫn giữ. Tab Sản phẩm của admin cũng hiện cả sản phẩm đã bị ẩn trước đó, kèm nhãn "Đã ẩn", để bạn xóa nốt.

**Không đổi được thứ tự bộ sưu tập.** Backend thiếu endpoint đổi thứ tự, và mọi bộ sưu tập đang có cùng `position = 0`. Đã thêm `POST /api/admin/collections/:id/move`, đánh lại số thứ tự 1..n, và giao diện tự dùng cách dự phòng nếu server chưa có endpoint. Sửa tên bộ sưu tập không còn làm mất vị trí.

**Không tải được ảnh sản phẩm.** Backend thiếu `POST /api/admin/upload`. Đã thêm: ảnh (PNG, JPEG, WebP) được thu nhỏ ở trình duyệt, lưu trong database, xem tại `/api/uploads/:id`. Thư mục `images/` ở gốc repo cũng được phục vụ tại `/images/...` (ví dụ `/images/products/Ao-khoac-bomber-den.jpg`), dán được vào ô "đường dẫn ảnh".

**Lỗi phụ đã sửa:** `/api/collections` nằm sau `errorHandler` trong `index.ts` nên lỗi trả về HTML thay vì JSON.

## 4. Cách kiểm tra sau khi deploy
1. Admin, tab Sản phẩm, bấm Xóa "Thắt lưng da": sản phẩm biến mất, vào lại vẫn không còn.
2. Admin, tab Bộ sưu tập, bấm ↑ ↓ rồi mở trang chủ: băng chuyền theo đúng thứ tự mới, tải lại trang vẫn giữ.
3. Admin, Sửa sản phẩm, chọn tệp ảnh: ảnh xem trước hiện ra, bấm Lưu, ra trang chủ thấy ảnh mới. Tải lại trang, ảnh vẫn còn.

## 5. Bảo mật: nhớ đổi mật khẩu admin
`create-admin.ts` ghi sẵn `admin@shop.local` / `Admin@12345` trong repo công khai. Hãy đăng nhập admin, đổi mật khẩu ở trang Tài khoản, và nên sửa file đó để đọc mật khẩu từ biến môi trường.