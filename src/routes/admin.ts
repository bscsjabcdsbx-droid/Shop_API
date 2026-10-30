import { OrderStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { attachCoupons, releaseCoupon } from "../coupon.js";
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
  images: z.array(imageRef).max(8),
  // Thử đồ AI: null = tự suy theo danh mục; "none" = tắt cho sản phẩm này. Không gửi = giữ nguyên.
  tryOnType: z.enum(["upper", "lower", "overall", "none"]).nullable().optional(),
  variants: z.array(z.object({ size: z.string(), color: z.string(), stock: z.number().int().min(0) })).min(1),
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
  const list = await db.order.findMany({ where: { ...(code && { code: { contains: code, mode: "insensitive" } }), ...(status && { status }) }, orderBy: { createdAt: "desc" }, include: { items: true } });
  res.json(await attachCoupons(list));
}));
const flow: Record<OrderStatus, OrderStatus[]> = { PENDING: ["CONFIRMED","CANCELLED"], CONFIRMED: ["PREPARING","CANCELLED"], PREPARING: ["SHIPPING","CANCELLED"], SHIPPING: ["DELIVERED"], DELIVERED: [], CANCELLED: [] };
r.patch("/orders/:id/status", wrap(async (req, res) => {
  const { status } = z.object({ status: z.nativeEnum(OrderStatus) }).parse(req.body);
  const orderId = await db.$transaction(async tx => {
    const o = await tx.order.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!o) throw new HttpError(404, "Không tìm thấy đơn hàng");
    if (!flow[o.status].includes(status)) throw new HttpError(409, `Không thể chuyển từ ${o.status} sang ${status}`);
    await tx.order.update({ where: { id: o.id }, data: { status } });
    if (status === "CANCELLED") for (const i of o.items) if (i.variantId !== null) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
    return o.id;
  });
  if (status === "CANCELLED") await releaseCoupon(orderId);
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
  images: z.array(z.object({ url: imageRef, caption: z.string().trim().max(300).default("") })).max(12).optional(),
});
const withImages = { images: { orderBy: { position: "asc" as const } } };
const toImages = (images: { url: string; caption: string }[]) =>
  images.map((m, i) => ({ url: m.url, caption: m.caption, position: i }));
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
  res.json(await db.collection.findMany({ orderBy: byPosition, include: withImages }));
}));

// Tạo bộ sưu tập (không gửi position thì xếp cuối danh sách)
r.post("/collections", wrap(async (req, res) => {
  const { position, imageUrl, images, ...data } = collectionSchema.parse(req.body);
  await assertCategory(data.categorySlug);
  const last = await db.collection.aggregate({ _max: { position: true } });
  const collection = await db.collection.create({
    data: {
      ...data,
      imageUrl: imageUrl ?? null,
      position: position ?? (last._max.position ?? 0) + 1,
      ...(images && { images: { create: toImages(images) } }),
    },
    include: withImages,
  });
  res.status(201).json(collection);
}));

// Chỉnh sửa bộ sưu tập (không gửi position thì giữ nguyên vị trí cũ)
r.put("/collections/:id", wrap(async (req, res) => {
  const id = parseId(req.params.id);
  const { position, imageUrl, images, ...data } = collectionSchema.parse(req.body);
  await assertCategory(data.categorySlug);
  // Có gửi images thì thay toàn bộ danh sách ảnh; không gửi thì giữ nguyên ảnh cũ
  const collection = await db.$transaction(async tx => {
    if (images !== undefined) await tx.collectionImage.deleteMany({ where: { collectionId: id } });
    return tx.collection.update({
      where: { id },
      data: {
        ...data,
        imageUrl: imageUrl ?? null,
        ...(position !== undefined && { position }),
        ...(images !== undefined && { images: { create: toImages(images) } }),
      },
      include: withImages,
    });
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

// ===== Mã giảm giá =====
const dateRef = z.string().datetime({ offset: true }).nullable().optional();
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Mã gồm 3 đến 30 ký tự: chữ, số, gạch ngang hoặc gạch dưới"),
  description: z.string().trim().max(200).default(""),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().min(1),
  minOrder: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(1).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  startsAt: dateRef,
  expiresAt: dateRef,
  isActive: z.boolean().default(true),
})
  .refine(c => c.type !== "PERCENT" || c.value <= 100, { message: "Giảm theo phần trăm tối đa là 100%" })
  .refine(c => !c.startsAt || !c.expiresAt || new Date(c.startsAt) < new Date(c.expiresAt), { message: "Ngày kết thúc phải sau ngày bắt đầu" });

const couponData = (c: z.infer<typeof couponSchema>) => ({
  code: c.code, description: c.description, type: c.type, value: c.value, minOrder: c.minOrder,
  maxDiscount: c.type === "PERCENT" ? c.maxDiscount ?? null : null,
  usageLimit: c.usageLimit ?? null, perUserLimit: c.perUserLimit ?? null,
  startsAt: c.startsAt ? new Date(c.startsAt) : null, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
  isActive: c.isActive,
});

function duplicateCode(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Mã giảm giá này đã tồn tại");
  throw e;
}

r.get("/coupons", wrap(async (_req, res) => res.json(await db.coupon.findMany({ orderBy: { id: "desc" } }))));
r.post("/coupons", wrap(async (req, res) => {
  const c = couponSchema.parse(req.body);
  res.status(201).json(await db.coupon.create({ data: couponData(c) }).catch(duplicateCode));
}));
r.put("/coupons/:id", wrap(async (req, res) => {
  const c = couponSchema.parse(req.body);
  res.json(await db.coupon.update({ where: { id: parseId(req.params.id) }, data: couponData(c) }).catch(duplicateCode));
}));
r.delete("/coupons/:id", wrap(async (req, res) => {
  await db.coupon.delete({ where: { id: parseId(req.params.id) } });
  res.json({ ok: true });
}));

// ===== Chat với khách =====
const chatBody = z.object({ body: z.string().trim().min(1).max(1000) });

// Danh sách cuộc trò chuyện: tin mới nhất của mỗi khách và số tin khách chưa được đọc
r.get("/chat/threads", wrap(async (_req, res) => {
  const [latest, unread] = await Promise.all([
    db.chatMessage.findMany({
      distinct: ["userId"], orderBy: { id: "desc" }, take: 100,
      select: { id: true, userId: true, fromAdmin: true, body: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    db.chatMessage.groupBy({ by: ["userId"], where: { fromAdmin: false, readByAdmin: false }, _count: { _all: true } }),
  ]);
  const counts = new Map(unread.map(u => [u.userId, u._count._all]));
  res.json(latest.map(m => ({
    userId: m.userId, name: m.user.name, email: m.user.email, lastBody: m.body, lastFromAdmin: m.fromAdmin,
    lastAt: m.createdAt, unread: counts.get(m.userId) ?? 0,
  })));
}));

r.get("/chat/unread", wrap(async (_req, res) => {
  res.json({ count: await db.chatMessage.count({ where: { fromAdmin: false, readByAdmin: false } }) });
}));

// Lấy tin nhắn của một khách (tin mới hơn `after`) và đánh dấu đã đọc
r.get("/chat/:userId/messages", wrap(async (req, res) => {
  const userId = parseId(req.params.userId);
  const after = z.coerce.number().int().min(0).default(0).parse(req.query.after);
  const messages = await db.chatMessage.findMany({
    where: { userId, id: { gt: after } }, orderBy: { id: "asc" }, take: 200,
    select: { id: true, fromAdmin: true, body: true, createdAt: true },
  });
  await db.chatMessage.updateMany({ where: { userId, fromAdmin: false, readByAdmin: false }, data: { readByAdmin: true } });
  res.json({ messages });
}));

r.post("/chat/:userId/messages", wrap(async (req, res) => {
  const userId = parseId(req.params.userId);
  const { body } = chatBody.parse(req.body);
  const exists = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw new HttpError(404, "Không tìm thấy khách hàng");
  const m = await db.chatMessage.create({
    data: { userId, fromAdmin: true, body, readByAdmin: true },
    select: { id: true, fromAdmin: true, body: true, createdAt: true },
  });
  res.status(201).json(m);
}));

export default r;