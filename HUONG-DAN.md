# HƯỚNG DẪN SỬ DỤNG SHOP-API (MONO)

`shop-api` là máy chủ Node.js + Express + Prisma + PostgreSQL. Dự án
cũng phục vụ giao diện web trong thư mục `public/`, vì vậy có thể chạy
website và API cùng lúc tại:

-   Website: http://localhost:4000
-   API: `http://localhost:4000/api`

------------------------------------------------------------------------

## 1. Yêu cầu trước khi cài đặt

-   Node.js phiên bản 20 trở lên.
-   PostgreSQL phiên bản 14 trở lên (cài trực tiếp hoặc chạy bằng
    Docker).

### Chạy PostgreSQL bằng Docker

Nếu đã cài Docker Desktop, có thể tạo PostgreSQL bằng lệnh:

``` bash
docker run --name mono-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shop -p 5432:5432 -d postgres:16
```

------------------------------------------------------------------------

## 2. Cài đặt lần đầu

Mở Terminal hoặc PowerShell tại thư mục dự án:

``` powershell
cd shop-api
copy .env.example .env
```

Mở file `.env` và cấu hình các biến:

-   `DATABASE_URL`: chuỗi kết nối PostgreSQL. Nếu dùng đúng lệnh Docker
    ở trên, cấu hình phải khớp với thông tin của container.
-   `JWT_SECRET`: chuỗi ngẫu nhiên dài ít nhất 16 ký tự. Không sử dụng
    giá trị mẫu khi triển khai thật.
-   `PORT`: cổng chạy máy chủ, mặc định là `4000`.

**Lưu ý:** Không đưa file `.env` lên GitHub và không chia sẻ mật khẩu,
token hoặc chuỗi kết nối cơ sở dữ liệu.

Cài thư viện và khởi tạo database:

``` bash
npm install
npm run db:push
npm run seed
```

-   `npm install`: cài các thư viện cần thiết.
-   `npm run db:push`: đồng bộ cấu trúc Prisma với database.
-   `npm run seed`: tạo dữ liệu mẫu gồm 5 danh mục, 20 sản phẩm và 2 tài
    khoản.

> **Cảnh báo:** `npm run seed` xóa dữ liệu cũ trước khi nạp dữ liệu mẫu.
> Chỉ chạy khi thực sự muốn làm mới database.

------------------------------------------------------------------------

## 3. Khởi động website và API

Chạy ở chế độ phát triển:

``` bash
npm run dev
```

Hoặc chạy chế độ thông thường:

``` bash
npm start
```

Mở website:

http://localhost:4000

Kiểm tra API:

http://localhost:4000/api/health

Nếu máy chủ hoạt động, API trả về:

``` json
{"ok":true}
```

### Tài khoản demo

  Vai trò      Email                Mật khẩu
  ------------ -------------------- ---------------
  Admin        `admin@shop.local`   `Admin@12345`
  Khách hàng   `khach@shop.local`   `Khach@12345`

Đây là tài khoản dùng cho môi trường demo. Khi triển khai thật, hãy đổi
mật khẩu hoặc xóa tài khoản demo.

Nếu trình duyệt hiển thị thông báo **"chế độ demo"**, nghĩa là giao diện
không gọi được API (máy chủ chưa chạy hoặc địa chỉ API chưa đúng). Dữ
liệu ở chế độ này chỉ được lưu trong trình duyệt.

------------------------------------------------------------------------

## 4. Danh sách API

Các API yêu cầu đăng nhập sử dụng token trong header:

``` http
Authorization: Bearer <token>
```

Token được cấp khi đăng ký hoặc đăng nhập và có thời hạn 7 ngày.

  Nhóm        Endpoint                                  Quyền
  ----------- ----------------------------------------- ---------------------
  Hệ thống    `GET /api/health`                         Công khai
  Tài khoản   `POST /api/auth/register`                 Công khai
  Tài khoản   `POST /api/auth/login`                    Công khai
  Tài khoản   `GET /api/auth/me`                        Đăng nhập
  Tài khoản   `PATCH /api/auth/me`                      Đăng nhập
  Tài khoản   `POST /api/auth/change-password`          Đăng nhập
  Sản phẩm    `GET /api/products`                       Công khai
  Sản phẩm    `GET /api/products/categories`            Công khai
  Sản phẩm    `GET /api/products/:slug`                 Công khai
  Giỏ hàng    `GET /api/cart`                           Đăng nhập
  Giỏ hàng    `POST /api/cart/items`                    Đăng nhập
  Giỏ hàng    `PATCH /api/cart/items/:id`               Đăng nhập
  Giỏ hàng    `DELETE /api/cart/items/:id`              Đăng nhập
  Đơn hàng    `POST /api/orders`                        Đăng nhập
  Đơn hàng    `GET /api/orders`                         Đăng nhập
  Đơn hàng    `GET /api/orders/:code`                   Đăng nhập
  Đơn hàng    `POST /api/orders/:code/cancel`           Đăng nhập
  Admin       `GET /api/admin/stats`                    Admin
  Admin       `GET /api/admin/products`                 Admin
  Admin       `POST /api/admin/products`                Admin
  Admin       `PUT /api/admin/products/:id`             Admin
  Admin       `DELETE /api/admin/products/:id`          Admin
  Admin       `PATCH /api/admin/variants/:id/stock`     Admin
  Admin       `GET /api/admin/orders`                   Admin
  Admin       `PATCH /api/admin/orders/:id/status`      Admin
  Admin       `GET /api/admin/customers`                Admin
  Admin       `GET /api/admin/customers/:id/orders`     Admin
  Admin       `PATCH /api/admin/customers/:id/active`   Admin
  Thử đồ AI   `GET /api/try-on/config`                  Công khai
  Thử đồ AI   `GET /api/try-on/active`                  Đăng nhập (chủ job)
  Thử đồ AI   `POST /api/try-on`                        Đăng nhập
  Thử đồ AI   `GET /api/try-on/:jobId/status`           Đăng nhập (chủ job)
  Thử đồ AI   `GET /api/try-on/:jobId/result`           Đăng nhập (chủ job)
  Thử đồ AI   `DELETE /api/try-on/:jobId`               Đăng nhập (chủ job)

Endpoint `GET /api/products` hỗ trợ các tham số lọc và phân trang như
`q`, `category`, `minPrice`, `maxPrice`, `size`, `color`, `inStock`,
`sort`, `page`, `limit`.

### Thử API nhanh bằng curl

Đăng nhập:

``` bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@shop.local\",\"password\":\"Admin@12345\"}"
```

Lấy danh sách sản phẩm:

``` bash
curl "http://localhost:4000/api/products?category=ao&sort=price_asc"
```

------------------------------------------------------------------------

## 5. Quy tắc nghiệp vụ

### Đặt hàng và tồn kho

-   Đặt hàng được xử lý trong một giao dịch: kiểm tra và trừ kho có điều
    kiện, tạo đơn hàng, sau đó xóa giỏ hàng.
-   Nếu hai khách cùng đặt sản phẩm cuối cùng, chỉ một đơn được chấp
    nhận.

### Phí giao hàng

-   Phí giao hàng cố định: 30.000đ.
-   Miễn phí giao hàng cho đơn từ 500.000đ.
-   Chưa hỗ trợ giao hàng nhanh.

### Hủy đơn và cập nhật trạng thái

-   Khách chỉ được hủy đơn ở trạng thái **Chờ xác nhận**.
-   Khi hủy đơn, số lượng sản phẩm được hoàn lại kho.
-   Admin cập nhật trạng thái theo thứ tự: **Chờ xác nhận → Đã xác nhận
    → Đang chuẩn bị → Đang giao → Đã giao**.
-   Có thể hủy đơn trước khi đơn được giao.

### Sản phẩm và wishlist

-   Nếu sản phẩm đã có trong đơn hàng, thao tác xóa sẽ chuyển sản phẩm
    sang trạng thái ẩn để giữ lịch sử đơn hàng.
-   Wishlist hiện được lưu trong trình duyệt, chưa có API riêng.

------------------------------------------------------------------------

## 6. Xử lý lỗi thường gặp

  ---------------------------------------------------------------------------
  Lỗi                                     Nguyên nhân và cách xử lý
  --------------------------------------- -----------------------------------
  `P1001 Can't reach database server`     PostgreSQL chưa chạy hoặc
                                          `DATABASE_URL` chưa đúng. Kiểm tra
                                          PostgreSQL và file `.env`.

  `JWT_SECRET phải có ít nhất 16 ký tự`   Cập nhật `JWT_SECRET` trong `.env`
                                          thành chuỗi đủ dài.

  `EADDRINUSE`                            Cổng 4000 đang được chương trình
                                          khác sử dụng. Dừng chương trình đó
                                          hoặc đổi `PORT` trong `.env`.

  Website hiện "chế độ demo"              Mở website qua
                                          `http://localhost:4000`, không mở
                                          trực tiếp file `index.html`; đồng
                                          thời kiểm tra máy chủ có đang chạy
                                          hay không.

  Thay đổi `prisma/schema.prisma`         Chạy lại `npm run db:push` sau khi
                                          kiểm tra thay đổi schema.
  ---------------------------------------------------------------------------

------------------------------------------------------------------------

## 7. Lưu ý khi triển khai lên máy chủ thật

-   Đặt `JWT_SECRET` ngẫu nhiên, đủ mạnh.
-   Đổi mật khẩu hoặc xóa hai tài khoản demo.
-   Chỉ phục vụ website/API qua HTTPS.
-   Sử dụng PostgreSQL có sao lưu định kỳ.
-   Đặt `CLIENT_ORIGIN` đúng domain frontend nếu giao diện và API chạy ở
    hai domain khác nhau.
-   Không commit file `.env`, mật khẩu, token hoặc thông tin kết nối
    database lên GitHub.

------------------------------------------------------------------------

## 8. Cập nhật: đánh giá, bộ sưu tập và tải ảnh

Bản cập nhật này bổ sung endpoint mới, không chủ đích thay đổi hành vi
các endpoint cũ. Giao diện tự kiểm tra khả năng hỗ trợ: nếu máy chủ chưa
có endpoint mới, tính năng tương ứng sẽ chạy ở chế độ dự phòng và thông
báo rõ trên màn hình.

  ----------------------------------------------------------------------------------------
  Tính năng               Endpoint mới                             Cần cập nhật database?
  ----------------------- ---------------------------------------- -----------------------
  Khách đánh giá sao và   `POST /api/products/:id/reviews` (đăng   Không, dùng bảng
  nhận xét                nhập; chỉ khi đã nhận hàng thành công)   `Review` có sẵn

  Xem bộ sưu tập trang    `GET /api/collections`                   Có, thêm bảng
  chủ                                                              `Collection`

  Admin quản lý bộ sưu    `GET /api/admin/collections`             Có, thêm bảng
  tập                                                              `Collection`

  Admin tạo bộ sưu tập    `POST /api/admin/collections`            Có, thêm bảng
                                                                   `Collection`

  Admin sửa bộ sưu tập    `PUT /api/admin/collections/:id`         Có, thêm bảng
                                                                   `Collection`

  Admin xóa bộ sưu tập    `DELETE /api/admin/collections/:id`      Có, thêm bảng
                                                                   `Collection`

  Admin đổi thứ tự bộ sưu `POST /api/admin/collections/:id/move`   Có, thêm bảng
  tập                                                              `Collection`

  Admin tải ảnh lên       `POST /api/admin/upload`                 Không
  ----------------------------------------------------------------------------------------

### Cách cập nhật

1.  Thay code backend bằng bản mới.

2.  Cài lại thư viện nếu cần và chạy build/kiểm tra dự án.

3.  Đẩy code lên GitHub để Render triển khai bản mới.

4.  Chạy lệnh sau **một lần** để đồng bộ schema database:

    ``` bash
    npx prisma db push
    ```

    Lệnh này đồng bộ cấu trúc schema hiện tại, trong đó có bảng
    `Collection`. Trước khi chạy trên database thật, hãy sao lưu dữ liệu
    và kiểm tra thay đổi schema; không nên mặc định rằng `db push` chỉ
    thêm bảng trong mọi trường hợp.

5.  Vào trang Admin, mở tab **Bộ sưu tập**, bấm **Nhập bộ sưu tập mặc
    định** để tạo 5 bộ sưu tập ban đầu.

6.  Sau đó có thể thêm, sửa, ẩn hoặc đổi thứ tự bộ sưu tập.

### Quy tắc nghiệp vụ mới

-   Chỉ khách có đơn ở trạng thái **Đã giao** và đơn đó chứa sản phẩm
    tương ứng mới được đánh giá sản phẩm.
-   Đánh giá gồm 1--5 sao và nhận xét từ 5--1000 ký tự.
-   Mỗi khách có một đánh giá cho mỗi sản phẩm. Gửi đánh giá lại sẽ cập
    nhật đánh giá cũ.
-   Nút **Hoàn thành** của admin đưa đơn qua các trạng thái hợp lệ cho
    tới **Đã giao**, thông qua API đổi trạng thái hiện có.
-   Doanh thu trên trang tổng quan do giao diện tính và chỉ cộng các đơn
    **Đã giao**. Số liệu server tại `/api/admin/stats` không bị thay
    đổi.
-   Ảnh tải lên được lưu trong `public/uploads/`. Với Render gói miễn
    phí, tệp trên ổ đĩa tạm có thể mất khi triển khai lại. Nên dùng dịch
    vụ lưu trữ ảnh bên ngoài hoặc Persistent Disk nếu dịch vụ và gói
    đang dùng hỗ trợ.

------------------------------------------------------------------------

## 9. Quy trình khởi động máy chủ thử đồ AI CatVTON

Máy chủ AI chạy trên máy tính cá nhân, còn backend chính chạy trên
Render. Vì vậy, khi tắt máy tính, tính năng thử đồ AI trên website sẽ
tạm thời không hoạt động.

Mỗi lần bật máy và muốn sử dụng thử đồ AI, thực hiện các bước sau.

### Bước 1. Khởi động CatVTON API

Mở Anaconda Prompt hoặc CMD và chạy:

``` CMD
cd "D:\Project 1\CatVTON-AI"
d:
conda activate catvton311
start_api.bat
```

-   Chờ API khởi động hoàn tất.
-   Giữ cửa sổ này mở trong suốt thời gian sử dụng tính năng thử đồ.
-   Không đóng cửa sổ khi website còn cần gọi máy chủ AI.

### Bước 2. Khởi động Cloudflare Tunnel

Mở **một cửa sổ PowerShell mới**, sau đó chạy:

``` powershell
cloudflared tunnel --url http://127.0.0.1:8000
```

Cloudflare sẽ hiển thị một URL có dạng:

``` text
https://ten-ngau-nhien.trycloudflare.com
```

Giữ cửa sổ Tunnel mở. Đây là đường kết nối để backend Render gọi đến máy
chủ AI đang chạy trên máy tính cá nhân.

### Bước 3. Cập nhật URL nếu Cloudflare cấp URL mới

Quick Tunnel có thể tạo URL mới sau khi khởi động lại. Nếu URL thay đổi:

1.  Sao chép URL `https://...trycloudflare.com` mới từ cửa sổ Cloudflare
    Tunnel.

2.  Mở trang quản lý dịch vụ backend trên Render.

3.  Vào phần **Environment**.

4.  Cập nhật biến `CATVTON_API_URL` thành URL mới, ví dụ:

    ``` text
    CATVTON_API_URL=https://ten-ngau-nhien.trycloudflare.com
    ```

5.  Lưu thay đổi và chờ Render khởi động lại/deploy hoàn tất.

6.  Mở lại endpoint kiểm tra trạng thái ở Bước 3.

**Không** thêm đường dẫn `/health` vào cuối `CATVTON_API_URL`, trừ khi
cấu hình của phiên bản backend yêu cầu rõ điều đó.

### Bước 4. Kiểm tra trạng thái kết nối

Mở đường dẫn sau trên trình duyệt:

https://shop-api-1-gvf9.onrender.com/api/try-on/config

Khi cấu hình và kết nối hoạt động, kết quả dự kiến có các trường:

``` json
{
  "enabled": true,
  "online": true,
  "ready": true
}
```

Ý nghĩa:

-   `enabled: true`: tính năng thử đồ được bật.
-   `online: true`: backend nhận diện máy chủ AI đang trực tuyến.
-   `ready: true`: máy chủ AI được báo là sẵn sàng.

Đây là kiểm tra trạng thái cấu hình. Để chắc chắn toàn bộ luồng hoạt
động, hãy đăng nhập website và thử một lượt thử đồ.

### Những việc không cần làm lại mỗi lần bật máy

  Công việc                                Có cần làm lại?
  ---------------------------------------- -------------------------------------------------
  Khởi động CatVTON API                    Có
  Khởi động Cloudflare Tunnel              Có
  Cập nhật `CATVTON_API_URL` trên Render   Chỉ khi URL Tunnel thay đổi
  Cấu hình API key                         Không, nếu key không thay đổi
  Cài lại thư viện Python                  Không, nếu môi trường vẫn còn nguyên
  Tải lại model AI                         Thông thường không, nếu model vẫn còn trong máy

> **Lưu ý:** Khi máy tính tắt hoặc hai cửa sổ CatVTON API/Cloudflare
> Tunnel bị đóng, website vẫn có thể truy cập nhưng tính năng thử đồ AI
> sẽ không hoạt động. Hãy để cả hai tiến trình chạy trong lúc cần sử
> dụng tính năng này.

Về lâu dài, có thể cấu hình Cloudflare Named Tunnel với domain riêng để
sử dụng URL cố định, tránh phải cập nhật `CATVTON_API_URL` trên Render
mỗi lần Quick Tunnel đổi địa chỉ.

------------------------------------------------------------------------

## 10. Quy trình đưa code lên GitHub

Mở Terminal tại thư mục dự án và kiểm tra trước các tệp sẽ được đưa lên:

``` bash
git status
```

Đảm bảo `.env`, thông tin đăng nhập, token, khóa API và dữ liệu riêng tư
không nằm trong danh sách chuẩn bị commit.

Sau đó chạy:

``` bash
git add .
git commit -m "Mô tả rõ nội dung cập nhật"
git push origin main
```

### Cách đặt tên commit

Tên commit cần nêu rõ lần cập nhật đã thay đổi những gì. Ví dụ:

``` bash
git commit -m "feat: add product reviews and collections"
```

Hoặc:

``` bash
git commit -m "fix: update CatVTON API integration"
```

Không sử dụng `git add .` một cách máy móc nếu chưa kiểm tra
`git status`, vì có thể vô tình đưa tệp cấu hình hoặc dữ liệu riêng tư
lên GitHub.

Sau khi push thành công, kiểm tra repository GitHub và trạng thái deploy
của Render.
