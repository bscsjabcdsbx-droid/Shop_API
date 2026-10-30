import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../lib.js";
import { cfg } from "./config.js";

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

/** Nhận diện định dạng ảnh thật bằng magic bytes (không tin Content-Type hay đuôi file). */
export function sniffImage(buf: Uint8Array): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return "image/png";
  if (buf.length >= 12 && Buffer.from(buf.subarray(0, 4)).toString("latin1") === "RIFF" &&
      Buffer.from(buf.subarray(8, 12)).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export class GarmentError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const IMAGES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "images");

async function readLimited(res: Response, max: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new GarmentError("GARMENT_TOO_LARGE", "Ảnh sản phẩm quá lớn");
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > max) throw new GarmentError("GARMENT_TOO_LARGE", "Ảnh sản phẩm quá lớn");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Lấy bytes ảnh sản phẩm từ nguồn CHÍNH THỨC trong database. Không bao giờ nhận URL từ frontend.
 * - /api/uploads/:id  -> đọc trực tiếp bảng Upload
 * - /images/...        -> đọc file trong thư mục images/ của backend (chặn path traversal)
 * - http(s)://...      -> chỉ khi host nằm trong TRYON_GARMENT_ALLOWED_HOSTS (chống SSRF), không theo redirect
 */
export async function loadGarmentImage(url: string): Promise<{ data: Buffer; mime: ImageMime }> {
  const max = cfg.uploadMaxSize;
  let ref = url.trim();
  if (cfg.publicApiBaseUrl && ref.startsWith(cfg.publicApiBaseUrl + "/")) ref = ref.slice(cfg.publicApiBaseUrl.length);

  let data: Buffer;
  const upload = /^\/api\/uploads\/(\d{1,10})$/.exec(ref);
  if (upload) {
    const row = await db.upload.findUnique({ where: { id: Number(upload[1]) } });
    if (!row) throw new GarmentError("GARMENT_NOT_FOUND", "Không tìm thấy ảnh sản phẩm");
    data = Buffer.from(row.data);
  } else if (ref.startsWith("/images/")) {
    const rel = decodeURIComponent(ref.slice("/images/".length).split(/[?#]/)[0]);
    const file = path.resolve(IMAGES_ROOT, rel);
    if (!file.startsWith(IMAGES_ROOT + path.sep)) throw new GarmentError("GARMENT_INVALID", "Đường dẫn ảnh sản phẩm không hợp lệ");
    const st = await stat(file).catch(() => null);
    if (!st?.isFile()) throw new GarmentError("GARMENT_NOT_FOUND", "Không tìm thấy ảnh sản phẩm");
    if (st.size > max) throw new GarmentError("GARMENT_TOO_LARGE", "Ảnh sản phẩm quá lớn");
    data = await readFile(file);
  } else if (/^https?:\/\//i.test(ref)) {
    let u: URL;
    try { u = new URL(ref); } catch { throw new GarmentError("GARMENT_INVALID", "Đường dẫn ảnh sản phẩm không hợp lệ"); }
    if (!cfg.garmentAllowedHosts.includes(u.hostname.toLowerCase()))
      throw new GarmentError("GARMENT_HOST_NOT_ALLOWED", "Ảnh sản phẩm nằm ở máy chủ ngoài chưa được cho phép");
    let res: Response;
    try {
      res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(15000) });
    } catch {
      throw new GarmentError("GARMENT_FETCH_FAILED", "Không tải được ảnh sản phẩm");
    }
    if (!res.ok) throw new GarmentError("GARMENT_FETCH_FAILED", "Không tải được ảnh sản phẩm");
    data = await readLimited(res, max);
  } else {
    throw new GarmentError("GARMENT_INVALID", "Đường dẫn ảnh sản phẩm không hợp lệ");
  }

  if (data.length > max) throw new GarmentError("GARMENT_TOO_LARGE", "Ảnh sản phẩm quá lớn");
  const mime = sniffImage(data);
  if (!mime) throw new GarmentError("GARMENT_INVALID", "Ảnh sản phẩm không phải JPEG, PNG hoặc WebP");
  return { data, mime };
}
