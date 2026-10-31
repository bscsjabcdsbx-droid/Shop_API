export const STYLES = ["streetwear", "minimalist", "casual", "vintage", "korean", "sporty", "formal", "elegant", "y2k", "old_money"] as const;
export type Style = (typeof STYLES)[number];

export type Role = "top" | "bottom" | "dress" | "outer" | "footwear" | "bag" | "accessory";
export type Season = "hot" | "cool" | "all";
export type Occasion = "daily" | "work" | "formal" | "party" | "sport";

export interface ProductInput {
  id: number;
  name: string;
  slug: string;
  description: string;
  material: string | null;
  price: number;
  salePrice: number | null;
  soldCount: number;
  tryOnType: string | null;
  categorySlug: string;
  categoryName: string;
  images: string[];
  variants: { size: string; color: string; stock: number }[];
}

export type ColorKind = "neutral" | "chromatic";
export interface ColorInfo { name: string; kind: ColorKind; hue: number; light: number }

export interface Profile {
  id: number;
  name: string;
  slug: string;
  role: Role | null;
  roleConfidence: number;
  styles: Partial<Record<Style, number>>;
  styleConfidence: number;
  colors: ColorInfo[];
  colorConfidence: number;
  occasions: Occasion[];
  season: Season | null;
  tags: Set<string>;
  price: number;
  originalPrice: number;
  soldCount: number;
  image: string | null;
  inStock: boolean;
}

export type Factor = "style" | "color" | "category" | "occasion" | "season" | "preference";
export const WEIGHTS: Record<Factor, number> = { style: 0.30, color: 0.20, category: 0.20, occasion: 0.15, season: 0.10, preference: 0.05 };

export interface FactorResult { score: number | null; confidence: number }
export interface OutfitScore {
  score: number;
  confidence: number;
  knownWeight: number;
  factors: Record<Factor, FactorResult>;
  colors: Map<number, ColorInfo | null>;
}
