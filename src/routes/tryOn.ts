// API thử đồ AI. Frontend chỉ gọi các endpoint này; không bao giờ gọi CatVTON/Tunnel trực tiếp.
//
//   GET    /api/try-on/config          cấu hình công khai (bật/tắt, dung lượng tối đa, máy AI có hoạt động)
//   GET    /api/try-on/active          job gần nhất còn hoạt động/còn ảnh + hạn mức còn lại   (đăng nhập)
//   POST   /api/try-on                 tạo job: multipart personImage + productId, header Idempotency-Key (đăng nhập)
//   GET    /api/try-on/:jobId/status   trạng thái                                              (chủ job)
//   GET    /api/try-on/:jobId/result   ẢNH PNG kết quả (bytes, không lưu ở Render/DB)          (chủ job)
//   DELETE /api/try-on/:jobId          hủy job đang chờ / giải phóng ảnh kết quả                (chủ job)
import { Readable } from "node:stream";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { db, requireAuth, uid, wrap } from "../lib.js";
import { CatvtonError, deleteJob, getResult, serviceStatus, submitJob } from "../tryon/catvtonClient.js";
import { cfg, GARMENT_TYPES, type GarmentType } from "../tryon/config.js";
import { GarmentError, loadGarmentImage, sniffImage } from "../tryon/images.js";
import {
  ACTIVE, cancelOrRelease, failData, publicJob, quotaInfo, refreshJob, refreshUserActive,
  remotePatch, reserveJob, TryOnError,
} from "../tryon/jobs.js";

const r = Router();
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendError(res: Response, e: TryOnError) {
  if (e.extra.retryAfter) res.setHeader("Retry-After", String(e.extra.retryAfter));
  res.status(e.status).json({ error: e.message, code: e.code, ...e.extra });
}

// Giới hạn tần suất gọi API thử đồ (kể cả polling) theo tài khoản — chống spam request.
const hits = new Map<number, { start: number; n: number }>();
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > 60_000) hits.delete(k); }, 60_000).unref();
function perUserRate(req: Request, res: Response, next: NextFunction) {
  const id = uid(req), now = Date.now();
  const h = hits.get(id);
  if (!h || now - h.start > 60_000) hits.set(id, { start: now, n: 1 });
  else if (++h.n > cfg.requestsPerMinute) {
    res.setHeader("Retry-After", String(Math.ceil((h.start + 60_000 - now) / 1000)));
    return res.status(429).json({ error: "Bạn thao tác quá nhanh. Vui lòng chờ một chút.", code: "TOO_MANY_REQUESTS" });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(), // ảnh chỉ nằm trong RAM, không ghi đĩa
  limits: { fileSize: cfg.uploadMaxSize, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
});
function receiveImage(req: Request, res: Response, next: NextFunction) {
  upload.single("personImage")(req, res, err => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE")
      return res.status(413).json({ error: `Ảnh vượt quá ${(cfg.uploadMaxSize / 1048576).toFixed(0)} MB.`, code: "FILE_TOO_LARGE" });
    return res.status(400).json({ error: "Dữ liệu tải lên không hợp lệ.", code: "BAD_UPLOAD" });
  });
}

async function ownedJob(req: Request) {
  const id = String(req.params.jobId);
  if (!UUID_RE.test(id)) throw new TryOnError(404, "JOB_NOT_FOUND", "Không tìm thấy tác vụ.");
  const job = await db.tryOnJob.findUnique({ where: { id } });
  // Không tiết lộ job của người khác có tồn tại hay không.
  if (!job || job.userId !== uid(req)) throw new TryOnError(404, "JOB_NOT_FOUND", "Không tìm thấy tác vụ.");
  return job;
}

const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  wrap(async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (e instanceof TryOnError) return sendError(res, e);
      throw e;
    }
  });

// ------------------------------------------------------------------ cấu hình công khai
r.get("/config", wrap(async (_req, res) => {
  const svc = await serviceStatus();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    enabled: cfg.enabled, online: svc.online, ready: svc.ready,
    uploadMaxSize: cfg.uploadMaxSize, resultTtl: cfg.resultTtlSec, acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
    categoryMap: cfg.categoryMap,
    limits: { maxActiveJobs: cfg.userMaxActiveJobs, windowMax: cfg.rateMax, windowMinutes: cfg.rateWindowMs / 60000, dailyMax: cfg.dailyLimit },
  });
}));

r.use(requireAuth, perUserRate);

// ------------------------------------------------------------------ khôi phục trạng thái sau khi tải lại trang
r.get("/active", handle(async (req, res) => {
  const userId = uid(req);
  await refreshUserActive(userId);
  const job = await db.tryOnJob.findFirst({
    where: { userId, OR: [{ status: { in: ACTIVE } }, { status: "COMPLETED", resultReleased: false,
      finishedAt: { gte: new Date(Date.now() - cfg.resultTtlSec * 1000) } }] },
    orderBy: { createdAt: "desc" },
  });
  res.json({ job: job ? publicJob(job) : null, quota: await quotaInfo(userId) });
}));

// ------------------------------------------------------------------ tạo tác vụ
r.post("/", receiveImage, handle(async (req, res) => {
  if (!cfg.enabled) throw new TryOnError(503, "TRYON_DISABLED", "Tính năng thử đồ AI hiện chưa được bật.");
  const userId = uid(req);
  const key = String(req.headers["idempotency-key"] ?? "");
  if (!KEY_RE.test(key)) throw new TryOnError(400, "BAD_IDEMPOTENCY_KEY", "Thiếu hoặc sai Idempotency-Key.");

  // Gửi lại cùng một thao tác (lỗi mạng, double-click): trả lại job cũ, không tạo thêm.
  const dup = await db.tryOnJob.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
  if (dup) return res.status(200).json({ job: publicJob(dup) });

  // Chỉ nhận productId; KHÔNG nhận URL ảnh hay loại trang phục từ frontend.
  if (typeof req.body?.imageUrl !== "undefined" || typeof req.body?.garmentUrl !== "undefined")
    throw new TryOnError(400, "URL_NOT_ALLOWED", "Không được gửi đường dẫn ảnh.");
  const productId = Number(req.body?.productId);
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new TryOnError(400, "BAD_PRODUCT", "Sản phẩm không hợp lệ.");
  const file = req.file;
  if (!file) throw new TryOnError(400, "NO_IMAGE", "Bạn chưa chọn ảnh.");
  const personMime = sniffImage(file.buffer);
  if (!personMime) throw new TryOnError(400, "INVALID_IMAGE", "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.");

  const product = await db.product.findFirst({
    where: { id: productId, isActive: true },
    include: { category: { select: { slug: true } }, images: { orderBy: { position: "asc" }, take: 1 } },
  });
  if (!product) throw new TryOnError(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
  const override = product.tryOnType;
  if (override === "none") throw new TryOnError(400, "NOT_SUPPORTED", "Sản phẩm này không hỗ trợ thử đồ AI.");
  const garmentType: GarmentType | undefined =
    GARMENT_TYPES.includes(override as GarmentType) ? (override as GarmentType) : cfg.categoryMap[product.category.slug];
  if (!garmentType) throw new TryOnError(400, "NOT_SUPPORTED", "Sản phẩm này không hỗ trợ thử đồ AI.");
  const imageUrl = product.images[0]?.url;
  if (!imageUrl) throw new TryOnError(400, "NO_PRODUCT_IMAGE", "Sản phẩm chưa có ảnh để thử đồ.");

  let garment;
  try { garment = await loadGarmentImage(imageUrl); } catch (e) {
    if (e instanceof GarmentError) {
      console.warn(`[try-on] Ảnh sản phẩm ${productId} không dùng được: ${e.code}`);
      throw new TryOnError(422, e.code, "Ảnh của sản phẩm này chưa dùng được cho thử đồ AI.");
    }
    throw e;
  }

  // Cập nhật job cũ của người dùng (nếu đã xong trên CatVTON) trước khi tính giới hạn.
  await refreshUserActive(userId);
  const { job, created } = await reserveJob(userId, productId, garmentType, key);
  if (!created) return res.status(200).json({ job: publicJob(job) });

  try {
    const remote = await submitJob({
      jobId: job.id, person: file.buffer, personMime, garment: garment.data, garmentMime: garment.mime, garmentType,
    });
    const updated = await db.tryOnJob.update({ where: { id: job.id }, data: { submittedAt: new Date(), ...remotePatch(remote, job) } });
    console.log(`[try-on] job ${job.id} user ${userId} product ${productId} -> ${remote.status}`);
    return res.status(202).json({ job: publicJob(updated) });
  } catch (e) {
    if (!(e instanceof CatvtonError)) {
      await db.tryOnJob.update({ where: { id: job.id }, data: failData("SUBMIT_FAILED") });
      throw e;
    }
    const map: Record<string, [number, string]> = {
      queue_full: [503, e.code === "RESULT_STORE_FULL" ? "RESULT_STORE_FULL" : "QUEUE_FULL"],
      not_ready: [503, "MODEL_NOT_READY"],
      timeout: [504, "SUBMIT_TIMEOUT"],
      bad_request: [400, "INVALID_IMAGE"],
      auth: [503, "SERVICE_MISCONFIGURED"],
    };
    let [status, code] = map[e.kind] ?? [503, "SERVICE_OFFLINE"];
    // 400 từ CatVTON chỉ là lỗi của người dùng khi đó là ảnh hỏng; lỗi tham số khác là do cấu hình hai phía lệch nhau.
    if (e.kind === "bad_request" && e.code !== "INVALID_IMAGE") [status, code] = [503, "SERVICE_MISCONFIGURED"];
    if (code === "SERVICE_MISCONFIGURED" && e.kind !== "auth") console.error(`[try-on] CatVTON từ chối tham số: ${e.code}`);
    if (e.kind === "auth") console.error("[try-on] CatVTON từ chối API key (kiểm tra CATVTON_API_KEY ở hai phía)");
    else console.warn(`[try-on] job ${job.id} gửi thất bại: ${e.kind}/${e.code}`);
    const failed = await db.tryOnJob.update({ where: { id: job.id }, data: failData(code) });
    if (e.kind === "timeout") {
      // Có thể CatVTON đã nhận job nhưng phản hồi bị mất: yêu cầu hủy để không chiếm GPU vô ích.
      deleteJob(job.id).catch(() => undefined);
    }
    const retryAfter = e.retryAfter ?? (status === 503 ? 30 : undefined);
    throw new TryOnError(status, code, publicJob(failed).message ?? "Không gửi được yêu cầu.", retryAfter ? { retryAfter } : {});
  }
}));

// ------------------------------------------------------------------ trạng thái
r.get("/:jobId/status", handle(async (req, res) => {
  const { job, reachable } = await refreshJob(await ownedJob(req));
  res.setHeader("Cache-Control", "no-store");
  res.json({ job: publicJob(job, { serviceReachable: reachable }) });
}));

// ------------------------------------------------------------------ ảnh kết quả (bytes trực tiếp)
r.get("/:jobId/result", handle(async (req, res) => {
  let job = await ownedJob(req);
  if (ACTIVE.includes(job.status)) job = (await refreshJob(job)).job;
  if (job.status !== "COMPLETED") throw new TryOnError(409, "RESULT_NOT_READY", "Ảnh kết quả chưa sẵn sàng.");
  if (!publicJob(job).resultAvailable) throw new TryOnError(410, "RESULT_EXPIRED", "Ảnh kết quả đã hết hạn lưu tạm. Vui lòng tạo lại.");

  let remote: globalThis.Response;
  try { remote = await getResult(job.id); } catch (e) {
    if (e instanceof CatvtonError && (e.kind === "expired" || e.kind === "not_found")) {
      await db.tryOnJob.update({ where: { id: job.id }, data: { resultReleased: true } });
      throw new TryOnError(410, "RESULT_EXPIRED", "Ảnh kết quả đã hết hạn lưu tạm. Vui lòng tạo lại.");
    }
    if (e instanceof CatvtonError) throw new TryOnError(503, "SERVICE_OFFLINE", "Máy chủ AI hiện không hoạt động. Vui lòng thử lại sau.", { retryAfter: 30 });
    throw e;
  }
  const type = (remote.headers.get("content-type") ?? "").split(";")[0].trim();
  if (type !== "image/png" || !remote.body) {
    await remote.body?.cancel().catch(() => undefined);
    throw new TryOnError(502, "BAD_RESULT", "Máy chủ AI trả về dữ liệu không hợp lệ.");
  }
  await db.tryOnJob.update({ where: { id: job.id }, data: { resultFetchedAt: new Date() } });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename="thu-do-${job.id.slice(0, 8)}.png"`);
  const len = remote.headers.get("content-length");
  if (len) res.setHeader("Content-Length", len);
  // Stream thẳng từ CatVTON tới trình duyệt: không ghi đĩa, không ghi DB.
  Readable.fromWeb(remote.body as import("node:stream/web").ReadableStream).on("error", () => res.destroy()).pipe(res);
}));

// ------------------------------------------------------------------ hủy / giải phóng
r.delete("/:jobId", handle(async (req, res) => {
  const job = await cancelOrRelease(await ownedJob(req));
  res.json({ job: publicJob(job) });
}));

export default r;
