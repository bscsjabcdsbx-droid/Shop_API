# HƯỚNG DẪN SỬ DỤNG shop-api (MONO)

shop-api là máy chủ Node.js + Express + Prisma + PostgreSQL. Nó cũng phục vụ luôn giao diện web trong thư mục `public/`, nên chỉ cần chạy một lệnh là có cả website lẫn API ở `http://localhost:4000`.

## 1. Cần có
- Node.js 20 trở lên
- PostgreSQL 14 trở lên (cài sẵn, hoặc chạy bằng Docker)

Chạy PostgreSQL nhanh bằng Docker:
```
docker run --name mono-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shop -p 5432:5432 -d postgres:16
```

## 2. Cài đặt (làm một lần)
```
cd shop-api
cp .env.example .env        # Windows: copy .env.example .env
```
Mở `.env` và chỉnh:
- `DATABASE_URL` : chuỗi kết nối PostgreSQL (mặc định khớp lệnh Docker ở trên)
- `JWT_SECRET`   : chuỗi ngẫu nhiên dài từ 16 ký tự trở lên, KHÔNG dùng lại giá trị mẫu khi triển khai thật
- `PORT`         : mặc định 4000

Sau đó:
```
npm install                 # tự chạy prisma generate
npm run db:push             # tạo bảng trong database
npm run seed                # nạp 5 danh mục, 20 sản phẩm, 2 tài khoản
```
Cảnh báo: `npm run seed` XÓA sạch dữ liệu cũ rồi nạp lại. Chỉ chạy khi muốn làm mới.

## 3. Chạy
```
npm run dev                 # tự khởi động lại khi sửa code
# hoặc
npm start
```
Mở http://localhost:4000 để dùng website. Kiểm tra API: http://localhost:4000/api/health trả về {"ok":true}.

Tài khoản demo:
- Admin: admin@shop.local / Admin@12345
- Khách: khach@shop.local / Khach@12345

Nếu trình duyệt hiện thông báo "chế độ demo" nghĩa là web không gọi được API (chưa chạy server hoặc sai địa chỉ). Dữ liệu lúc đó chỉ lưu trong trình duyệt.

## 4. Danh sách API
Gửi token trong header `Authorization: Bearer <token>`. Token nhận được khi đăng ký hoặc đăng nhập, hạn 7 ngày.

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Hệ thống | GET /api/health | công khai |
| Tài khoản | POST /api/auth/register, POST /api/auth/login | công khai |
| | GET, PATCH /api/auth/me ; POST /api/auth/change-password | đăng nhập |
| Sản phẩm | GET /api/products (q, category, minPrice, maxPrice, size, color, inStock, sort, page, limit) | công khai |
| | GET /api/products/categories ; GET /api/products/:slug | công khai |
| Giỏ hàng | GET /api/cart ; POST /api/cart/items ; PATCH, DELETE /api/cart/items/:id | đăng nhập |
| Đơn hàng | POST /api/orders ; GET /api/orders ; GET /api/orders/:code ; POST /api/orders/:code/cancel | đăng nhập |
| Admin | GET /api/admin/stats | admin |
| | GET, POST /api/admin/products ; PUT, DELETE /api/admin/products/:id ; PATCH /api/admin/variants/:id/stock | admin |
| | GET /api/admin/orders ; PATCH /api/admin/orders/:id/status | admin |
| | GET /api/admin/customers ; GET /api/admin/customers/:id/orders ; PATCH /api/admin/customers/:id/active | admin |

Thử nhanh bằng curl:
```
curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@shop.local","password":"Admin@12345"}'
curl http://localhost:4000/api/products?category=ao&sort=price_asc
```

## 5. Quy tắc nghiệp vụ cần biết
- Đặt hàng chạy trong một giao dịch: trừ kho có điều kiện, tạo đơn, xóa giỏ. Hai người mua món cuối cùng cùng lúc thì chỉ một người đặt được.
- Phí giao hàng cố định 30.000đ, miễn phí từ 500.000đ. Giao nhanh chưa hỗ trợ.
- Khách chỉ hủy được đơn ở trạng thái "Chờ xác nhận". Hủy đơn sẽ hoàn lại kho.
- Admin đổi trạng thái theo thứ tự: Chờ xác nhận, Đã xác nhận, Đang chuẩn bị, Đang giao, Đã giao. Có thể hủy trước khi giao.
- Xóa sản phẩm đã có đơn hàng sẽ chuyển sang trạng thái ẩn thay vì xóa hẳn, để giữ lịch sử đơn.
- Wishlist hiện lưu trong trình duyệt, chưa có API.

## 6. Xử lý lỗi thường gặp
- `P1001 Can't reach database server`: PostgreSQL chưa chạy hoặc `DATABASE_URL` sai.
- `JWT_SECRET phải có ít nhất 16 ký tự`: sửa lại `.env`.
- `EADDRINUSE`: cổng 4000 đang bị dùng, đổi `PORT` trong `.env`.
- Web hiện "chế độ demo": mở http://localhost:4000 (không mở file index.html trực tiếp) và chắc chắn server đang chạy.
- Đổi cấu trúc bảng trong `prisma/schema.prisma` rồi chạy lại `npm run db:push`.

## 7. Khi đưa lên máy chủ thật
- Đặt `JWT_SECRET` ngẫu nhiên dài, đổi mật khẩu 2 tài khoản demo hoặc xóa chúng.
- Chạy sau HTTPS (Nginx, Caddy hoặc dịch vụ hosting).
- Dùng PostgreSQL có sao lưu định kỳ.
- Đặt `CLIENT_ORIGIN` đúng tên miền nếu giao diện chạy ở domain khác với API.

## 8. Cập nhật: ảnh sản phẩm, hoàn thành đơn, doanh thu
- Sau khi cập nhật code, chạy lại `npm run db:push` để thêm cột `deliveredAt` vào bảng Order. Dữ liệu cũ được giữ nguyên.
- **Doanh thu chỉ tính các đơn đã hoàn thành** (trạng thái "Đã giao"). Trong trang admin, mỗi đơn chưa xong có nút "Hoàn thành". Bấm nút này, đơn chuyển sang "Đã giao" và doanh thu được cộng ngay. Tháng ghi nhận doanh thu là tháng hoàn thành.
- API mới: `POST /api/admin/orders/:id/complete` (hoàn thành đơn), `POST /api/admin/upload` (tải ảnh lên, body `{ "dataUrl": "data:image/jpeg;base64,..." }`, trả về `{ "url": "/uploads/xxxx.jpg" }`).
- Ảnh tải lên được lưu trong `public/uploads/`. Hãy sao lưu thư mục này cùng database. Mỗi sản phẩm tối đa 8 ảnh, chỉ nhận PNG, JPEG, WebP.
- Thêm ảnh trong trang admin: bấm Thêm hoặc Sửa sản phẩm, chọn tệp ảnh từ máy (tự thu nhỏ về tối đa 900px) hoặc dán đường dẫn ảnh. Ảnh đầu tiên là ảnh chính.