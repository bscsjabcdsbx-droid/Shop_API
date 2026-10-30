// Quản lý vòng đời TryOnJob (chỉ metadata) và giới hạn lượt thử đồ.
import type { Prisma, TryOnJob, TryOnStatus } from "@prisma/client";
import { db } from "../lib.js";
import { CatvtonError, deleteJob, getJob, type RemoteJob } from "./catvtonClient.js";
import { cfg } from "./config.js";

const LOCK_NAMESPACE = 731_001; // không gian khóa pg_advisory riêng cho tính năng thử đồ
export const ACTIVE: TryOnStatus[] = ["QUEUED", "PROCESSING"];
const DAY_MS = 24 * 3600 * 1000;

/** Lỗi do hệ thống (không phải do người dùng): không trừ lượt. */
const SYSTEM_ERRORS = new Set([
  "SERVICE_OFFLINE", "QUEUE_FULL", "RESULT_STORE_FULL", "MODEL_NOT_READY", "SUBMIT_TIMEOUT", "SUBMIT_FAILED",
  "JOB_LOST", "TIMEOUT", "GPU_OOM", "WORKER_STUCK", "CATVTON_AUTH", "SERVICE_MISCONFIGURED",
]);

export const MESSAGES: Record<string, string> = {
  SERVICE_OFFLINE: "Máy chủ AI hiện không hoạt động. Vui lòng thử lại sau.",
  SERVICE_MISCONFIGURED: "Máy chủ AI hiện không hoạt động. Vui lòng thử lại sau.",
  QUEUE_FULL: "Hàng đợi đã đầy, hệ thống đang quá tải. Vui lòng thử lại sau ít phút.",
  RESULT_STORE_FULL: "Hệ thống đang quá tải. Vui lòng thử lại sau ít phút.",
  MODEL_NOT_READY: "Máy chủ AI đang khởi động. Vui lòng thử lại sau ít phút.",
  SUBMIT_TIMEOUT: "Không gửi được yêu cầu tới máy chủ AI (quá thời gian). Vui lòng thử lại.",
  SUBMIT_FAILED: "Không gửi được yêu cầu tới máy chủ AI. Vui lòng thử lại.",
  JOB_LOST: "Máy chủ AI đã khởi động lại nên tác vụ bị mất. Vui lòng thử lại.",
  TIMEOUT: "Tác vụ đã hết thời gian xử lý.",
  GPU_OOM: "Máy chủ AI thiếu bộ nhớ GPU. Vui lòng thử lại sau.",
  WORKER_STUCK: "Tác vụ đã hết thời gian xử lý.",
  INFERENCE_ERROR: "AI không tạo được ảnh từ ảnh này. Hãy thử ảnh khác (toàn thân, rõ người, nền đơn giản).",
  NSFW_BLOCKED: "Ảnh không vượt qua bước kiểm tra an toàn. Vui lòng sử dụng hình ảnh phù hợp và thử lại.",
  INVALID_IMAGE: "Ảnh không hợp lệ hoặc bị hỏng.",
  CANCELLED: "Tác vụ đã được hủy.",
  RESULT_EXPIRED: "Ảnh kết quả đã hết hạn lưu tạm. Vui lòng tạo lại.",
};

export class TryOnError extends Error {
  constructor(public status: number, public code: string, message: string,
              public extra: { retryAfter?: number; activeJobId?: string } = {}) { super(message); }
}

// ------------------------------------------------------------------ biểu diễn công khai
export function publicJob(j: TryOnJob, opts: { serviceReachable?: boolean } = {}) {
  const ttlEnd = j.finishedAt ? j.finishedAt.getTime() + cfg.resultTtlSec * 1000 : 0;
  const resultAvailable = j.status === "COMPLETED" && !j.resultReleased && Date.now() < ttlEnd;
  return {
    id: j.id,
    productId: j.productId,
    status: j.status.toLowerCase(),
    queuePosition: j.status === "QUEUED" ? j.queuePosition : null,
    errorCode: j.errorCode,
    message: j.errorCode ? MESSAGES[j.errorCode] ?? "Tác vụ đã thất bại." : null,
    resultAvailable,
    resultExpiresAt: resultAvailable ? new Date(ttlEnd).toISOString() : null,
    createdAt: j.createdAt.toISOString(),
    ...(opts.serviceReachable === false ? { serviceReachable: false } : {}),
  };
}

// ------------------------------------------------------------------ hạn mức
async function quotaRows(client: Pick<typeof db, "tryOnJob">, userId: number, since: Date, take: number) {
  return client.tryOnJob.findMany({
    where: { userId, countsTowardQuota: true, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" }, take, select: { createdAt: true },
  });
}

/** Thời điểm (giây) đến khi số lượt trong cửa sổ giảm xuống dưới giới hạn; 0 nếu còn lượt. */
function waitSeconds(rows: { createdAt: Date }[], limit: number, windowMs: number, now: number) {
  if (rows.length < limit) return 0;
  const pivot = rows[limit - 1].createdAt.getTime();
  return Math.max(1, Math.ceil((pivot + windowMs - now) / 1000));
}

export async function quotaInfo(userId: number) {
  const now = Date.now();
  const [win, day, active] = await Promise.all([
    quotaRows(db, userId, new Date(now - cfg.rateWindowMs), cfg.rateMax),
    quotaRows(db, userId, new Date(now - DAY_MS), cfg.dailyLimit),
    db.tryOnJob.count({ where: { userId, status: { in: ACTIVE } } }),
  ]);
  return {
    activeJobs: active, maxActiveJobs: cfg.userMaxActiveJobs,
    windowUsed: win.length, windowMax: cfg.rateMax, windowMinutes: cfg.rateWindowMs / 60000,
    dailyUsed: day.length, dailyMax: cfg.dailyLimit,
    retryAfter: Math.max(waitSeconds(win, cfg.rateMax, cfg.rateWindowMs, now), waitSeconds(day, cfg.dailyLimit, DAY_MS, now)),
  };
}

/**
 * Kiểm tra giới hạn và tạo job trong MỘT transaction có khóa advisory theo userId.
 * Hai request đồng thời của cùng người dùng phải xếp hàng tại khóa, nên không thể cùng vượt qua bước kiểm tra.
 */
export async function reserveJob(userId: number, productId: number, garmentType: string, idempotencyKey: string) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int4, ${userId}::int4)`;
    const existing = await tx.tryOnJob.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (existing) return { job: existing, created: false };

    const now = Date.now();
    // Job cũ bị treo (vượt tuổi tối đa) không được chặn người dùng mãi mãi.
    await tx.tryOnJob.updateMany({
      where: { userId, status: { in: ACTIVE }, createdAt: { lt: new Date(now - cfg.jobMaxAgeSec * 1000) } },
      data: { status: "FAILED", errorCode: "TIMEOUT", countsTowardQuota: false, finishedAt: new Date() },
    });
    const active = await tx.tryOnJob.findMany({
      where: { userId, status: { in: ACTIVE } }, orderBy: { createdAt: "desc" }, select: { id: true },
    });
    if (active.length >= cfg.userMaxActiveJobs)
      throw new TryOnError(429, "ACTIVE_JOB_EXISTS", "Bạn đang có một lượt thử đồ chưa hoàn thành. Vui lòng chờ lượt đó xong.",
        { activeJobId: active[0].id });

    const win = await quotaRows(tx, userId, new Date(now - cfg.rateWindowMs), cfg.rateMax);
    const w1 = waitSeconds(win, cfg.rateMax, cfg.rateWindowMs, now);
    if (w1) throw new TryOnError(429, "RATE_LIMITED",
      `Bạn đã dùng ${cfg.rateMax} lượt trong ${cfg.rateWindowMs / 60000} phút. Vui lòng chờ trước khi thử lại.`, { retryAfter: w1 });
    const day = await quotaRows(tx, userId, new Date(now - DAY_MS), cfg.dailyLimit);
    const w2 = waitSeconds(day, cfg.dailyLimit, DAY_MS, now);
    if (w2) throw new TryOnError(429, "DAILY_LIMIT",
      `Bạn đã đạt giới hạn ${cfg.dailyLimit} lượt thử đồ trong 24 giờ.`, { retryAfter: w2 });

    const job = await tx.tryOnJob.create({ data: { userId, productId, garmentType, idempotencyKey } });
    return { job, created: true };
  }, { timeout: 15000, maxWait: 15000 });
}

// ------------------------------------------------------------------ đồng bộ trạng thái với CatVTON
type Patch = Prisma.TryOnJobUpdateManyMutationInput;

async function patchActive(job: TryOnJob, data: Patch): Promise<TryOnJob> {
  // Chỉ cập nhật nếu job vẫn đang hoạt động: không ghi đè trạng thái kết thúc do request khác ghi trước.
  await db.tryOnJob.updateMany({ where: { id: job.id, status: { in: ACTIVE } }, data });
  return db.tryOnJob.findUniqueOrThrow({ where: { id: job.id } });
}

export function failData(code: string): Patch {
  return { status: "FAILED", errorCode: code, countsTowardQuota: !SYSTEM_ERRORS.has(code), finishedAt: new Date(), queuePosition: null };
}

export function remotePatch(r: RemoteJob, job: TryOnJob): Patch {
  switch (r.status) {
    case "queued": return { status: "QUEUED", queuePosition: r.queue_position };
    case "processing": return { status: "PROCESSING", queuePosition: null, startedAt: job.startedAt ?? new Date() };
    case "completed": return { status: "COMPLETED", queuePosition: null, finishedAt: new Date(), resultReleased: !r.result_available };
    case "cancelled": return { status: "CANCELLED", queuePosition: null, errorCode: "CANCELLED", finishedAt: new Date() };
    default: return failData(r.error_code || "INFERENCE_ERROR");
  }
}

/** Hỏi CatVTON trạng thái mới nhất của một job đang hoạt động. Không bao giờ ném lỗi mạng ra ngoài. */
export async function refreshJob(job: TryOnJob): Promise<{ job: TryOnJob; reachable: boolean }> {
  if (!ACTIVE.includes(job.status)) return { job, reachable: true };
  const age = Date.now() - job.createdAt.getTime();
  if (!job.submittedAt) {
    // Request gửi job bị gián đoạn (ví dụ Render khởi động lại giữa chừng).
    if (age > 120_000) return { job: await patchActive(job, failData("SUBMIT_FAILED")), reachable: true };
    return { job, reachable: true };
  }
  try {
    const remote = await getJob(job.id);
    return { job: await patchActive(job, remotePatch(remote, job)), reachable: true };
  } catch (e) {
    if (e instanceof CatvtonError && e.kind === "not_found")
      return { job: await patchActive(job, failData("JOB_LOST")), reachable: true };
    if (e instanceof CatvtonError && e.kind === "auth") console.error("[try-on] CatVTON từ chối API key (kiểm tra CATVTON_API_KEY)");
    if (age > cfg.jobMaxAgeSec * 1000) return { job: await patchActive(job, failData("TIMEOUT")), reachable: false };
    return { job, reachable: false };
  }
}

export async function refreshUserActive(userId: number) {
  const list = await db.tryOnJob.findMany({ where: { userId, status: { in: ACTIVE } } });
  for (const j of list) await refreshJob(j);
}

// ------------------------------------------------------------------ dọn dẹp định kỳ
let sweeping = false;
export async function sweep() {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = Date.now();
    // 1) Job chưa kết thúc: hỏi lại CatVTON (kể cả khi người dùng đã rời trang), job quá hạn -> TIMEOUT
    const active = await db.tryOnJob.findMany({ where: { status: { in: ACTIVE } }, orderBy: { createdAt: "asc" }, take: 50 });
    for (const j of active) await refreshJob(j);
    await db.tryOnJob.updateMany({
      where: { status: { in: ACTIVE }, createdAt: { lt: new Date(now - cfg.jobMaxAgeSec * 1000) } },
      data: failData("TIMEOUT"),
    });
    // 2) Xóa metadata cũ (không có ảnh nào trong DB để xóa)
    await db.tryOnJob.deleteMany({ where: { createdAt: { lt: new Date(now - cfg.jobRetentionHours * 3600_000) } } });
  } catch (e) {
    console.error("[try-on] Dọn dẹp thất bại:", (e as Error).message);
  } finally {
    sweeping = false;
  }
}

export function startSweeper() {
  const t = setInterval(() => void sweep(), cfg.cleanupIntervalSec * 1000);
  t.unref();
  setTimeout(() => void sweep(), 3000).unref();
}

/** Hủy job (đang chờ) hoặc giải phóng ảnh kết quả trên CatVTON. */
export async function cancelOrRelease(job: TryOnJob): Promise<TryOnJob> {
  if (ACTIVE.includes(job.status)) {
    let outcome: string | null = null;
    if (job.submittedAt) {
      try { outcome = await deleteJob(job.id); } catch { outcome = "unreachable"; }
    }
    if (outcome === "cancel_requested") {
      // Đang chạy trên GPU: pipeline dừng ở bước kế tiếp; trạng thái cuối sẽ là cancelled.
      return job;
    }
    return patchActive(job, { status: "CANCELLED", errorCode: "CANCELLED", finishedAt: new Date(), queuePosition: null });
  }
  if (job.status === "COMPLETED" && !job.resultReleased) {
    try { await deleteJob(job.id); } catch { /* CatVTON tự xóa khi hết hạn */ }
    return db.tryOnJob.update({ where: { id: job.id }, data: { resultReleased: true } });
  }
  return job;
}
