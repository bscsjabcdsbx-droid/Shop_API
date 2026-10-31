import type { ColorInfo, Profile, Role, Style } from "./types.js";

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Nhóm các sắc độ cách nhau <= 30° thành một nhóm màu nổi. */
function hueGroups(colors: ColorInfo[]): number[] {
  const groups: number[] = [];
  for (const c of colors) if (!groups.some(g => hueDistance(g, c.hue) <= 30)) groups.push(c.hue);
  return groups;
}

/** Đánh giá hài hòa của TOÀN BỘ bảng màu của bộ trang phục (không chỉ từng cặp). */
export function paletteHarmony(colors: ColorInfo[]): number {
  const chromatic = colors.filter(c => c.kind === "chromatic");
  const neutrals = colors.filter(c => c.kind === "neutral");
  const groups = hueGroups(chromatic);

  if (groups.length === 0) {
    // Toàn màu trung tính: đẹp nhất khi có cả tối và sáng.
    const lights = neutrals.map(c => c.light);
    const contrast = Math.max(...lights) - Math.min(...lights);
    const distinct = new Set(neutrals.map(c => c.name)).size;
    let s = distinct === 1 ? 0.8 : 0.86;
    if (contrast >= 0.4) s += 0.07;
    // Nâu đi cùng đen là cặp dễ lệch tông.
    const names = new Set(neutrals.map(c => c.name));
    if (names.has("Nâu") && names.has("Đen")) s -= 0.12;
    return Math.max(0, Math.min(1, s));
  }
  if (groups.length === 1) return neutrals.length ? 0.93 : 0.85;
  if (groups.length === 2) {
    const d = hueDistance(groups[0]!, groups[1]!);
    let s = d <= 60 ? 0.84 : d >= 150 ? 0.76 : 0.58;
    if (neutrals.length) s += 0.06;
    return Math.min(1, s);
  }
  return Math.max(0.1, 0.4 - 0.1 * (groups.length - 3));
}

/** Chọn màu cho từng sản phẩm sao cho bảng màu cả bộ hài hòa nhất. */
export function bestPalette(items: Profile[]): { score: number | null; picks: Map<number, ColorInfo | null> } {
  const picks = new Map<number, ColorInfo | null>();
  const withColor = items.filter(i => i.colors.length > 0);
  for (const i of items) if (!i.colors.length) picks.set(i.id, null);
  if (withColor.length < 2) {
    for (const i of withColor) picks.set(i.id, i.colors[0]!);
    return { score: null, picks };
  }
  let best = -1;
  let bestPick: ColorInfo[] = [];
  const cur: ColorInfo[] = [];
  const walk = (idx: number) => {
    if (idx === withColor.length) {
      const s = paletteHarmony(cur);
      if (s > best) { best = s; bestPick = [...cur]; }
      return;
    }
    for (const c of withColor[idx]!.colors) { cur.push(c); walk(idx + 1); cur.pop(); }
  };
  walk(0);
  withColor.forEach((i, k) => picks.set(i.id, bestPick[k]!));
  return { score: best, picks };
}

const FORMAL_STYLES: Style[] = ["formal", "elegant", "old_money"];

/** Tương thích loại trang phục & cấu trúc của cả bộ. Luôn tính được (không phụ thuộc dữ liệu thiếu). */
export function categoryCompatibility(items: Profile[], style: Style): number {
  const roles = new Set<Role>(items.map(i => i.role!));
  let s = 0.7;
  const coreComplete = roles.has("dress") || (roles.has("top") && roles.has("bottom"));
  if (coreComplete) s += 0.15;
  else s -= 0.1;
  if (roles.has("outer") && (roles.has("top") || roles.has("dress"))) s += 0.05;
  if (roles.has("footwear")) s += 0.05;
  if (roles.has("bag") || roles.has("accessory")) s += 0.05;

  const tags = new Set<string>();
  items.forEach(i => i.tags.forEach(t => tags.add(t)));
  if (FORMAL_STYLES.includes(style)) {
    if (tags.has("shorts")) s -= 0.25;
    if (tags.has("sweatpants")) s -= 0.25;
    if (tags.has("hoodie")) s -= 0.2;
    if (tags.has("technical")) s -= 0.15;
  }
  if (style === "sporty" && tags.has("tailored")) s -= 0.2;
  // Đồ vest/blazer đi với đồ thể thao ngay trong một bộ là lệch phong cách.
  if (tags.has("tailored") && (tags.has("sweatpants") || tags.has("technical"))) s -= 0.2;
  return Math.max(0, Math.min(1, s));
}
