import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { errorHandler } from "./lib.js";
import admin from "./routes/admin.js";
import auth from "./routes/auth.js";
import cart from "./routes/cart.js";
import orders from "./routes/orders.js";
import products from "./routes/products.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/api/products", products);
app.use("/api/cart", cart);
app.use("/api/orders", orders);
app.use("/api/admin", admin);
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../public")));
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API chạy tại http://localhost:${port}`));
