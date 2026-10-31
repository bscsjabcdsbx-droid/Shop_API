import { bestPalette, categoryCompatibility } from "./compatibility.js";
import { WEIGHTS, type Factor, type FactorResult, type Occasion, type OutfitScore, type Profile, type Style } from "./types.js";

const TARGET_OCCASIONS: Record<Style, Occasion[]> = {
  streetwear: ["daily"],
  minimalist: ["daily", "work"],
  casual: ["daily"],
  vintage: ["daily", "party"],
  korean: ["daily", "work"],
  sporty: ["sport", "daily"],
  formal: ["formal", "work"],
  elegant: ["party", "formal", "work"],
  y2k: ["daily", "party"],
  old_money: ["formal", "work", "daily"],
};

const UNKNOWN: FactorResult = { score: null, confidence: 0 };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Điểm phong cách của một sản phẩm so với phong cách người dùng chọn. null = không có dữ liệu. */
export function itemStyleFit(p: Profile, style: Style): number | null {
  if (!p.styleConfidence || Object.keys(p.styles).length === 0) return null;
  return p.styles[style] ?? 0.15;
}

function styleFactor(items: Profile[], style: Style): FactorResult {
  const known = items.map(i => ({ s: itemStyleFit(i, style), c: i.styleConfidence })).filter(x => x.s !== null);
  if (known.length === 0) return UNKNOWN;
  const wsum = known.reduce((a, x) => a + x.c, 0);
  const score = known.reduce((a, x) => a + x.s! * x.c, 0) / wsum;
  // Thiếu phong cách ở một số món thì độ tin cậy giảm theo tỷ lệ món có dữ liệu.
  return { score, confidence: mean(known.map(x => x.c)) * (known.length / items.length) };
}

function occasionFactor(items: Profile[], style: Style): FactorResult {
  const known = items.filter(i => i.occasions.length > 0);
  if (known.length < 2) return UNKNOWN;
  const target = TARGET_OCCASIONS[style];
  let score = mean(known.map(i => (i.occasions.some(o => target.includes(o)) ? 1 : 0.2)));
  const all = new Set(known.flatMap(i => i.occasions));
  const sportOnly = known.some(i => i.occasions.length === 1 && i.occasions[0] === "sport");
  const formalOnly = known.some(i => i.occasions.every(o => o === "formal" || o === "work"));
  if (all.has("sport") && all.has("formal") && sportOnly && formalOnly) score *= 0.5;
  return { score, confidence: 0.6 * (known.length / items.length) };
}

function seasonFactor(items: Profile[]): FactorResult {
  const known = items.filter(i => i.season !== null);
  if (known.length < 2) return UNKNOWN;
  const hot = known.some(i => i.season === "hot");
  const cool = known.some(i => i.season === "cool");
  const score = hot && cool ? 0.3 : 1;
  return { score, confidence: 0.55 * (known.length / items.length) };
}

/** Độ phổ biến trong cửa hàng (soldCount) — thay cho "sở thích" vì DB không lưu sở thích từng người. */
function preferenceFactor(items: Profile[], maxSold: number): FactorResult {
  if (maxSold <= 0) return UNKNOWN;
  const score = mean(items.map(i => Math.log1p(i.soldCount) / Math.log1p(maxSold)));
  return { score, confidence: 0.6 };
}

export interface ScoreContext { style: Style; maxSold: number }

/** Chấm điểm cả bộ. Thành phần không có dữ liệu bị loại và trọng số được chuẩn hóa lại. */
export function scoreOutfit(items: Profile[], ctx: ScoreContext): OutfitScore {
  const palette = bestPalette(items);
  const colorKnown = palette.score !== null;
  const factors: Record<Factor, FactorResult> = {
    style: styleFactor(items, ctx.style),
    color: colorKnown ? { score: palette.score, confidence: mean(items.filter(i => i.colors.length).map(i => i.colorConfidence)) } : UNKNOWN,
    category: { score: categoryCompatibility(items, ctx.style), confidence: mean(items.map(i => i.roleConfidence)) },
    occasion: occasionFactor(items, ctx.style),
    season: seasonFactor(items),
    preference: preferenceFactor(items, ctx.maxSold),
  };

  let used = 0;
  let acc = 0;
  let confAcc = 0;
  for (const f of Object.keys(WEIGHTS) as Factor[]) {
    const r = factors[f];
    if (r.score === null) continue;
    used += WEIGHTS[f];
    acc += WEIGHTS[f] * r.score;
    confAcc += WEIGHTS[f] * r.confidence;
  }
  if (used === 0) return { score: 0, confidence: 0, knownWeight: 0, factors, colors: palette.picks };
  return { score: acc / used, confidence: confAcc, knownWeight: used, factors, colors: palette.picks };
}

export const confidenceLevel = (c: number): "high" | "medium" | "low" => (c >= 0.6 ? "high" : c >= 0.4 ? "medium" : "low");

/** Quy tắc loại bỏ: không đủ dữ liệu để kết luận thì không đề xuất. */
export function isReliable(s: OutfitScore): boolean {
  const styleOrColor = s.factors.style.score !== null || s.factors.color.score !== null;
  return styleOrColor && s.knownWeight >= 0.5;
}
