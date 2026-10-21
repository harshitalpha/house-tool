import { describe, expect, it } from "vitest";
import { z } from "zod";
import { House, Room, fixtures, mintId, stableStringify, validateHouse } from "../src";

describe("fixtures", () => {
  for (const [name, house] of Object.entries(fixtures)) {
    it(`${name} parses and passes the validator`, () => {
      expect(validateHouse(house)).toEqual([]);
    });
    it(`${name} survives a serialize → parse round trip unchanged`, () => {
      const text = stableStringify(house);
      expect(stableStringify(House.parse(JSON.parse(text)))).toBe(text);
    });
  }
});

describe("schema", () => {
  it("fills defaults so a minimal AI-written room is enough", () => {
    const room = Room.parse({ id: "hall", name: "Hall", x: 0, z: 0, width: 2, depth: 3 });
    expect(room.height).toBe(2.7);
    expect(room.sides.north).toEqual({ material: "#e8e4dc", openings: [], open: false });
    expect(room.floor).toBe("#c9b99a");
  });

  it("gives doors and windows type-specific defaults", () => {
    const room = Room.parse({
      id: "r", name: "R", x: 0, z: 0, width: 4, depth: 4,
      sides: { north: { openings: [{ id: "d", type: "door", offset: 1 }, { id: "w", type: "window", offset: 2 }] } },
    });
    const [door, win] = room.sides.north.openings;
    expect(door).toMatchObject({ type: "door", width: 0.9, height: 2.05 });
    expect(win).toMatchObject({ type: "window", width: 1.2, height: 1.2, sill: 0.9 });
  });

  it("rejects bad input with a path", () => {
    const bad = House.safeParse({ version: 1, rooms: [{ id: "Bad Id", name: "x", x: 0, z: 0, width: -1, depth: 2 }] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = bad.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("rooms.0.id");
      expect(paths).toContain("rooms.0.width");
    }
  });

  it("rejects an unknown version and a colour that is not hex", () => {
    expect(House.safeParse({ version: 2, rooms: [] }).success).toBe(false);
    expect(
      Room.safeParse({ id: "r", name: "R", x: 0, z: 0, width: 1, depth: 1, floor: "red" }).success,
    ).toBe(false);
  });

  it("emits JSON Schema without tuples (prefixItems breaks structured outputs)", () => {
    const json = JSON.stringify(z.toJSONSchema(House, { io: "input" }));
    expect(json).not.toContain("prefixItems");
  });
});

describe("validator", () => {
  const base = () => structuredClone(fixtures.twoBhk) as House;

  it("flags an opening that runs past its wall", () => {
    const h = base();
    h.rooms[0]!.sides.north.openings.push({ id: "door_9", type: "door", offset: 4.5, width: 0.9, height: 2.05 });
    expect(validateHouse(h).map((i) => i.message).join("\n")).toMatch(/door_9 runs to 5\.40 m/);
  });

  it("flags rooms closer than one wall thickness, and overlapping rooms", () => {
    const close = base();
    close.rooms[1]!.x = 5.1;
    expect(validateHouse(close).some((i) => /too close/.test(i.message))).toBe(true);
    const overlap = base();
    overlap.rooms[1]!.x = 4;
    expect(validateHouse(overlap).some((i) => /too close/.test(i.message))).toBe(true);
  });

  it("accepts rooms exactly one wall thickness apart, and diagonal neighbours", () => {
    expect(validateHouse(fixtures.twoBhk)).toEqual([]);
  });

  it("flags furniture outside its room or in a missing room", () => {
    const h = base();
    h.furniture[0]!.x = 4.9;
    h.furniture[1]!.roomId = "nowhere";
    const msgs = validateHouse(h).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/sofa_1 does not fit inside living/);
    expect(msgs).toMatch(/table_1 is in room "nowhere"/);
  });

  it("counts rotation when checking furniture fit", () => {
    const h = base();
    const bed = h.furniture.find((f) => f.id === "bed_1")!; // 1.6 x 2.0 at rotation 90 → 2.0 x 1.6
    bed.z = 3.1; // rotated: z extent 2.3..3.9 fits; unrotated it would be 2.1..4.1 and not fit
    expect(validateHouse(h).some((i) => /bed_1 does not fit/.test(i.message))).toBe(false);
    bed.x = 8.0; // x extent 7.0..9.0 > room max 8.65
    expect(validateHouse(h).some((i) => /bed_1 does not fit/.test(i.message))).toBe(true);
  });

  it("flags duplicate ids, overlapping openings, and openings on an open side", () => {
    const h = base();
    h.rooms[1]!.id = "living";
    const dup = validateHouse(h).some((i) => /already used/.test(i.message));
    expect(dup).toBe(true);

    const o = structuredClone(fixtures.openPlan) as House;
    o.rooms[0]!.sides.east.openings.push({ id: "door_8", type: "door", offset: 1, width: 0.9, height: 2.05 });
    expect(validateHouse(o).some((i) => /is open/.test(i.message))).toBe(true);

    const p = structuredClone(fixtures.studio) as House;
    p.rooms[0]!.sides.south.openings.push({ id: "door_7", type: "door", offset: 1.0, width: 0.9, height: 2.05 });
    expect(validateHouse(p).some((i) => /overlap/.test(i.message))).toBe(true);
  });

  it("flags a window taller than the wall", () => {
    const h = base();
    const win = h.rooms[3]!.sides.south.openings[0]!;
    if (win.type !== "window") throw new Error("fixture changed: expected a window");
    win.sill = 2.5;
    expect(validateHouse(h).some((i) => /reaches/.test(i.message))).toBe(true);
  });
});

describe("ids", () => {
  it("mints deterministically from the counter and never reuses an id", () => {
    const a = structuredClone(fixtures.studio) as House;
    const b = structuredClone(fixtures.studio) as House;
    expect(mintId(a, "chair")).toBe("chair_1");
    expect(mintId(a, "chair")).toBe("chair_2");
    expect(mintId(b, "chair")).toBe("chair_1");
    a.furniture = a.furniture.filter((f) => f.id !== "bed_1"); // removed ids are not reused
    expect(mintId(a, "bed")).toBe("bed_2");
  });

  it("skips ids that already exist even if the counter is behind", () => {
    const h = structuredClone(fixtures.studio) as House;
    h.nextId = {};
    expect(mintId(h, "bed")).toBe("bed_2");
  });
});

describe("stableStringify", () => {
  it("is independent of key order", () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe(stableStringify({ a: { c: 2, d: 1 }, b: 1 }));
  });
});

import { sampleFlat } from "../src/fixtures";
import { validateHouse as validateFlat } from "../src/validator";
describe("sample flat fixture", () => {
  it("is a valid house", () => {
    expect(validateFlat(sampleFlat)).toEqual([]);
  });
});
