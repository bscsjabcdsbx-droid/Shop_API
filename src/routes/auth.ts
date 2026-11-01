import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sendMail } from "../mail.js";
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

// ===== Quên mật khẩu =====
const RESET_TTL_MS = 30 * 60_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// Địa chỉ giao diện web để dựng liên kết đặt lại: RESET_URL_BASE, nếu không có thì lấy origin đầu tiên của CLIENT_ORIGIN
const resetBase = () => (process.env.RESET_URL_BASE || (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",")[0].trim()).replace(/\/+$/, "");

r.post("/forgot-password", wrap(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  // Luôn trả lời giống nhau để không lộ email nào đã đăng ký
  const reply = { ok: true, message: "Nếu email đã đăng ký, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Liên kết có hiệu lực 30 phút." };
  if (!user || !user.isActive) return res.json(reply);
  // Giới hạn: tối đa 3 yêu cầu / giờ / tài khoản
  if (await db.passwordReset.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } }) >= 3) return res.json(reply);
  const token = randomBytes(32).toString("hex");
  const row = await db.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  const link = `${resetBase()}/?reset=${token}`;
  try {
    await sendMail(user.email, "Đặt lại mật khẩu NSHV",
      `<p>Xin chào ${esc(user.name)},</p><p>Bạn vừa yêu cầu đặt lại mật khẩu. Bấm vào liên kết dưới đây (có hiệu lực 30 phút, dùng được một lần):</p><p><a href="${link}">Đặt lại mật khẩu</a></p><p>Nếu không phải bạn yêu cầu, hãy bỏ qua email này.</p>`,
      `Xin chào ${user.name},\nĐặt lại mật khẩu (hiệu lực 30 phút, dùng một lần): ${link}\nNếu không phải bạn yêu cầu, hãy bỏ qua email này.`);
  } catch (e) {
    console.error(e);
    await db.passwordReset.delete({ where: { id: row.id } }).catch(() => {});
  }
  res.json(reply);
}));

r.post("/reset-password", wrap(async (req, res) => {
  const d = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password: z.string().min(8).max(72) }).parse(req.body);
  const row = await db.passwordReset.findUnique({ where: { tokenHash: sha256(d.token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new HttpError(400, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
  const passwordHash = await bcrypt.hash(d.password, 12);
  // Đánh dấu đã dùng bằng điều kiện usedAt = null để hai yêu cầu song song không cùng dùng một token
  const used = await db.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) throw new HttpError(400, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn");
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    db.passwordReset.deleteMany({ where: { userId: row.userId, usedAt: null } }),
  ]);
  res.json({ ok: true });
}));
export default r;
