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
import products from "./routes/products.js";
import uploads from "./routes/uploads.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
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
app.use("/api/admin", admin);
app.use("/images", express.static(path.join(root, "images")));
app.use(express.static(path.join(root, "public")));
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API chạy tại http://localhost:${port}`));