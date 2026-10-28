import { Router } from "express";
import { db, wrap } from "../lib.js";

const r = Router();

r.get("/", wrap(async (_req, res) => {
  const collections = await db.collection.findMany({
    where: { isActive: true },
    orderBy: [
      { position: "asc" },
      { id: "asc" },
    ],
    include: { images: { orderBy: { position: "asc" } } },
  });

  res.json(collections);
}));

export default r;