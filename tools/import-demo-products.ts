
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const API_URL =
  "https://raw.githubusercontent.com/arturayupov/womens-fashion-catalog-open-data/main/data/products.json";

const USD_TO_VND = Number(process.env.DEMO_USD_TO_VND ?? 25_000);
const DEFAULT_LIMIT = 1500;
const MAX_LIMIT = 999999;

type SourceVariant = {
  sku?: string;
  title?: string;
  price_usd?: number;
  compare_at_price_usd?: number;
  in_stock?: boolean;
  options?: Record<string, string>;
};

type SourceProduct = {
  id: string | number;
  handle?: string;
  title: string;
  url?: string;
  product_type?: string;
  vendor?: string;
  tags?: string[];
  description?: string;
  category?: {
    id?: string;
    name?: string;
    full_path?: string;
  };
  price?: {
    min_usd?: number;
    max_usd?: number;
    currency?: string;
  };
  images?: Array<{
    url?: string;
    alt?: string;
  }>;
  featured_image_url?: string;
  variants?: SourceVariant[];
};

type CategoryInfo = {
  slug: string;
  name: string;
  tryOnType: string;
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function usage() {
  console.log(`
Shop_API - Livostyle Fashion Importer

Usage:
  npm run import:demo -- --limit=300
  npm run import:demo -- --limit=100 --category=ao
  npm run import:demo -- --limit=100 --category=quan
  npm run import:demo -- --limit=100 --category=vay
  npm run import:demo -- --limit=300 --dry-run

Options:
  --limit=N       Maximum products (1-${MAX_LIMIT})
  --category=SLUG ao, quan, vay
  --dry-run       Preview without writing to database
  --help          Show help

Environment:
  DATABASE_URL
  DEMO_USD_TO_VND (default 25000)
`);
}

async function fetchProducts(): Promise<SourceProduct[]> {
  console.log("Đang tải dữ liệu Livostyle Fashion Catalog...");

  const response = await fetch(API_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "Shop-API-Fashion-Importer/1.0",
    },
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Không thể tải dữ liệu: HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  if (Array.isArray(data)) {
    return data as SourceProduct[];
  }

  if (
    data &&
    typeof data === "object" &&
    "products" in data &&
    Array.isArray(data.products)
  ) {
    return data.products as SourceProduct[];
  }

  throw new Error("Cấu trúc dữ liệu JSON không hợp lệ.");
}

// Chỉ lấy quần áo, bỏ giày dép và phụ kiện.
function getCategory(product: SourceProduct): CategoryInfo | null {
  const name = String(product.category?.name ?? "")
    .toLowerCase()
    .trim();

  const path = String(product.category?.full_path ?? "")
    .toLowerCase();

  const type = String(product.product_type ?? "")
    .toLowerCase()
    .trim();

  const text = `${name} ${path} ${type}`;

  // Không lấy giày dép và phụ kiện.
  if (
    /shoes|sandals|boots|sneakers|footwear|bags|jewelry|sunglasses|watches/.test(text)
  ) {
    return null;
  }

  // Váy liền: thử đồ toàn thân.
  if (/dress|dresses/.test(text)) {
    return {
      slug: "vay",
      name: "Váy",
      tryOnType: "overall",
    };
  }

  // Chân váy: thử đồ phần dưới.
  if (/skirt|skirts|skorts/.test(text)) {
    return {
      slug: "vay",
      name: "Váy",
      tryOnType: "lower",
    };
  }

  // Quần.
  if (/trousers|pants|shorts|jeans|leggings|joggers/.test(text)) {
    return {
      slug: "quan",
      name: "Quần",
      tryOnType: "lower",
    };
  }

  // Áo.
  if (
    /blouses|clothing tops|t-shirts|shirts|tank tops|sweaters|hoodies|sweatshirts|cardigans|bodysuits|tunics|vests|coats|jackets|overcoats|windbreakers|kimonos|cover ups|cover-up|swimwear|bikinis/.test(text)
  ) {
    return {
      slug: "ao",
      name: "Áo",
      tryOnType: "upper",
    };
  }

  return null;
}

function getImageUrls(product: SourceProduct): string[] {
  const candidates = [
    ...(product.images ?? []).map((image) => image.url ?? ""),
    product.featured_image_url ?? "",
  ];

  const valid = candidates.filter((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname === "cdn.shopify.com"
      );
    } catch {
      return false;
    }
  });

  return [...new Set(valid)].slice(0, 5);
}

function toVnd(usd: number): number {
  return Math.max(
    1_000,
    Math.round((usd * USD_TO_VND) / 1_000) * 1_000,
  );
}

function getPrice(product: SourceProduct): number {
  return Number(
    product.price?.min_usd ??
      product.variants?.[0]?.price_usd ??
      0,
  );
}

function getSalePrice(product: SourceProduct): number | null {
  const variants = product.variants ?? [];

  const variant = variants.find(
    (item) =>
      item.in_stock &&
      Number(item.compare_at_price_usd ?? 0) >
        Number(item.price_usd ?? 0),
  );

  if (!variant) return null;

  return toVnd(Number(variant.price_usd));
}

// Chuyển biến thể từ nguồn sang schema Shop_API.
function getVariants(product: SourceProduct) {
  const sourceVariants = product.variants ?? [];

  const variants = sourceVariants.map((variant) => {
    const options = variant.options ?? {};

    const size =
      options.Size ??
      options.size ??
      "FREE";

    const color =
      options.Color ??
      options.color ??
      "Mặc định";

    return {
      size,
      color,
      // Nguồn chỉ cung cấp trạng thái còn hàng,
      // không cung cấp số lượng tồn kho thực tế.
      stock: variant.in_stock ? 1 : 0,
    };
  });

  const unique = [
    ...new Map(
      variants.map((variant) => [
        `${variant.size}-${variant.color}`,
        variant,
      ]),
    ).values(),
  ];

  if (unique.length > 0) {
    return unique;
  }

  return [
    {
      size: "FREE",
      color: "Mặc định",
      stock: 0,
    },
  ];
}

function cleanDescription(value?: string): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  if (hasFlag("help")) {
    usage();
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Thiếu DATABASE_URL trong file .env.");
  }

  if (!Number.isFinite(USD_TO_VND) || USD_TO_VND <= 0) {
    throw new Error("DEMO_USD_TO_VND phải lớn hơn 0.");
  }

  const limit = Number(getArg("limit") ?? DEFAULT_LIMIT);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`--limit phải từ 1 đến ${MAX_LIMIT}.`);
  }

  const requestedCategory = getArg("category");

  if (
    requestedCategory &&
    !["ao", "quan", "vay"].includes(requestedCategory)
  ) {
    throw new Error("--category chỉ nhận ao, quan, vay.");
  }

  // 1. Tải catalog.
  const products = await fetchProducts();

  console.log("\n========== KIỂM TRA DỮ LIỆU ==========");

  console.log(
    JSON.stringify(products.slice(0, 3), null, 2)
  );

  console.log("\n========== DANH MỤC ==========");

  const categories = [
    ...new Set(
      products.map((p) =>
        JSON.stringify(p.category)
      )
    ),
  ];

  console.log(categories.slice(0, 30));

  console.log(`Nguồn cung cấp: ${products.length} sản phẩm.`);

  // 2. Lọc riêng quần áo.
  const filtered = products
    .map((product) => ({
      product,
      category: getCategory(product),
    }))
    .filter(
      (
        item,
      ): item is {
        product: SourceProduct;
        category: CategoryInfo;
      } => {
        return (
          item.category !== null &&
          (!requestedCategory ||
            item.category.slug === requestedCategory)
        );
      },
    );

  const unique = [
    ...new Map(
      filtered.map((item) => [
        item.product.id,
        item,
      ]),
    ).values(),
  ].slice(0, limit);

  console.log(`Sản phẩm quần áo phù hợp: ${filtered.length}`);
  console.log(`Số sản phẩm sẽ xử lý: ${unique.length}`);
  console.log(
    `Tỷ giá demo: 1 USD = ${USD_TO_VND.toLocaleString("vi-VN")} VND`,
  );

  if (hasFlag("dry-run")) {
    console.log("\n========== XEM TRƯỚC ==========");

    for (const item of unique.slice(0, 20)) {
      const { product, category } = item;

      console.log(
        `[${category.name}] ${product.title} | ` +
        `${toVnd(getPrice(product)).toLocaleString("vi-VN")}đ | ` +
        `${getImageUrls(product).length} ảnh`,
      );
    }

    console.log("\nDRY RUN: Không ghi dữ liệu vào database.");
    return;
  }

  // 3. Import sản phẩm.
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of unique) {
    const { product: source, category: mappedCategory } = item;

    const imageUrls = getImageUrls(source);

    if (imageUrls.length === 0 || getPrice(source) <= 0) {
      skipped++;
      console.log(`Bỏ qua sản phẩm thiếu ảnh hoặc giá: ${source.title}`);
      continue;
    }

    const sourceSlug =
      `demo-livostyle-${source.id}-${slugify(source.handle || source.title)}`;

    try {
      // Không ghi đè sản phẩm cũ.
      const existing = await db.product.findUnique({
        where: { slug: sourceSlug },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        console.log(`Đã tồn tại, giữ nguyên: ${source.title}`);
        continue;
      }

      // Chỉ tạo category nếu chưa tồn tại.
      const category = await db.category.upsert({
        where: { slug: mappedCategory.slug },
        update: {},
        create: {
          name: mappedCategory.name,
          slug: mappedCategory.slug,
        },
      });

      const price = toVnd(getPrice(source));
      const salePrice = getSalePrice(source);

      const description = [
        cleanDescription(source.description),
        source.vendor
          ? `Thương hiệu: ${source.vendor}.`
          : "",
        source.url
          ? `Sản phẩm gốc: ${source.url}`
          : "",
        "Nguồn dữ liệu: Livostyle Women's Fashion Catalog.",
      ].filter(Boolean).join("\n\n");

      // Chỉ CREATE, không UPDATE hoặc DELETE sản phẩm.
      await db.product.create({
        data: {
          name: `[Demo] ${source.title}`,
          slug: sourceSlug,
          description,
          material: null,
          price,
          salePrice:
            salePrice !== null && salePrice < price
              ? salePrice
              : null,
          soldCount: 0,
          isActive: true,
          categoryId: category.id,
          tryOnType: mappedCategory.tryOnType,

          images: {
            create: imageUrls.map((url, position) => ({
              url,
              position,
            })),
          },

          variants: {
            create: getVariants(source),
          },
        },
      });

      created++;
      console.log(`Đã thêm: ${source.title}`);
    } catch (error) {
      failed++;
      console.error(`Lỗi "${source.title}":`, error);
    }
  }

  console.log("\n========== KẾT QUẢ ==========");
  console.log(`Tạo mới: ${created}`);
  console.log(`Giữ nguyên: ${skipped}`);
  console.log(`Lỗi: ${failed}`);
  console.log("Không xóa hoặc cập nhật sản phẩm cũ.");
}

main()
  .catch((error) => {
    console.error("\nKhông thể hoàn tất import:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
