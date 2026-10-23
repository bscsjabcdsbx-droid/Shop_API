import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, HttpError, requireAuth, signToken, uid, wrap } from "../lib.js";

const r = Router();
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(72), name: z.string().min(2).max(80), phone: z.string().regex(/^0\d{9}$/).optional() });
const pub = { id: true, email: true, name: true, phone: true, role: true } as const;

r.post("/register", wrap(async (req, res) => {
  const d = registerSchema.parse(req.body);
  if (await db.user.findUnique({ where: { email: d.email.toLowerCase() } })) throw new HttpError(409, "Email đã được đăng ký");
  const user = await db.user.create({ data: { email: d.email.toLowerCase(), name: d.name, phone: d.phone, passwordHash: await bcrypt.hash(d.password, 12), cart: { create: {} } }, select: pub });
  res.status(201).json({ token: signToken(user.id), user });
}));

r.post("/login", wrap(async (req, res) => {
  const d = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(d.password, user.passwordHash))) throw new HttpError(401, "Sai email hoặc mật khẩu");
  if (!user.isActive) throw new HttpError(403, "Tài khoản đã bị khóa");
  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role } });
}));

r.get("/me", requireAuth, wrap(async (req, res) => res.json(await db.user.findUnique({ where: { id: uid(req) }, select: pub }))));

r.patch("/me", requireAuth, wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(2).max(80), phone: z.string().regex(/^0\d{9}$/).nullable() }).parse(req.body);
  res.json(await db.user.update({ where: { id: uid(req) }, data: d, select: pub }));
}));

r.post("/change-password", requireAuth, wrap(async (req, res) => {
  const d = z.object({ current: z.string(), next: z.string().min(8).max(72) }).parse(req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: uid(req) } });
  if (!(await bcrypt.compare(d.current, user.passwordHash))) throw new HttpError(400, "Mật khẩu hiện tại không đúng");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(d.next, 12) } });
  res.json({ ok: true });
}));
export default r;
