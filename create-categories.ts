import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const categories = [
  { name: "Áo", slug: "ao" },
  { name: "Quần", slug: "quan" },
  { name: "Váy", slug: "vay" },
  { name: "Áo khoác", slug: "khoac" },
  { name: "Phụ kiện", slug: "pk" },
];

async function main() {
  for (const category of categories) {
    await db.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        ...category,
        imageUrl: `https://picsum.photos/seed/cat-${category.slug}/600/700`,
      },
    });

    console.log("Đã kiểm tra danh mục:", category.name);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect();
  });
