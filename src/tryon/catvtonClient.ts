// Client gọi CatVTON API (máy cá nhân, qua Cloudflare Tunnel). Chỉ backend dùng; frontend không bao giờ thấy URL/khóa.
import { cfg } from "./config.js";

export type CatvtonErrorKind =
  | "disabled" | "offline" | "timeout" | "auth" | "queue_full" | "not_ready"
  | "bad_request" | "not_found" | "result_not_ready" | "expired" | "server";

export class CatvtonError extends Error {
  constructor(public kind: CatvtonErrorKind, public code: string, public retryAfter?: number) {
    super(`CatVTON ${kind}: ${code}`);
  }
}

export interface RemoteJob {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  queue_position: number | null;
  error_code: string | null;
  result_available: boolean;
  result_released?: boolean;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "X-API-Key": cfg.apiKey };
  // Chỉ gửi khi đã cấu hình Cloudflare Access (Named Tunnel). Quick Tunnel không dùng.
  if (cfg.accessClientId && cfg.accessClientSecret) {
    h["CF-Access-Client-Id"] = cfg.accessClientId;
    h["CF-Access-Client-Secret"] = cfg.accessClientSecret;
  }
  return h;
}

async function call(method: string, path: string, body?: FormData, timeoutMs = cfg.requestTimeoutMs): Promise<Response> {
  if (!cfg.enabled) throw new CatvtonError("disabled", "TRYON_DISABLED");
  try {
    return await fetch(cfg.apiUrl + path, {
      method, body, headers: headers(), redirect: "error", signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new CatvtonError("timeout", "CATVTON_TIMEOUT");
    // DNS lỗi, mất mạng, Tunnel không tồn tại...
    throw new CatvtonError("offline", "CATVTON_UNREACHABLE");
  }
}

async function errorFrom(res: Response): Promise<CatvtonError> {
  let code = "";
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (isJson) {
    try { code = String(((await res.json()) as { error_code?: string }).error_code ?? ""); } catch { /* bỏ qua */ }
  } else {
    await res.body?.cancel().catch(() => undefined);
  }
  const ra = Number(res.headers.get("retry-after"));
  const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined;
  if (res.status === 401 || res.status === 403) return new CatvtonError("auth", code || "CATVTON_AUTH");
  if (res.status === 429) return new CatvtonError("queue_full", code || "QUEUE_FULL", retryAfter);
  if (res.status === 404 && isJson) return new CatvtonError("not_found", code || "JOB_NOT_FOUND");
  if (res.status === 409) return new CatvtonError("result_not_ready", code || "RESULT_NOT_READY");
  if (res.status === 410) return new CatvtonError("expired", code || "RESULT_EXPIRED");
  if (res.status === 400 || res.status === 413) return new CatvtonError("bad_request", code || "BAD_REQUEST");
  if (res.status === 503 && code === "MODEL_NOT_READY") return new CatvtonError("not_ready", code, retryAfter);
  // 502/503/504/530... không phải JSON của CatVTON: thường là Tunnel/máy local không hoạt động.
  if (!isJson || res.status >= 502) return new CatvtonError("offline", code || `HTTP_${res.status}`);
  return new CatvtonError("server", code || `HTTP_${res.status}`);
}

export async function submitJob(input: {
  jobId: string; person: Buffer; personMime: string; garment: Buffer; garmentMime: string; garmentType: string;
}): Promise<RemoteJob> {
  const form = new FormData();
  form.append("job_id", input.jobId);
  form.append("cloth_type", input.garmentType);
  form.append("person_image", new Blob([new Uint8Array(input.person)], { type: input.personMime }), "person");
  form.append("cloth_image", new Blob([new Uint8Array(input.garment)], { type: input.garmentMime }), "garment");
  const res = await call("POST", "/try-on", form);
  if (res.status !== 202 && res.status !== 200) throw await errorFrom(res);
  return (await res.json()) as RemoteJob;
}

export async function getJob(jobId: string): Promise<RemoteJob> {
  const res = await call("GET", `/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as RemoteJob;
}

/** Trả về Response gốc để stream bytes ảnh thẳng tới trình duyệt (không ghi đĩa, không ghi DB). */
export async function getResult(jobId: string): Promise<Response> {
  const res = await call("GET", `/jobs/${encodeURIComponent(jobId)}/result`);
  if (!res.ok) throw await errorFrom(res);
  return res;
}

export async function deleteJob(jobId: string): Promise<string | null> {
  const res = await call("DELETE", `/jobs/${encodeURIComponent(jobId)}`, undefined, 10000);
  if (res.status === 404) { await res.body?.cancel().catch(() => undefined); return null; }
  if (!res.ok) throw await errorFrom(res);
  return String(((await res.json()) as { outcome?: string }).outcome ?? "");
}

let healthCache: { at: number; online: boolean; ready: boolean } | null = null;
/** Kiểm tra nhanh máy AI còn hoạt động không (cache 15 giây). Không trả thông tin GPU ra ngoài. */
export async function serviceStatus(): Promise<{ online: boolean; ready: boolean }> {
  if (!cfg.enabled) return { online: false, ready: false };
  if (healthCache && Date.now() - healthCache.at < 15000) return healthCache;
  let online = false, ready = false;
  try {
    const res = await call("GET", "/health", undefined, 8000);
    if (res.ok) {
      const h = (await res.json()) as { status?: string };
      online = true;
      ready = h.status === "ok" || h.status === "degraded";
    } else {
      await res.body?.cancel().catch(() => undefined);
    }
  } catch { /* offline */ }
  healthCache = { at: Date.now(), online, ready };
  return healthCache;
}
