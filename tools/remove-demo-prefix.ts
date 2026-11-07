
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const products = await db.product.findMany({
    where: {
      name: {
        startsWith: "[Demo] ",
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  console.log(`Tìm thấy ${products.length} sản phẩm cần sửa.`);

  let updated = 0;

  for (const product of products) {
    await db.product.update({
      where: { id: product.id },
      data: {
        name: product.name.replace(/^\[Demo\]\s*/, ""),
      },
    });

    updated++;
    console.log(`Đã sửa: ${product.name}`);
  }

  console.log(`\nHoàn tất: ${updated} sản phẩm.`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect();
  });
