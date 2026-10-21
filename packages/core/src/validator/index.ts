import { furnitureRect, rectContains, rectGaps, roomRect, sideLength } from "../geometry";
import { SIDES, type House } from "../schema";

export interface ValidationIssue {
  path: string;
  message: string;
}

const EPS = 1e-6;

/** Whole-scene rules, run after every batch. Returns [] when the house is valid. */
export function validateHouse(house: House): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const t = house.wallThickness;

  // Unique ids across rooms, furniture and openings.
  const seen = new Map<string, string>();
  const claim = (id: string, path: string) => {
    const prev = seen.get(id);
    if (prev) add(path, `id "${id}" is already used at ${prev}`);
    else seen.set(id, path);
  };
  house.rooms.forEach((r, i) => {
    claim(r.id, `rooms[${i}].id`);
    for (const side of SIDES) r.sides[side].openings.forEach((o, j) => claim(o.id, `rooms[${i}].sides.${side}.openings[${j}].id`));
  });
  house.furniture.forEach((f, i) => claim(f.id, `furniture[${i}].id`));
  house.lights.forEach((l, i) => claim(l.id, `lights[${i}].id`));

  // Per-room checks: openings fit their side and the wall height, and don't overlap.
  house.rooms.forEach((r, i) => {
    for (const side of SIDES) {
      const ws = r.sides[side];
      const len = sideLength(r, side);
      const base = `rooms[${i}].sides.${side}`;
      if (ws.open && ws.openings.length > 0) add(`${base}.openings`, `${r.id}.${side} is open (no wall), so it cannot have doors or windows`);
      ws.openings.forEach((o, j) => {
        const p = `${base}.openings[${j}]`;
        if (o.offset + o.width > len + EPS) {
          add(p, `${o.id} runs to ${(o.offset + o.width).toFixed(2)} m but ${r.id}.${side} is only ${len.toFixed(2)} m long`);
        }
        const sill = o.type === "window" ? o.sill : 0;
        if (sill + o.height > r.height + EPS) add(p, `${o.id} reaches ${(sill + o.height).toFixed(2)} m but the room is ${r.height} m high`);
      });
      const sorted = [...ws.openings].sort((a, b) => a.offset - b.offset);
      for (let k = 1; k < sorted.length; k++) {
        const prev = sorted[k - 1]!, cur = sorted[k]!;
        if (prev.offset + prev.width > cur.offset + EPS) add(base, `${prev.id} and ${cur.id} overlap on ${r.id}.${side}`);
      }
    }
  });

  // Rooms must not overlap, and neighbours need at least one wall thickness between interiors.
  for (let i = 0; i < house.rooms.length; i++) {
    for (let j = i + 1; j < house.rooms.length; j++) {
      const a = house.rooms[i]!, b = house.rooms[j]!;
      const gap = rectGaps(roomRect(a), roomRect(b));
      if (gap.x < t - EPS && gap.z < t - EPS) {
        add(`rooms[${j}]`, `${b.id} is too close to ${a.id}: interiors must be at least the wall thickness (${t} m) apart`);
      }
    }
  }

  // Furniture belongs to a room and stays inside it.
  house.furniture.forEach((f, i) => {
    const room = house.rooms.find((r) => r.id === f.roomId);
    if (!room) {
      add(`furniture[${i}].roomId`, `${f.id} is in room "${f.roomId}", which does not exist`);
      return;
    }
    if (!rectContains(roomRect(room), furnitureRect(f))) add(`furniture[${i}]`, `${f.id} does not fit inside ${room.id}`);
    if (f.elevation + f.height > room.height + EPS) add(`furniture[${i}]`, `${f.id} is taller than the room`);
  });

  return issues;
}
