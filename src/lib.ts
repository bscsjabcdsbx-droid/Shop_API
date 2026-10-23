import { PrismaClient, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const db = new PrismaClient();
export const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (JWT_SECRET.length < 16) throw new Error("JWT_SECRET phải có ít nhất 16 ký tự");

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export interface AuthedRequest extends Request { user: { id: number; role: Role } }

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new HttpError(401, "Chưa đăng nhập");
    const payload = jwt.verify(token, JWT_SECRET) as unknown as { sub: number };
    const user = await db.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, isActive: true } });
    if (!user || !user.isActive) throw new HttpError(401, "Tài khoản không hợp lệ hoặc đã bị khóa");
    (req as AuthedRequest).user = { id: user.id, role: user.role };
    next();
  } catch (e) { next(e instanceof HttpError ? e : new HttpError(401, "Phiên đăng nhập không hợp lệ")); }
};
export const requireAdmin: RequestHandler = (req, _res, next) =>
  (req as AuthedRequest).user.role === "ADMIN" ? next() : next(new HttpError(403, "Không đủ quyền"));

export const signToken = (id: number) => jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "7d" });
export const uid = (req: Request) => (req as AuthedRequest).user.id;

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err && typeof err === "object" && "issues" in err) return res.status(400).json({ error: "Dữ liệu không hợp lệ", details: (err as { issues: unknown }).issues });
  console.error(err);
  res.status(500).json({ error: "Lỗi máy chủ" });
}
