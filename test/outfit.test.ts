// Chạy: npx tsx --test test/outfit.test.ts   (dữ liệu giả trong bộ nhớ, KHÔNG kết nối database)
import assert from "node:assert/strict";
import { test } from "node:test";
import { paletteHarmony } from "../src/outfit/compatibility.js";
import { buildProfile, parseColor } from "../src/outfit/attributes.js";
import { LIMITS, recommend } from "../src/outfit/engine.js";
import { scoreOutfit } from "../src/outfit/scoring.js";
import type { ProductInput } from "../src/outfit/types.js";

let nextId = 1;
const mkP = (name: string, categorySlug: string, price: number, colors = ["Đen", "Trắng"], o: Partial<ProductInput> = {}): ProductInput => ({
  id: nextId++, name, slug: `p-${nextId}`, description: "", material: null, price, salePrice: null, soldCount: 5, tryOnType: null,
  categorySlug, categoryName: { ao: "Áo", quan: "Quần", vay: "Váy", khoac: "Áo khoác", pk: "Phụ kiện" }[categorySlug] ?? categorySlug,
  images: [`/img/${nextId}.jpg`], variants: colors.map(c => ({ size: "M", color: c, stock: 3 })), ...o,
});

const catalog = (): ProductInput[] => [
  mkP("Áo thun basic", "ao", 199000), mkP("Áo sơ mi linen", "ao", 349000, ["Trắng", "Be"]), mkP("Áo polo pique", "ao", 299000),
  mkP("Áo len cổ tròn", "ao", 399000, ["Be", "Xám"]),
  mkP("Quần jean slim", "quan", 499000, ["Xanh jean"]), mkP("Quần kaki ống đứng", "quan", 459000, ["Be", "Đen"]),
  mkP("Quần short linen", "quan", 299000, ["Be"]), mkP("Quần jogger nỉ", "quan", 399000, ["Xám", "Đen"]),
  mkP("Váy midi xếp ly", "vay", 549000, ["Đen"]), mkP("Chân váy chữ A", "vay", 399000, ["Đen", "Trắng"]),
  mkP("Áo khoác bomber", "khoac", 699000, ["Đen"]), mkP("Áo blazer oversize", "khoac", 899000, ["Đen", "Be"]),
  mkP("Mũ lưỡi trai", "pk", 149000), mkP("Thắt lưng da", "pk", 249000, ["Đen"]), mkP("Túi tote canvas", "pk", 199000, ["Be"]),
  mkP("Giày sneaker trắng", "pk", 799000, ["Trắng"]),
];

test("áo gốc: đề xuất quần/váy, không chứa sản phẩm gốc, chỉ dùng sản phẩm trong pool", () => {
  const cat = catalog();
  const base = cat[0]!;
  const pool = cat.filter(p => p.id !== base.id);
  const out = recommend({ base, pool, style: "casual" });
  assert.ok(out.outfits.length > 0);
  const ids = new Set(pool.map(p => p.id));
  for (const o of out.outfits) {
    assert.ok(o.items.every(i => ids.has(i.id) && i.id !== base.id));
    assert.ok(o.items.some(i => i.role === "bottom"));
    assert.ok(o.complete);
  }
});

test("quần gốc, váy gốc, giày gốc, phụ kiện gốc đều hoạt động (không mặc định là áo)", () => {
  const cat = catalog();
  for (const name of ["Quần jean slim", "Váy midi xếp ly", "Giày sneaker trắng", "Thắt lưng da", "Áo blazer oversize"]) {
    const base = cat.find(p => p.name === name)!;
    const out = recommend({ base, pool: cat.filter(p => p.id !== base.id), style: "casual" });
    assert.ok(out.outfits.length > 0, name);
    const roles = out.baseProfile.role;
    assert.ok(out.outfits.every(o => o.items.every(i => i.role !== roles || roles === "accessory")), name);
  }
  const skirt = cat.find(p => p.name === "Chân váy chữ A")!;
  assert.equal(buildProfile(skirt).role, "bottom");
  assert.equal(buildProfile(cat.find(p => p.name === "Giày sneaker trắng")!).role, "footwear");
});

test("thiếu dữ liệu: thành phần unknown bị loại và trọng số được chuẩn hóa lại", () => {
  const a = buildProfile(mkP("Áo thun basic", "ao", 100000));
  const b = buildProfile(mkP("Quần jean slim", "quan", 100000, ["Xanh jean"]));
  const s = scoreOutfit([a, b], { style: "casual", maxSold: 0 });
  assert.equal(s.factors.preference.score, null); // soldCount tối đa = 0 → không có dữ liệu
  assert.equal(s.factors.season.score, null);
  const w = { style: 0.3, color: 0.2, category: 0.2, occasion: 0.15 };
  const known = (["style", "color", "category", "occasion"] as const).filter(f => s.factors[f].score !== null);
  const used = known.reduce((x, f) => x + w[f], 0);
  const expected = known.reduce((x, f) => x + w[f] * s.factors[f].score!, 0) / used;
  assert.ok(Math.abs(s.score - expected) < 1e-9);
  assert.ok(Math.abs(s.knownWeight - used) < 1e-9);
});

test("không đủ dữ liệu để kết luận thì không đề xuất", () => {
  const base = mkP("Sản phẩm X", "ao", 100000, ["Hoa văn lạ"]);
  const other = mkP("Sản phẩm Y", "quan", 100000, ["Hoa văn lạ"]);
  const out = recommend({ base, pool: [other], style: "casual" });
  assert.equal(out.outfits.length, 0);
});

test("ngân sách: tổng giá (gồm sản phẩm gốc) không vượt ngân sách; ngân sách quá thấp → rỗng", () => {
  const cat = catalog();
  const base = cat[0]!;
  const pool = cat.slice(1);
  const out = recommend({ base, pool, style: "casual", budget: 900000 });
  assert.ok(out.outfits.length > 0);
  assert.ok(out.outfits.every(o => o.total <= 900000));
  assert.equal(recommend({ base, pool, style: "casual", budget: 250000 }).outfits.length, 0);
});

test("hết hàng bị loại; ưu tiên giá sale", () => {
  const cat = catalog();
  const base = cat[0]!;
  const sold = mkP("Quần jean đã hết", "quan", 100000, ["Xanh jean"], { variants: [{ size: "M", color: "Xanh jean", stock: 0 }] });
  const sale = mkP("Quần kaki sale", "quan", 600000, ["Be"], { salePrice: 300000 });
  const out = recommend({ base, pool: [...cat.slice(1), sold, sale], style: "casual" });
  assert.ok(out.outfits.every(o => o.items.every(i => i.id !== sold.id)));
  assert.equal(buildProfile(sale).price, 300000);
});

test("catalog không có giày/quần: trả về bộ chưa đầy đủ hoặc rỗng, ghi chú rõ ràng, không bịa", () => {
  const base = mkP("Áo thun basic", "ao", 100000);
  const out = recommend({ base, pool: [mkP("Mũ lưỡi trai", "pk", 100000)], style: "casual" });
  assert.ok(out.notes.includes("NO_FOOTWEAR_IN_CATALOG"));
  for (const o of out.outfits) { assert.equal(o.complete, false); assert.ok(o.missing.includes("bottom")); }
});

test("phong cách formal phạt đồ short/jogger", () => {
  const top = buildProfile(mkP("Áo sơ mi linen", "ao", 1, ["Trắng"]));
  const shorts = buildProfile(mkP("Quần short linen", "quan", 1, ["Be"]));
  const tailored = buildProfile(mkP("Quần tây công sở", "quan", 1, ["Be"]));
  const ctx = { style: "formal" as const, maxSold: 10 };
  assert.ok(scoreOutfit([top, tailored], ctx).score > scoreOutfit([top, shorts], ctx).score);
});

test("hài hòa màu cả bảng màu, không chỉ khác màu là tốt", () => {
  const c = (n: string) => parseColor(n)!;
  assert.ok(paletteHarmony([c("Đen"), c("Trắng"), c("Be")]) > paletteHarmony([c("Đỏ"), c("Xanh lá"), c("Vàng"), c("Đen")]));
  assert.ok(paletteHarmony([c("Đen"), c("Trắng"), c("Đỏ")]) > paletteHarmony([c("Đỏ"), c("Xanh lá"), c("Vàng")]));
});

test("hiệu năng: 600 sản phẩm vẫn trả kết quả nhanh và bị chặn số lượng", () => {
  const cat = catalog();
  const big: ProductInput[] = [];
  const slugs = ["ao", "quan", "vay", "khoac", "pk"];
  for (let i = 0; i < 600; i++) big.push(mkP(`Sản phẩm ${i} ${["thun", "jean", "midi", "bomber", "mũ"][i % 5]}`, slugs[i % 5]!, 100000 + i * 1000, ["Đen", "Trắng", "Be", "Xám"].slice(0, 1 + (i % 4))));
  const t0 = performance.now();
  const out = recommend({ base: cat[0]!, pool: big, style: "streetwear" });
  assert.ok(performance.now() - t0 < 1500);
  assert.ok(out.outfits.length <= LIMITS.results);
});
