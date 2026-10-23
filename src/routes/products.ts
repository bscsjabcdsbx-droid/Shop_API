import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { db, HttpError, wrap } from "../lib.js";

const r = Router();
const q = z.object({
  q: z.string().optional(), category: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(), maxPrice: z.coerce.number().int().min(0).optional(),
  size: z.string().optional(), color: z.string().optional(), inStock: z.enum(["true","false"]).optional(),
  sort: z.enum(["newest","price_asc","price_desc","bestseller"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(48).default(12),
});
const orderBy = {
  newest: { createdAt: "desc" }, price_asc: { price: "asc" }, price_desc: { price: "desc" }, bestseller: { soldCount: "desc" },
} satisfies Record<string, Prisma.ProductOrderByWithRelationInput>;
const listInclude = {
  images: { orderBy: { position: "asc" }, take: 3 }, category: { select: { name: true, slug: true } },
  reviews: { select: { rating: true } }, variants: { select: { id: true, size: true, color: true, stock: true } },
} satisfies Prisma.ProductInclude;

function withRating<T extends { reviews: { rating: number }[]; variants: { stock: number }[] }>(p: T) {
  const { reviews, variants, ...rest } = p;
  return { ...rest, variants, rating: reviews.length ? +(reviews.reduce((s, x) => s + x.rating, 0) / reviews.length).toFixed(1) : 0, reviewCount: reviews.length, inStock: variants.some(v => v.stock > 0) };
}

r.get("/categories", wrap(async (_req, res) => res.json(await db.category.findMany({ orderBy: { id: "asc" } }))));

r.get("/", wrap(async (req, res) => {
  const f = q.parse(req.query);
  const where: Prisma.ProductWhereInput = { isActive: true,
    ...(f.q && { name: { contains: f.q, mode: "insensitive" } }),
    ...(f.category && { category: { slug: f.category } }),
    ...((f.minPrice !== undefined || f.maxPrice !== undefined) && { price: { gte: f.minPrice, lte: f.maxPrice } }),
    ...((f.size || f.color || f.inStock === "true") && { variants: { some: { size: f.size, color: f.color, ...(f.inStock === "true" && { stock: { gt: 0 } }) } } }),
  };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include: listInclude, orderBy: orderBy[f.sort], skip: (f.page - 1) * f.limit, take: f.limit }),
  ]);
  res.json({ items: rows.map(withRating), total, page: f.page, totalPages: Math.ceil(total / f.limit) });
}));

r.get("/:slug", wrap(async (req, res) => {
  const p = await db.product.findFirst({ where: { slug: req.params.slug, isActive: true }, include: {
    ...listInclude, images: { orderBy: { position: "asc" } },
    variants: { orderBy: [{ color: "asc" }, { size: "asc" }] },
    reviews: { orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { name: true } } } } } });
  if (!p) throw new HttpError(404, "Không tìm thấy sản phẩm");
  const related = await db.product.findMany({ where: { categoryId: p.categoryId, id: { not: p.id }, isActive: true }, include: listInclude, take: 4 });
  const { reviews, variants, ...detail } = p;
  res.json({ ...detail, variants, reviews,
    rating: reviews.length ? +(reviews.reduce((s, x) => s + x.rating, 0) / reviews.length).toFixed(1) : 0,
    reviewCount: reviews.length, inStock: variants.some(v => v.stock > 0), related: related.map(withRating) });
}));
export default r;
