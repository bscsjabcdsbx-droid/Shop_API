import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db, HttpError, requireAuth, uid, wrap } from "../lib.js";

const r = Router();
r.use(requireAuth);
const FREE_SHIP_FROM = 500_000, SHIP_FEE = 30_000;

const checkoutSchema = z.object({
  fullName: z.string().min(2), phone: z.string().regex(/^0\d{9}$/, "Số điện thoại không hợp lệ"), email: z.string().email(),
  line: z.string().min(3), province: z.string().min(1), district: z.string().min(1), ward: z.string().min(1),
  note: z.string().max(500).optional(), paymentMethod: z.enum(["COD"]).default("COD"),
});

r.post("/", wrap(async (req, res) => {
  const d = checkoutSchema.parse(req.body);
  const order = await db.$transaction(async tx => {
    const cart = await tx.cart.findUnique({ where: { userId: uid(req) }, include: { items: { include: { variant: { include: { product: true } } } } } });
    if (!cart || cart.items.length === 0) throw new HttpError(400, "Giỏ hàng trống hoặc đơn đã được tạo");
    let subtotal = 0;
    const lines = cart.items.map(i => {
      const price = i.variant.product.salePrice ?? i.variant.product.price;
      subtotal += price * i.quantity;
      return { name: i.variant.product.name, size: i.variant.size, color: i.variant.color, price, quantity: i.quantity, variantId: i.variantId, productId: i.variant.productId };
    });
    for (const l of lines) {
      const upd = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
      if (upd.count === 0) throw new HttpError(409, `"${l.name}" (${l.size}/${l.color}) không đủ hàng`);
      await tx.product.update({ where: { id: l.productId }, data: { soldCount: { increment: l.quantity } } });
    }
    const shippingFee = subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE;
    const created = await tx.order.create({ data: {
      code: `DH${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`,
      userId: uid(req), paymentMethod: d.paymentMethod, shipName: d.fullName, shipPhone: d.phone, shipEmail: d.email,
      shipAddress: `${d.line}, ${d.ward}, ${d.district}, ${d.province}`, note: d.note, subtotal, shippingFee, total: subtotal + shippingFee,
      items: { create: lines.map(({ productId, ...l }) => l) } }, include: { items: true } });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return created;
  });
  res.status(201).json(order);
}));

r.get("/", wrap(async (req, res) => res.json(await db.order.findMany({ where: { userId: uid(req) }, orderBy: { createdAt: "desc" }, include: { items: true } }))));

r.get("/:code", wrap(async (req, res) => {
  const o = await db.order.findFirst({ where: { code: req.params.code, userId: uid(req) }, include: { items: true } });
  if (!o) throw new HttpError(404, "Không tìm thấy đơn hàng");
  res.json(o);
}));

r.post("/:code/cancel", wrap(async (req, res) => {
  await db.$transaction(async tx => {
    const o = await tx.order.findFirst({ where: { code: req.params.code, userId: uid(req) }, include: { items: true } });
    if (!o) throw new HttpError(404, "Không tìm thấy đơn hàng");
    if (o.status !== "PENDING") throw new HttpError(409, "Chỉ hủy được đơn đang chờ xác nhận");
    await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
    for (const i of o.items) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
  });
  res.json({ ok: true });
}));
export default r;
