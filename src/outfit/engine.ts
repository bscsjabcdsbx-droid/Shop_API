import { buildProfile } from "./attributes.js";
import { confidenceLevel, isReliable, itemStyleFit, scoreOutfit } from "./scoring.js";
import type { OutfitScore, ProductInput, Profile, Role, Style } from "./types.js";

export const LIMITS = { perSlot: 6, beam: 20, results: 6, maxReuse: 2, minScore: 0.45, poolPerCategory: 60 } as const;

const OPTIONAL_ALL: Role[] = ["outer", "footwear", "bag", "accessory"];

/** Các "kế hoạch" ghép đồ theo loại sản phẩm gốc: slot bắt buộc + slot tùy chọn. */
export function plansFor(base: Role): { required: Role[]; optional: Role[] }[] {
  const optional = OPTIONAL_ALL.filter(r => r !== base);
  switch (base) {
    case "top": return [{ required: ["bottom"], optional }];
    case "bottom": return [{ required: ["top"], optional }];
    case "dress": return [{ required: [], optional }];
    default: return [{ required: ["top", "bottom"], optional }, { required: ["dress"], optional }];
  }
}

export interface Outfit {
  items: Profile[]; // không gồm sản phẩm gốc
  total: number; // gồm sản phẩm gốc
  score: OutfitScore;
  complete: boolean;
  missing: Role[];
}

export interface EngineInput {
  base: ProductInput;
  pool: ProductInput[]; // ứng viên đã lọc: đang bán + còn hàng, không gồm sản phẩm gốc
  style: Style;
  budget?: number;
}

export interface EngineOutput {
  baseProfile: Profile;
  outfits: Outfit[];
  candidateCount: number;
  notes: string[];
}

export function recommend({ base, pool, style, budget }: EngineInput): EngineOutput {
  const baseProfile = buildProfile(base);
  const notes: string[] = [];
  if (!baseProfile.role) return { baseProfile, outfits: [], candidateCount: 0, notes: ["ROLE_UNKNOWN"] };

  const profiles = pool.map(buildProfile).filter(p => p.role && p.inStock && p.id !== base.id);
  const maxSold = Math.max(0, baseProfile.soldCount, ...profiles.map(p => p.soldCount));
  const ctx = { style, maxSold };

  const byRole = new Map<Role, Profile[]>();
  for (const p of profiles) {
    const list = byRole.get(p.role!) ?? [];
    list.push(p);
    byRole.set(p.role!, list);
  }
  // Mỗi slot chỉ giữ vài ứng viên khớp phong cách nhất → số tổ hợp luôn bị chặn.
  const topCandidates = (role: Role): Profile[] =>
    [...(byRole.get(role) ?? [])]
      .sort((a, b) => (itemStyleFit(b, style) ?? 0.3) - (itemStyleFit(a, style) ?? 0.3) || b.soldCount - a.soldCount || a.id - b.id)
      .slice(0, LIMITS.perSlot);

  const all = new Map<string, Outfit>();
  for (const plan of plansFor(baseProfile.role)) {
    const slots = [...plan.required, ...plan.optional];
    const missingRequired = plan.required.filter(r => !(byRole.get(r)?.length));
    let beam: Profile[][] = [[]];
    for (const slot of slots) {
      const cands = topCandidates(slot);
      if (!cands.length) continue;
      const optional = !plan.required.includes(slot);
      const next: { items: Profile[]; s: number }[] = [];
      for (const partial of beam) {
        const options: (Profile | null)[] = optional ? [null, ...cands] : cands;
        for (const c of options) {
          const items = c ? [...partial, c] : partial;
          const total = baseProfile.price + items.reduce((a, i) => a + i.price, 0);
          if (budget !== undefined && total > budget) continue; // thêm món chỉ làm giá tăng → cắt nhánh
          next.push({ items, s: scoreOutfit([baseProfile, ...items], ctx).score });
        }
      }
      next.sort((a, b) => b.s - a.s);
      beam = next.slice(0, LIMITS.beam).map(n => n.items);
      if (!beam.length) break;
    }
    for (const items of beam) {
      if (!items.length) continue;
      const roles = new Set<Role>([baseProfile.role, ...items.map(i => i.role!)]);
      const complete = roles.has("dress") || (roles.has("top") && roles.has("bottom"));
      const score = scoreOutfit([baseProfile, ...items], ctx);
      if (!isReliable(score) || score.score < LIMITS.minScore) continue;
      const key = items.map(i => i.id).sort((a, b) => a - b).join("-");
      const missing = [...new Set([...missingRequired, ...(complete ? [] : plan.required.filter(r => !roles.has(r)))])];
      const prev = all.get(key);
      if (!prev || prev.score.score < score.score) {
        all.set(key, { items, total: baseProfile.price + items.reduce((a, i) => a + i.price, 0), score, complete, missing });
      }
    }
  }

  // Xếp hạng: bộ đầy đủ trước, rồi theo điểm; giữ đa dạng (mỗi món xuất hiện tối đa maxReuse lần).
  const ranked = [...all.values()].sort((a, b) => Number(b.complete) - Number(a.complete) || b.score.score - a.score.score || a.total - b.total);
  const used = new Map<number, number>();
  const outfits: Outfit[] = [];
  for (const o of ranked) {
    if (o.items.some(i => (used.get(i.id) ?? 0) >= LIMITS.maxReuse)) continue;
    o.items.forEach(i => used.set(i.id, (used.get(i.id) ?? 0) + 1));
    outfits.push(o);
    if (outfits.length >= LIMITS.results) break;
  }

  if (!byRole.get("footwear")?.length) notes.push("NO_FOOTWEAR_IN_CATALOG");
  if (outfits.some(o => !o.complete)) notes.push("INCOMPLETE_OUTFIT");
  if (!outfits.length && budget !== undefined) notes.push("NOTHING_WITHIN_BUDGET_OR_LOW_CONFIDENCE");
  return { baseProfile, outfits, candidateCount: profiles.length, notes };
}

export { confidenceLevel };
