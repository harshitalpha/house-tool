import { describe, expect, it } from "vitest";
import {
  House, OpBatch, applyOps, compassOf, fixtures, relativeLabel, resolveDirection, resolveOps, stableStringify,
  validateHouse, type Op, type OpInput,
} from "../src";

const base = fixtures.twoBhk;
const parseOps = (ops: OpInput[]) => OpBatch.parse({ ops }).ops;
function run(ops: OpInput[], house: House = base, ctx = {}) {
  const resolved = resolveOps(house, parseOps(ops), ctx);
  if (!resolved.ok) return { ok: false as const, errors: resolved.errors };
  return applyOps(house, resolved.ops);
}
function ok(ops: OpInput[], house: House = base, ctx = {}) {
  const r = run(ops, house, ctx);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  expect(validateHouse(r.house)).toEqual([]);
  return r;
}
const item = (h: House, id: string) => h.furniture.find((f) => f.id === id)!;
const room = (h: House, id: string) => h.rooms.find((r) => r.id === id)!;

describe("resolveDirection", () => {
  const cases: [number, string, string, string, string][] = [
    // yaw, forward, right, backward, left
    [0, "north", "east", "south", "west"],
    [90, "west", "north", "east", "south"],
    [180, "south", "west", "north", "east"],
    [270, "east", "south", "west", "north"],
  ];
  for (const [yaw, f, r, b, l] of cases) {
    it(`yaw ${yaw}`, () => {
      expect(compassOf(resolveDirection("forward", yaw))).toBe(f);
      expect(compassOf(resolveDirection("right", yaw))).toBe(r);
      expect(compassOf(resolveDirection("backward", yaw))).toBe(b);
      expect(compassOf(resolveDirection("left", yaw))).toBe(l);
    });
  }
  it("unsnapped vectors are exact, snapped ones are axis-aligned", () => {
    const [x, z] = resolveDirection("forward", 30, false);
    expect(x).toBeCloseTo(-0.5, 9);
    expect(z).toBeCloseTo(-Math.cos(Math.PI / 6), 9);
    expect(resolveDirection("forward", 30)).toEqual([0, -1]);
  });
  it("never maps two relative words to the same wall, at any yaw", () => {
    for (let y = 0; y < 360; y++) {
      const set = new Set((["forward", "right", "backward", "left"] as const).map((w) => compassOf(resolveDirection(w, y))));
      expect(set.size).toBe(4);
    }
  });
  it("labels walls relative to the camera", () => {
    expect(relativeLabel("west", 0)).toBe("on your LEFT");
    expect(relativeLabel("west", 90)).toBe("AHEAD");
  });
});

describe("resolveOps", () => {
  it("fills $selected, and maps it to a room for roomId", () => {
    const r = resolveOps(base, parseOps([{ op: "set_material", id: "$selected", color: "#b33a3a" }, { op: "add_furniture", roomId: "$selected", category: "lamp" }]), { selectedId: "sofa_1" });
    expect(r.ok && r.ops[0]).toMatchObject({ id: "sofa_1" });
    expect(r.ok && r.ops[1]).toMatchObject({ roomId: "living" });
  });
  it("errors when nothing is selected", () => {
    const r = resolveOps(base, parseOps([{ op: "remove_furniture", id: "$selected" }]));
    expect(r.ok).toBe(false);
  });
  it("turns relative directions into compass words using the camera", () => {
    const r = resolveOps(base, parseOps([{ op: "move_object_by", id: "sofa_1", direction: "left", distance: 0.5 }]), { cameraYawDeg: 90 });
    expect(r.ok && r.ops[0]).toMatchObject({ direction: "south" });
  });
  it("errors on a relative direction without a camera", () => {
    expect(resolveOps(base, parseOps([{ op: "move_object_by", id: "sofa_1", direction: "left", distance: 0.5 }])).ok).toBe(false);
  });
});

describe("furniture ops", () => {
  it("moves and clamps at the wall with an honest message", () => {
    const r = ok([{ op: "move_object_by", id: "sofa_1", direction: "west", distance: 5 }]);
    expect(item(r.house, "sofa_1").x).toBeCloseTo(1.0, 9); // half of 2.0 m width, wall at x = 0
    expect(r.messages[0]).toMatch(/stopped at the wall/);
    const free = ok([{ op: "move_object_by", id: "sofa_1", direction: "east", distance: 0.5 }]);
    expect(item(free.house, "sofa_1").x).toBeCloseTo(2.5, 9);
    expect(free.messages[0]).toBe("Moved sofa_1 0.5 m east");
  });
  it("moves to absolute coordinates", () => {
    expect(item(ok([{ op: "move_object_to", id: "sofa_1", x: 3, z: 2 }]).house, "sofa_1")).toMatchObject({ x: 3, z: 2 });
  });
  it("adds furniture with defaults, minted id, free space, and no overlap", () => {
    const r = ok([{ op: "add_furniture", roomId: "living", category: "chair" }, { op: "add_furniture", roomId: "living", category: "chair" }]);
    expect(r.house.furniture.filter((f) => f.category === "chair").map((f) => f.id)).toEqual(["chair_1", "chair_2"]);
    const [a, b] = r.house.furniture.filter((f) => f.category === "chair");
    expect(a!.x === b!.x && a!.z === b!.z).toBe(false);
  });
  it("places furniture against a wall, facing into the room", () => {
    const r = ok([{ op: "add_furniture", roomId: "bed1", category: "wardrobe", against: "east" }]);
    const w = r.house.furniture.filter((f) => f.category === "wardrobe" && f.roomId === "bed1").at(-1)!;
    expect(w.rotation).toBe(90); // front faces west, into the room
    expect(w.x + w.depth / 2).toBeCloseTo(8.65, 6); // flush with the east wall (room max x)
  });
  it("is deterministic: the same ops on the same house give identical results", () => {
    const ops: OpInput[] = [{ op: "add_furniture", roomId: "living", category: "lamp" }, { op: "add_furniture", roomId: "kitchen", category: "table" }];
    expect(stableStringify(ok(ops).house)).toBe(stableStringify(ok(ops).house));
  });
  it("rotates by and to, normalised", () => {
    expect(item(ok([{ op: "rotate_object", id: "sofa_1", degrees: -90 }]).house, "sofa_1").rotation).toBe(270);
    expect(item(ok([{ op: "rotate_object", id: "sofa_1", degrees: 450, mode: "to" }]).house, "sofa_1").rotation).toBe(90);
  });
  it("faces towards a wall or an item", () => {
    expect(item(ok([{ op: "face_towards", id: "sofa_1", target: "living.north" }]).house, "sofa_1").rotation).toBe(180);
    expect(item(ok([{ op: "face_towards", id: "sofa_1", target: "tv_1" }]).house, "sofa_1").rotation).toBe(180);
  });
  it("resizes, relabels, removes", () => {
    expect(item(ok([{ op: "resize_object", id: "sofa_1", width: 1.6 }]).house, "sofa_1").width).toBe(1.6);
    expect(item(ok([{ op: "set_label", id: "sofa_1", label: "grey sofa" }]).house, "sofa_1").label).toBe("grey sofa");
    expect(ok([{ op: "remove_furniture", id: "sofa_1" }]).house.furniture.some((f) => f.id === "sofa_1")).toBe(false);
  });
  it("lets the user mint a lamp with a free-text label", () => {
    const r = ok([{ op: "add_furniture", roomId: "living", category: "lamp", label: "reading lamp" }]);
    expect(r.house.furniture.at(-1)).toMatchObject({ category: "lamp", label: "reading lamp", id: "lamp_1" });
  });
});

describe("room ops", () => {
  it("adds a room next to another, exactly one wall thickness away", () => {
    const r = ok([{ op: "add_room", room: { name: "Study", kind: "study", width: 3, depth: 3, placeNextTo: { room: "living", side: "north" } } }]);
    const s = room(r.house, "study");
    expect(s.z).toBeCloseTo(0 - 0.15 - 3, 9);
    expect(s.x).toBe(0);
  });
  it("supports align center and end", () => {
    const end = ok([{ op: "add_room", room: { name: "Hall", width: 1, depth: 2, placeNextTo: { room: "living", side: "north", align: "end" } } }]);
    expect(room(end.house, "hall").x).toBe(4); // living ends at x = 5, hall is 1 wide
    const centre = ok([{ op: "add_room", room: { name: "Hall", width: 1, depth: 2, placeNextTo: { room: "living", side: "north", align: "center" } } }]);
    expect(room(centre.house, "hall").x).toBe(2);
  });
  it("rejects a placement that collides with a neighbour", () => {
    expect(run([{ op: "add_room", room: { name: "Hall", width: 1, depth: 2, placeNextTo: { room: "living", side: "east" } } }]).ok).toBe(false);
  });
  it("carries furniture along when a room shrinks, and keeps rotated items inside", () => {
    const r = ok([{ op: "resize_room", id: "kitchen", depth: 2.8 }]);
    expect(item(r.house, "fridge_1").z).toBeLessThanOrEqual(4.15 + 2.8 - 0.35 + 1e-9);
    expect(r.messages[0]).toMatch(/moved 1 item/);
    const rot = ok([{ op: "rotate_object", id: "sofa_1", degrees: 90 }]);
    expect(rot.messages[0]).toMatch(/shifted to stay inside/);
  });
  it("resizes, renames, moves with furniture, removes with furniture", () => {
    expect(room(ok([{ op: "resize_room", id: "kitchen", depth: 2.8 }]).house, "kitchen").depth).toBe(2.8);
    expect(room(ok([{ op: "rename_room", id: "kitchen", name: "Cook room" }]).house, "kitchen").name).toBe("Cook room");
    const moved = ok([{ op: "move_room_by", id: "bed2", direction: "south", distance: 1 }]);
    expect(room(moved.house, "bed2").z).toBe(5.15);
    expect(item(moved.house, "bed_2").z).toBeCloseTo(6.65, 9);
    const rm = ok([{ op: "remove_room", id: "bed2" }]);
    expect(rm.house.furniture.some((f) => f.roomId === "bed2")).toBe(false);
    expect(rm.messages[0]).toMatch(/and its 1 furniture item/);
  });
});

describe("opening and wall ops", () => {
  it("adds a centred window with a minted id, moves it, removes it", () => {
    const r = ok([{ op: "add_opening", wall: "bed2.west", opening: { type: "window", width: 1.0 } }]);
    const w = room(r.house, "bed2").sides.west.openings.find((o) => o.id === "window_8")!;
    expect(w.offset).toBeCloseTo(1.0, 9); // (3.0 - 1.0) / 2
    const m = ok([{ op: "move_opening", id: "window_8", offset: 0.2 }], r.house);
    expect(room(m.house, "bed2").sides.west.openings.find((o) => o.id === "window_8")!.offset).toBe(0.2);
    const d = ok([{ op: "remove_opening", id: "window_8" }], r.house);
    expect(room(d.house, "bed2").sides.west.openings.some((o) => o.id === "window_8")).toBe(false);
  });
  it("opens a wall and drops its openings", () => {
    const r = ok([{ op: "set_wall_open", wall: "bed1.east", open: true }]);
    expect(room(r.house, "bed1").sides.east).toMatchObject({ open: true, openings: [] });
  });
});

describe("set_material", () => {
  it("paints a wall, a floor, an item, and bulk targets", () => {
    expect(room(ok([{ op: "set_material", id: "living.north", color: "#b33a3a" }]).house, "living").sides.north.material).toBe("#b33a3a");
    expect(room(ok([{ op: "set_material", id: "living", color: "#112233" }]).house, "living").floor).toBe("#112233");
    expect(item(ok([{ op: "set_material", id: "sofa_1", color: "#445566" }]).house, "sofa_1").color).toBe("#445566");
    const all = ok([{ op: "set_material", id: "all_walls", color: "#ffffff" }]).house;
    expect(all.rooms.every((r) => (["north", "east", "south", "west"] as const).every((s) => r.sides[s].open || r.sides[s].material === "#ffffff"))).toBe(true);
    const own = ok([{ op: "set_material", id: "kitchen.walls", color: "#abcdef" }]).house;
    expect(room(own, "kitchen").sides.west.material).toBe("#abcdef");
    expect(room(own, "living").sides.west.material).not.toBe("#abcdef");
  });
});

describe("conversation ops", () => {
  it("clarify and answer change nothing", () => {
    const c = ok([{ op: "clarify", question: "Which sofa?", candidates: ["sofa_1", "sofa_2"] }]);
    expect(c.question).toEqual({ text: "Which sofa?", candidates: ["sofa_1", "sofa_2"] });
    expect(c.patches).toEqual([]);
    expect(ok([{ op: "answer", text: "5 m wide" }]).answer).toBe("5 m wide");
  });
});

describe("atomic batches", () => {
  it("a failing op leaves the house untouched and names the op", () => {
    const before = stableStringify(base);
    const r = run([{ op: "move_object_by", id: "sofa_1", direction: "east", distance: 0.5 }, { op: "remove_furniture", id: "nope_9" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.path).toBe("ops[1]");
      expect(r.errors[0]!.message).toMatch(/unknown id "nope_9"/);
    }
    expect(stableStringify(base)).toBe(before);
  });
  it("a batch that breaks a scene rule is rejected as a whole", () => {
    const r = run([{ op: "resize_room", id: "living", width: 8 }]); // would collide with bedroom 1
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /too close|does not fit|runs to/.test(e.message))).toBe(true);
  });
  it("later ops can use things earlier ops created", () => {
    const r = ok([
      { op: "add_room", room: { name: "Study", kind: "study", width: 3, depth: 3, placeNextTo: { room: "living", side: "north" } } },
      { op: "add_furniture", roomId: "study", category: "desk", against: "north" },
    ]);
    expect(r.house.furniture.some((f) => f.roomId === "study" && f.category === "desk")).toBe(true);
  });
  it("gives a helpful hint for an unknown id", () => {
    const r = run([{ op: "move_object_by", id: "sofa_9", direction: "east", distance: 1 }]);
    expect(!r.ok && r.errors[0]!.message).toMatch(/sofa_1/);
  });
  it("rejects bad batches at parse time", () => {
    expect(OpBatch.safeParse({ ops: [] }).success).toBe(false);
    expect(OpBatch.safeParse({ ops: [{ op: "explode" }] }).success).toBe(false);
    expect(OpBatch.safeParse({ ops: Array.from({ length: 41 }, () => ({ op: "answer", text: "x" })) }).success).toBe(false);
  });
});

describe("move_opening clamping", () => {
  it("stops at the wall end and at a neighbouring opening", async () => {
    const { sampleFlat } = await import("../src/fixtures");
    const r1 = applyOps(sampleFlat, [{ op: "move_opening", id: "door_main", offset: 50 }]);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const d = r1.house.rooms.find((r) => r.id === "drawing")!.sides.south.openings[0]!;
      expect(d.offset).toBeCloseTo(4.363 - 1.05, 3);
      expect(r1.messages[0]).toMatch(/stopped at the wall/);
    }
    expect(() => run([{ op: "move_opening", id: "door_main", offset: -3 }], sampleFlat)).toThrow(); // negative offsets are invalid input
  });
});

describe("resize_opening", () => {
  it("widens from either end and stops at neighbours", async () => {
    const { sampleFlat } = await import("../src/fixtures");
    const get = (h: typeof sampleFlat) => h.rooms.find((r) => r.id === "drawing")!.sides.south.openings[0]!;
    const start = get(sampleFlat); // offset 0.25, width 1.05, wall 4.363 long
    const a = applyOps(sampleFlat, [{ op: "resize_opening", id: "door_main", width: 2, anchor: "start" }]);
    expect(a.ok && get(a.house)).toMatchObject({ offset: 0.25, width: 2 });
    const b = applyOps(sampleFlat, [{ op: "resize_opening", id: "door_main", width: 1.2, anchor: "end" }]);
    expect(b.ok && get(b.house).offset).toBeCloseTo(start.offset + start.width - 1.2, 6);
    const c = applyOps(sampleFlat, [{ op: "resize_opening", id: "door_main", width: 99, anchor: "end" }]);
    expect(c.ok && get(c.house)).toMatchObject({ offset: 0, width: start.offset + start.width });
    const d = applyOps(sampleFlat, [{ op: "resize_opening", id: "door_main", width: 99 }]);
    expect(d.ok && get(d.house)).toMatchObject({ offset: 0, width: 4.363 });
  });
});

describe("appearance and lights", () => {
  const house = fixtures.twoBhk;
  const sofa = house.furniture.find((f) => f.category === "sofa")!;

  it("set_model picks a built-in look and rejects unknown styles", () => {
    const r = run([{ op: "set_model", id: sofa.id, name: "sofa", style: "curved" }]);
    expect(r.ok && r.house.furniture.find((f) => f.id === sofa.id)!.model).toEqual({ name: "sofa", style: "curved" });
    const bad = run([{ op: "set_model", id: sofa.id, name: "sofa", style: "wavy" }]);
    expect(bad.ok).toBe(false);
  });

  it("set_parts replaces the model and resize scales the parts", () => {
    const parts = [{ shape: "box" as const, size: { x: 1, y: 0.5, z: 0.5 }, at: { x: 0, y: 0, z: 0 } }];
    const r = run([{ op: "set_model", id: sofa.id, name: "sofa" }, { op: "set_parts", id: sofa.id, parts }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.house.furniture.find((x) => x.id === sofa.id)!;
    expect(f.model).toBeUndefined();
    expect(f.parts).toHaveLength(1);
    const r2 = applyOps(r.house, [{ op: "resize_object", id: sofa.id, width: f.width * 2 }]);
    expect(r2.ok && (r2.house.furniture.find((x) => x.id === sofa.id)!.parts![0] as { size: { x: number } }).size.x).toBeCloseTo(2, 3);
  });

  it("set_finish merges into the existing finish and handles bulk targets", () => {
    const room = house.rooms[0]!.id;
    const r = run([{ op: "set_finish", id: `${room}.north`, texture: "stripes", color: "#9db4c0" }, { op: "set_finish", id: `${room}.north`, scale: 0.25 }, { op: "set_finish", id: "all_floors", texture: "tiles" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.house.rooms[0]!.sides.north.finish).toMatchObject({ texture: "stripes", color: "#9db4c0", scale: 0.25 });
    expect(r.house.rooms.every((x) => x.floorFinish?.texture === "tiles")).toBe(true);
    expect(run([{ op: "set_finish", id: room }]).ok).toBe(false); // nothing to change
  });

  it("lights: add above furniture, update, remove; ids stay unique", () => {
    const r = run([{ op: "add_light", above: sofa.id, fixture: "pendant", intensity: 4 }, { op: "add_light", roomId: house.rooms[0]!.id, type: "spot", fixture: "downlight" }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.house.lights).toHaveLength(2);
    const [a, b] = r.house.lights;
    expect(a!.at.x).toBe(sofa.x);
    expect(a!.at.y).toBeCloseTo(2.0, 5);
    expect(a!.id).not.toBe(b!.id);
    expect(validateHouse(r.house)).toEqual([]);
    const r2 = applyOps(r.house, [{ op: "set_light", id: a!.id, color: "#ffffff", on: false }, { op: "remove_light", id: b!.id }]);
    expect(r2.ok && r2.house.lights).toHaveLength(1);
    expect(r2.ok && r2.house.lights[0]).toMatchObject({ color: "#ffffff", on: false });
    expect(run([{ op: "add_light" }]).ok).toBe(false); // no position given
  });

  it("every built-in model builds parts for every style", async () => {
    const { MODELS, partsFor } = await import("../src/models");
    for (const def of Object.values(MODELS)) for (const style of def.styles) {
      const parts = partsFor({ model: { name: def.name, style }, width: 2, depth: 1, height: 0.9 });
      expect(parts && parts.length).toBeGreaterThan(0);
    }
  });
});

describe("photo finishes", () => {
  it("set_finish accepts an uploaded image and an empty string removes it", () => {
    const room = fixtures.twoBhk.rooms[0]!.id;
    const r = run([{ op: "set_finish", id: `${room}.north`, image: "/__attachment/wallpaper-1.jpg", scale: 0.8 }]);
    expect(r.ok && r.house.rooms[0]!.sides.north.finish).toMatchObject({ image: "/__attachment/wallpaper-1.jpg", scale: 0.8 });
    if (!r.ok) return;
    const r2 = applyOps(r.house, [{ op: "set_finish", id: `${room}.north`, image: "" }]);
    expect(r2.ok && r2.house.rooms[0]!.sides.north.finish?.image).toBeUndefined();
    expect(() => run([{ op: "set_finish", id: `${room}.north`, image: "../../etc/passwd" }])).toThrow();
  });
});

describe("locking", () => {
  const flat = fixtures.sampleFlat;
  it("locked doors refuse moves, resizes and removal; unlocking restores them", () => {
    const locked = run([{ op: "set_locked", id: "all_openings", locked: true }], flat);
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    for (const op of [{ op: "move_opening", id: "door_main", offset: 1 }, { op: "resize_opening", id: "door_main", width: 1.3 }, { op: "remove_opening", id: "door_main" }] as OpInput[]) {
      const r = run([op], locked.house);
      expect(r.ok).toBe(false);
    }
    const open = run([{ op: "set_locked", id: "door_main", locked: false }, { op: "move_opening", id: "door_main", offset: 0.4 }], locked.house);
    expect(open.ok).toBe(true);
  });
  it("locks furniture too", () => {
    const id = flat.furniture[0]!.id;
    const l = run([{ op: "set_locked", id, locked: true }], flat);
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(run([{ op: "move_object_by", id, direction: "left", distance: 0.1 }], l.house).ok).toBe(false);
  });
});
