import { partsFor } from "../models";
import type { Furniture, Part } from "../schema";
import { furnitureRect, type Rect } from "./bounds";

export interface Footprint extends Rect {
  /** Height range above the floor, metres. */
  y0: number;
  y1: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * What an item actually occupies on the floor, one rectangle per part (arcs are cut into slices), so an L
 * sofa leaves its empty corner free to walk through. Items without models or parts are one box.
 */
export function furnitureFootprints(f: Furniture): Footprint[] {
  const parts = partsFor(f);
  if (!parts) return [{ ...furnitureRect(f), y0: f.elevation, y1: f.elevation + f.height }];
  const ct = Math.cos(rad(f.rotation)), st = Math.sin(rad(f.rotation));
  const world = (px: number, pz: number) => ({ x: f.x + px * ct - pz * st, z: f.z + px * st + pz * ct });
  const out: Footprint[] = [];

  const push = (pts: { x: number; z: number }[], y0: number, h: number) => {
    const w = pts.map((p) => world(p.x, p.z));
    out.push({
      minX: Math.min(...w.map((p) => p.x)), maxX: Math.max(...w.map((p) => p.x)),
      minZ: Math.min(...w.map((p) => p.z)), maxZ: Math.max(...w.map((p) => p.z)),
      y0: f.elevation + y0, y1: f.elevation + y0 + h,
    });
  };
  const local = (p: Part, dx: number, dz: number) => {
    const c = Math.cos(rad(p.rotation)), s = Math.sin(rad(p.rotation));
    return { x: p.at.x + dx * c - dz * s, z: p.at.z + dx * s + dz * c };
  };
  const square = (p: Part, hx: number, hz: number, h: number) =>
    push([local(p, -hx, -hz), local(p, hx, -hz), local(p, hx, hz), local(p, -hx, hz)], p.at.y, h);

  for (const p of parts) {
    switch (p.shape) {
      case "box": square(p, p.size.x / 2, p.size.z / 2, p.size.y); break;
      case "sphere": square(p, p.size.x / 2, p.size.z / 2, p.size.y); break;
      case "cylinder": square(p, Math.max(p.radius, p.radiusTop ?? 0), Math.max(p.radius, p.radiusTop ?? 0), p.height); break;
      case "torus": square(p, p.radius + p.tube, p.radius + p.tube, p.tube * 2); break;
      case "lathe": {
        const r = Math.max(...p.profile.map((q) => q.r));
        const ys = p.profile.map((q) => q.y);
        square(p, r, r, Math.max(...ys) - Math.min(...ys));
        break;
      }
      case "polygon": {
        push(p.points.map((q) => local(p, q.x, q.z)).map((q) => ({ x: q.x, z: q.z })), p.at.y, p.height);
        break;
      }
      case "arc": {
        const slices = Math.max(2, Math.ceil(Math.abs(p.endDeg - p.startDeg) / 12));
        for (let k = 0; k < slices; k++) {
          const a0 = rad(p.startDeg + ((p.endDeg - p.startDeg) * k) / slices), a1 = rad(p.startDeg + ((p.endDeg - p.startDeg) * (k + 1)) / slices);
          const pts = [[p.innerRadius, a0], [p.outerRadius, a0], [p.outerRadius, a1], [p.innerRadius, a1], [p.outerRadius, (a0 + a1) / 2]].map(([r, a]) => local(p, r! * Math.cos(a!), r! * Math.sin(a!)));
          push(pts, p.at.y, p.height);
        }
        break;
      }
    }
  }
  return out;
}
