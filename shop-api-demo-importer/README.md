# Shop_API - Demo Product Importer

Tool lấy dữ liệu sản phẩm thời trang DEMO từ DummyJSON, chuẩn hóa và nhập vào PostgreSQL hiện tại của Shop_API bằng Prisma.

## Vì sao tương thích schema hiện tại?

Tool chỉ dùng các model/field đã có trong `prisma/schema.prisma`:
- `Category`: `name`, `slug`
- `Product`: `name`, `slug`, `description`, `price`, `salePrice`, `categoryId`, `isActive`, `tryOnType`
- `ProductImage`: `url`, `position`
- `ProductVariant`: `size`, `color`, `stock`

Không thêm cột, không chạy migration, không xóa dữ liệu cũ.

## Cài đặt

1. Giải nén các file vào thư mục gốc `Shop_API`.
2. Mở `package.json` hiện tại và thêm dòng `"import:demo": "tsx tools/import-demo-products.ts"` vào object `scripts`. Không thay toàn bộ package.json để tránh ghi đè dependency hoặc script riêng của nhánh local.
3. Đảm bảo file `.env` có `DATABASE_URL` trỏ tới database muốn nhập.
4. Cài dependencies nếu cần:

```bash
npm install
npx prisma generate
```

## Chạy thử trước (không ghi database)

```bash
npm run import:demo -- --limit=100 --dry-run
```

## Nhập dữ liệu

```bash
npm run import:demo -- --limit=100
```

Chỉ nhập một nhóm:

```bash
npm run import:demo -- --category=ao --limit=50
npm run import:demo -- --category=vay --limit=50
npm run import:demo -- --category=pk --limit=50
```

## Tỷ giá quy đổi giá demo

DummyJSON trả giá mẫu bằng USD. Tool quy đổi sang VND để tương thích `price`/`salePrice` kiểu Int của Shop_API:

```env
DEMO_USD_TO_VND=25000
```

Có thể thay đổi tỷ giá này trong `.env`. Đây chỉ là giá giả lập cho môi trường demo, không phải tỷ giá hoặc giá bán thực tế.

## Nguồn và hình ảnh

- API: https://dummyjson.com/products
- Tài liệu: https://dummyjson.com/docs/products
- Ảnh: URL HTTPS từ `cdn.dummyjson.com`, lưu trực tiếp vào `ProductImage.url` (không tải file về server).

DummyJSON là bộ dữ liệu mẫu để phát triển/kiểm thử. Tool chỉ lấy các nhóm thời trang có trong nguồn (áo, váy, giày/phụ kiện). Nguồn không có đầy đủ quần và áo khoác nên tool không tự bịa thêm sản phẩm cho hai nhóm đó.

DummyJSON không cung cấp đầy đủ biến thể size/màu cho các mặt hàng. Size/màu được tạo ở mức dữ liệu demo để đáp ứng quan hệ `ProductVariant` bắt buộc của Shop_API. Không dùng dữ liệu này như tồn kho thật.

## An toàn dữ liệu

- Dùng slug có tiền tố `demo-dummyjson-<id>-` để phân biệt và chống nhập trùng.
- Nếu slug đã tồn tại, tool bỏ qua sản phẩm đó.
- Không xóa, không cập nhật, không đụng đến tài khoản, đơn hàng, giỏ hàng hoặc sản phẩm cũ.
- Nên chạy `--dry-run` trước và xác nhận `DATABASE_URL` trước khi import.
