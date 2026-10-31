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
| Thử đồ AI | GET /api/try-on/config | công khai |
| | GET /api/try-on/active ; POST /api/try-on ; GET /api/try-on/:jobId/status ; GET /api/try-on/:jobId/result ; DELETE /api/try-on/:jobId | đăng nhập (chủ job) |

Cài đặt và vận hành tính năng thử đồ AI: xem `CATVTON_INTEGRATION.md`.

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

## 8. Cập nhật mới: đánh giá, bộ sưu tập, ảnh (chỉ thêm, không sửa chức năng cũ)
Các endpoint cũ giữ nguyên hành vi. Bản cập nhật chỉ **thêm** endpoint mới. Giao diện tự nhận biết: nếu máy chủ chưa có endpoint mới, tính năng đó chạy ở chế độ dự phòng và báo rõ trên màn hình, các phần còn lại vẫn dùng bình thường.

| Tính năng | Endpoint mới | Cần cập nhật database? |
|---|---|---|
| Khách đánh giá sao và nhận xét | POST /api/products/:id/reviews (đăng nhập, chỉ khi đã nhận hàng thành công) | Không (dùng bảng Review có sẵn) |
| Xem bộ sưu tập trang chủ | GET /api/collections | Có: thêm bảng Collection |
| Admin quản lý bộ sưu tập | GET, POST /api/admin/collections ; PUT, DELETE /api/admin/collections/:id ; POST /api/admin/collections/:id/move | Có: thêm bảng Collection |
| Admin tải ảnh lên | POST /api/admin/upload | Không |

## 9. upload code lên github
chạy 
git add .                                                                                                     
git commit -m "Tên lần upload đó (yêu cầu phải nêu rõ lần đó chỉnh sửa những gì)"
git push origin main 

**Cách cập nhật:**
1. Thay code backend bằng bản mới, cài lại và chạy lại server (trên Render: đẩy code lên rồi Deploy).
2. Chạy `npx prisma db push` một lần. Lệnh này chỉ **thêm** bảng Collection, không đụng tới bảng và dữ liệu cũ.
3. Vào trang admin, mở tab "Bộ sưu tập", bấm "Nhập bộ sưu tập mặc định" để tạo 5 bộ sưu tập ban đầu, sau đó thêm, sửa, ẩn, đổi thứ tự tùy ý.

**Quy tắc nghiệp vụ**
- Chỉ khách có đơn ở trạng thái "Đã giao" chứa sản phẩm đó mới gửi được đánh giá (1 đến 5 sao, nhận xét 5 đến 1000 ký tự). Mỗi khách một đánh giá cho mỗi sản phẩm, gửi lại sẽ cập nhật đánh giá cũ.
- Nút "Hoàn thành" của admin đưa đơn qua các trạng thái hợp lệ cho tới "Đã giao" bằng API đổi trạng thái sẵn có.
- Doanh thu trên trang tổng quan do giao diện tính, chỉ cộng các đơn "Đã giao". Số liệu trên server (`/api/admin/stats`) không bị thay đổi.
- Ảnh tải lên lưu trong `public/uploads/`. Trên Render gói miễn phí, ổ đĩa bị xóa mỗi lần deploy lại, nên hãy dán đường dẫn ảnh từ dịch vụ lưu trữ ảnh hoặc gắn Persistent Disk.

## 10. Quy trình 
  Bước 1. Khởi động CatVTON API
    Mở Anaconda Prompt hoặc PowerShell và chạy:
      cd "D:\Project 1\CatVTON-edited\CatVTON-AI"
      conda activate catvton311
      python api_server.py

    - Chờ API khởi động hoàn tất.
    - Giữ cửa sổ này mở.
    - Không tắt cửa sổ khi muốn website sử dụng tính năng thử đồ.
  Bước 2. Khởi động Cloudflare Tunnel
    Mở một cửa sổ PowerShell mới, chạy:
      cloudflared tunnel --url http://127.0.0.1:8000

    Cloudflare sẽ cung cấp URL dạng:
    https://ten-ngau-nhien.trycloudflare.com

    Giữ cửa sổ này mở.
  Bước 3. Kiểm tra kết nối
    Mở URL sau trên trình duyệt:
      https://shop-api-1-gvf9.onrender.com/api/try-on/config

    Nếu kết quả có:
    {
      "enabled": true,
      "online": true,
      "ready": true
    }

    thì backend đang nhận diện máy chủ AI là hoạt động.
  Bước 4. Nếu URL Tunnel thay đổi
    Nếu Cloudflare cấp URL mới, bạn cần cập nhật biến môi trường CATVTON_API_URL trên Render thành:
    https://ten-ngau-nhien.trycloudflare.com

    Sau đó lưu thay đổi và chờ Render deploy/restart hoàn tất.
