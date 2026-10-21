import type { House } from "../schema";
import { SIDES } from "../schema";
import { roomRect, type Rect } from "./bounds";
import { furnitureFootprints } from "./footprints";
import { buildWalls, lineOf, uToWorld } from "./walls";

/** Radius of the walking person, metres. */
export const WALK_RADIUS = 0.28;
/** Body spans from just above the floor to head height; things entirely above (lintels) don't block. */
const BODY_MIN = 0.05;
const BODY_MAX = 1.8;

/** Everything a walking person cannot pass: walls and glass at body height, plus furniture they would bump into. */
export function walkBlockers(house: House): Rect[] {
  const rects: Rect[] = buildWalls(house)
    .filter((b) => b.cy - b.sy / 2 < BODY_MAX && b.cy + b.sy / 2 > BODY_MIN)
    .map((b) => ({ minX: b.cx - b.sx / 2, maxX: b.cx + b.sx / 2, minZ: b.cz - b.sz / 2, maxZ: b.cz + b.sz / 2 }));
  for (const f of house.furniture) {
    // Each part blocks if it overlaps the body's height range and is not just a low rug-sized thing.
    for (const fp of furnitureFootprints(f)) {
      if (fp.y0 < BODY_MAX && fp.y1 > 0.3) rects.push({ minX: fp.minX, maxX: fp.maxX, minZ: fp.minZ, maxZ: fp.maxZ });
    }
  }
  return rects;
}

export function isBlocked(blockers: Rect[], x: number, z: number, radius = WALK_RADIUS): boolean {
  return blockers.some((r) => x > r.minX - radius && x < r.maxX + radius && z > r.minZ - radius && z < r.maxZ + radius);
}

/** Move by (dx, dz), sliding along obstacles: each axis is tried on its own. */
export function moveWithCollision(
  blockers: Rect[], from: { x: number; z: number }, dx: number, dz: number, radius = WALK_RADIUS,
): { x: number; z: number } {
  let { x, z } = from;
  if (!isBlocked(blockers, x + dx, z, radius)) x += dx;
  if (!isBlocked(blockers, x, z + dz, radius)) z += dz;
  return { x, z };
}

/** A free standing spot in a room (nearest its centre), for starting a walkthrough. */
export function findSpawn(house: House, roomId?: string, radius = WALK_RADIUS): { x: number; z: number } {
  const room = house.rooms.find((r) => r.id === roomId) ?? house.rooms[0];
  if (!room) return { x: 0, z: 0 };
  const blockers = walkBlockers(house);
  const cx = room.x + room.width / 2, cz = room.z + room.depth / 2;
  const step = 0.2;
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (let x = room.x + radius; x <= room.x + room.width - radius + 1e-9; x += step) {
    for (let z = room.z + radius; z <= room.z + room.depth - radius + 1e-9; z += step) {
      if (isBlocked(blockers, x, z, radius)) continue;
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < bestD) { bestD = d; best = { x, z }; }
    }
  }
  return best ?? { x: cx, z: cz };
}

export interface WalkStart {
  x: number;
  z: number;
  /** Radians. 0 looks north (-Z); matches the camera yaw convention used everywhere. */
  yaw: number;
}

const OUTWARD = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;

/**
 * The main entrance: the first door on an outside wall (nothing on the other side).
 * Returns a spot `distance` metres outside it, facing in, so a walkthrough starts at the door.
 */
export function findEntrance(house: House, distance = 1.2): WalkStart | null {
  const t = house.wallThickness;
  for (const room of house.rooms) {
    for (const side of SIDES) {
      const ws = room.sides[side];
      if (ws.open) continue;
      const [nx, nz] = OUTWARD[side];
      for (const o of ws.openings) {
        if (o.type !== "door") continue;
        const a = uToWorld(room, side, o.offset + o.width / 2); // along the wall
        const line = lineOf(room, side);
        const alongX = side === "north" || side === "south";
        const at = (d: number) => ({ x: alongX ? a : line + nx * d, z: alongX ? line + nz * d : a });
        const probe = at(t + 0.3);
        const inside = house.rooms.some((r) => {
          const rr = roomRect(r);
          return probe.x > rr.minX && probe.x < rr.maxX && probe.z > rr.minZ && probe.z < rr.maxZ;
        });
        if (inside) continue; // leads to another room, not outdoors
        const p = at(distance);
        return { x: p.x, z: p.z, yaw: Math.atan2(nx, nz) }; // facing inward = -outward: atan2(-(-nx), -(-nz))
      }
    }
  }
  return null;
}
