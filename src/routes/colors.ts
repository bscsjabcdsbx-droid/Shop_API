import { Router } from "express";
import { z } from "zod";
import { db, requireAdmin, requireAuth, wrap } from "../lib.js";

const r = Router();
const swatchSchema = z.object({
  name: z.string().trim().min(1).max(40),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Mã màu phải có dạng #rrggbb"),
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

export default r;
