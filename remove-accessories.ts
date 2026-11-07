import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const SLUG = "pk";

async function main() {
  const category = await db.category.findUnique({ where: { slug: SLUG } });
  if (!category) {
    console.log("Không có danh mục Phụ kiện trong CSDL, không cần dọn.");
    return;
  }

  const products = await db.product.findMany({
    where: { categoryId: category.id },
    select: { id: true, name: true, variants: { select: { orderItems: { select: { id: true }, take: 1 } } } },
  });

  let deleted = 0;
  let hidden = 0;
  for (const p of products) {
    const hasOrders = p.variants.some((v) => v.orderItems.length > 0);
    if (hasOrders) {
      await db.product.update({ where: { id: p.id }, data: { isActive: false } });
      hidden++;
    } else {
      await db.product.delete({ where: { id: p.id } });
      deleted++;
    }
  }

  const remaining = await db.product.count({ where: { categoryId: category.id } });
  if (remaining === 0) {
    await db.category.delete({ where: { id: category.id } });
    console.log("Đã xóa danh mục Phụ kiện.");
  } else {
    console.log(`Giữ lại danh mục vì còn ${remaining} sản phẩm đã có đơn hàng (đã ẩn, API công khai không trả ra).`);
  }
  console.log(`Đã xóa ${deleted} sản phẩm, ẩn ${hidden} sản phẩm.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
