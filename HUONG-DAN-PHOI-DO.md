# Hướng dẫn tính năng Phối đồ thông minh

Tính năng gợi ý bộ trang phục từ sản phẩm yêu thích, dùng **sản phẩm thật trong database Shop_API**. Không sửa schema, không ghi dữ liệu, không ảnh hưởng CatVTON.

## 1. Người dùng dùng như thế nào

1. Đăng nhập, thêm sản phẩm vào **Yêu thích**.
2. Ở trang Yêu thích (hoặc trang chi tiết sản phẩm), bấm **Phối đồ với sản phẩm này**.
3. Chọn phong cách: Streetwear, Minimalist, Casual, Vintage, Korean Style, Sporty, Formal, Elegant, Y2K, Old Money (mặc định: Casual).
4. (Tùy chọn) nhập ngân sách tối đa cho cả bộ, đã gồm giá sản phẩm gốc.
5. Bấm **Bắt đầu phối đồ**. Mỗi bộ hiển thị ảnh, tên, giá, màu gợi ý của từng món, điểm tương thích (0–100), độ tin cậy và tổng giá. Có nút **Xem chi tiết** và **Thêm vào giỏ**.

Lưu ý: nút chỉ hoạt động khi website kết nối được máy chủ API. Ở chế độ demo (localStorage) sẽ hiện thông báo "cần kết nối máy chủ".

## 2. Cài đặt và chạy thử local

```bash
npm install
npx prisma generate      # chỉ sinh Prisma Client, không đụng database
npm run build            # kiểm tra TypeScript
npx tsx --test test/outfit.test.ts   # 10 test thuật toán, dữ liệu giả, không cần database
npm run dev              # chạy server tại http://localhost:4000
```

Không chạy `prisma db push`, `prisma migrate`, `npm run seed` cho tính năng này. Nếu `.env` đang trỏ tới database production, endpoint phối đồ vẫn an toàn vì chỉ dùng `findUnique`/`findMany`.

## 3. API

`POST /api/outfit/recommend` (cần header `Authorization: Bearer <token>`)

```json
{ "productId": 12, "style": "streetwear", "budget": 1000000 }
```

- `productId`: số nguyên dương, bắt buộc.
- `style`: một trong `streetwear, minimalist, casual, vintage, korean, sporty, formal, elegant, y2k, old_money` (mặc định `casual`).
- `budget`: số nguyên dương (₫), không bắt buộc, là giới hạn cho **toàn bộ** bộ đồ gồm cả sản phẩm gốc.

Ví dụ:

```bash
curl -X POST http://localhost:4000/api/outfit/recommend \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"productId":12,"style":"casual","budget":1500000}'
```

Response (rút gọn):

```json
{
  "baseProduct": { "id": 12, "name": "Áo thun basic", "price": 199000, "role": "top", "inStock": true, "colors": ["Đen", "Trắng"] },
  "style": "casual",
  "budget": 1500000,
  "recommendations": [{
    "items": { "bottom": { "id": 5, "name": "Quần jean slim", "price": 499000, "color": "Đen" }, "outer": {}, "footwear": {}, "bag": {}, "accessories": [] },
    "baseSlot": "top",
    "matchScore": 89,
    "confidence": 0.67, "confidenceLevel": "high",
    "totalPrice": 698000,
    "complete": true, "missing": [],
    "breakdown": { "style": 73, "color": 93, "category": 95, "occasion": 100, "season": null, "preference": 84 }
  }],
  "meta": { "candidateCount": 7, "notes": ["NO_FOOTWEAR_IN_CATALOG"] }
}
```

- `items` chỉ chứa các món được đề xuất thêm, **không** gồm sản phẩm gốc. `totalPrice` đã gồm sản phẩm gốc.
- `breakdown`: `null` nghĩa là thiếu dữ liệu nên thành phần đó bị loại khỏi phép tính.
- `meta.notes`: `NO_FOOTWEAR_IN_CATALOG`, `INCOMPLETE_OUTFIT`, `NOTHING_WITHIN_BUDGET_OR_LOW_CONFIDENCE`.

Mã lỗi: `400` dữ liệu không hợp lệ, `401` chưa đăng nhập, `404` sản phẩm không tồn tại hoặc đã ngừng bán, `422` chưa xác định được loại sản phẩm, `429` gọi quá nhanh (tối đa 20 lần/phút/tài khoản).

## 4. Thuật toán hoạt động ra sao

1. **Lấy dữ liệu:** mỗi danh mục tối đa 60 sản phẩm bán chạy, chỉ lấy sản phẩm đang bán và còn hàng. Danh sách này được cache 30 giây.
2. **Nhận diện thuộc tính** (chỉ trong bộ nhớ, không lưu DB):
   - Loại: theo danh mục (`ao`, `quan`, `vay`, `khoac`, `pk`); trong `pk` tự tách giày, túi, phụ kiện theo tên; `Chân váy` được xem là quần/váy dưới.
   - Màu: theo `ProductVariant.color` còn hàng.
   - Phong cách, mùa, dịp: theo từ khóa trong tên, chất liệu, mô tả. Mỗi thuộc tính có độ tin cậy; không đủ căn cứ thì là `unknown`.
3. **Ghép bộ:** theo loại sản phẩm gốc (áo → quần, giày, phụ kiện...; váy → giày, túi...). Mỗi vị trí chỉ giữ 6 ứng viên khớp nhất, dùng beam search nên số tổ hợp luôn bị chặn.
4. **Chấm điểm cả bộ** = `0.30 Style + 0.20 Color + 0.20 Category + 0.15 Occasion + 0.10 Season + 0.05 Preference`. Thành phần `unknown` bị bỏ và trọng số chuẩn hóa lại. Màu được đánh giá trên cả bảng màu của bộ, không chỉ từng cặp. Preference dùng độ phổ biến (`soldCount`).
5. **Xếp hạng:** bộ đầy đủ trước, rồi theo điểm. Tối đa 6 bộ, mỗi món xuất hiện không quá 2 lần. Bộ có điểm dưới 45 hoặc thiếu dữ liệu tin cậy sẽ không được đề xuất.

## 5. Để kết quả chính xác hơn (không cần sửa code)

- Đặt tên sản phẩm có từ khóa rõ ràng, ví dụ "Áo hoodie oversize streetwear", "Quần tây công sở", "Váy lụa thanh lịch".
- Điền **chất liệu** và **màu** đầy đủ ở từng biến thể, dùng tên màu thông dụng (Đen, Trắng, Xám, Be, Navy, Xanh jean, Nâu, Đỏ...).
- Thêm danh mục hoặc sản phẩm giày, túi để bộ đồ đầy đủ hơn. Trong danh mục Phụ kiện, tên có "giày", "sneaker", "túi", "balo" sẽ được nhận đúng loại.

## 6. Chỉnh thông số

| Muốn đổi | File | Biến |
|---|---|---|
| Trọng số điểm | `src/outfit/types.ts` | `WEIGHTS` |
| Số bộ trả về, số ứng viên, điểm tối thiểu | `src/outfit/engine.ts` | `LIMITS` |
| Thời gian cache | `src/outfit/service.ts` | `POOL_TTL_MS` |
| Giới hạn request | `src/routes/outfit.ts` | `MAX_PER_MINUTE` |
| Từ khóa phong cách, màu, mùa | `src/outfit/attributes.ts` | `STYLE_RULES`, `COLOR_RULES` |

## 7. Xử lý sự cố

- **Không thấy nút Phối đồ:** kiểm tra `public/index.html` đã có `<script src="outfit.js">` sau `tryon.js`, và xóa cache trình duyệt.
- **Báo cần kết nối máy chủ:** website đang ở chế độ demo; chạy `npm run dev` hoặc kiểm tra `/api/health`.
- **Kết quả rỗng:** ngân sách quá thấp, phong cách quá xa với catalog, hoặc thiếu dữ liệu tên/màu. Thử bỏ ngân sách hoặc đổi phong cách.
- **Điểm phong cách thấp, độ tin cậy vừa:** tên sản phẩm chung chung; xem mục 5.
- **Lỗi build về `@prisma/client`:** chạy `npx prisma generate`.

## 8. Khôi phục

Bản gốc nằm trong `Shop_API_BACKUP_original.zip`. Để gỡ tính năng: xóa `src/outfit/`, `src/routes/outfit.ts`, `public/outfit.js`, `test/`, và hoàn tác 4 file đã sửa (`src/index.ts`, `public/app.js`, `public/index.html`, `public/style.css`) bằng `outfit-integration.patch` (`git apply -R`).

## 9. Cập nhật GitHub

Chưa commit, chưa push, chưa deploy. Hãy mở bằng VS Code, chạy thử local, rồi tự quyết định commit và deploy khi hài lòng.
