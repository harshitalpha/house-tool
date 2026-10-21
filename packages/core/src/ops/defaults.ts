import type { Furniture } from "../schema";

type Category = Furniture["category"];

/** Default size (metres) and colour per category, so the AI only has to say "add a sofa". */
export const FURNITURE_DEFAULTS: Record<Category, { width: number; depth: number; height: number; elevation?: number; color: string }> = {
  bed: { width: 1.6, depth: 2.0, height: 0.5, color: "#a7b4c4" },
  sofa: { width: 2.0, depth: 0.9, height: 0.85, color: "#556b8d" },
  table: { width: 1.2, depth: 0.8, height: 0.75, color: "#b08968" },
  chair: { width: 0.45, depth: 0.45, height: 0.9, color: "#8c6f4e" },
  desk: { width: 1.4, depth: 0.7, height: 0.75, color: "#c8b79b" },
  wardrobe: { width: 1.8, depth: 0.6, height: 2.1, color: "#c8b79b" },
  tv: { width: 1.2, depth: 0.1, height: 0.7, elevation: 0.9, color: "#222222" },
  shelf: { width: 1.0, depth: 0.3, height: 1.8, color: "#a68a64" },
  lamp: { width: 0.3, depth: 0.3, height: 1.5, color: "#e8d9a8" },
  counter: { width: 2.0, depth: 0.6, height: 0.9, color: "#d9d6cf" },
  sink: { width: 0.5, depth: 0.4, height: 0.9, color: "#f2f2f2" },
  fridge: { width: 0.7, depth: 0.7, height: 1.8, color: "#e5e7ea" },
  toilet: { width: 0.4, depth: 0.7, height: 0.4, color: "#f2f2f2" },
  other: { width: 0.6, depth: 0.6, height: 0.6, color: "#8d8d8d" },
};
