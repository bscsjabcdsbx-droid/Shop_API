import { db, HttpError } from "../lib.js";
import { recommend, LIMITS, confidenceLevel, type Outfit } from "./engine.js";
import type { Profile, ProductInput, Style } from "./types.js";

const productInclude = {
  images: { orderBy: { position: "asc" as const }, take: 1 },
  category: { select: { name: true, slug: true } },
  variants: { select: { size: true, color: true, stock: true } },
};

type Row = {
  id: number; name: string; slug: string; description: string; material: string | null; price: number; salePrice: number | null;
  soldCount: number; tryOnType: string | null; images: { url: string }[]; category: { name: string; slug: string };
  variants: { size: string; color: string; stock: number }[];
};
const toInput = (r: Row): ProductInput => ({
  id: r.id, name: r.name, slug: r.slug, description: r.description, material: r.material, price: r.price, salePrice: r.salePrice,
  soldCount: r.soldCount, tryOnType: r.tryOnType, categorySlug: r.category.slug, categoryName: r.category.name,
  images: r.images.map(i => i.url), variants: r.variants,
});

// Bộ nhớ đệm ngắn hạn cho danh sách ứng viên (chỉ đọc). Tồn kho có thể lệch tối đa POOL_TTL_MS.
const POOL_TTL_MS = 30_000;
let poolCache: { at: number; rows: ProductInput[] } | null = null;

async function loadPool(): Promise<ProductInput[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL_MS) return poolCache.rows;
  const cats = await db.category.findMany({ select: { id: true } });
  // Số truy vấn cố định = số danh mục, chạy song song (không truy vấn trong vòng lặp tuần tự).
  const groups = await Promise.all(cats.map((c: { id: number }) => db.product.findMany({
    where: { categoryId: c.id, isActive: true, variants: { some: { stock: { gt: 0 } } } },
    include: productInclude,
    orderBy: [{ soldCount: "desc" }, { id: "asc" }],
    take: LIMITS.poolPerCategory,
  })));
  const rows = groups.flat().map((r: unknown) => toInput(r as Row));
  poolCache = { at: Date.now(), rows };
  return rows;
}

const itemOut = (p: Profile, color?: string) => ({
  id: p.id, name: p.name, slug: p.slug, image: p.image, price: p.price,
  originalPrice: p.originalPrice > p.price ? p.originalPrice : null, role: p.role, color: color ?? null,
});

const SLOT_KEYS = ["top", "bottom", "dress", "outer", "footwear", "bag"] as const;

function outfitOut(o: Outfit, style: Style, baseRole: string) {
  const colorOf = (p: Profile) => o.score.colors.get(p.id)?.name;
  const items: Record<string, unknown> = { accessories: o.items.filter(i => i.role === "accessory").map(i => itemOut(i, colorOf(i))) };
  for (const k of SLOT_KEYS) {
    const it = o.items.find(i => i.role === k);
    if (it) items[k] = itemOut(it, colorOf(it));
  }
  const f = o.score.factors;
  return {
    items, baseSlot: baseRole, style,
    matchScore: Math.round(o.score.score * 100),
    confidence: +o.score.confidence.toFixed(2), confidenceLevel: confidenceLevel(o.score.confidence),
    totalPrice: o.total, complete: o.complete, missing: o.missing,
    breakdown: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.score === null ? null : Math.round(v.score * 100)])),
  };
}

export async function recommendOutfits(input: { productId: number; style: Style; budget?: number }) {
  // Chỉ truy vấn ĐỌC. Không create/update/delete ở bất kỳ đâu trong module này.
  const row = await db.product.findUnique({ where: { id: input.productId }, include: productInclude });
  if (!row || !row.isActive) throw new HttpError(404, "Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng kinh doanh");
  const base = toInput(row as Row);
  const pool = (await loadPool()).filter(p => p.id !== base.id);

  const out = recommend({ base, pool, style: input.style, budget: input.budget });
  if (out.notes.includes("ROLE_UNKNOWN")) throw new HttpError(422, "Chưa xác định được loại sản phẩm để phối đồ");
  const b = out.baseProfile;
  return {
    baseProduct: { ...itemOut(b), inStock: b.inStock, colors: b.colors.map(c => c.name) },
    style: input.style,
    budget: input.budget ?? null,
    recommendations: out.outfits.map(o => outfitOut(o, input.style, b.role!)),
    meta: { candidateCount: out.candidateCount, notes: out.notes },
  };
}
