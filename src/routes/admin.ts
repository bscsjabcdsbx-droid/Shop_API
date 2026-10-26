import { OrderStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { db, HttpError, requireAdmin, requireAuth, wrap } from "../lib.js";

const r = Router();
r.use(requireAuth, requireAdmin);

r.get("/stats", wrap(async (_req, res) => {
  const [rev, orders, customers, products, recent, top] = await Promise.all([
    db.order.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { total: true } }), db.order.count(), db.user.count({ where: { role: "CUSTOMER" } }), db.product.count(),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 5 }), db.product.findMany({ orderBy: { soldCount: "desc" }, take: 5, select: { id: true, name: true, soldCount: true } }),
  ]);
  const monthly = await db.$queryRaw<{ month: string; revenue: bigint }[]>`
    SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, SUM(total) AS revenue
    FROM "Order" WHERE status <> 'CANCELLED' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`;
  res.json({ revenue: rev._sum.total ?? 0, orders, customers, products, recentOrders: recent, topProducts: top, monthly: monthly.map(m => ({ month: m.month, revenue: Number(m.revenue) })).reverse() });
}));

const productSchema = z.object({
  name: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().min(1), material: z.string().optional(),
  price: z.number().int().min(0), salePrice: z.number().int().min(0).nullable().optional(), categoryId: z.number().int(), isActive: z.boolean().default(true),
  images: z.array(z.string().url()).min(1), variants: z.array(z.object({ size: z.string(), color: z.string(), stock: z.number().int().min(0) })).min(1),
}).refine(p => p.salePrice == null || p.salePrice < p.price, { message: "Giá khuyến mãi phải thấp hơn giá gốc" });

r.get("/products", wrap(async (req, res) => {
  const s = String(req.query.q ?? "");
  res.json(await db.product.findMany({ where: s ? { name: { contains: s, mode: "insensitive" } } : {}, orderBy: { id: "desc" }, include: { category: true, images: { take: 1 }, variants: true } }));
}));
r.post("/products", wrap(async (req, res) => {
  const { images, variants, ...d } = productSchema.parse(req.body);
  res.status(201).json(await db.product.create({ data: { ...d, images: { create: images.map((url, position) => ({ url, position })) }, variants: { create: variants } } }));
}));
r.put("/products/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { images, variants, ...d } = productSchema.parse(req.body);
  res.json(await db.$transaction(async tx => {
    await tx.productImage.deleteMany({ where: { productId: id } });
    for (const v of variants) await tx.productVariant.upsert({ where: { productId_size_color: { productId: id, size: v.size, color: v.color } }, update: { stock: v.stock }, create: { ...v, productId: id } });
    return tx.product.update({ where: { id }, data: { ...d, images: { create: images.map((url, position) => ({ url, position })) } } });
  }));
}));
r.delete("/products/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  try { await db.product.delete({ where: { id } }); }
  catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") { await db.product.update({ where: { id }, data: { isActive: false } }); return res.json({ ok: true, archived: true }); }
    throw e;
  }
  res.json({ ok: true });
}));
r.patch("/variants/:id/stock", wrap(async (req, res) => {
  const { stock } = z.object({ stock: z.number().int().min(0) }).parse(req.body);
  res.json(await db.productVariant.update({ where: { id: Number(req.params.id) }, data: { stock } }));
}));

r.get("/orders", wrap(async (req, res) => {
  const { code, status } = z.object({ code: z.string().optional(), status: z.nativeEnum(OrderStatus).optional() }).parse(req.query);
  res.json(await db.order.findMany({ where: { ...(code && { code: { contains: code, mode: "insensitive" } }), ...(status && { status }) }, orderBy: { createdAt: "desc" }, include: { items: true } }));
}));
const flow: Record<OrderStatus, OrderStatus[]> = { PENDING: ["CONFIRMED","CANCELLED"], CONFIRMED: ["PREPARING","CANCELLED"], PREPARING: ["SHIPPING","CANCELLED"], SHIPPING: ["DELIVERED"], DELIVERED: [], CANCELLED: [] };
r.patch("/orders/:id/status", wrap(async (req, res) => {
  const { status } = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
  await db.$transaction(async tx => {
    const o = await tx.order.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!o) throw new HttpError(404, "Không tìm thấy đơn hàng");
    if (!flow[o.status].includes(status)) throw new HttpError(409, `Không thể chuyển từ ${o.status} sang ${status}`);
    await tx.order.update({ where: { id: o.id }, data: { status } });
    if (status === "CANCELLED") for (const i of o.items) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
  });
  res.json({ ok: true });
}));

r.get("/customers", wrap(async (req, res) => {
  const s = String(req.query.q ?? "");
  res.json(await db.user.findMany({ where: { role: "CUSTOMER", ...(s && { OR: [{ name: { contains: s, mode: "insensitive" } }, { email: { contains: s, mode: "insensitive" } }] }) },
    select: { id: true, email: true, name: true, phone: true, isActive: true, createdAt: true, _count: { select: { orders: true } } }, orderBy: { id: "desc" } }));
}));
r.get("/customers/:id/orders", wrap(async (req, res) => res.json(await db.order.findMany({ where: { userId: Number(req.params.id) }, orderBy: { createdAt: "desc" }, include: { items: true } }))));
r.patch("/customers/:id/active", wrap(async (req, res) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  res.json(await db.user.update({ where: { id: Number(req.params.id), role: "CUSTOMER" }, data: { isActive }, select: { id: true, isActive: true } }));
}));

const collectionSchema = z.object({
  title: z.string().trim().min(2).max(100),
  categorySlug: z.string().trim().min(1),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

// Lấy tất cả bộ sưu tập
r.get("/collections", wrap(async (_req, res) => {
  const collections = await db.collection.findMany({
    orderBy: [
      { position: "asc" },
      { id: "asc" },
    ],
  });

  res.json(collections);
}));

// Tạo bộ sưu tập
r.post("/collections", wrap(async (req, res) => {
  const data = collectionSchema.parse(req.body);

  const category = await db.category.findUnique({
    where: { slug: data.categorySlug },
  });

  if (!category) {
    throw new HttpError(400, "Danh mục không tồn tại");
  }

  const collection = await db.collection.create({
    data,
  });

  res.status(201).json(collection);
}));

// Chỉnh sửa bộ sưu tập
r.put("/collections/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, "ID không hợp lệ");
  }

  const data = collectionSchema.parse(req.body);

  const category = await db.category.findUnique({
    where: { slug: data.categorySlug },
  });

  if (!category) {
    throw new HttpError(400, "Danh mục không tồn tại");
  }

  const collection = await db.collection.update({
    where: { id },
    data,
  });

  res.json(collection);
}));

// Xóa bộ sưu tập
r.delete("/collections/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, "ID không hợp lệ");
  }

  await db.collection.delete({
    where: { id },
  });

  res.json({ ok: true });
}));
export default r;
