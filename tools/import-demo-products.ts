
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { load } from "cheerio";
import { createHash } from "node:crypto";

const db = new PrismaClient();

const BASE_URL = "https://dosi-in.com";

const CATEGORY_SOURCES = [
  {
    slug: "ao",
    name: "Áo",
    url: `${BASE_URL}/danh-muc/ao-thun/`,
    tryOnType: "upper",
  },
  {
    slug: "quan",
    name: "Quần",
    url: `${BASE_URL}/danh-muc/quan/`,
    tryOnType: "lower",
  },
  {
    slug: "vay",
    name: "Váy",
    url: `${BASE_URL}/danh-muc/vay-dam/`,
    tryOnType: "overall",
  },
  {
    slug: "khoac",
    name: "Áo khoác",
    url: `${BASE_URL}/danh-muc/ao-khoac/`,
    tryOnType: "upper",
  },
] as const;

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 2000;
const REQUEST_DELAY_MS = 700;
const OLD_IMPORT_PREFIX = "demo-livostyle-";

type CategoryInfo = {
  slug: string;
  name: string;
  tryOnType: string;
};

type ProductData = {
  "@type"?: string | string[];
  name?: string;
  description?: string;
  image?: string | string[];
  sku?: string | number;
  category?: string;
  brand?: {
    name?: string;
  } | string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
};

type CrawledProduct = {
  name: string;
  colors: string[];
  description: string;
  sourceUrl: string;
  sourceId: string;
  brand: string;
  price: number;
  imageUrls: string[];
  category: CategoryInfo;
  soldCount: number;
  sizes: string[];
};

/* =========================
   XỬ LÝ SIZE VÀ MÀU SẮC
========================= */

function getSizes(description: string): string[] {
  const sizePattern =
    /(?:size|kích cỡ|kích thước)\s*[:：]\s*((?:(?:XXXS|XXS|XXXL|XXL|XS|XL|S|M|L|[2-5]XL|FREE\s*SIZE|FREESIZE|ONE\s*SIZE|FREE|[0-9]{2})(?:\s*[,/|;]\s*)?)+)/i;

  const match = description.match(sizePattern);

  if (!match) return [];

  const tokens = match[1].match(
    /XXXS|XXS|XXXL|XXL|XS|XL|S|M|L|[2-5]XL|FREE\s*SIZE|FREESIZE|ONE\s*SIZE|FREE|[0-9]{2}/gi,
  );

  return [
    ...new Set(
      (tokens ?? []).map((size) =>
        size.toUpperCase().replace(/\s+/g, " ").trim(),
      ),
    ),
  ];
}

function getColors(description: string): string[] {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const colors: string[] = [];

  for (const line of lines) {
    const match = line.match(
      /(?:màu sắc|màu|color|colours?)\s*[:：]\s*(.+)/i,
    );

    if (!match) continue;

    const values = match[1]
      .split(/[,;/|]+/)
      .map((color) => color.trim())
      .filter(Boolean)
      .map((color) => color.slice(0, 40));

    colors.push(...values);
  }

  return [...new Set(colors)];
}

function getVariants(product: CrawledProduct) {
  const sizes = product.sizes.length > 0
    ? product.sizes
    : ["Chưa rõ"];

  const colors = product.colors.length > 0
    ? product.colors
    : ["Chưa rõ"];

  return sizes.flatMap((size) =>
    colors.map((color) => ({
      size,
      color,
      stock: 0,
    })),
  );
}

/* =========================
   TIỆN ÍCH
========================= */

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function makeSourceId(url: string, sku?: string | number): string {
  if (sku !== undefined && String(sku).trim()) {
    return String(sku).trim();
  }

  const match = url.match(/\.([0-9]+)\/?$/);

  if (match) {
    return match[1];
  }

  return createHash("sha256")
    .update(url)
    .digest("hex")
    .slice(0, 16);
}

function makeProductSlug(product: CrawledProduct): string {
  return `dosi-${slugify(product.sourceId)}-${slugify(product.name)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value?: string): string {
  if (!value) return "";

  const $ = load(`<div>${value}</div>`);

  return $.text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* =========================
   PHÂN LOẠI SẢN PHẨM
========================= */

function getCategoryInfo(
  sourceCategory: string,
  productName: string,
  fallback: CategoryInfo,
): CategoryInfo {
  const text = `${sourceCategory} ${productName}`.toLowerCase();

  if (/áo dài/.test(text)) {
    return {
      slug: "ao",
      name: "Áo",
      tryOnType: "overall",
    };
  }

  if (/chân váy|váy ngắn|váy dài|skirt|skorts/.test(text)) {
    return {
      slug: "vay",
      name: "Váy",
      tryOnType: "lower",
    };
  }

  if (/đầm|váy liền|jumpsuit|romper/.test(text)) {
    return {
      slug: "vay",
      name: "Váy",
      tryOnType: "overall",
    };
  }

  if (/quần|jeans|shorts|pants|legging/.test(text)) {
    return {
      slug: "quan",
      name: "Quần",
      tryOnType: "lower",
    };
  }

  if (/áo khoác|jacket|coat|hoodie|cardigan/.test(text)) {
    return {
      slug: "khoac",
      name: "Áo khoác",
      tryOnType: "upper",
    };
  }

  if (/áo|shirt|tee|blouse|top/.test(text)) {
    return {
      slug: "ao",
      name: "Áo",
      tryOnType: "upper",
    };
  }

  return { ...fallback };
}

/* =========================
   ĐỌC JSON-LD
========================= */

function extractProductJsonLd(html: string): ProductData | null {
  const $ = load(html);

  let result: ProductData | null = null;

  $('script[type="application/ld+json"]').each((_, element) => {
    if (result) return;

    const raw = $(element).html();
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);

      const visit = (value: unknown): void => {
        if (result || !value || typeof value !== "object") return;

        const obj = value as Record<string, unknown>;

        const type = obj["@type"];

        const isProduct =
          type === "Product" ||
          (Array.isArray(type) && type.includes("Product"));

        if (isProduct) {
          result = obj as ProductData;
          return;
        }

        if (Array.isArray(value)) {
          for (const item of value) visit(item);
          return;
        }

        if (Array.isArray(obj["@graph"])) {
          visit(obj["@graph"]);
        }
      };

      visit(parsed);
    } catch {
      // Bỏ qua JSON-LD không hợp lệ.
    }
  });

  return result;
}

/* =========================
   XỬ LÝ ẢNH
========================= */

function getImageUrls(product: ProductData): string[] {
  const candidates = Array.isArray(product.image)
    ? product.image
    : product.image
      ? [product.image]
      : [];

  const valid = candidates.filter((value) => {
    try {
      const url = new URL(value);

      return (
        url.protocol === "https:" &&
        (
          url.hostname === "img.dosi-in.com" ||
          url.hostname === "dosi-in.com"
        )
      );
    } catch {
      return false;
    }
  });

  return [...new Set(valid)].slice(0, 8);
}

/* =========================
   THÔNG TIN BÁN HÀNG
========================= */

function getSoldCount(html: string): number {
  const $ = load(html);
  const text = $("body").text();

  const match = text.match(
    /([\d.,]+)\s*(?:đã bán|sản phẩm đã bán)/i,
  );

  if (!match) return 0;

  const value = Number(match[1].replace(/[.,]/g, ""));

  return Number.isFinite(value) ? value : 0;
}

/* =========================
   LẤY LINK SẢN PHẨM
========================= */

function getProductLinks(
  html: string,
  category: CategoryInfo,
): Array<{ url: string; category: CategoryInfo }> {
  const $ = load(html);

  const results = new Map<
    string,
    { url: string; category: CategoryInfo }
  >();

  $('a[href*="/san-pham/"]').each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    try {
      const url = new URL(href, BASE_URL);

      if (
        url.hostname !== "dosi-in.com" ||
        !url.pathname.startsWith("/san-pham/")
      ) {
        return;
      }

      url.search = "";
      url.hash = "";

      const canonicalUrl = url.href;

      results.set(canonicalUrl, {
        url: canonicalUrl,
        category,
      });
    } catch {
      // Bỏ qua link không hợp lệ.
    }
  });

  return [...results.values()];
}

/* =========================
   TẢI TRANG WEB
========================= */

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; ShopAPIImporter/1.0)",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  return response.text();
}

/* =========================
   CÀO CHI TIẾT SẢN PHẨM
========================= */

async function crawlProduct(
  url: string,
  fallbackCategory: CategoryInfo,
): Promise<CrawledProduct | null> {
  const html = await fetchHtml(url);
  const source = extractProductJsonLd(html);

  if (!source || !source.name) {
    console.log("  Bỏ qua: không tìm thấy dữ liệu Product JSON-LD");
    return null;
  }

  const price = Number(source.offers?.price ?? 0);

  if (!Number.isFinite(price) || price <= 0) {
    console.log("  Bỏ qua: sản phẩm không có giá hợp lệ");
    return null;
  }

  const imageUrls = getImageUrls(source);

  if (imageUrls.length === 0) {
    console.log("  Bỏ qua: sản phẩm không có ảnh hợp lệ");
    return null;
  }

  const description = cleanText(source.description);

  const brand =
    typeof source.brand === "string"
      ? source.brand
      : source.brand?.name ?? "";

  const category = getCategoryInfo(
    String(source.category ?? ""),
    source.name,
    fallbackCategory,
  );

  const sizes = getSizes(description);
  const colors = getColors(description);

  return {
    name: source.name.trim(),
    colors,
    description,
    sourceUrl: url,
    sourceId: makeSourceId(url, source.sku),
    brand,
    price: Math.round(price),
    imageUrls,
    category,
    soldCount: getSoldCount(html),
    sizes,
  };
}

/* =========================
   CÀO DANH MỤC
========================= */

async function crawlCategories(
  limit: number,
  requestedCategory?: string,
): Promise<CrawledProduct[]> {
  const selectedCategories = CATEGORY_SOURCES.filter(
    (category) =>
      !requestedCategory || category.slug === requestedCategory,
  );

  const links: Array<{
    url: string;
    category: CategoryInfo;
  }> = [];

  console.log("\n========== LẤY DANH SÁCH SẢN PHẨM ==========");

  for (const source of selectedCategories) {
    console.log(`\nDanh mục: ${source.name}`);

    try {
      const html = await fetchHtml(source.url);
      const found = getProductLinks(html, source);

      console.log(`Tìm thấy ${found.length} đường dẫn sản phẩm.`);

      links.push(...found);
    } catch (error) {
      console.error(`Không tải được danh mục ${source.name}:`, error);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const linksByCategory = new Map<
    string,
    Array<{ url: string; category: CategoryInfo }>
  >();

  for (const item of links) {
    const slug = item.category.slug;

    if (!linksByCategory.has(slug)) {
      linksByCategory.set(slug, []);
    }

    const group = linksByCategory.get(slug)!;

    if (!group.some((existing) => existing.url === item.url)) {
      group.push(item);
    }
  }

  const uniqueLinks: Array<{
    url: string;
    category: CategoryInfo;
  }> = [];

  const seenUrls = new Set<string>();

  let index = 0;

  while (uniqueLinks.length < limit) {
    let added = false;

    for (const category of selectedCategories) {
      const item = linksByCategory.get(category.slug)?.[index];

      if (!item || seenUrls.has(item.url)) {
        continue;
      }

      uniqueLinks.push(item);
      seenUrls.add(item.url);
      added = true;

      if (uniqueLinks.length >= limit) {
        break;
      }
    }

    if (!added) {
      break;
    }

    index++;
  }

  console.log(`\nTổng link duy nhất cần xử lý: ${uniqueLinks.length}`);

  const products: CrawledProduct[] = [];

  console.log("\n========== CÀO CHI TIẾT SẢN PHẨM ==========");

  for (let i = 0; i < uniqueLinks.length; i++) {
    const item = uniqueLinks[i];

    console.log(`\n[${i + 1}/${uniqueLinks.length}] ${item.url}`);

    try {
      const product = await crawlProduct(
        item.url,
        item.category,
      );

      if (product) {
        products.push(product);

        console.log(
          `  OK: ${product.name} | ` +
          `${product.price.toLocaleString("vi-VN")}₫ | ` +
          `${product.imageUrls.length} ảnh`,
        );

        console.log(
          `  Size: ${product.sizes.join(", ") || "Chưa rõ"}`,
        );

        console.log(
          `  Màu: ${product.colors.join(", ") || "Chưa rõ"}`,
        );
      }
    } catch (error) {
      console.error("  Lỗi:", error);
    }

    if (i < uniqueLinks.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  return products;
}

/* =========================
   XÓA SẢN PHẨM IMPORT CŨ
========================= */

async function countOldProducts(): Promise<number> {
  return db.product.count({
    where: {
      slug: {
        startsWith: OLD_IMPORT_PREFIX,
      },
    },
  });
}

async function removeOldProducts(): Promise<number> {
  const oldProducts = await db.product.findMany({
    where: {
      slug: {
        startsWith: OLD_IMPORT_PREFIX,
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  console.log("\n========== SẢN PHẨM IMPORT CŨ ==========");
  console.log(`Tìm thấy ${oldProducts.length} sản phẩm Livostyle cũ.`);

  for (const product of oldProducts.slice(0, 20)) {
    console.log(`- ${product.name} (${product.slug})`);
  }

  if (oldProducts.length === 0) return 0;

  const result = await db.product.deleteMany({
    where: {
      slug: {
        startsWith: OLD_IMPORT_PREFIX,
      },
    },
  });

  return result.count;
}

/* =========================
   CHƯƠNG TRÌNH CHÍNH
========================= */

async function main() {
  if (hasFlag("help")) {
    console.log(`
Shop_API - Dosi-in Fashion Importer

Usage:
  npm run import:demo -- --limit=100 --dry-run
  npm run import:demo -- --limit=300 --dry-run
  npm run import:demo -- --limit=100 --category=ao --dry-run
  npm run import:demo -- --limit=100 --category=quan --dry-run
  npm run import:demo -- --limit=100 --category=vay --dry-run
  npm run import:demo -- --limit=100 --category=khoac --dry-run

Import thật:
  npm run import:demo -- --limit=300

Xóa sản phẩm từ importer tiếng Anh cũ và import Dosi-in:
  npm run import:demo -- --limit=300 --clean-old

Options:
  --limit=N       Số sản phẩm tối đa (1-${MAX_LIMIT})
  --category=...  ao, quan, vay, khoac
  --dry-run       Chỉ xem trước, không ghi database
  --clean-old     Xóa sản phẩm có slug demo-livostyle- trước khi import
  --help          Hiển thị hướng dẫn
`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Thiếu DATABASE_URL trong file .env.");
  }

  const limit = Number(getArg("limit") ?? DEFAULT_LIMIT);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`--limit phải từ 1 đến ${MAX_LIMIT}.`);
  }

  const requestedCategory = getArg("category");

  if (
    requestedCategory &&
    !CATEGORY_SOURCES.some(
      (category) => category.slug === requestedCategory,
    )
  ) {
    throw new Error("--category chỉ nhận ao, quan, vay, khoac.");
  }

  console.log("========================================");
  console.log("       DOSI-IN FASHION IMPORTER");
  console.log("========================================");
  console.log(`Giới hạn: ${limit}`);
  console.log(`Danh mục: ${requestedCategory ?? "Tất cả"}`);
  console.log(`Chế độ xem trước: ${hasFlag("dry-run") ? "Có" : "Không"}`);
  console.log(`Xóa dữ liệu importer cũ: ${hasFlag("clean-old") ? "Có" : "Không"}`);

  const oldCount = await countOldProducts();

  console.log(`\nSản phẩm từ importer tiếng Anh cũ: ${oldCount}`);

  const products = await crawlCategories(
    limit,
    requestedCategory,
  );

  console.log("\n========== TỔNG HỢP DỮ LIỆU ==========");
  console.log(`Cào thành công: ${products.length}`);

  const categoryCounts = new Map<string, number>();

  for (const product of products) {
    categoryCounts.set(
      product.category.name,
      (categoryCounts.get(product.category.name) ?? 0) + 1,
    );
  }

  for (const [name, count] of categoryCounts) {
    console.log(`${name}: ${count}`);
  }

  if (hasFlag("dry-run")) {
    console.log("\n========== XEM TRƯỚC ==========");

    for (const product of products.slice(0, 30)) {
      console.log(
        `[${product.category.name}] ${product.name}\n` +
        `  Giá: ${product.price.toLocaleString("vi-VN")}₫\n` +
        `  Thương hiệu: ${product.brand || "Không rõ"}\n` +
        `  Ảnh: ${product.imageUrls.length}\n` +
        `  Size: ${product.sizes.join(", ") || "Chưa rõ"}\n` +
        `  Màu: ${product.colors.join(", ") || "Chưa rõ"}\n` +
        `  Mã nguồn: ${product.sourceId}\n` +
        `  Thử đồ: ${product.category.tryOnType}\n`,
      );
    }

    if (hasFlag("clean-old")) {
      console.log(
        `DRY RUN: Có ${oldCount} sản phẩm cũ dự kiến được xóa.`,
      );
    }

    console.log("DRY RUN: Không xóa hoặc ghi dữ liệu database.");
    return;
  }

  let deleted = 0;

  if (hasFlag("clean-old")) {
    console.log("\nĐang xóa sản phẩm từ importer tiếng Anh cũ...");

    deleted = await removeOldProducts();

    console.log(`Đã xóa ${deleted} sản phẩm cũ.`);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  console.log("\n========== IMPORT DATABASE ==========");

  for (const source of products) {
    const slug = makeProductSlug(source);

    try {
      const existing = await db.product.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        console.log(`Đã tồn tại, giữ nguyên: ${source.name}`);
        continue;
      }

      const category = await db.category.upsert({
        where: {
          slug: source.category.slug,
        },
        update: {},
        create: {
          name: source.category.name,
          slug: source.category.slug,
        },
      });

      const description = [
        source.description,
        source.brand ? `Thương hiệu: ${source.brand}.` : "",
        `Nguồn tham khảo: ${source.sourceUrl}`,
        "Nguồn dữ liệu: Dosi-in.",
      ]
        .filter(Boolean)
        .join("\n\n");

      await db.product.create({
        data: {
          name: source.name,
          slug,
          description,
          material: null,
          price: source.price,
          salePrice: null,
          soldCount: source.soldCount,
          isActive: true,
          categoryId: category.id,
          tryOnType: source.category.tryOnType,

          images: {
            create: source.imageUrls.map((url, position) => ({
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
      console.log(`Đã thêm: ${source.name}`);
    } catch (error) {
      failed++;
      console.error(`Lỗi "${source.name}":`, error);
    }
  }

  console.log("\n========== KẾT QUẢ ==========");
  console.log(`Sản phẩm cào thành công: ${products.length}`);
  console.log(`Sản phẩm cũ đã xóa: ${deleted}`);
  console.log(`Sản phẩm mới đã thêm: ${created}`);
  console.log(`Sản phẩm trùng được giữ nguyên: ${skipped}`);
  console.log(`Sản phẩm lỗi: ${failed}`);

  console.log("\nKhông cập nhật hoặc xóa sản phẩm Dosi-in đã có.");
}

main()
  .catch((error) => {
    console.error("\nKhông thể hoàn tất import:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
