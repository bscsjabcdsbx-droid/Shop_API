import { Router } from "express";
import { z } from "zod";
import { findUsable } from "../coupon.js";
import { db, HttpError, requireAuth, uid, wrap } from "../lib.js";

const r = Router();
r.use(requireAuth);

// Kiểm tra mã trên giỏ hàng hiện tại của khách (tạm tính tính ở server, không tin số từ trình duyệt)
r.post("/validate", wrap(async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(1).max(40) }).parse(req.body);
  const cart = await db.cart.findUnique({
    where: { userId: uid(req) },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });
  const subtotal = (cart?.items ?? []).reduce((s, i) => s + (i.variant.product.salePrice ?? i.variant.product.price) * i.quantity, 0);
  if (!subtotal) throw new HttpError(400, "Giỏ hàng trống");
  const { coupon, discount } = await findUsable(db, code, subtotal, uid(req));
  res.json({
    code: coupon.code, description: coupon.description, type: coupon.type, value: coupon.value,
    minOrder: coupon.minOrder, maxDiscount: coupon.maxDiscount, discount, subtotal,
  });
}));

export default r;