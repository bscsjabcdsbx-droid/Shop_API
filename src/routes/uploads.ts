import { Router } from "express";
import { db, HttpError, wrap } from "../lib.js";

const r = Router();

// Ảnh được lưu trong database nên không mất khi server khởi động lại hoặc deploy lại
r.get("/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "ID không hợp lệ");
  const row = await db.upload.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Không tìm thấy ảnh");
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.send(Buffer.from(row.data));
}));

export default r;