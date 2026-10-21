import type { Material, Texture } from "@house/core";
import * as THREE from "three";

/**
 * Procedural patterns, drawn once on a small canvas in light greys so the material colour tints them
 * (a "stripes" wall in dark teal gives teal and a slightly darker teal). No image files needed.
 */

const SIZE = 256;
const cache = new Map<Texture, THREE.CanvasTexture>();

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Painter = (g: CanvasRenderingContext2D, rand: () => number) => void;

const noise = (g: CanvasRenderingContext2D, rand: () => number, n: number, alpha: number, size = 1.5) => {
  for (let k = 0; k < n; k++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? "0,0,0" : "255,255,255"},${alpha * rand()})`;
    g.fillRect(rand() * SIZE, rand() * SIZE, size, size);
  }
};

const flat = (c: string): Painter => (g, r) => { g.fillStyle = c; g.fillRect(0, 0, SIZE, SIZE); noise(g, r, 2500, 0.05); };

const PAINTERS: Record<Exclude<Texture, "plain">, Painter> = {
  plaster: flat("#f1eee8"),
  parquet: flat("#cdb08a"),
  stone: flat("#d8c8a8"),
  wood: (g, r) => {
    g.fillStyle = "#e9dfd0"; g.fillRect(0, 0, SIZE, SIZE);
    for (let k = 0; k < 60; k++) {
      const y = r() * SIZE;
      g.strokeStyle = `rgba(90,60,30,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= SIZE; x += 32) g.lineTo(x, y + Math.sin(x / 40 + k) * 3 + (r() - 0.5) * 2);
      g.stroke();
    }
  },
  dark_wood: (g, r) => {
    g.fillStyle = "#cfc2b2"; g.fillRect(0, 0, SIZE, SIZE);
    for (let k = 0; k < 80; k++) {
      const y = r() * SIZE;
      g.strokeStyle = `rgba(40,25,10,${0.15 + r() * 0.3})`; g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= SIZE; x += 32) g.lineTo(x, y + Math.sin(x / 35 + k) * 4);
      g.stroke();
    }
  },
  fabric: (g, r) => {
    g.fillStyle = "#efefec"; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = "rgba(0,0,0,0.07)"; g.lineWidth = 1;
    for (let k = 0; k < SIZE; k += 3) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, SIZE); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(SIZE, k); g.stroke(); }
    noise(g, r, 2500, 0.1);
  },
  linen: (g, r) => {
    g.fillStyle = "#f1f0ec"; g.fillRect(0, 0, SIZE, SIZE);
    for (let k = 0; k < 220; k++) { g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.06})`; const y = r() * SIZE; g.beginPath(); g.moveTo(0, y); g.lineTo(SIZE, y + (r() - 0.5) * 3); g.stroke(); }
    for (let k = 0; k < 220; k++) { g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; const x = r() * SIZE; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 3, SIZE); g.stroke(); }
  },
  velvet: (g, r) => {
    g.fillStyle = "#f4f4f2"; g.fillRect(0, 0, SIZE, SIZE);
    noise(g, r, 6000, 0.07, 2);
  },
  leather: (g, r) => {
    g.fillStyle = "#f0efed"; g.fillRect(0, 0, SIZE, SIZE);
    for (let k = 0; k < 700; k++) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.beginPath(); g.arc(r() * SIZE, r() * SIZE, 2 + r() * 4, 0, 7); g.fill(); }
  },
  marble: (g, r) => {
    g.fillStyle = "#f5f5f3"; g.fillRect(0, 0, SIZE, SIZE);
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(90,95,105,${0.1 + r() * 0.25})`; g.lineWidth = 0.6 + r() * 2;
      let x = r() * SIZE, y = 0; g.beginPath(); g.moveTo(x, y);
      while (y < SIZE) { x += (r() - 0.5) * 34; y += 10 + r() * 16; g.lineTo(x, y); }
      g.stroke();
    }
  },
  tiles: (g) => {
    g.fillStyle = "#f3f3f1"; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = "#b9b9b4"; g.lineWidth = 4;
    g.strokeRect(0, 0, SIZE, SIZE); g.beginPath(); g.moveTo(SIZE / 2, 0); g.lineTo(SIZE / 2, SIZE); g.moveTo(0, SIZE / 2); g.lineTo(SIZE, SIZE / 2); g.stroke();
  },
  stripes: (g) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = "#d4d4d2";
    for (let k = 0; k < 4; k++) g.fillRect(k * 64 + 32, 0, 32, SIZE);
  },
  damask: (g) => {
    g.fillStyle = "#f4f4f1"; g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = "#d3d3cd";
    const motif = (cx: number, cy: number) => {
      g.beginPath(); g.moveTo(cx, cy - 46); g.quadraticCurveTo(cx + 32, cy - 10, cx, cy + 46); g.quadraticCurveTo(cx - 32, cy - 10, cx, cy - 46); g.fill();
      g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fillStyle = "#f4f4f1"; g.fill(); g.fillStyle = "#d3d3cd";
      g.beginPath(); g.ellipse(cx - 40, cy, 14, 6, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + 40, cy, 14, 6, 0, 0, 7); g.fill();
    };
    motif(SIZE / 4, SIZE / 4); motif((SIZE * 3) / 4, (SIZE * 3) / 4);
  },
  fluted: (g) => {
    const ridges = 16, w = SIZE / ridges;
    for (let k = 0; k < ridges; k++) {
      const gr = g.createLinearGradient(k * w, 0, (k + 1) * w, 0);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.55, "#d9d9d6"); gr.addColorStop(1, "#a9a9a5");
      g.fillStyle = gr; g.fillRect(k * w, 0, w, SIZE);
    }
  },
  brick: (g) => {
    g.fillStyle = "#b8b8b2"; g.fillRect(0, 0, SIZE, SIZE);
    const rows = 8, bh = SIZE / rows;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 4; x++) {
      const off = y % 2 ? SIZE / 8 : 0;
      g.fillStyle = y % 3 === 0 ? "#f4f4f2" : "#ececea";
      g.fillRect(x * (SIZE / 4) + off + 3, y * bh + 3, SIZE / 4 - 6, bh - 6);
    }
  },
  concrete: (g, r) => {
    g.fillStyle = "#e4e4e2"; g.fillRect(0, 0, SIZE, SIZE);
    noise(g, r, 9000, 0.14, 2);
  },
  geometric: (g) => {
    g.fillStyle = "#f6f6f3"; g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = "#d6d6d1";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 64 + 32, cy = y * 64 + 32;
      g.beginPath(); g.moveTo(cx, cy - 24); g.lineTo(cx + 24, cy); g.lineTo(cx, cy + 24); g.lineTo(cx - 24, cy); g.closePath();
      if ((x + y) % 2 === 0) g.fill(); else { g.strokeStyle = "#c4c4be"; g.lineWidth = 3; g.stroke(); }
    }
  },
};

function base(name: Texture): THREE.CanvasTexture | null {
  if (name === "plain") return null;
  let t = cache.get(name);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    PAINTERS[name](c.getContext("2d")!, rng(name.length * 977 + name.charCodeAt(0)));
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    cache.set(name, t);
  }
  return t;
}

/** Presets backed by photographic PBR sets in /textures/pbr/<id>/{diff,nor,rough}.jpg (Poly Haven, CC0). */
const PBR: Partial<Record<Texture, string>> = {
  wood: "laminate_floor_02", parquet: "herringbone_parquet", tiles: "interior_tiles", plaster: "white_plaster_02",
  stone: "marble_01", velvet: "velour_velvet", leather: "fabric_leather_01", linen: "rough_linen", fabric: "wool_boucle",
  concrete: "concrete_floor_02", brick: "painted_brick",
};

const PAINT = new Set(["white_plaster_02"]);
const whiteMap = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 4;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

function pbrTexture(id: string, repeatU: number, repeatV: number, offsetU: number, offsetV: number): THREE.Texture {
  // One loader per map and use (a clone of a still-loading texture would never get its image); the browser caches the files.
  const load = (file: string, srgb: boolean) => {
    const t = new THREE.TextureLoader().load(`/textures/pbr/${id}/${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(Math.max(0.05, repeatU), Math.max(0.05, repeatV));
    t.offset.set(offsetU, offsetV);
    return t;
  };
  // Painted surfaces keep the material's own colour: only the relief and sheen come from the photo set.
  const map = PAINT.has(id) ? whiteMap() : load("diff", true);
  const normalMap = load("nor", false), roughnessMap = load("rough", false);
  map.userData.pbr = { normalMap, roughnessMap };
  map.addEventListener("dispose", () => { normalMap.dispose(); roughnessMap.dispose(); });
  return map;
}

/** A texture instance with its own repeat/offset (the pattern itself is shared). null for "plain". */
export function makeTexture(name: Texture, repeatU: number, repeatV: number, offsetU = 0, offsetV = 0): THREE.Texture | null {
  const pbr = PBR[name];
  if (pbr) return pbrTexture(pbr, repeatU, repeatV, offsetU, offsetV);
  const b = base(name);
  if (!b) return null;
  const t = b.clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(0.05, repeatU), Math.max(0.05, repeatV));
  t.offset.set(offsetU, offsetV);
  return t;
}

/**
 * The pattern for a material: its uploaded photo if it has one, else its preset. Repeat and offset are in
 * pattern repeats (surface metres / material scale). null when there is no pattern.
 */
export function materialTexture(m: Material | undefined, repeatU: number, repeatV: number, offsetU = 0, offsetV = 0): THREE.Texture | null {
  if (!m) return null;
  if (!m.image) return m.texture === "plain" ? null : makeTexture(m.texture, repeatU, repeatV, offsetU, offsetV);
  if (m.seamless) return seamlessTexture(m.image, repeatU / 2, repeatV / 2, offsetU / 2, offsetV / 2);
  // One loader per use: a clone of a still-loading texture would never receive its image.
  const t = new THREE.TextureLoader().load(m.image);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(Math.max(0.05, repeatU), Math.max(0.05, repeatV));
  t.offset.set(offsetU, offsetV);
  return t;
}

const SEAM = 512;
const seamCache = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * A photo prepared for tiling: the slow light/dark drift across the photo is removed (so tiles don't read as
 * boxes) and the result is mirrored 2x2 (so the edges of a tile always match its neighbour).
 */
function seamlessCanvas(url: string): Promise<HTMLCanvasElement> {
  let p = seamCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const make = () => { const c = document.createElement("canvas"); c.width = c.height = SEAM; return c; };
        const src = make(), blur = make();
        const sg = src.getContext("2d")!, bg = blur.getContext("2d")!;
        sg.drawImage(img, 0, 0, SEAM, SEAM);
        // Blur a mirrored 3x3 so the borders don't fade, then keep the middle tile.
        const big = document.createElement("canvas");
        big.width = big.height = SEAM * 3;
        const gg = big.getContext("2d")!;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const fx = i !== 1, fy = j !== 1;
          gg.save();
          gg.translate(i * SEAM + (fx ? SEAM : 0), j * SEAM + (fy ? SEAM : 0));
          gg.scale(fx ? -1 : 1, fy ? -1 : 1);
          gg.drawImage(src, 0, 0);
          gg.restore();
        }
        bg.filter = `blur(${SEAM / 5}px)`;
        bg.drawImage(big, -SEAM, -SEAM);
        const sd = sg.getImageData(0, 0, SEAM, SEAM), bd = bg.getImageData(0, 0, SEAM, SEAM);
        const mean = [0, 0, 0];
        for (let i = 0; i < bd.data.length; i += 4) for (let k = 0; k < 3; k++) mean[k]! += bd.data[i + k]!;
        for (let k = 0; k < 3; k++) mean[k]! /= SEAM * SEAM;
        for (let i = 0; i < sd.data.length; i += 4) for (let k = 0; k < 3; k++) sd.data[i + k] = Math.max(0, Math.min(255, sd.data[i + k]! - bd.data[i + k]! + mean[k]!));
        sg.putImageData(sd, 0, 0);
        const out = document.createElement("canvas");
        out.width = out.height = SEAM * 2;
        const og = out.getContext("2d")!;
        for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          og.save();
          og.translate(fx ? SEAM * 2 : 0, fy ? SEAM * 2 : 0);
          og.scale(fx ? -1 : 1, fy ? -1 : 1);
          og.drawImage(src, 0, 0);
          og.restore();
        }
        resolve(out);
      };
      img.onerror = () => reject(new Error(`could not load ${url}`));
      img.src = url;
    });
    seamCache.set(url, p);
  }
  return p;
}

function seamlessTexture(url: string, repeatU: number, repeatV: number, offsetU: number, offsetV: number): THREE.Texture {
  // Full size from the start: a GPU texture can't change size once uploaded.
  const holder = document.createElement("canvas");
  holder.width = holder.height = SEAM * 2;
  const hg = holder.getContext("2d")!;
  hg.fillStyle = "#8a8580";
  hg.fillRect(0, 0, holder.width, holder.height);
  const t = new THREE.CanvasTexture(holder);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(Math.max(0.025, repeatU), Math.max(0.025, repeatV));
  t.offset.set(offsetU, offsetV);
  seamlessCanvas(url).then((c) => {
    hg.drawImage(c, 0, 0);
    t.needsUpdate = true;
  }).catch(() => {});
  return t;
}

/** A photo shows its own colours: tint only when the material asks for one. */
export const photoTint = (m: Material | undefined, fallback: string): string => (m?.image ? m.color ?? "#ffffff" : m?.color ?? fallback);
