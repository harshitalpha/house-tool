import { Material, type Furniture, type Part } from "../schema";

/**
 * Built-in parametric models: a name, a style and the item's overall size produce a list of parts.
 * They are conveniences, not limits: any object can instead carry its own `parts`. Parts that don't
 * set a material inherit the item's colour/material.
 */

export interface ModelInput {
  width: number;
  depth: number;
  height: number;
  style: string;
  count?: number;
}

export interface ModelDef {
  name: string;
  summary: string;
  styles: string[];
  build(i: ModelInput): Part[];
}

type Mat = Parameters<typeof Material.parse>[0];
const mat = (m: Mat) => Material.parse(m);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const DARK = mat({ color: "#2b2a28", roughness: 0.6 });
const WOOD = mat({ color: "#8b6a4a", texture: "wood", scale: 0.6, roughness: 0.6 });
const METAL = mat({ color: "#b9b9b5", metalness: 0.8, roughness: 0.3 });
const WHITE = mat({ color: "#f2f0ea", texture: "linen", scale: 0.3 });
const LEG = mat({ color: "#5b4531", roughness: 0.5 });
const PILLOW_A = mat({ color: "#c4a67c", texture: "linen", scale: 0.25, roughness: 0.95 });
const PILLOW_B = mat({ color: "#7d858e", texture: "linen", scale: 0.25, roughness: 0.95 });

function box(x: number, y: number, z: number, w: number, h: number, d: number, extra: { radius?: number; material?: ReturnType<typeof mat>; rotation?: number } = {}): Part {
  return { shape: "box", size: { x: r3(w), y: r3(h), z: r3(d) }, radius: extra.radius ?? 0, at: { x: r3(x), y: r3(y), z: r3(z) }, rotation: extra.rotation ?? 0, material: extra.material };
}
function cyl(x: number, y: number, z: number, radius: number, height: number, extra: { radiusTop?: number; material?: ReturnType<typeof mat> } = {}): Part {
  return { shape: "cylinder", radius: r3(radius), height: r3(height), radiusTop: extra.radiusTop, at: { x: r3(x), y: r3(y), z: r3(z) }, rotation: 0, material: extra.material };
}
function sphere(x: number, y: number, z: number, w: number, h: number, d: number, material?: ReturnType<typeof mat>): Part {
  return { shape: "sphere", size: { x: r3(w), y: r3(h), z: r3(d) }, at: { x: r3(x), y: r3(y), z: r3(z) }, rotation: 0, material };
}
function arc(cz: number, y: number, inner: number, outer: number, height: number, a0: number, a1: number, material?: ReturnType<typeof mat>): Part {
  return { shape: "arc", innerRadius: r3(inner), outerRadius: r3(outer), height: r3(height), startDeg: r3(a0), endDeg: r3(a1), at: { x: 0, y: r3(y), z: r3(cz) }, rotation: 0, material };
}

// ---------------------------------------------------------------------------
// sofa
// ---------------------------------------------------------------------------

function sofaParts(i: ModelInput, seats?: number): Part[] {
  const { width: W, depth: D, height: H } = i;
  const style = i.style;
  const legH = 0.1;
  const baseH = Math.min(0.2, H * 0.28);
  const cushH = 0.14;
  const armW = clamp(W * 0.07, 0.12, 0.2);
  const backD = clamp(D * 0.22, 0.16, 0.28);
  const seatY = legH + baseH;
  const out: Part[] = [];
  const legs = (pts: { x: number; z: number }[]) => pts.forEach((p) => out.push(cyl(p.x, 0, p.z, 0.018, legH, { radiusTop: 0.034, material: LEG })));
  // Two scatter cushions on the seat, in front of the back cushions.
  const pillow = (x: number, z: number, m: ReturnType<typeof mat>) => out.push(box(x, seatY + cushH, z, 0.42, 0.38, 0.13, { radius: 0.06, material: m }));

  if (style === "curved") {
    const t = clamp(D * 0.6, 0.8, 1.0);
    // Pick the sweep angle so the footprint is W wide and D deep.
    const depthAt = (deg: number) => {
      const half = (deg / 2) * (Math.PI / 180);
      const R = W / (2 * Math.sin(half));
      return R * (1 - Math.cos(half)) + t * Math.cos(half);
    };
    let lo = 30, hi = 200;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (depthAt(mid) < D) lo = mid; else hi = mid; }
    const sweep = (lo + hi) / 2;
    const half = (sweep / 2) * (Math.PI / 180);
    const R = W / (2 * Math.sin(half));
    const cz = -D / 2 + R;
    const a0 = 270 - sweep / 2, a1 = 270 + sweep / 2;
    out.push(arc(cz, legH, R - t, R, baseH, a0, a1));
    out.push(arc(cz, seatY, R - t, R - backD, cushH, a0, a1));
    out.push(arc(cz, legH, R - backD, R, H - legH, a0, a1));
    const rm = R - t / 2;
    for (const deg of [a0 + 8, 270, a1 - 8]) {
      const a = (deg * Math.PI) / 180;
      out.push(cyl(rm * Math.cos(a), 0, cz + rm * Math.sin(a), 0.03, legH, { material: DARK }));
    }
    return out;
  }

  const n = clamp(seats ?? Math.round(W / 0.75), 1, 6);
  const wing = style === "l_left" || style === "l_right" || style === "u";
  const mirror = style === "l_left" ? -1 : 1;
  const chaiseW = clamp(W * 0.3, 0.9, 1.3);
  const Dm = clamp(0.95, 0.7, D * 0.7); // depth of the straight part of an L / U
  const place = (x0: number, x1: number, z0: number, z1: number, h: number, y: number, extra?: { radius?: number; material?: ReturnType<typeof mat> }) =>
    box(mirror * (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, extra);

  if (!wing) {
    const x0 = -W / 2 + armW, x1 = W / 2 - armW, zb = -D / 2 + backD;
    out.push(place(x0, x1, zb, D / 2, baseH, legH));
    out.push(place(-W / 2, -W / 2 + armW, -D / 2, D / 2, H * 0.62 - legH, legH, { radius: 0.05 }));
    out.push(place(W / 2 - armW, W / 2, -D / 2, D / 2, H * 0.62 - legH, legH, { radius: 0.05 }));
    out.push(place(-W / 2, W / 2, -D / 2, zb, H - legH, legH, { radius: 0.06 }));
    const cw = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      out.push(place(x0 + k * cw + 0.005, x0 + (k + 1) * cw - 0.005, zb, D / 2 - 0.02, cushH, seatY, { radius: 0.05 }));
      out.push(place(x0 + k * cw + 0.01, x0 + (k + 1) * cw - 0.01, zb, zb + 0.16, (H - seatY - cushH) * 0.85, seatY + cushH, { radius: 0.06 }));
    }
    if (W > 1.2) { pillow(x0 + 0.3, zb + 0.23, PILLOW_A); pillow(x1 - 0.3, zb + 0.23, PILLOW_B); }
    legs([{ x: -W / 2 + 0.08, z: -D / 2 + 0.08 }, { x: W / 2 - 0.08, z: -D / 2 + 0.08 }, { x: -W / 2 + 0.08, z: D / 2 - 0.08 }, { x: W / 2 - 0.08, z: D / 2 - 0.08 }]);
    return out;
  }

  // L / U: a straight run along the back plus a chaise (or two) reaching toward the front.
  const zb = -D / 2 + backD;
  const left = style === "u" ? -W / 2 : -W / 2 + armW;
  const mainX0 = left + (style === "u" ? chaiseW : 0);
  const mainX1 = W / 2 - chaiseW;
  out.push(place(-W / 2, W / 2, -D / 2, zb, H - legH, legH, { radius: 0.06 })); // back
  if (style !== "u") out.push(place(-W / 2, -W / 2 + armW, -D / 2, -D / 2 + Dm, H * 0.62 - legH, legH, { radius: 0.05 })); // arm at the straight end
  // bases
  out.push(place(left, W / 2, zb, -D / 2 + Dm, baseH, legH));
  out.push(place(W / 2 - chaiseW, W / 2, -D / 2 + Dm, D / 2, baseH, legH));
  if (style === "u") out.push(place(-W / 2, -W / 2 + chaiseW, -D / 2 + Dm, D / 2, baseH, legH));
  // cushions on the straight part
  const run0 = mainX0, run1 = mainX1;
  const m = clamp(Math.round((run1 - run0) / 0.75), 1, 5);
  const cw = (run1 - run0) / m;
  for (let k = 0; k < m; k++) {
    out.push(place(run0 + k * cw + 0.005, run0 + (k + 1) * cw - 0.005, zb, -D / 2 + Dm, cushH, seatY, { radius: 0.05 }));
    out.push(place(run0 + k * cw + 0.01, run0 + (k + 1) * cw - 0.01, zb, zb + 0.16, (H - seatY - cushH) * 0.85, seatY + cushH, { radius: 0.06 }));
  }
  // chaise cushions (corner cushion included)
  out.push(place(W / 2 - chaiseW + 0.005, W / 2, zb, D / 2 - 0.02, cushH, seatY, { radius: 0.05 }));
  out.push(place(W / 2 - chaiseW + 0.01, W / 2 - 0.01, zb, zb + 0.16, (H - seatY - cushH) * 0.85, seatY + cushH, { radius: 0.06 }));
  if (style === "u") {
    out.push(place(-W / 2, -W / 2 + chaiseW - 0.005, zb, D / 2 - 0.02, cushH, seatY, { radius: 0.05 }));
    out.push(place(-W / 2 + 0.01, -W / 2 + chaiseW - 0.01, zb, zb + 0.16, (H - seatY - cushH) * 0.85, seatY + cushH, { radius: 0.06 }));
  }
  pillow(mirror * (run0 + 0.3), zb + 0.23, PILLOW_A);
  pillow(mirror * (W / 2 - chaiseW / 2), zb + 0.23, PILLOW_B);
  const corners = [{ x: -W / 2 + 0.08, z: -D / 2 + 0.08 }, { x: W / 2 - 0.08, z: -D / 2 + 0.08 }, { x: W / 2 - 0.08, z: D / 2 - 0.08 }, { x: -W / 2 + 0.08, z: D / 2 - 0.08 }];
  legs(corners.filter((c) => style === "u" || c.x !== -W / 2 + 0.08 || c.z < 0).map((c) => ({ x: mirror * c.x, z: c.z })));
  return out;
}

// ---------------------------------------------------------------------------
// the rest
// ---------------------------------------------------------------------------

function bedParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  const out: Part[] = [];
  const frameH = i.style === "platform" ? 0.28 : 0.22;
  const hbT = 0.1;
  const hbH = Math.max(H, 0.9);
  out.push(box(0, 0.06, 0, W, frameH, D, { material: i.style === "platform" ? undefined : WOOD }));
  out.push(box(0, 0.06 + frameH, 0.02, W - 0.06, 0.22, D - 0.1, { radius: 0.05, material: WHITE }));
  out.push(box(0, 0.06 + frameH + 0.22, D * 0.17, W - 0.08, 0.08, D * 0.62, { radius: 0.04 })); // duvet in the item's colour
  const pw = (W - 0.3) / 2;
  for (const sx of [-1, 1]) out.push(box(sx * (pw / 2 + 0.03), 0.06 + frameH + 0.22, -D / 2 + 0.3, pw, 0.12, 0.38, { radius: 0.05, material: WHITE }));
  if (i.style === "tufted") {
    out.push(box(0, 0, -D / 2 - hbT / 2, W + 0.1, hbH, hbT, { material: DARK }));
    const cols = Math.max(2, Math.round(W / 0.55)), cw = (W - 0.1) / cols;
    for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
      out.push(box(-W / 2 + 0.05 + cw * (c + 0.5), 0.35 + r * 0.28, -D / 2 - hbT / 2 + hbT / 2 + 0.015, cw - 0.03, 0.25, 0.05, { radius: 0.04, material: mat({ color: "#b79b82", texture: "leather", scale: 0.3 }) }));
    }
  } else {
    out.push(box(0, 0, -D / 2 - hbT / 2, W + 0.1, hbH, hbT, { material: WOOD }));
  }
  return out;
}

function tableParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  const top = 0.04;
  if (i.style === "round") {
    const r = Math.min(W, D) / 2;
    return [cyl(0, H - top, 0, r, top, { material: WOOD }), cyl(0, 0.03, 0, 0.07, H - top - 0.03, { material: DARK }), cyl(0, 0, 0, r * 0.45, 0.03, { material: DARK })];
  }
  const out: Part[] = [box(0, H - top, 0, W, top, D, { radius: 0.01, material: WOOD })];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(sx * (W / 2 - 0.07), 0, sz * (D / 2 - 0.07), 0.06, H - top, 0.06, { material: DARK }));
  return out;
}

function coffeeTableParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  if (i.style === "round") {
    const r = Math.min(W, D) / 2;
    return [cyl(0, H - 0.03, 0, r, 0.03, { material: mat({ color: "#e8e6e1", texture: "marble", scale: 0.8, roughness: 0.2 }) }), cyl(0, 0.0, 0, r * 0.7, 0.03, { material: DARK }), cyl(0, 0.03, 0, 0.04, H - 0.06, { material: METAL })];
  }
  const out: Part[] = [box(0, H - 0.04, 0, W, 0.04, D, { radius: 0.01 }), box(0, 0.12, 0, W - 0.1, 0.02, D - 0.1, { material: DARK })];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), 0.04, H - 0.04, 0.04, { material: METAL }));
  return out;
}

function chairParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  const seatH = H * 0.5;
  const out: Part[] = [box(0, seatH, 0, W, 0.05, D, { radius: 0.02 }), box(0, seatH + 0.05, -D / 2 + 0.025, W, H - seatH - 0.05, 0.05, { radius: 0.02 })];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.04), 0.04, seatH, 0.04, { material: DARK }));
  return out;
}

function tvUnitParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  const out: Part[] = [box(0, 0, 0, W, H, D), box(0, H, 0, W + 0.02, 0.025, D + 0.02, { material: mat({ color: "#f4f2ee", roughness: 0.4 }) })];
  const n = Math.max(1, Math.round(W / 0.5)), dw = (W - 0.06) / n;
  for (let k = 0; k < n; k++) out.push(box(-W / 2 + 0.03 + dw * (k + 0.5), 0.03, D / 2 + 0.008, dw - 0.02, H - 0.06, 0.016, { material: mat({ color: "#b8ada0", roughness: 0.5 }) }));
  return out;
}

function wardrobeParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  const out: Part[] = [box(0, 0, 0, W, H, D)];
  const doorM = mat({ color: i.style === "dark" ? "#3a322c" : "#d8d3c8", roughness: 0.5 });
  out.push(box(0, H, 0, W + 0.03, 0.03, D + 0.03, { material: doorM })); // crown
  out.push(box(0, 0, D / 2 - 0.02, W - 0.04, 0.07, D - 0.05, { material: DARK })); // recessed plinth
  const n = Math.max(2, i.count ?? Math.round(W / 0.55)), dw = W / n;
  for (let k = 0; k < n; k++) {
    out.push(box(-W / 2 + dw * (k + 0.5), 0.075, D / 2 + 0.01, dw - 0.012, H - 0.095, 0.02, { radius: 0.004, material: doorM }));
    const hx = -W / 2 + dw * (k + (k % 2 === 0 ? 0.88 : 0.12));
    out.push(box(hx, H * 0.45, D / 2 + 0.035, 0.015, 0.4, 0.03, { material: DARK }));
  }
  return out;
}

function rugParts(i: ModelInput): Part[] {
  const m = mat({ color: undefined, texture: "geometric", scale: 0.4, roughness: 1 });
  if (i.style === "round") return [cyl(0, 0, 0, Math.min(i.width, i.depth) / 2, 0.015, { material: m })];
  return [box(0, 0, 0, i.width, 0.015, i.depth, { radius: 0.005, material: m })];
}

function floorLampParts(i: ModelInput): Part[] {
  const { width: W, height: H } = i;
  const r = W / 2;
  return [
    cyl(0, 0, 0, r * 0.45, 0.025, { material: METAL }),
    cyl(0, 0.025, 0, 0.012, H - 0.3, { material: METAL }),
    { shape: "lathe", profile: [{ r: r * 0.55, y: 0 }, { r, y: 0.28 }], at: { x: 0, y: r3(H - 0.3), z: 0 }, rotation: 0, material: mat({ color: "#f3e3c3", emissive: "#ffd9a0", emissiveIntensity: 0.6, opacity: 0.95 }) },
  ];
}

function plantParts(i: ModelInput): Part[] {
  const { width: W, height: H } = i;
  const pot = Math.min(0.35, H * 0.35);
  const g = mat({ color: "#3f7d4e", roughness: 0.9 });
  return [
    cyl(0, 0, 0, W * 0.3, pot, { radiusTop: W * 0.36, material: mat({ color: "#a8755a", roughness: 0.8 }) }),
    sphere(0, pot, 0, W * 0.8, H - pot, W * 0.8, g),
    sphere(W * 0.12, pot + (H - pot) * 0.35, W * 0.1, W * 0.55, (H - pot) * 0.6, W * 0.55, mat({ color: "#4d9460" })),
  ];
}

function bookshelfParts(i: ModelInput): Part[] {
  const { width: W, depth: D, height: H } = i;
  const t = 0.03;
  const out: Part[] = [box(-W / 2 + t / 2, 0, 0, t, H, D), box(W / 2 - t / 2, 0, 0, t, H, D), box(0, 0, -D / 2 + 0.01, W, H, 0.02)];
  const shelves = Math.max(3, Math.round(H / 0.4));
  for (let k = 0; k <= shelves; k++) out.push(box(0, ((H - t) * k) / shelves, 0, W - 2 * t, t, D));
  return out;
}

export const MODELS: Record<string, ModelDef> = {
  sofa: { name: "sofa", summary: "Sofa. count = seats.", styles: ["straight", "l_right", "l_left", "u", "curved"], build: (i) => sofaParts(i, i.count) },
  armchair: { name: "armchair", summary: "Single-seat armchair.", styles: ["straight"], build: (i) => sofaParts({ ...i, style: "straight" }, 1) },
  bed: { name: "bed", summary: "Bed with headboard at the back (north at rotation 0).", styles: ["panel", "tufted", "platform"], build: bedParts },
  dining_table: { name: "dining_table", summary: "Dining/work table.", styles: ["rect", "round"], build: tableParts },
  coffee_table: { name: "coffee_table", summary: "Low table.", styles: ["rect", "round"], build: coffeeTableParts },
  chair: { name: "chair", summary: "Dining chair, back at the back.", styles: ["dining"], build: chairParts },
  tv_unit: { name: "tv_unit", summary: "TV console with drawer fronts.", styles: ["floating", "standard"], build: tvUnitParts },
  wardrobe: { name: "wardrobe", summary: "Wardrobe with doors and handles. count = doors.", styles: ["light", "dark"], build: wardrobeParts },
  bookshelf: { name: "bookshelf", summary: "Open shelving.", styles: ["open"], build: bookshelfParts },
  rug: { name: "rug", summary: "Flat rug.", styles: ["rect", "round"], build: rugParts },
  floor_lamp: { name: "floor_lamp", summary: "Standing lamp with a glowing shade (add a light for illumination).", styles: ["classic"], build: floorLampParts },
  plant: { name: "plant", summary: "Potted plant.", styles: ["bushy"], build: plantParts },
};

/** What to draw for an item: its own parts, else its model, else null (the viewer draws the plain box). */
export function partsFor(f: Pick<Furniture, "parts" | "model" | "width" | "depth" | "height">): Part[] | null {
  if (f.parts?.length) return f.parts;
  if (!f.model) return null;
  const def = MODELS[f.model.name];
  if (!def) return null;
  const style = f.model.style && def.styles.includes(f.model.style) ? f.model.style : def.styles[0]!;
  return def.build({ width: f.width, depth: f.depth, height: f.height, style, count: f.model.count });
}

/** Typical overall size (width, depth, height in metres) for a model, so "add a curved sofa" needs no numbers. */
export function defaultModelSize(name: string, style?: string): { width: number; depth: number; height: number } {
  const wide = style === "l_left" || style === "l_right" ? { width: 2.8, depth: 1.9, height: 0.85 } : style === "u" ? { width: 3.2, depth: 2.2, height: 0.85 } : style === "curved" ? { width: 2.8, depth: 1.2, height: 0.85 } : { width: 2.0, depth: 0.95, height: 0.85 };
  const table: Record<string, { width: number; depth: number; height: number }> = {
    sofa: wide, armchair: { width: 0.9, depth: 0.9, height: 0.85 }, bed: { width: 1.6, depth: 2.0, height: 0.9 },
    dining_table: style === "round" ? { width: 1.1, depth: 1.1, height: 0.75 } : { width: 1.6, depth: 0.9, height: 0.75 },
    coffee_table: style === "round" ? { width: 0.8, depth: 0.8, height: 0.42 } : { width: 1.1, depth: 0.6, height: 0.42 },
    chair: { width: 0.45, depth: 0.5, height: 0.9 }, tv_unit: { width: 1.6, depth: 0.38, height: 0.4 }, wardrobe: { width: 1.8, depth: 0.6, height: 2.2 },
    bookshelf: { width: 0.9, depth: 0.3, height: 1.9 }, rug: { width: 2.0, depth: 1.4, height: 0.02 }, floor_lamp: { width: 0.4, depth: 0.4, height: 1.6 }, plant: { width: 0.5, depth: 0.5, height: 1.1 },
  };
  return table[name] ?? { width: 0.6, depth: 0.6, height: 0.6 };
}

/** Scale custom parts when their object is resized, so a curved sofa made of parts stretches with its box. */
export function scaleParts(parts: Part[], sx: number, sy: number, sz: number): Part[] {
  const sr = (sx + sz) / 2;
  return parts.map((p) => {
    const at = { x: r3(p.at.x * sx), y: r3(p.at.y * sy), z: r3(p.at.z * sz) };
    switch (p.shape) {
      case "box": return { ...p, at, size: { x: r3(p.size.x * sx), y: r3(p.size.y * sy), z: r3(p.size.z * sz) } };
      case "sphere": return { ...p, at, size: { x: r3(p.size.x * sx), y: r3(p.size.y * sy), z: r3(p.size.z * sz) } };
      case "cylinder": return { ...p, at, radius: r3(p.radius * sr), radiusTop: p.radiusTop === undefined ? undefined : r3(p.radiusTop * sr), height: r3(p.height * sy) };
      case "torus": return { ...p, at, radius: r3(p.radius * sr), tube: r3(p.tube * Math.min(sr, sy)) };
      case "arc": return { ...p, at, innerRadius: r3(p.innerRadius * sr), outerRadius: r3(p.outerRadius * sr), height: r3(p.height * sy) };
      case "polygon": return { ...p, at, points: p.points.map((q) => ({ x: r3(q.x * sx), z: r3(q.z * sz) })), height: r3(p.height * sy) };
      case "lathe": return { ...p, at, profile: p.profile.map((q) => ({ r: r3(q.r * sr), y: r3(q.y * sy) })) };
    }
  });
}
