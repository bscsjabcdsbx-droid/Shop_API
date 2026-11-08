import { Router } from "express";
import { z } from "zod";
import { db, HttpError, requireAdmin, requireAuth, wrap } from "../lib.js";

const r = Router();
const swatchSchema = z.object({
  name: z.string().trim().min(1).max(40),
  // Nhận #rrggbb, rrggbb, #rgb hoặc rgb -> luôn lưu dạng #rrggbb viết thường.
  hex: z.string().trim().transform(s => {
    let h = s.replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.replace(/./g, c => c + c);
    return "#" + h.toLowerCase();
  }).refine(h => /^#[0-9a-f]{6}$/.test(h), "Mã màu HEX không hợp lệ (vd: #1f2a52)"),
});

// Công khai: trang sản phẩm dùng để vẽ ô chọn màu.
r.get("/", wrap(async (_req, res) => res.json(await db.colorSwatch.findMany({ orderBy: { name: "asc" } }))));

r.put("/", requireAuth, requireAdmin, wrap(async (req, res) => {
  const { name, hex } = swatchSchema.parse(req.body);
  res.json(await db.colorSwatch.upsert({ where: { name }, update: { hex }, create: { name, hex } }));
}));

r.delete("/:name", requireAuth, requireAdmin, wrap(async (req, res) => {
  await db.colorSwatch.deleteMany({ where: { name: req.params.name } });
  res.json({ ok: true });
}));

// Xóa hẳn một màu khỏi mọi sản phẩm (biến thể + màu hiển thị). Từ chối nếu đó là màu duy nhất của một sản phẩm.
r.delete("/:name/products", requireAuth, requireAdmin, wrap(async (req, res) => {
  const name = req.params.name;
  const variants = await db.productVariant.findMany({ where: { color: name }, select: { productId: true, product: { select: { name: true } } } });
  const blocked: string[] = [];
  for (const pid of new Set(variants.map(v => v.productId))) {
    const others = await db.productVariant.count({ where: { productId: pid, NOT: { color: name } } });
    if (!others) blocked.push(variants.find(v => v.productId === pid)!.product.name);
  }
  if (blocked.length) {
    const shown = blocked.slice(0, 5).join(", ") + (blocked.length > 5 ? ` và ${blocked.length - 5} sản phẩm khác` : "");
    throw new HttpError(409, `Không thể xóa: "${name}" là màu duy nhất của ${shown}. Hãy thêm màu khác cho các sản phẩm này trước.`);
  }
  const [removed] = await db.$transaction([
    db.productVariant.deleteMany({ where: { color: name } }),
    db.colorSwatch.deleteMany({ where: { name } }),
  ]);
  res.json({ ok: true, removedVariants: removed.count });
}));

export default r;