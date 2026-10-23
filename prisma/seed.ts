import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();

const cats = [["Áo","ao"],["Quần","quan"],["Váy","vay"],["Áo khoác","khoac"],["Phụ kiện","pk"]] as const;
const names: Record<string, string[]> = {
  ao: ["Áo thun basic","Áo sơ mi linen","Áo polo pique","Áo len cổ tròn"],
  quan: ["Quần jean slim","Quần kaki ống đứng","Quần short linen","Quần jogger nỉ"],
  vay: ["Váy midi xếp ly","Váy sơ mi dáng dài","Váy suông cotton","Chân váy chữ A"],
  khoac: ["Áo khoác bomber","Áo khoác denim","Áo blazer oversize","Áo khoác gió"],
  pk: ["Mũ lưỡi trai","Thắt lưng da","Khăn lụa","Túi tote canvas"],
};
const slugify = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");

async function main() {
  await db.$transaction([db.orderItem.deleteMany(), db.order.deleteMany(), db.cartItem.deleteMany(), db.cart.deleteMany(),
    db.review.deleteMany(), db.wishlist.deleteMany(), db.productVariant.deleteMany(), db.productImage.deleteMany(),
    db.product.deleteMany(), db.category.deleteMany(), db.user.deleteMany()]);

  const admin = await db.user.create({ data: { email: "admin@shop.local", name: "Quản trị viên", role: "ADMIN", passwordHash: await bcrypt.hash("Admin@12345", 12) } });
  const customer = await db.user.create({ data: { email: "khach@shop.local", name: "Nguyễn Văn A", passwordHash: await bcrypt.hash("Khach@12345", 12), cart: { create: {} } } });

  let n = 0;
  for (const [name, slug] of cats) {
    const cat = await db.category.create({ data: { name, slug, imageUrl: `https://picsum.photos/seed/cat-${slug}/600/700` } });
    for (const pname of names[slug]) {
      n++;
      const price = (150 + (n * 37) % 600) * 1000;
      const sizes = slug === "pk" ? ["FREE"] : ["S","M","L","XL"];
      const colors = ["Đen","Trắng","Xám"].slice(0, 2 + (n % 2));
      const product = await db.product.create({ data: {
        name: pname, slug: slugify(pname), categoryId: cat.id, price,
        salePrice: n % 4 === 0 ? Math.round(price * 0.8 / 1000) * 1000 : null,
        soldCount: (n * 13) % 90, material: "Cotton 100%",
        description: `${pname} thiết kế tối giản, form chuẩn, dễ phối đồ hằng ngày.`,
        images: { create: [0,1,2].map(i => ({ url: `https://picsum.photos/seed/${slugify(pname)}-${i}/800/1000`, position: i })) },
        variants: { create: sizes.flatMap(size => colors.map((color, ci) => ({ size, color, stock: n % 7 === 0 ? 0 : 3 + ((n + ci) % 12) }))) },
      }});
      await db.review.create({ data: { userId: customer.id, productId: product.id, rating: 3 + (n % 3), comment: "Chất vải tốt, đúng mô tả, giao hàng nhanh." } });
    }
  }
  console.log(`Seed xong: 5 danh mục, ${n} sản phẩm. Admin: ${admin.email} / Admin@12345`);
}
main().finally(() => db.$disconnect());
