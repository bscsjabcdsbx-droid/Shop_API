import { Router } from "express";
import { z } from "zod";
import { db, HttpError, requireAuth, uid, wrap } from "../lib.js";

export const OPEN_TIME = "08:00";
export const CLOSE_TIME = "22:00";
export const MAX_DAYS_AHEAD = 60;

const pad = (n: number) => String(n).padStart(2, "0");
/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
export const todayVN = (offsetDays = 0) => {
  const t = new Date(Date.now() + offsetDays * 86_400_000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
  return p; // en-CA => YYYY-MM-DD
};
const isRealDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ").refine(isRealDate, "Ngày không hợp lệ");
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ")
  .refine(t => t >= OPEN_TIME && t <= CLOSE_TIME, `Giờ hẹn phải từ ${OPEN_TIME} đến ${CLOSE_TIME}`);

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^0\d{9}$/, "Số điện thoại gồm 10 số và bắt đầu bằng 0"),
  mode: z.string().trim().min(1).max(60),
  topic: z.string().trim().min(1).max(100),
  note: z.string().trim().max(300).optional(),
  date: dateStr,
  time: timeStr,
});

export const bookingOut = (b: { id: number; name: string; phone: string; mode: string; topic: string; note: string | null; date: string; time: string; status: string; confirmedAt: Date | null; createdAt: Date }) =>
  ({ id: b.id, name: b.name, phone: b.phone, mode: b.mode, topic: b.topic, note: b.note, date: b.date, time: b.time, status: b.status, confirmedAt: b.confirmedAt, createdAt: b.createdAt });

const r = Router();
r.use(requireAuth);

r.post("/", wrap(async (req, res) => {
  const d = createSchema.parse(req.body);
  const min = todayVN(1), max = todayVN(MAX_DAYS_AHEAD);
  if (d.date < min || d.date > max) throw new HttpError(400, `Ngày hẹn phải từ ngày mai và trong vòng ${MAX_DAYS_AHEAD} ngày tới`);
  const userId = uid(req);
  if (await db.booking.count({ where: { userId, status: "PENDING", createdAt: { gt: new Date(Date.now() - 3_600_000) } } }) >= 5)
    throw new HttpError(429, "Bạn đặt lịch quá nhiều, vui lòng thử lại sau");
  if (await db.booking.findFirst({ where: { userId, date: d.date, time: d.time, status: { not: "CANCELLED" } } }))
    throw new HttpError(409, "Bạn đã có lịch vào đúng ngày và giờ này");
  const b = await db.booking.create({ data: { ...d, note: d.note || null, userId } });
  res.status(201).json(bookingOut(b));
}));

// Lịch của chính khách (mới nhất trước)
r.get("/", wrap(async (req, res) => {
  const l = await db.booking.findMany({ where: { userId: uid(req) }, orderBy: [{ date: "desc" }, { time: "desc" }], take: 50 });
  res.json(l.map(bookingOut));
}));

// Khách tự hủy lịch đang chờ xác nhận
r.post("/:id/cancel", wrap(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const b = await db.booking.findFirst({ where: { id, userId: uid(req) } });
  if (!b) throw new HttpError(404, "Không tìm thấy lịch hẹn");
  if (b.status !== "PENDING") throw new HttpError(400, "Chỉ hủy được lịch đang chờ xác nhận");
  res.json(bookingOut(await db.booking.update({ where: { id }, data: { status: "CANCELLED" } })));
}));

export default r;
