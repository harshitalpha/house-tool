import { enablePatches, produceWithPatches, type Draft, type Patch } from "immer";
import { furnitureRect, sideLength, type Rect } from "../geometry";
import { mintId } from "../ids";
import { defaultModelSize, MODELS, scaleParts } from "../models";
import { Light, Material, Room, SIDES, type Furniture, type House, type Side } from "../schema";
import { validateHouse, type ValidationIssue } from "../validator";
import { FURNITURE_DEFAULTS } from "./defaults";
import { COMPASS_VECTORS, resolveDirection, compassOf, type DirectionWord } from "./direction";
import { OpBatch, type Op, type OpName } from "./schema";

enablePatches();

export interface OpContext {
  /** Id of the selected thing (furniture, room, or "room.side" wall), for "$selected". */
  selectedId?: string | null;
  /** Camera yaw in degrees, to resolve forward/left/right. */
  cameraYawDeg?: number;
}

export interface OpError {
  path: string;
  message: string;
}

class OpFailure extends Error {
  constructor(message: string, public path?: string) { super(message); }
}

const MIN_OPENING = 0.3;

/** How far an opening may extend along its wall: from the wall end or the previous opening to the wall end or the next one. */
function openingBounds(room: Draft<House>["rooms"][number], side: Side, o: { id: string; offset: number; width: number }) {
  let lo = 0;
  let hi = sideLength(room, side);
  for (const x of room.sides[side].openings) {
    if (x.id === o.id) continue;
    if (x.offset + x.width <= o.offset + 1e-9) lo = Math.max(lo, x.offset + x.width);
    else hi = Math.min(hi, x.offset);
  }
  return { lo, hi };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(r2(n));

// ---------------------------------------------------------------------------
// resolveOps: substitute $selected, turn relative directions into compass words
// ---------------------------------------------------------------------------

const SELECTED = "$selected";
const ROOM_KEYS = new Set(["roomId"]);

function selectedRoomId(sel: string, house: House): string {
  if (sel.includes(".")) return sel.split(".")[0]!;
  const f = house.furniture.find((x) => x.id === sel);
  return f ? f.roomId : sel;
}

/** Resolve context-dependent words, so the ops that get applied and stored are fully concrete. */
export function resolveOps(house: House, ops: Op[], ctx: OpContext = {}): { ok: true; ops: Op[] } | { ok: false; errors: OpError[] } {
  const errors: OpError[] = [];
  const out = ops.map((op, i) => {
    const copy: Record<string, unknown> = structuredClone(op);
    for (const [key, value] of Object.entries(copy)) {
      if (value === SELECTED) {
        if (!ctx.selectedId) {
          errors.push({ path: `ops[${i}].${key}`, message: `"$selected" was used but nothing is selected` });
        } else {
          copy[key] = ROOM_KEYS.has(key) ? selectedRoomId(ctx.selectedId, house) : ctx.selectedId;
        }
      }
      if (key === "direction" && typeof value === "string") {
        if (value === "forward" || value === "backward" || value === "left" || value === "right") {
          if (ctx.cameraYawDeg === undefined) {
            errors.push({ path: `ops[${i}].direction`, message: `"${value}" depends on the camera, which is not available; use north/east/south/west` });
          } else {
            copy[key] = compassOf(resolveDirection(value as DirectionWord, ctx.cameraYawDeg));
          }
        }
      }
    }
    return copy as Op;
  });
  return errors.length ? { ok: false, errors } : { ok: true, ops: out };
}

// ---------------------------------------------------------------------------
// reference lookup
// ---------------------------------------------------------------------------

type Target =
  | { kind: "room"; room: Draft<House>["rooms"][number] }
  | { kind: "wall"; room: Draft<House>["rooms"][number]; side: Side }
  | { kind: "furniture"; item: Draft<House>["furniture"][number] }
  | { kind: "opening"; room: Draft<House>["rooms"][number]; side: Side }
  | { kind: "light"; light: Draft<House>["lights"][number] };

function knownIds(h: Draft<House>): string[] {
  const ids: string[] = [];
  for (const r of h.rooms) {
    ids.push(r.id);
    for (const s of SIDES) for (const o of r.sides[s].openings) ids.push(o.id);
  }
  for (const f of h.furniture) ids.push(f.id);
  for (const l of h.lights) ids.push(l.id);
  return ids;
}


function assertUnlocked(h: Draft<House>, id: string) {
  const t = findTargetSafe(h, id);
  if (t?.locked) throw new OpFailure(`${id} is locked. Unlock it first (set_locked) if the user really wants it changed.`);
}
function findTargetSafe(h: Draft<House>, id: string): { locked?: boolean } | null {
  const f = h.furniture.find((x) => x.id === id);
  if (f) return f;
  for (const r of h.rooms) for (const s of SIDES) { const o = r.sides[s].openings.find((x) => x.id === id); if (o) return o; }
  return null;
}

function unknown(h: Draft<House>, ref: string, what: string): OpFailure {
  const ids = knownIds(h);
  const close = ids.filter((id) => id.startsWith(ref.split("_")[0]!.slice(0, 3)) || ref.startsWith(id.split("_")[0]!));
  const hint = (close.length ? close : ids).slice(0, 12).join(", ");
  return new OpFailure(`unknown ${what} "${ref}". Known ids: ${hint}${ids.length > 12 && !close.length ? ", ..." : ""}`);
}

function findRoom(h: Draft<House>, id: string) {
  const r = h.rooms.find((x) => x.id === id);
  if (!r) throw unknown(h, id, "room");
  return r;
}

function parseWall(h: Draft<House>, ref: string): { room: Draft<House>["rooms"][number]; side: Side } {
  const [roomId, side] = ref.split(".");
  if (!roomId || !side || !(SIDES as readonly string[]).includes(side)) {
    throw new OpFailure(`"${ref}" is not a wall: use "<roomId>.<north|east|south|west>", e.g. "living.north"`);
  }
  return { room: findRoom(h, roomId), side: side as Side };
}

function findTarget(h: Draft<House>, ref: string): Target {
  if (ref.includes(".")) return { kind: "wall", ...parseWall(h, ref) };
  const room = h.rooms.find((r) => r.id === ref);
  if (room) return { kind: "room", room };
  const item = h.furniture.find((f) => f.id === ref);
  if (item) return { kind: "furniture", item };
  for (const r of h.rooms) for (const s of SIDES) if (r.sides[s].openings.some((o) => o.id === ref)) return { kind: "opening", room: r, side: s };
  const light = h.lights.find((l) => l.id === ref);
  if (light) return { kind: "light", light };
  throw unknown(h, ref, "id");
}

function findFurniture(h: Draft<House>, ref: string) {
  const t = findTarget(h, ref);
  if (t.kind !== "furniture") throw new OpFailure(`"${ref}" is not a furniture item`);
  return t.item;
}

// ---------------------------------------------------------------------------
// placement helpers
// ---------------------------------------------------------------------------

const overlaps = (a: Rect, b: Rect, margin = 0.02) =>
  a.minX < b.maxX - margin && a.maxX > b.minX + margin && a.minZ < b.maxZ - margin && a.maxZ > b.minZ + margin;

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(s) ? s : s ? `r_${s}` : "";
}

function normRotation(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Clamp a furniture centre so its rotated footprint stays inside the room. Returns how far it was pulled back. */
function clampInside(room: { x: number; z: number; width: number; depth: number }, f: Furniture, x: number, z: number) {
  const probe = furnitureRect({ ...f, x, z });
  const hx = (probe.maxX - probe.minX) / 2, hz = (probe.maxZ - probe.minZ) / 2;
  const cx = Math.min(Math.max(x, room.x + hx), room.x + room.width - hx);
  const cz = Math.min(Math.max(z, room.z + hz), room.z + room.depth - hz);
  return { x: cx, z: cz, clamped: Math.abs(cx - x) > 1e-9 || Math.abs(cz - z) > 1e-9 };
}

/** After a rotation or resize, pull an item back inside its room. Returns a note for the message. */
function keepInside(h: Draft<House>, f: Draft<House>["furniture"][number]): string {
  const room = findRoom(h, f.roomId);
  const c = clampInside(room, f as Furniture, f.x, f.z);
  if (!c.clamped) return "";
  f.x = r2(c.x);
  f.z = r2(c.z);
  return " (shifted to stay inside the room)";
}

/** Front faces south at rotation 0, clockwise from above: facing west = 90, north = 180, east = 270. */
const FACE_ROTATION: Record<Side, number> = { south: 0, west: 90, north: 180, east: 270 };

function findFreeSpot(h: Draft<House>, room: Draft<House>["rooms"][number], f: Furniture, candidates: [number, number][]) {
  const others = h.furniture.filter((o) => o.roomId === room.id).map((o) => furnitureRect(o));
  for (const [x, z] of candidates) {
    const c = clampInside(room, f, x, z);
    if (c.clamped) continue;
    if (!others.some((o) => overlaps(furnitureRect({ ...f, x, z }), o))) return { x, z };
  }
  return null;
}

// ---------------------------------------------------------------------------
// handlers (a missing handler is a compile error)
// ---------------------------------------------------------------------------

type Handler<K extends OpName> = (h: Draft<House>, op: Extract<Op, { op: K }>) => string[];
type Registry = { [K in OpName]: Handler<K> };

const handlers: Registry = {
  add_room(h, op) {
    const d = op.room;
    const t = h.wallThickness;
    let { x, z } = d;
    if (d.placeNextTo) {
      const ref = findRoom(h, d.placeNextTo.room);
      const { side, align } = d.placeNextTo;
      const along = (refStart: number, refLen: number, len: number) =>
        align === "start" ? refStart : align === "center" ? refStart + (refLen - len) / 2 : refStart + refLen - len;
      if (side === "east") { x = ref.x + ref.width + t; z = along(ref.z, ref.depth, d.depth); }
      else if (side === "west") { x = ref.x - t - d.width; z = along(ref.z, ref.depth, d.depth); }
      else if (side === "south") { z = ref.z + ref.depth + t; x = along(ref.x, ref.width, d.width); }
      else { z = ref.z - t - d.depth; x = along(ref.x, ref.width, d.width); }
    }
    if (x === undefined || z === undefined) throw new OpFailure("add_room needs x and z, or placeNextTo");
    let id = d.id ?? slug(d.name);
    if (!id || knownIds(h).includes(id)) id = mintId(h as House, "room");
    const { placeNextTo: _p, ...rest } = d;
    h.rooms.push(Room.parse({ ...rest, id, x, z }));
    return [`Added room "${d.name}" (${id}) ${fmt(d.width)} × ${fmt(d.depth)} m at (${fmt(x)}, ${fmt(z)})`];
  },

  remove_room(h, op) {
    const room = findRoom(h, op.id);
    const n = h.furniture.filter((f) => f.roomId === room.id).length;
    h.furniture = h.furniture.filter((f) => f.roomId !== room.id);
    h.rooms = h.rooms.filter((r) => r.id !== room.id);
    return [`Removed room ${room.id}${n ? ` and its ${n} furniture item${n > 1 ? "s" : ""}` : ""}`];
  },

  resize_room(h, op) {
    const room = findRoom(h, op.id);
    if (op.width === undefined && op.depth === undefined) throw new OpFailure("resize_room needs width and/or depth");
    if (op.width !== undefined) room.width = op.width;
    if (op.depth !== undefined) room.depth = op.depth;
    const moved = h.furniture.filter((f) => f.roomId === room.id && keepInside(h, f)).length;
    return [`Resized ${room.id} to ${fmt(room.width)} × ${fmt(room.depth)} m (north-west corner stays put)${moved ? `; moved ${moved} item${moved > 1 ? "s" : ""} to stay inside` : ""}`];
  },

  move_room_by(h, op) {
    const room = findRoom(h, op.id);
    const [vx, vz] = COMPASS_VECTORS[op.direction as Side];
    shiftRoom(h, room, vx * op.distance, vz * op.distance);
    return [`Moved ${room.id} ${fmt(op.distance)} m ${op.direction}, with its furniture`];
  },

  move_room_to(h, op) {
    const room = findRoom(h, op.id);
    shiftRoom(h, room, op.x - room.x, op.z - room.z);
    return [`Moved ${room.id} to (${fmt(op.x)}, ${fmt(op.z)}), with its furniture`];
  },

  rename_room(h, op) {
    const room = findRoom(h, op.id);
    room.name = op.name;
    return [`Renamed ${room.id} to "${op.name}"`];
  },

  add_opening(h, op) {
    const { room, side } = parseWall(h, op.wall);
    const o = op.opening;
    const len = sideLength(room as never, side);
    const id = o.id ?? mintId(h as House, o.type);
    const offset = o.offset ?? Math.max(0, (len - o.width) / 2);
    const ws = room.sides[side];
    const full =
      o.type === "door"
        ? { id, type: "door" as const, offset, width: o.width, height: o.height }
        : { id, type: "window" as const, offset, width: o.width, height: o.height, sill: o.sill };
    ws.openings.push(full);
    return [`Added ${o.type} ${id} on ${op.wall}, ${fmt(o.width)} m wide at offset ${fmt(offset)}`];
  },

  remove_opening(h, op) {
    assertUnlocked(h, op.id);
    const t = findTarget(h, op.id);
    if (t.kind !== "opening") throw new OpFailure(`"${op.id}" is not a door or window`);
    const ws = t.room.sides[t.side];
    ws.openings = ws.openings.filter((o) => o.id !== op.id);
    return [`Removed ${op.id} from ${t.room.id}.${t.side}`];
  },

  move_opening(h, op) {
    assertUnlocked(h, op.id);
    const t = findTarget(h, op.id);
    if (t.kind !== "opening") throw new OpFailure(`"${op.id}" is not a door or window`);
    const o = t.room.sides[t.side].openings.find((x) => x.id === op.id)!;
    const { lo, hi } = openingBounds(t.room, t.side, o);
    // Keep it on the wall and out of its neighbours' way (it slides, it never jumps past or overlaps another).
    const offset = Math.max(lo, Math.min(hi - o.width, op.offset));
    o.offset = offset;
    const note = Math.abs(offset - op.offset) > 1e-9 ? ` (stopped at the wall or the next opening, you asked for ${fmt(op.offset)})` : "";
    return [`Moved ${op.id} to offset ${fmt(offset)} on ${t.room.id}.${t.side}${note}`];
  },

  resize_opening(h, op) {
    assertUnlocked(h, op.id);
    const t = findTarget(h, op.id);
    if (t.kind !== "opening") throw new OpFailure(`"${op.id}" is not a door or window`);
    const o = t.room.sides[t.side].openings.find((x) => x.id === op.id)!;
    const { lo, hi } = openingBounds(t.room, t.side, o);
    const notes: string[] = [];
    if (op.width !== undefined || op.offset !== undefined) {
      const wanted = op.width ?? o.width;
      let width: number;
      let offset: number;
      if (op.anchor === "end" && op.width !== undefined) {
        const end = o.offset + o.width;
        width = Math.max(MIN_OPENING, Math.min(end - lo, wanted));
        offset = Math.round((end - width) * 1000) / 1000;
      } else {
        width = Math.max(MIN_OPENING, Math.min(hi - lo, wanted));
        offset = Math.max(lo, Math.min(hi - width, op.offset ?? o.offset));
        if (op.anchor === "start" && op.width !== undefined) width = Math.min(width, hi - o.offset), offset = o.offset;
      }
      if (op.width !== undefined && Math.abs(width - op.width) > 1e-9) notes.push(`width limited to ${fmt(width)} by the wall or the next opening`);
      o.width = width;
      o.offset = offset;
    }
    if (op.height !== undefined) {
      const sill = o.type === "window" ? o.sill : 0;
      const height = Math.max(MIN_OPENING, Math.min(t.room.height - sill, op.height));
      if (Math.abs(height - op.height) > 1e-9) notes.push(`height limited to ${fmt(height)} by the room`);
      o.height = height;
    }
    return [`Resized ${op.id}: ${fmt(o.width)} m wide x ${fmt(o.height)} m high at offset ${fmt(o.offset)}${notes.length ? ` (${notes.join("; ")})` : ""}`];
  },

  set_wall_open(h, op) {
    const { room, side } = parseWall(h, op.wall);
    const ws = room.sides[side];
    const dropped = op.open ? ws.openings.length : 0;
    ws.open = op.open;
    if (op.open) ws.openings = [];
    return [`${op.open ? "Opened" : "Closed"} ${op.wall}${dropped ? ` (its ${dropped} door/window removed)` : ""}`];
  },

  add_furniture(h, op) {
    const room = findRoom(h, op.roomId);
    const d = FURNITURE_DEFAULTS[op.category];
    const ms = op.model && !op.parts ? defaultModelSize(op.model.name, op.model.style) : null;
    if (op.model && !MODELS[op.model.name]) throw new OpFailure(`unknown model "${op.model.name}". Models: ${Object.keys(MODELS).join(", ")}. For anything else give "parts".`);
    const base: Furniture = {
      id: "pending", category: op.category, label: op.label, roomId: room.id, x: 0, z: 0,
      width: op.width ?? ms?.width ?? d.width, depth: op.depth ?? ms?.depth ?? d.depth, height: op.height ?? ms?.height ?? d.height,
      elevation: op.elevation ?? d.elevation ?? 0, rotation: op.rotation ?? 0, color: op.color ?? d.color,
      ...(op.model ? { model: op.model } : {}), ...(op.parts ? { parts: op.parts } : {}), ...(op.material ? { material: op.material } : {}),
    };
    const cx = room.x + room.width / 2, cz = room.z + room.depth / 2;
    let pos: { x: number; z: number } | null = null;
    let note = "";

    if (op.x !== undefined && op.z !== undefined) {
      pos = { x: op.x, z: op.z };
    } else if (op.against) {
      if (op.rotation === undefined) base.rotation = FACE_ROTATION[op.against === "north" ? "south" : op.against === "south" ? "north" : op.against === "east" ? "west" : "east"];
      const rect = furnitureRect({ ...base, x: 0, z: 0 });
      const hx = rect.maxX, hz = rect.maxZ;
      const candidates: [number, number][] = [];
      for (let k = 0; k <= 200; k++) {
        for (const sign of k === 0 ? [1] : [1, -1]) {
          const along = sign * k * 0.1;
          if (op.against === "north") candidates.push([cx + along, room.z + hz]);
          if (op.against === "south") candidates.push([cx + along, room.z + room.depth - hz]);
          if (op.against === "west") candidates.push([room.x + hx, cz + along]);
          if (op.against === "east") candidates.push([room.x + room.width - hx, cz + along]);
        }
      }
      pos = findFreeSpot(h, room, base, candidates);
      note = ` against the ${op.against} wall`;
    } else {
      const candidates: [number, number][] = [];
      for (let ix = 0; ix <= Math.ceil(room.width / 0.25); ix++) for (let iz = 0; iz <= Math.ceil(room.depth / 0.25); iz++) {
        candidates.push([room.x + ix * 0.25, room.z + iz * 0.25]);
      }
      candidates.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cz) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cz) ** 2));
      pos = findFreeSpot(h, room, base, candidates);
    }
    if (!pos) throw new OpFailure(`no free space for a ${op.category} in ${room.id}`);
    if (op.x !== undefined && op.z !== undefined) {
      const c = clampInside(room, base, pos.x, pos.z);
      pos = { x: c.x, z: c.z };
      if (c.clamped) note = " (moved inside the room)";
    }
    const id = mintId(h as House, op.category);
    h.furniture.push({ ...base, id, x: r2(pos.x), z: r2(pos.z) });
    return [`Added ${id}${op.label ? ` "${op.label}"` : ""} (${op.category}) in ${room.id} at (${fmt(pos.x)}, ${fmt(pos.z)})${note}`];
  },

  set_locked(h, op) {
    const all = op.id === "all_openings" || op.id === "all_doors" || op.id === "all_furniture";
    let n = 0;
    const set = (x: { locked?: boolean }) => { if (op.locked) x.locked = true; else delete x.locked; n++; };
    if (op.id === "all_furniture") h.furniture.forEach(set);
    else if (all) {
      for (const r of h.rooms) for (const s of SIDES) for (const o of r.sides[s].openings) if (op.id === "all_openings" || o.type === "door") set(o);
    } else {
      const t = findTargetSafe(h, op.id);
      if (!t) throw unknown(h, op.id, "door, window or furniture item");
      set(t);
    }
    return [`${op.locked ? "Locked" : "Unlocked"} ${all ? `${n} item${n === 1 ? "" : "s"} (${op.id})` : op.id}`];
  },

  remove_furniture(h, op) {
    assertUnlocked(h, op.id);
    const f = findFurniture(h, op.id);
    h.furniture = h.furniture.filter((x) => x.id !== f.id);
    return [`Removed ${op.id}`];
  },

  move_object_by(h, op) {
    assertUnlocked(h, op.id);
    const f = findFurniture(h, op.id);
    const room = findRoom(h, f.roomId);
    const [vx, vz] = COMPASS_VECTORS[op.direction as Side];
    const want = { x: f.x + vx * op.distance, z: f.z + vz * op.distance };
    const c = clampInside(room, f as Furniture, want.x, want.z);
    const moved = Math.hypot(c.x - f.x, c.z - f.z);
    f.x = r2(c.x);
    f.z = r2(c.z);
    return [
      c.clamped
        ? `Moved ${op.id} ${fmt(moved)} m ${op.direction} (stopped at the wall; asked for ${fmt(op.distance)} m)`
        : `Moved ${op.id} ${fmt(op.distance)} m ${op.direction}`,
    ];
  },

  move_object_to(h, op) {
    assertUnlocked(h, op.id);
    const f = findFurniture(h, op.id);
    const room = findRoom(h, f.roomId);
    const c = clampInside(room, f as Furniture, op.x, op.z);
    f.x = r2(c.x);
    f.z = r2(c.z);
    return [`Moved ${op.id} to (${fmt(c.x)}, ${fmt(c.z)})${c.clamped ? " (kept inside the room)" : ""}`];
  },

  rotate_object(h, op) {
    assertUnlocked(h, op.id);
    const f = findFurniture(h, op.id);
    f.rotation = normRotation(op.mode === "to" ? op.degrees : f.rotation + op.degrees);
    return [`Rotated ${op.id} to ${fmt(f.rotation)}°${keepInside(h, f)}`];
  },

  face_towards(h, op) {
    const f = findFurniture(h, op.id);
    const t = findTarget(h, op.target);
    let tx: number, tz: number;
    if (t.kind === "furniture") { tx = t.item.x; tz = t.item.z; }
    else if (t.kind === "room") { tx = t.room.x + t.room.width / 2; tz = t.room.z + t.room.depth / 2; }
    else if (t.kind === "wall") {
      const { x, z, width, depth } = t.room;
      [tx, tz] = t.side === "north" ? [x + width / 2, z] : t.side === "south" ? [x + width / 2, z + depth] : t.side === "west" ? [x, z + depth / 2] : [x + width, z + depth / 2];
    } else throw new OpFailure(`cannot face "${op.target}"`);
    const dir = compassOf([tx - f.x, tz - f.z]);
    f.rotation = FACE_ROTATION[dir];
    return [`Turned ${op.id} to face ${op.target} (${dir})${keepInside(h, f)}`];
  },

  resize_object(h, op) {
    assertUnlocked(h, op.id);
    const f = findFurniture(h, op.id);
    if (op.width === undefined && op.depth === undefined && op.height === undefined) throw new OpFailure("resize_object needs width, depth and/or height");
    const before = { w: f.width, d: f.depth, h: f.height };
    if (op.width !== undefined) f.width = op.width;
    if (op.depth !== undefined) f.depth = op.depth;
    if (op.height !== undefined) f.height = op.height;
    if (f.parts) f.parts = scaleParts(f.parts, f.width / before.w, f.height / before.h, f.depth / before.d);
    return [`Resized ${op.id} to ${fmt(f.width)} × ${fmt(f.depth)} × ${fmt(f.height)} m${keepInside(h, f)}`];
  },

  set_label(h, op) {
    const f = findFurniture(h, op.id);
    f.label = op.label || undefined;
    return [`Labelled ${op.id} "${op.label}"`];
  },

  set_material(h, op) {
    const msgs: string[] = [];
    const paintWalls = (room: Draft<House>["rooms"][number]) => {
      for (const s of SIDES) if (!room.sides[s].open) room.sides[s].material = op.color;
    };
    if (op.id === "all_walls") { h.rooms.forEach(paintWalls); return [`Painted all walls ${op.color}`]; }
    if (op.id === "all_floors") { h.rooms.forEach((r) => (r.floor = op.color)); return [`Set all floors to ${op.color}`]; }
    if (op.id.endsWith(".walls")) { paintWalls(findRoom(h, op.id.slice(0, -".walls".length))); return [`Painted all walls of ${op.id.slice(0, -6)} ${op.color}`]; }
    const t = findTarget(h, op.id);
    if (t.kind === "wall") { t.room.sides[t.side].material = op.color; msgs.push(`Painted ${op.id} ${op.color}`); }
    else if (t.kind === "room") { t.room.floor = op.color; msgs.push(`Set the floor of ${op.id} to ${op.color}`); }
    else if (t.kind === "furniture") { t.item.color = op.color; if (t.item.material?.color) t.item.material.color = undefined; msgs.push(`Coloured ${op.id} ${op.color}`); }
    else if (t.kind === "opening") {
      const o = t.room.sides[t.side].openings.find((x) => x.id === op.id)!;
      o.color = op.color;
      msgs.push(`Coloured ${op.id} ${op.color}`);
    }
    else if (t.kind === "light") { t.light.color = op.color; msgs.push(`Light ${op.id} is now ${op.color}`); }
    else throw new OpFailure(`cannot paint "${op.id}"`);
    return msgs;
  },

  set_finish(h, op) {
    const { op: _op, id, ...patch } = op;
    void _op;
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (!Object.keys(defined).length) throw new OpFailure("set_finish needs at least one of color, texture, scale, roughness, metalness, opacity, emissive");
    const merge = (cur: Material | undefined): Material => {
      const next: Record<string, unknown> = { ...(cur ?? {}), ...defined };
      if (next.image === "") delete next.image;
      return Material.parse(next);
    };
    const wallsOf = (room: Draft<House>["rooms"][number]) => SIDES.filter((s) => !room.sides[s].open).forEach((s) => (room.sides[s].finish = merge(room.sides[s].finish)));
    const what = Object.entries(defined).map(([k, v]) => `${k} ${v}`).join(", ");
    if (id === "all_walls") { h.rooms.forEach(wallsOf); return [`Finished all walls: ${what}`]; }
    if (id === "all_floors") { h.rooms.forEach((r) => (r.floorFinish = merge(r.floorFinish))); return [`Finished all floors: ${what}`]; }
    if (id.endsWith(".walls")) { wallsOf(findRoom(h, id.slice(0, -".walls".length))); return [`Finished all walls of ${id.slice(0, -6)}: ${what}`]; }
    const t = findTarget(h, id);
    if (t.kind === "wall") { t.room.sides[t.side].finish = merge(t.room.sides[t.side].finish); return [`Finished ${id}: ${what}`]; }
    if (t.kind === "room") { t.room.floorFinish = merge(t.room.floorFinish); return [`Finished the floor of ${id}: ${what}`]; }
    if (t.kind === "furniture") { t.item.material = merge(t.item.material); return [`Finished ${id}: ${what}`]; }
    throw new OpFailure(`cannot give "${id}" a finish; use a wall, a room (its floor) or a furniture id`);
  },

  set_model(h, op) {
    const f = findFurniture(h, op.id);
    if (op.name === "box") { delete f.model; delete f.parts; return [`${op.id} is a plain box again`]; }
    const def = MODELS[op.name];
    if (!def) throw new OpFailure(`unknown model "${op.name}". Models: ${Object.keys(MODELS).join(", ")}, or "box" for a plain box. For anything else use set_parts.`);
    if (op.style && !def.styles.includes(op.style)) throw new OpFailure(`model ${op.name} has no style "${op.style}". Styles: ${def.styles.join(", ")}`);
    f.model = { name: op.name, style: op.style ?? def.styles[0], ...(op.count ? { count: op.count } : {}) };
    delete f.parts;
    return [`${op.id} is now a ${op.name} (${f.model.style})`];
  },

  set_parts(h, op) {
    const f = findFurniture(h, op.id);
    f.parts = op.parts;
    delete f.model;
    return [`${op.id} now has ${op.parts.length} custom parts`];
  },

  add_light(h, op) {
    const { op: _op, above, roomId, ...fields } = op;
    void _op;
    let room: Draft<House>["rooms"][number] | undefined;
    let at = fields.at;
    if (above) {
      const f = findFurniture(h, above);
      room = findRoom(h, f.roomId);
      at = at ?? { x: f.x, y: room.height - (fields.fixture === "pendant" ? 0.7 : 0.01), z: f.z };
    } else if (roomId) {
      room = findRoom(h, roomId);
      at = at ?? { x: room.x + room.width / 2, y: room.height - (fields.fixture === "pendant" ? 0.7 : 0.01), z: room.z + room.depth / 2 };
    }
    if (!at) throw new OpFailure('add_light needs "at" ({x, y, z} in metres), or "above" (a furniture id), or "roomId" (centre of that room)');
    const defined = Object.fromEntries(Object.entries({ ...fields, at }).filter(([, v]) => v !== undefined));
    const id = mintId(h as House, "light");
    const light = Light.parse({ ...defined, id });
    h.lights.push(light);
    return [`Added ${id}${light.label ? ` "${light.label}"` : ""} (${light.type}, ${light.fixture}) at (${fmt(at.x)}, ${fmt(at.y ?? 0)}, ${fmt(at.z)})`];
  },

  remove_light(h, op) {
    const t = findTarget(h, op.id);
    if (t.kind !== "light") throw new OpFailure(`"${op.id}" is not a light`);
    h.lights = h.lights.filter((l) => l.id !== op.id);
    return [`Removed ${op.id}`];
  },

  set_light(h, op) {
    const t = findTarget(h, op.id);
    if (t.kind !== "light") throw new OpFailure(`"${op.id}" is not a light`);
    const { op: _op, id: _id, ...patch } = op;
    void _op; void _id;
    const defined = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (!defined.length) throw new OpFailure("set_light needs at least one field to change");
    Object.assign(t.light, Object.fromEntries(defined));
    return [`Updated ${op.id}: ${defined.map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ")}`];
  },

  clarify(_h, op) {
    return [`Question: ${op.question}${op.candidates.length ? ` (${op.candidates.join(", ")})` : ""}`];
  },

  answer(_h, op) {
    return [`Answer: ${op.text}`];
  },
};

function shiftRoom(h: Draft<House>, room: Draft<House>["rooms"][number], dx: number, dz: number) {
  room.x = r2(room.x + dx);
  room.z = r2(room.z + dz);
  for (const f of h.furniture) if (f.roomId === room.id) { f.x = r2(f.x + dx); f.z = r2(f.z + dz); }
}

// ---------------------------------------------------------------------------
// applyOps
// ---------------------------------------------------------------------------

export interface ApplyOk {
  ok: true;
  house: House;
  patches: Patch[];
  inverse: Patch[];
  messages: string[];
  /** Set when the batch asked a question instead of changing the scene. */
  question?: { text: string; candidates: string[] };
  answer?: string;
}
export interface ApplyFail {
  ok: false;
  errors: OpError[];
}

/** Apply a batch atomically: either every op succeeds and the whole scene validates, or nothing changes. */
export function applyOps(house: House, ops: Op[]): ApplyOk | ApplyFail {
  const messages: string[] = [];
  let failure: OpError | null = null;
  let result: [House, Patch[], Patch[]] | null = null;

  try {
    result = produceWithPatches(house, (draft) => {
      ops.forEach((op, i) => {
        try {
          const handler = handlers[op.op] as (h: Draft<House>, o: Op) => string[];
          messages.push(...handler(draft, op));
        } catch (e) {
          if (e instanceof OpFailure) throw Object.assign(new Error(e.message), { opIndex: i, opName: op.op });
          throw e;
        }
      });
    }) as [House, Patch[], Patch[]];
  } catch (e) {
    const err = e as Error & { opIndex?: number; opName?: string };
    if (err.opIndex === undefined) throw e;
    failure = { path: `ops[${err.opIndex}]`, message: `${err.opName}: ${err.message}` };
  }
  if (failure || !result) return { ok: false, errors: [failure!] };

  const [next, patches, inverse] = result;
  const issues: ValidationIssue[] = validateHouse(next);
  if (issues.length) {
    return { ok: false, errors: issues.map((i) => ({ path: i.path, message: `${i.message} (nothing was changed)` })) };
  }
  const q = ops.find((o) => o.op === "clarify");
  const a = ops.find((o) => o.op === "answer");
  return {
    ok: true, house: next, patches, inverse, messages,
    question: q && q.op === "clarify" ? { text: q.question, candidates: q.candidates } : undefined,
    answer: a && a.op === "answer" ? a.text : undefined,
  };
}

export { OpBatch };
