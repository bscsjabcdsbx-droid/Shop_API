import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, uid, wrap } from "../lib.js";
import { recommendOutfits } from "../outfit/service.js";
import { STYLES } from "../outfit/types.js";

const r = Router();

// Giới hạn request theo tài khoản (chống spam): 20 lần/phút.
const MAX_PER_MINUTE = 20;
const hits = new Map<number, { start: number; n: number }>();
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > 60_000) hits.delete(k); }, 60_000).unref();
function perUserRate(req: Request, res: Response, next: NextFunction) {
  const id = uid(req), now = Date.now();
  const h = hits.get(id);
  if (!h || now - h.start > 60_000) hits.set(id, { start: now, n: 1 });
  else if (++h.n > MAX_PER_MINUTE) {
    res.setHeader("Retry-After", String(Math.ceil((h.start + 60_000 - now) / 1000)));
    return res.status(429).json({ error: "Bạn thao tác quá nhanh. Vui lòng chờ một chút." });
  }
  next();
}

const body = z.object({
  productId: z.coerce.number().int().positive(),
  style: z.enum(STYLES).default("casual"),
  budget: z.coerce.number().int().positive().max(1_000_000_000).optional(),
});

r.use(requireAuth, perUserRate);
r.post("/recommend", wrap(async (req, res) => {
  res.json(await recommendOutfits(body.parse(req.body)));
}));

export default r;
