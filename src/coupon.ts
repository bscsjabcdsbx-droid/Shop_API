import type { Prisma } from "@prisma/client";
import { db, HttpError } from "./lib.js";

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

export function discountFor(c: { type: "PERCENT" | "FIXED"; value: number; maxDiscount: number | null }, subtotal: number) {
  const raw = c.type === "PERCENT" ? Math.floor((subtotal * c.value) / 100) : c.value;
  const capped = c.type === "PERCENT" && c.maxDiscount ? Math.min(raw, c.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

/** Kiểm tra mã còn dùng được cho đơn này không; trả về mã và số tiền được giảm. */
export async function findUsable(client: Prisma.TransactionClient, rawCode: string, subtotal: number, userId: number) {
  const coupon = await client.coupon.findUnique({ where: { code: rawCode.trim().toUpperCase() } });
  if (!coupon) throw new HttpError(404, "Mã giảm giá không tồn tại");
  const now = new Date();
  if (!coupon.isActive) throw new HttpError(400, "Mã giảm giá đã bị tắt");
  if (coupon.startsAt && coupon.startsAt > now) throw new HttpError(400, "Mã giảm giá chưa đến thời gian áp dụng");
  if (coupon.expiresAt && coupon.expiresAt < now) throw new HttpError(400, "Mã giảm giá đã hết hạn");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw new HttpError(400, "Mã giảm giá đã hết lượt sử dụng");
  if (subtotal < coupon.minOrder) throw new HttpError(400, `Đơn hàng tối thiểu ${vnd(coupon.minOrder)} để dùng mã này`);
  if (coupon.perUserLimit !== null) {
    const used = await client.couponUse.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit) throw new HttpError(400, "Bạn đã dùng hết lượt của mã này");
  }
  return { coupon, discount: discountFor(coupon, subtotal) };
}

/** Dùng trong giao dịch đặt hàng: kiểm tra lại và tăng số lượt dùng (chống dùng quá giới hạn khi nhiều người đặt cùng lúc). */
export async function applyCoupon(tx: Prisma.TransactionClient, rawCode: string, subtotal: number, userId: number) {
  const { coupon, discount } = await findUsable(tx, rawCode, subtotal, userId);
  const upd = await tx.coupon.updateMany({
    where: { id: coupon.id, ...(coupon.usageLimit !== null && { usedCount: { lt: coupon.usageLimit } }) },
    data: { usedCount: { increment: 1 } },
  });
  if (upd.count === 0) throw new HttpError(409, "Mã giảm giá đã hết lượt sử dụng");
  return { id: coupon.id, code: coupon.code, discount };
}

/** Hủy đơn: trả lại lượt dùng mã. Chạy sau khi giao dịch hủy đã xong; lỗi (ví dụ chưa tạo bảng) không làm hỏng việc hủy đơn. */
export async function releaseCoupon(orderId: number) {
  try {
    const use = await db.couponUse.findUnique({ where: { orderId } });
    if (!use) return;
    await db.$transaction([
      db.couponUse.delete({ where: { orderId } }),
      db.coupon.updateMany({ where: { id: use.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } }),
    ]);
  } catch (e) {
    console.error("releaseCoupon:", e);
  }
}

/** Gắn mã giảm giá và số tiền giảm vào danh sách đơn hàng. Nếu chưa có bảng CouponUse thì trả nguyên danh sách. */
export async function attachCoupons<T extends { id: number }>(orders: T[]) {
  if (orders.length === 0) return orders;
  try {
    const uses = await db.couponUse.findMany({
      where: { orderId: { in: orders.map(o => o.id) } },
      include: { coupon: { select: { code: true } } },
    });
    const byOrder = new Map(uses.map(u => [u.orderId, { couponCode: u.coupon.code, discount: u.discount }]));
    return orders.map(o => ({ ...o, ...(byOrder.get(o.id) ?? {}) }));
  } catch {
    return orders;
  }
}