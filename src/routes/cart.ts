import { Router } from "express";
import { z } from "zod";
import { db, HttpError, requireAuth, uid, wrap } from "../lib.js";

const r = Router();
r.use(requireAuth);

const cartInclude = { items: { orderBy: { id: "asc" }, include: { variant: { include: { product: { select: { name: true, slug: true, price: true, salePrice: true, images: { orderBy: { position: "asc" }, take: 1 } } } } } } } } as const;

async function getCart(userId: number) {
  const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId }, include: cartInclude });
  const items = cart.items.map(i => {
    const unit = i.variant.product.salePrice ?? i.variant.product.price;
    return { id: i.id, variantId: i.variantId, quantity: i.quantity, size: i.variant.size, color: i.variant.color, stock: i.variant.stock,
      name: i.variant.product.name, slug: i.variant.product.slug, image: i.variant.product.images[0]?.url ?? null, unitPrice: unit, lineTotal: unit * i.quantity };
  });
  return { id: cart.id, items, subtotal: items.reduce((s, i) => s + i.lineTotal, 0) };
}

r.get("/", wrap(async (req, res) => res.json(await getCart(uid(req)))));

r.post("/items", wrap(async (req, res) => {
  const d = z.object({ variantId: z.number().int(), quantity: z.number().int().min(1).max(20) }).parse(req.body);
  const variant = await db.productVariant.findUnique({ where: { id: d.variantId } });
  if (!variant) throw new HttpError(400, "Vui lòng chọn size và màu hợp lệ");
  const cart = await db.cart.upsert({ where: { userId: uid(req) }, update: {}, create: { userId: uid(req) } });
  const key = { cartId_variantId: { cartId: cart.id, variantId: d.variantId } };
  const existing = await db.cartItem.findUnique({ where: key });
  const qty = (existing?.quantity ?? 0) + d.quantity;
  if (qty > variant.stock) throw new HttpError(409, `Chỉ còn ${variant.stock} sản phẩm trong kho`);
  await db.cartItem.upsert({ where: key, update: { quantity: qty }, create: { cartId: cart.id, variantId: d.variantId, quantity: qty } });
  res.status(201).json(await getCart(uid(req)));
}));

r.patch("/items/:id", wrap(async (req, res) => {
  const { quantity } = z.object({ quantity: z.number().int().min(1).max(20) }).parse(req.body);
  const item = await db.cartItem.findFirst({ where: { id: Number(req.params.id), cart: { userId: uid(req) } }, include: { variant: true } });
  if (!item) throw new HttpError(404, "Không tìm thấy sản phẩm trong giỏ");
  if (quantity > item.variant.stock) throw new HttpError(409, `Chỉ còn ${item.variant.stock} sản phẩm trong kho`);
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  res.json(await getCart(uid(req)));
}));

r.delete("/items/:id", wrap(async (req, res) => {
  await db.cartItem.deleteMany({ where: { id: Number(req.params.id), cart: { userId: uid(req) } } });
  res.json(await getCart(uid(req)));
}));
export default r;
