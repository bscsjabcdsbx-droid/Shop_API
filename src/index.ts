import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { errorHandler, requireAdmin, requireAuth } from "./lib.js";
import admin from "./routes/admin.js";
import auth from "./routes/auth.js";
import cart from "./routes/cart.js";
import chat from "./routes/chat.js";
import collections from "./routes/collections.js";
import coupons from "./routes/coupons.js";
import orders from "./routes/orders.js";
import outfit from "./routes/outfit.js";
import products from "./routes/products.js";
import tryOn from "./routes/tryOn.js";
import { startSweeper } from "./tryon/jobs.js";
import uploads from "./routes/uploads.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
// Render đặt backend sau 1 lớp proxy: lấy đúng IP người dùng cho log/giới hạn. Đổi bằng TRUST_PROXY nếu cần.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
// CLIENT_ORIGIN: một hoặc nhiều origin, cách nhau dấu phẩy; hỗ trợ "*." cho domain preview,
// ví dụ: https://shop-9be.pages.dev,https://*.shop-9be.pages.dev
const origins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map(s => s.trim()).filter(Boolean);
const originOk = (o: string) => origins.some(p => p === o || (p.includes("://*.") && (() => {
  const [scheme, host] = p.split("://*.");
  return o.startsWith(scheme + "://") && o.endsWith("." + host);
})()));
app.use(cors({
  origin: (o, cb) => cb(null, !o || originOk(o)),
  exposedHeaders: ["Retry-After", "Content-Disposition"],
}));
// Tải ảnh lên: chỉ admin, cho phép body lớn hơn các API khác (đặt trước bộ đọc JSON mặc định)
app.use("/api/admin/upload", requireAuth, requireAdmin, express.json({ limit: "10mb" }));
app.use(express.json({ limit: "100kb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/api/products", products);
app.use("/api/cart", cart);
app.use("/api/orders", orders);
app.use("/api/collections", collections);
app.use("/api/coupons", coupons);
app.use("/api/chat", chat);
app.use("/api/uploads", uploads);
app.use("/api/try-on", tryOn);
app.use("/api/outfit", outfit);
app.use("/api/admin", admin);
app.use("/images", express.static(path.join(root, "images")));
app.use(express.static(path.join(root, "public")));
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API chạy tại http://localhost:${port}`));
startSweeper();