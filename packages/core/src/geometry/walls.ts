import type { House, Opening, Room, Side } from "../schema";
import { sideLength } from "./bounds";

/**
 * Wall construction. Each side of a room becomes a slab of half the wall thickness just
 * outside the room's rectangle. A wall is described in its own (u, v) frame: u runs along
 * the wall in the side's "left to right seen from inside" direction, v is height.
 * No CSG: a wall with openings is split into plain rectangles around them.
 */

export interface Cut {
  offset: number;
  width: number;
  sill: number;
  height: number;
}

export interface WallRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

const EPS = 1e-6;

export function cutOf(o: Opening): Cut {
  return { offset: o.offset, width: o.width, sill: o.type === "window" ? o.sill : 0, height: o.height };
}

/** Rectangles that tile a wall of `length` x `height` minus the openings. Clamped to `height`. */
export function wallRects(length: number, height: number, cuts: Cut[]): WallRect[] {
  const out: WallRect[] = [];
  const sorted = [...cuts].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const c of sorted) {
    const u0 = Math.max(c.offset, cursor);
    const u1 = Math.min(c.offset + c.width, length);
    if (u1 - u0 <= EPS) continue;
    if (u0 - cursor > EPS) out.push({ u0: cursor, u1: u0, v0: 0, v1: height });
    const below = Math.min(c.sill, height);
    if (below > EPS) out.push({ u0, u1, v0: 0, v1: below });
    const topOfOpening = c.sill + c.height;
    if (topOfOpening < height - EPS) out.push({ u0, u1, v0: Math.max(topOfOpening, 0), v1: height });
    cursor = u1;
  }
  if (length - cursor > EPS) out.push({ u0: cursor, u1: length, v0: 0, v1: height });
  return out;
}

/** Axis coordinate (x for north/south, z for east/west) of the point at distance u along a side. */
export function uToWorld(room: Room, side: Side, u: number): number {
  switch (side) {
    case "north": return room.x + u;
    case "south": return room.x + room.width - u;
    case "east": return room.z + u;
    case "west": return room.z + room.depth - u;
  }
}

export function worldToU(room: Room, side: Side, a: number): number {
  switch (side) {
    case "north": return a - room.x;
    case "south": return room.x + room.width - a;
    case "east": return a - room.z;
    case "west": return room.z + room.depth - a;
  }
}

const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** Position of a side's wall line on its perpendicular axis (z for north/south, x for east/west). */
export function lineOf(room: Room, side: Side): number {
  switch (side) {
    case "north": return room.z;
    case "south": return room.z + room.depth;
    case "east": return room.x + room.width;
    case "west": return room.x;
  }
}

/**
 * Cuts for one side: its own openings, plus openings of a neighbour's facing side that pass
 * through this slab too (a door belongs to one room but cuts both halves of the wall).
 */
export function effectiveCuts(house: House, room: Room, side: Side): Cut[] {
  const t = house.wallThickness;
  const length = sideLength(room, side);
  const own = room.sides[side].openings.map(cutOf);
  const cuts = [...own];
  const facing = OPPOSITE[side];
  const myLine = lineOf(room, side);
  const outward = side === "north" || side === "west" ? -1 : 1;

  for (const other of house.rooms) {
    if (other.id === room.id) continue;
    // The neighbour's facing wall line must be exactly one wall thickness away.
    if (Math.abs(lineOf(other, facing) - (myLine + outward * t)) > 1e-4) continue;
    for (const o of other.sides[facing].openings) {
      const a0 = uToWorld(other, facing, o.offset);
      const a1 = uToWorld(other, facing, o.offset + o.width);
      const u0 = Math.max(0, Math.min(worldToU(room, side, a0), worldToU(room, side, a1)));
      const u1 = Math.min(length, Math.max(worldToU(room, side, a0), worldToU(room, side, a1)));
      if (u1 - u0 <= EPS) continue;
      if (own.some((c) => c.offset < u1 - EPS && c.offset + c.width > u0 + EPS)) continue; // own opening wins
      const c = cutOf(o);
      cuts.push({ ...c, offset: u0, width: u1 - u0 });
    }
  }
  return cuts;
}

export interface WallBox {
  key: string;
  roomId: string;
  side: Side;
  kind: "wall" | "glass";
  /** Centre and size in metres, world axes (x east, y up, z south). */
  cx: number; cy: number; cz: number;
  sx: number; sy: number; sz: number;
  color: string;
}

/**
 * All wall boxes for a house. `wallHeight` caps wall height (cutaway view); defaults to each
 * room's own height. North and south walls extend by half a thickness at both ends to close the
 * outer corners; east and west walls don't, so corner tops never overlap (no z-fighting).
 */
export function buildWalls(house: House, wallHeight?: number): WallBox[] {
  const boxes: WallBox[] = [];
  const ts = house.wallThickness / 2;

  for (const room of house.rooms) {
    const H = Math.min(wallHeight ?? room.height, room.height);
    for (const side of ["north", "east", "south", "west"] as const) {
      const ws = room.sides[side];
      if (ws.open) continue;
      const length = sideLength(room, side);
      const rects = wallRects(length, H, effectiveCuts(house, room, side));
      if (side === "north" || side === "south") {
        rects.push({ u0: -ts, u1: 0, v0: 0, v1: H }, { u0: length, u1: length + ts, v0: 0, v1: H });
      }
      const line = lineOf(room, side);
      const outward = side === "north" || side === "west" ? -1 : 1;
      const mid = line + (outward * ts) / 2; // slab centre on the perpendicular axis

      const place = (r: WallRect, thickness: number, kind: "wall" | "glass", index: number): WallBox => {
        const a = uToWorld(room, side, r.u0), b = uToWorld(room, side, r.u1);
        const lo = Math.min(a, b), len = Math.abs(b - a);
        const alongX = side === "north" || side === "south";
        return {
          key: `${room.id}.${side}.${kind}.${index}`,
          roomId: room.id, side, kind,
          cx: alongX ? lo + len / 2 : mid, cz: alongX ? mid : lo + len / 2,
          cy: (r.v0 + r.v1) / 2,
          sx: alongX ? len : thickness, sz: alongX ? thickness : len, sy: r.v1 - r.v0,
          color: ws.material,
        };
      };
      rects.forEach((r, i) => boxes.push(place(r, ts, "wall", i)));

      ws.openings.forEach((o, i) => {
        if (o.type !== "window") return;
        const top = Math.min(o.sill + o.height, H);
        if (top - o.sill <= EPS) return;
        const glass = place({ u0: o.offset, u1: o.offset + o.width, v0: o.sill, v1: top }, 0.02, "glass", i);
        boxes.push({ ...glass, color: "#bfe0ff" });
      });
    }
  }
  return boxes;
}
