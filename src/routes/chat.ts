import { Router } from "express";
import { z } from "zod";
import { db, HttpError, requireAuth, uid, wrap } from "../lib.js";

const r = Router();
r.use(requireAuth);

// Tin nhắn của cuộc trò chuyện giữa khách và admin (lấy tin mới hơn id `after`)
r.get("/messages", wrap(async (req, res) => {
  const after = z.coerce.number().int().min(0).default(0).parse(req.query.after);
  const messages = await db.chatMessage.findMany({
    where: { userId: uid(req), id: { gt: after } },
    orderBy: { id: "asc" },
    take: 200,
    select: { id: true, fromAdmin: true, body: true, createdAt: true },
  });
  res.json({ messages });
}));

r.post("/messages", wrap(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const recent = await db.chatMessage.count({
    where: { userId: uid(req), fromAdmin: false, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 15) throw new HttpError(429, "Bạn gửi tin nhắn quá nhanh, vui lòng thử lại sau ít phút");
  const m = await db.chatMessage.create({
    data: { userId: uid(req), fromAdmin: false, body, readByUser: true },
    select: { id: true, fromAdmin: true, body: true, createdAt: true },
  });
  res.status(201).json(m);
}));

// Đánh dấu đã đọc các tin của admin
r.post("/read", wrap(async (req, res) => {
  await db.chatMessage.updateMany({ where: { userId: uid(req), fromAdmin: true, readByUser: false }, data: { readByUser: true } });
  res.json({ ok: true });
}));

// Số tin của admin chưa đọc (cho chấm đỏ trên biểu tượng chat)
r.get("/unread", wrap(async (req, res) => {
  res.json({ count: await db.chatMessage.count({ where: { userId: uid(req), fromAdmin: true, readByUser: false } }) });
}));

export default r;