// Cấu hình tính năng thử đồ AI. Mọi giá trị đọc từ biến môi trường, có mặc định an toàn.
// Không có URL, token hay secret nào được ghi cứng trong mã nguồn.

const int = (name: string, def: number, min: number, max: number) => {
  const raw = (process.env[name] ?? "").trim();
  const v = raw === "" ? def : Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${name} phải là số nguyên trong [${min}, ${max}]`);
  return v;
};
const list = (name: string) =>
  (process.env[name] ?? "").split(",").map(s => s.trim()).filter(Boolean);

export type GarmentType = "upper" | "lower" | "overall";
export const GARMENT_TYPES: readonly GarmentType[] = ["upper", "lower", "overall"];

function parseCategoryMap(raw: string): Record<string, GarmentType> {
  const map: Record<string, GarmentType> = {};
  for (const pair of raw.split(",").map(s => s.trim()).filter(Boolean)) {
    const [slug, type] = pair.split(":").map(s => s.trim());
    if (!slug || !GARMENT_TYPES.includes(type as GarmentType))
      throw new Error(`TRYON_CATEGORY_MAP không hợp lệ ở "${pair}" (dạng slug:upper|lower|overall)`);
    map[slug] = type as GarmentType;
  }
  return map;
}

function load() {
  const apiUrl = (process.env.CATVTON_API_URL ?? "").trim().replace(/\/+$/, "");
  if (apiUrl && !/^https?:\/\//.test(apiUrl)) throw new Error("CATVTON_API_URL phải bắt đầu bằng http:// hoặc https://");
  const windowMin = int("TRYON_RATE_LIMIT_WINDOW", 10, 1, 1440);
  return {
    /** Tắt hẳn tính năng nếu chưa cấu hình URL hoặc đặt TRYON_ENABLED=false */
    enabled: (process.env.TRYON_ENABLED ?? "true").trim().toLowerCase() !== "false" && apiUrl !== "",
    apiUrl,
    apiKey: (process.env.CATVTON_API_KEY ?? "").trim(),
    // Chỉ dùng khi chuyển sang Named Tunnel + Cloudflare Access (để trống khi dùng Quick Tunnel)
    accessClientId: (process.env.CATVTON_ACCESS_CLIENT_ID ?? "").trim(),
    accessClientSecret: (process.env.CATVTON_ACCESS_CLIENT_SECRET ?? "").trim(),
    /** Timeout cho MỖI lần gọi HTTP tới CatVTON (ms). Inference chạy bất đồng bộ nên không cần chờ cả 180 giây. */
    requestTimeoutMs: int("CATVTON_API_TIMEOUT", 30000, 1000, 600000),
    userMaxActiveJobs: int("TRYON_USER_MAX_ACTIVE_JOBS", 1, 1, 10),
    rateWindowMs: windowMin * 60_000,
    rateMax: int("TRYON_RATE_LIMIT_MAX", 3, 1, 1000),
    dailyLimit: int("TRYON_DAILY_LIMIT", 10, 1, 10000),
    maxJobTimeoutSec: int("MAX_JOB_TIMEOUT", 180, 10, 3600),
    resultTtlSec: int("TRYON_RESULT_TTL", 3600, 30, 86400),
    uploadMaxSize: int("TRYON_UPLOAD_MAX_SIZE", 10 * 1024 * 1024, 1024, 50 * 1024 * 1024),
    /** Tuổi tối đa (giây) của một job chưa kết thúc trước khi bị đánh dấu TIMEOUT (gồm cả thời gian chờ hàng đợi) */
    jobMaxAgeSec: int("TRYON_JOB_MAX_AGE", 1200, 60, 86400),
    /** Giữ metadata job bao lâu (giờ). Phải >= 24 để giới hạn theo ngày hoạt động đúng. */
    jobRetentionHours: int("TRYON_JOB_RETENTION_HOURS", 48, 24, 24 * 365),
    cleanupIntervalSec: int("TRYON_CLEANUP_INTERVAL", 60, 10, 3600),
    /** Giới hạn số request API thử đồ (kể cả polling) mỗi phút cho một tài khoản */
    requestsPerMinute: int("TRYON_REQUESTS_PER_MINUTE", 60, 10, 10000),
    categoryMap: parseCategoryMap(process.env.TRYON_CATEGORY_MAP ?? "ao:upper,khoac:upper,quan:lower,vay:overall"),
    /** Host ngoài được phép tải ảnh sản phẩm (ảnh trong DB dạng https://...). Để trống = không tải ảnh ngoài. */
    garmentAllowedHosts: list("TRYON_GARMENT_ALLOWED_HOSTS").map(h => h.toLowerCase()),
    /** URL công khai của chính backend (để nhận ra ảnh /api/uploads/:id được lưu dưới dạng URL tuyệt đối) */
    publicApiBaseUrl: (process.env.PUBLIC_API_BASE_URL ?? "").trim().replace(/\/+$/, ""),
  };
}

export type TryOnConfig = ReturnType<typeof load>;
export const cfg: TryOnConfig = load();
