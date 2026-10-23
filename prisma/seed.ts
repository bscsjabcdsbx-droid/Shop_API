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
  let n = 0;

  for (const [name, slug] of cats) {
    const cat = await db.category.upsert({
      where: { slug },
      update: {},
      create: {
        name,
        slug,
        imageUrl: `https://picsum.photos/seed/cat-${slug}/600/700`,
      },
    });

    for (const pname of names[slug]) {
      const productSlug = slugify(pname);

      const existing = await db.product.findUnique({
        where: { slug: productSlug },
      });

      if (existing) {
        console.log(`Đã tồn tại, bỏ qua: ${pname}`);
        continue;
      }

      n++;
      const price = (150 + (n * 37) % 600) * 1000;
      const sizes = slug === "pk"
        ? ["FREE"]
        : ["S", "M", "L", "XL"];
      const colors = ["Đen", "Trắng", "Xám"].slice(
        0,
        2 + (n % 2)
      );

      await db.product.create({
        data: {
          name: pname,
          slug: productSlug,
          categoryId: cat.id,
          price,
          salePrice: n % 4 === 0
            ? Math.round(price * 0.8 / 1000) * 1000
            : null,
          soldCount: (n * 13) % 90,
          material: "Cotton 100%",
          description:
            `${pname} thiết kế tối giản, form chuẩn, dễ phối đồ hằng ngày.`,
          images: {
            create: [0, 1, 2].map((i) => ({
              url: `https://picsum.photos/seed/${productSlug}-${i}/800/1000`,
              position: i,
            })),
          },
          variants: {
            create: sizes.flatMap((size) =>
              colors.map((color, ci) => ({
                size,
                color,
                stock: n % 7 === 0
                  ? 0
                  : 3 + ((n + ci) % 12),
              }))
            ),
          },
        },
      });

      console.log(`Đã tạo sản phẩm: ${pname}`);
    }
  }

  console.log(`Hoàn tất! Đã tạo thêm ${n} sản phẩm.`);
}

main().finally(() => db.$disconnect());
