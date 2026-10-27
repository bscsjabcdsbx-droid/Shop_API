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

const imageRef = z.string().min(1).max(2000).refine(u => /^(https?:\/\/|\/)/.test(u), "Đường dẫn ảnh phải bắt đầu bằng http(s):// hoặc /");

const productSchema = z.object({
  name: z.string().min(2), slug: z.string().regex(/^[a-z0-9-]+$/), description: z.string().min(1), material: z.string().optional(),
  price: z.number().int().min(0), salePrice: z.number().int().min(0).nullable().optional(), categoryId: z.number().int(), isActive: z.boolean().default(true),
  images: z.array(imageRef).max(8), variants: z.array(z.object({ size: z.string(), color: z.string(), stock: z.number().int().min(0) })).min(1),
}).refine(p => p.salePrice == null || p.salePrice < p.price, { message: "Giá khuyến mãi phải thấp hơn giá gốc" });

r.get("/products", wrap(async (req, res) => {
  const s = String(req.query.q ?? "");
  res.json(await db.product.findMany({ where: s ? { name: { contains: s, mode: "insensitive" } } : {}, orderBy: { id: "desc" }, include: { category: true, images: { orderBy: { position: "asc" } }, variants: true } }));
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
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "ID không hợp lệ");
  const exists = await db.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new HttpError(404, "Không tìm thấy sản phẩm");
  try {
    // Biến thể, ảnh, đánh giá, yêu thích và mục trong giỏ bị xóa theo; chi tiết đơn hàng được giữ lại (variantId = null)
    await db.product.delete({ where: { id } });
  } catch (e) {
    // Database chưa được cập nhật (chưa chạy `npx prisma db push`): ẩn sản phẩm thay vì báo lỗi
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      await db.product.update({ where: { id }, data: { isActive: false } });
      return res.json({ ok: true, archived: true });
    }
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
    if (status === "CANCELLED") for (const i of o.items) if (i.variantId !== null) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
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
  imageUrl: imageRef.nullable().optional(),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).optional(),
});
const byPosition = [{ position: "asc" as const }, { id: "asc" as const }];

function parseId(raw: string) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "ID không hợp lệ");
  return id;
}

async function assertCategory(slug: string) {
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) throw new HttpError(400, "Danh mục không tồn tại");
}

// Lấy tất cả bộ sưu tập (kể cả đang ẩn)
r.get("/collections", wrap(async (_req, res) => {
  res.json(await db.collection.findMany({ orderBy: byPosition }));
}));

// Tạo bộ sưu tập (không gửi position thì xếp cuối danh sách)
r.post("/collections", wrap(async (req, res) => {
  const { position, imageUrl, ...data } = collectionSchema.parse(req.body);
  await assertCategory(data.categorySlug);
  const last = await db.collection.aggregate({ _max: { position: true } });
  const collection = await db.collection.create({
    data: { ...data, imageUrl: imageUrl ?? null, position: position ?? (last._max.position ?? 0) + 1 },
  });
  res.status(201).json(collection);
}));

// Chỉnh sửa bộ sưu tập (không gửi position thì giữ nguyên vị trí cũ)
r.put("/collections/:id", wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const { position, imageUrl, ...data } = collectionSchema.parse(req.body);
  await assertCategory(data.categorySlug);
  const collection = await db.collection.update({
    where: { id },
    data: { ...data, imageUrl: imageUrl ?? null, ...(position !== undefined && { position }) },
  });
  res.json(collection);
}));

// Xóa bộ sưu tập
r.delete("/collections/:id", wrap(async (req, res) => {
  await db.collection.delete({ where: { id: parseId(req.params.id) } });
  res.json({ ok: true });
}));

// Đổi thứ tự lên (-1) hoặc xuống (1); đánh lại số thứ tự 1..n để không bị trùng vị trí
r.post("/collections/:id/move", wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const { direction } = z.object({ direction: z.union([z.literal(-1), z.literal(1)]) }).parse(req.body);
  const all = await db.collection.findMany({ orderBy: byPosition });
  const i = all.findIndex(c => c.id === id), j = i + direction;
  if (i < 0) throw new HttpError(404, "Không tìm thấy bộ sưu tập");
  if (j >= 0 && j < all.length) {
    const ids = all.map(c => c.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await db.$transaction(ids.map((cid, k) => db.collection.update({ where: { id: cid }, data: { position: k + 1 } })));
  }
  res.json({ ok: true });
}));

// Tải ảnh lên: lưu trong database, trả về đường dẫn /api/uploads/:id
r.post("/upload", wrap(async (req, res) => {
  const { dataUrl } = z.object({ dataUrl: z.string().max(8_000_000) }).parse(req.body);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, "Chỉ nhận ảnh PNG, JPEG hoặc WebP");
  const row = await db.upload.create({ data: { mime: m[1], data: Buffer.from(m[2], "base64") }, select: { id: true } });
  res.status(201).json({ url: `/api/uploads/${row.id}` });
}));

export default r;