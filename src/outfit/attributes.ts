import type { ColorInfo, Occasion, ProductInput, Profile, Role, Season, Style } from "./types.js";

export const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();

const has = (text: string, re: RegExp) => re.test(text);

/* ---------- Loại sản phẩm ---------- */
const CATEGORY_ROLE: Record<string, Role> = { ao: "top", quan: "bottom", vay: "dress", khoac: "outer", pk: "accessory" };
const RE_FOOTWEAR = /\b(giay|sneaker|boot|boots|sandal|dep|loafer|shoe|shoes|giay the thao|mary jane)\b/;
const RE_BAG = /\b(tui|balo|backpack|bag|clutch|tote|vi cam tay)\b/;
const RE_OUTER = /\b(ao khoac|khoac|jacket|blazer|cardigan|bomber|coat|windbreaker|ao gio)\b/;
const RE_BOTTOM = /\b(quan|short|shorts|jean|jeans|jogger|kaki|chino|trouser|pants|chan vay|skirt|legging)\b/;
const RE_DRESS = /\b(dam|dress|jumpsuit|vay lien|vay)\b/;
const RE_TOP = /\b(ao|shirt|tee|polo|hoodie|sweater|top|tank|blouse)\b/;

export function inferRole(p: ProductInput): { role: Role | null; confidence: number } {
  const name = fold(p.name);
  const cat = fold(p.categoryName);
  const known = CATEGORY_ROLE[p.categorySlug];
  if (known === "accessory") {
    if (has(name, RE_FOOTWEAR)) return { role: "footwear", confidence: 0.9 };
    if (has(name, RE_BAG)) return { role: "bag", confidence: 0.9 };
    return { role: "accessory", confidence: 0.9 };
  }
  if (known === "dress") {
    if (/\b(chan vay|skirt)\b/.test(name)) return { role: "bottom", confidence: 0.9 };
    return { role: "dress", confidence: 0.85 };
  }
  if (known) return { role: known, confidence: 0.95 };

  // Danh mục do quản trị viên tự tạo: suy theo tên danh mục rồi tên sản phẩm.
  for (const text of [cat, name]) {
    const conf = text === cat ? 0.75 : 0.65;
    if (has(text, RE_FOOTWEAR)) return { role: "footwear", confidence: conf };
    if (has(text, RE_BAG)) return { role: "bag", confidence: conf };
    if (has(text, RE_OUTER)) return { role: "outer", confidence: conf };
    if (/\b(chan vay|skirt)\b/.test(text)) return { role: "bottom", confidence: conf };
    if (has(text, RE_DRESS)) return { role: "dress", confidence: conf };
    if (has(text, RE_BOTTOM)) return { role: "bottom", confidence: conf };
    if (has(text, RE_TOP)) return { role: "top", confidence: conf };
  }
  if (p.tryOnType === "upper") return { role: "top", confidence: 0.55 };
  if (p.tryOnType === "lower") return { role: "bottom", confidence: 0.55 };
  if (p.tryOnType === "overall") return { role: "dress", confidence: 0.55 };
  return { role: null, confidence: 0 };
}

/* ---------- Phong cách ---------- */
// [regex, trọng số phong cách, độ tin cậy của bằng chứng]
// 0.9 = từ khóa nêu thẳng phong cách; 0.55 = suy ra từ loại trang phục (chỉ là gợi ý).
type StyleRule = [RegExp, Partial<Record<Style, number>>, number];
const STYLE_RULES: StyleRule[] = [
  [/\b(streetwear|street|hiphop|hip hop|oversize|oversized|graphic|cargo|baggy|techwear|varsity)\b/, { streetwear: 1 }, 0.9],
  [/\b(minimal|minimalist|toi gian|don gian|essential)\b/, { minimalist: 1 }, 0.9],
  [/\b(casual|hang ngay|daily)\b/, { casual: 1 }, 0.9],
  [/\b(vintage|retro|co dien|classic)\b/, { vintage: 1 }, 0.9],
  [/\b(han quoc|korean|ulzzang|hanquoc)\b/, { korean: 1 }, 0.9],
  [/\b(sport|sporty|the thao|gym|training|running|track)\b/, { sporty: 1 }, 0.9],
  [/\b(formal|cong so|suit|vest|quan tay)\b/, { formal: 1 }, 0.9],
  [/\b(elegant|thanh lich|sang trong|du tiec)\b/, { elegant: 1 }, 0.9],
  [/\b(y2k|baby tee|low rise|bling|metallic)\b/, { y2k: 1 }, 0.9],
  [/\b(old money|quiet luxury)\b/, { old_money: 1 }, 0.9],
  // Gợi ý theo loại trang phục
  [/\b(hoodie|bomber|jogger|ao khoac gio)\b/, { streetwear: 0.8, sporty: 0.6, casual: 0.6 }, 0.55],
  [/\b(thun|tee|t-shirt|basic)\b/, { casual: 0.8, minimalist: 0.7, streetwear: 0.6 }, 0.55],
  [/\b(polo)\b/, { casual: 0.7, old_money: 0.8, sporty: 0.5 }, 0.55],
  [/\b(so mi|shirt)\b/, { minimalist: 0.7, formal: 0.7, korean: 0.6, elegant: 0.5, old_money: 0.6 }, 0.55],
  [/\b(jean|jeans|denim)\b/, { casual: 0.9, streetwear: 0.7, vintage: 0.6, y2k: 0.5 }, 0.55],
  [/\b(kaki|chino)\b/, { casual: 0.7, old_money: 0.8, minimalist: 0.7, korean: 0.6, formal: 0.4 }, 0.55],
  [/\b(short|shorts)\b/, { casual: 0.8, sporty: 0.6, streetwear: 0.5 }, 0.55],
  [/\b(blazer)\b/, { formal: 0.9, elegant: 0.8, old_money: 0.8, korean: 0.6 }, 0.55],
  [/\b(len|knit|cashmere|cardigan|cable)\b/, { old_money: 0.8, vintage: 0.6, korean: 0.7, minimalist: 0.6 }, 0.55],
  [/\b(linen|lanh)\b/, { minimalist: 0.7, old_money: 0.7, casual: 0.6 }, 0.55],
  [/\b(xep ly|midi|chu a|a-line|crop|cropped)\b/, { korean: 0.9, elegant: 0.6, y2k: 0.5 }, 0.55],
  [/\b(lua|silk|satin|ren|lace|maxi|vay dai)\b/, { elegant: 0.9, old_money: 0.5, vintage: 0.5 }, 0.55],
  [/\b(flare|ong loe|mini)\b/, { y2k: 0.9, vintage: 0.5 }, 0.55],
  [/\b(canvas|mu luoi trai|cap)\b/, { casual: 0.8, streetwear: 0.7, sporty: 0.6 }, 0.55],
  [/\b(that lung|belt|da)\b/, { formal: 0.6, old_money: 0.7, vintage: 0.5, minimalist: 0.5 }, 0.5],
  [/\b(khan lua|scarf)\b/, { elegant: 0.8, vintage: 0.8, old_money: 0.8 }, 0.55],
  [/\b(ni|sweat|sweatpants)\b/, { casual: 0.7, streetwear: 0.7, sporty: 0.6 }, 0.55],
];

export function inferStyles(text: string): { styles: Partial<Record<Style, number>>; confidence: number } {
  const styles: Partial<Record<Style, number>> = {};
  let confidence = 0;
  for (const [re, weights, conf] of STYLE_RULES) {
    if (!re.test(text)) continue;
    confidence = Math.max(confidence, conf);
    for (const [k, w] of Object.entries(weights) as [Style, number][]) styles[k] = Math.max(styles[k] ?? 0, w);
  }
  return { styles, confidence };
}

/* ---------- Màu sắc ---------- */
type ColorRule = [RegExp, ColorInfo];
const mk = (name: string, kind: ColorInfo["kind"], hue: number, light: number): ColorInfo => ({ name, kind, hue, light });
const COLOR_RULES: ColorRule[] = [
  [/\b(xanh navy|navy|xanh den|xanh than|xanh tim than)\b/, mk("Navy", "neutral", 220, 0.2)],
  [/\b(xanh jean|jean|denim)\b/, mk("Xanh jean", "neutral", 215, 0.4)],
  [/\b(xanh la|xanh luc|green)\b/, mk("Xanh lá", "chromatic", 125, 0.4)],
  [/\b(xanh reu|olive|xanh ranh ri|ranh ri)\b/, mk("Olive", "chromatic", 75, 0.35)],
  [/\b(xanh ngoc|teal|mint|xanh bac ha)\b/, mk("Xanh ngọc", "chromatic", 175, 0.5)],
  [/\b(xanh duong|xanh da troi|xanh coban|blue|xanh)\b/, mk("Xanh dương", "chromatic", 215, 0.5)],
  [/\b(do do|burgundy|ruou vang|wine)\b/, mk("Đỏ đô", "chromatic", 350, 0.25)],
  [/\b(do|red)\b/, mk("Đỏ", "chromatic", 0, 0.45)],
  [/\b(cam|orange)\b/, mk("Cam", "chromatic", 25, 0.55)],
  [/\b(vang|yellow)\b/, mk("Vàng", "chromatic", 50, 0.6)],
  [/\b(tim|purple|violet|lavender)\b/, mk("Tím", "chromatic", 275, 0.45)],
  [/\b(hong|pink)\b/, mk("Hồng", "chromatic", 335, 0.7)],
  [/\b(be|kem|cream|beige|ivory|tan)\b/, mk("Be", "neutral", 40, 0.8)],
  [/\b(nau|brown|camel|ca phe|coffee)\b/, mk("Nâu", "neutral", 30, 0.3)],
  [/\b(kaki|khaki)\b/, mk("Kaki", "neutral", 45, 0.55)],
  [/\b(den|black)\b/, mk("Đen", "neutral", 0, 0.05)],
  [/\b(trang|white)\b/, mk("Trắng", "neutral", 0, 0.97)],
  [/\b(xam|ghi|grey|gray|bac|silver)\b/, mk("Xám", "neutral", 0, 0.5)],
];

export function parseColor(raw: string): ColorInfo | null {
  const t = fold(raw);
  for (const [re, info] of COLOR_RULES) if (re.test(t)) return info;
  return null;
}

/* ---------- Mùa & dịp ---------- */
export function inferSeason(text: string, role: Role | null): Season | null {
  const hot = /\b(linen|lanh|voan|thoang|mong|sat nach|short|shorts|mini|hai day|tank|ngan tay)\b/.test(text);
  const cool = /\b(len|wool|ni|sweater|sweat|hoodie|cardigan|da|khoac|bomber|coat)\b/.test(text) || role === "outer";
  if (hot && cool) return "all";
  if (hot) return "hot";
  if (cool) return "cool";
  return null;
}

export function inferOccasions(text: string): Occasion[] {
  const out: Occasion[] = [];
  if (/\b(so mi|blazer|quan tay|vest|cong so|suit|thanh lich|kaki|chino|formal)\b/.test(text)) out.push("work", "formal");
  if (/\b(du tiec|lua|satin|ren|sequin|bling|sang trong|elegant)\b/.test(text)) out.push("party");
  if (/\b(the thao|gym|jogger|running|track|legging|ao khoac gio|sport|sporty)\b/.test(text)) out.push("sport");
  if (/\b(thun|tee|polo|jean|jeans|denim|basic|canvas|tote|short|shorts|hoodie|casual|ni|oversize)\b/.test(text)) out.push("daily");
  return [...new Set(out)];
}

/* ---------- Hồ sơ sản phẩm ---------- */
const effectivePrice = (p: ProductInput) => (p.salePrice && p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price);

export function buildProfile(p: ProductInput): Profile {
  const text = fold(`${p.name} ${p.categoryName} ${p.material ?? ""} ${p.description ?? ""}`);
  const nameText = fold(`${p.name} ${p.material ?? ""}`);
  const { role, confidence: roleConfidence } = inferRole(p);

  const tags = new Set<string>();
  if (/\b(short|shorts)\b/.test(nameText)) tags.add("shorts");
  if (/\b(jogger|ni|sweatpants|legging)\b/.test(nameText)) tags.add("sweatpants");
  if (/\b(hoodie|sweater|sweat)\b/.test(nameText)) tags.add("hoodie");
  if (/\b(blazer|vest|suit|quan tay|cong so)\b/.test(nameText)) tags.add("tailored");
  if (/\b(ao khoac gio|windbreaker|track)\b/.test(nameText)) tags.add("technical");

  // Phong cách: ưu tiên tên + chất liệu; mô tả chỉ bổ sung (mô tả hay chứa từ chung chung).
  const fromName = inferStyles(nameText);
  const fromDesc = inferStyles(text);
  const styles = Object.keys(fromName.styles).length ? fromName.styles : fromDesc.styles;
  const styleConfidence = Object.keys(fromName.styles).length ? fromName.confidence : fromDesc.confidence * 0.8;

  // Màu: ưu tiên biến thể còn hàng; nếu không có thì suy từ tên (độ tin cậy thấp hơn).
  const inStockColors = p.variants.filter(v => v.stock > 0).map(v => v.color);
  const seen = new Map<string, ColorInfo>();
  for (const c of inStockColors) {
    const info = parseColor(c);
    if (info && !seen.has(info.name)) seen.set(info.name, info);
  }
  let colorConfidence = seen.size ? 0.95 : 0;
  if (!seen.size) {
    const info = parseColor(nameText);
    if (info) { seen.set(info.name, info); colorConfidence = 0.5; }
  }

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    role,
    roleConfidence,
    styles,
    styleConfidence,
    colors: [...seen.values()].slice(0, 3),
    colorConfidence,
    occasions: inferOccasions(text),
    season: inferSeason(nameText, role),
    tags,
    price: effectivePrice(p),
    originalPrice: p.price,
    soldCount: p.soldCount,
    image: p.images[0] ?? null,
    inStock: p.variants.some(v => v.stock > 0),
  };
}
