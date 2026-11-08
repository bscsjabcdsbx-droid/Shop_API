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

// Xóa hẳn một màu khỏi mọi sản phẩm (biến thể + màu hiển thị).
// - Sản phẩm còn màu khác: chỉ gỡ biến thể của màu này.
// - Sản phẩm chỉ có đúng màu này (xóa xong sẽ không còn biến thể để bán): mặc định từ chối (409, kèm danh sách + số lượng
//   để giao diện hỏi lại). Nếu có ?replaceWith=<màu khác> thì chuyển các biến thể đó sang màu thay thế (giữ nguyên size, tồn kho)
//   rồi mới xóa, nên admin không phải sửa từng sản phẩm một.
r.delete("/:name/products", requireAuth, requireAdmin, wrap(async (req, res) => {
  const name = req.params.name;
  const rawRepl = typeof req.query.replaceWith === "string" ? req.query.replaceWith.trim() : "";
  if (rawRepl.length > 40) throw new HttpError(400, "Tên màu thay thế tối đa 40 ký tự");
  if (rawRepl && rawRepl === name) throw new HttpError(400, "Màu thay thế phải khác màu đang xóa");
  const replaceWith = rawRepl || null;

  const variants = await db.productVariant.findMany({ where: { color: name }, select: { productId: true, product: { select: { name: true } } } });
  const blockedIds: number[] = [];
  const blocked: string[] = [];
  for (const pid of new Set(variants.map(v => v.productId))) {
    const others = await db.productVariant.count({ where: { productId: pid, NOT: { color: name } } });
    if (!others) {
      blockedIds.push(pid);
      blocked.push(variants.find(v => v.productId === pid)!.product.name);
    }
  }
  if (blocked.length && !replaceWith) {
    const shown = blocked.slice(0, 5).join(", ") + (blocked.length > 5 ? ` và ${blocked.length - 5} sản phẩm khác` : "");
    return void res.status(409).json({
      error: `Không thể xóa: "${name}" là màu duy nhất của ${shown}. Hãy chọn màu thay thế hoặc thêm màu khác cho các sản phẩm này trước.`,
      blockedCount: blocked.length,
      blockedProducts: blocked.slice(0, 5),
    });
  }
  const ops = [];
  // Chuyển trước (chỉ các sản phẩm không còn màu nào khác nên không thể trùng (sản phẩm, size, màu)), phần còn lại xóa sau.
  if (blocked.length && replaceWith) {
    ops.push(db.productVariant.updateMany({ where: { color: name, productId: { in: blockedIds } }, data: { color: replaceWith } }));
  }
  ops.push(db.productVariant.deleteMany({ where: { color: name } }));
  ops.push(db.colorSwatch.deleteMany({ where: { name } }));
  const results = await db.$transaction(ops);
  const moved = blocked.length && replaceWith ? results[0].count : 0;
  const removed = results[results.length - 2].count;
  res.json({ ok: true, removedVariants: removed, movedVariants: moved, movedProducts: replaceWith ? blocked.length : 0 });
}));

export default r;