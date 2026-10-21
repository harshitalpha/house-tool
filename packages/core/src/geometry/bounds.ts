import type { Furniture, Room, Side } from "../schema";

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function roomRect(room: Room): Rect {
  return { minX: room.x, maxX: room.x + room.width, minZ: room.z, maxZ: room.z + room.depth };
}

/** Length of one side of the room's interior rectangle. */
export function sideLength(room: Room, side: Side): number {
  return side === "north" || side === "south" ? room.width : room.depth;
}

/** Axis-aligned bounding box of a furniture item after rotation (degrees clockwise from above). */
export function furnitureRect(f: Furniture): Rect {
  const a = (f.rotation * Math.PI) / 180;
  const hx = (Math.abs(Math.cos(a)) * f.width + Math.abs(Math.sin(a)) * f.depth) / 2;
  const hz = (Math.abs(Math.sin(a)) * f.width + Math.abs(Math.cos(a)) * f.depth) / 2;
  return { minX: f.x - hx, maxX: f.x + hx, minZ: f.z - hz, maxZ: f.z + hz };
}

export function rectContains(outer: Rect, inner: Rect, eps = 1e-6): boolean {
  return (
    inner.minX >= outer.minX - eps && inner.maxX <= outer.maxX + eps &&
    inner.minZ >= outer.minZ - eps && inner.maxZ <= outer.maxZ + eps
  );
}

/** Signed gap between two rectangles along each axis (negative = overlapping on that axis). */
export function rectGaps(a: Rect, b: Rect): { x: number; z: number } {
  return {
    x: Math.max(a.minX - b.maxX, b.minX - a.maxX),
    z: Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ),
  };
}
