import { describe, expect, it } from "vitest";
import { fixtures, findEntrance, findSpawn, isBlocked, moveWithCollision, walkBlockers } from "../src";

/** Walk in small steps like the frame loop does. */
function walk(house: Parameters<typeof walkBlockers>[0], start: { x: number; z: number }, dx: number, dz: number, steps: number) {
  const blockers = walkBlockers(house);
  let p = start;
  for (let i = 0; i < steps; i++) p = moveWithCollision(blockers, p, dx, dz);
  return p;
}

describe("walking", () => {
  const h = fixtures.twoBhk;

  it("cannot walk through an outer wall", () => {
    const end = walk(h, { x: 1.0, z: 1.5 }, -0.05, 0, 100);
    expect(end.x).toBeGreaterThan(0.2); // west wall is at x = 0
  });

  it("cannot walk through a wall that has a window", () => {
    const end = walk(h, { x: 1.9, z: 1.0 }, 0, -0.05, 100); // window spans x 1.0..2.8 on the north wall
    expect(end.z).toBeGreaterThan(0.1);
  });

  it("can walk through a doorway into the next room", () => {
    // living.east door_2 spans z 2.4..3.3 and is 0.9 m wide; the walker is 0.56 m wide.
    const end = walk(h, { x: 4.2, z: 2.85 }, 0.05, 0, 40);
    expect(end.x).toBeGreaterThan(5.5); // past the wall (x 5.0..5.15) and into bedroom 1
  });

  it("cannot squeeze through a gap narrower than the walker", () => {
    const narrow = structuredClone(h);
    narrow.rooms[0]!.sides.east.openings[0]!.width = 0.4;
    const end = walk(narrow, { x: 4.2, z: 2.8 }, 0.05, 0, 40);
    expect(end.x).toBeLessThan(5.0);
  });

  it("slides along a wall instead of stopping dead", () => {
    const blockers = walkBlockers(h);
    const p = moveWithCollision(blockers, { x: 0.3, z: 1.5 }, -0.05, 0.05);
    expect(p.z).toBeCloseTo(1.55, 9); // blocked in x, free in z
  });

  it("is blocked by furniture at body height, but walks under a high shelf", () => {
    expect(isBlocked(walkBlockers(h), 2.0, 3.3)).toBe(true); // sofa
    const withShelf = structuredClone(h);
    withShelf.furniture.push({
      id: "shelf_1", category: "shelf", roomId: "living", x: 1.0, z: 1.0, width: 1.0, depth: 0.3,
      height: 0.3, elevation: 1.9, rotation: 0, color: "#8d8d8d",
    });
    expect(isBlocked(walkBlockers(withShelf), 1.0, 1.0)).toBe(false);
  });

  it("walks under a lintel but is stopped by the wall beside the door", () => {
    // Beside the doorway (door spans z 2.4..3.3) the wall is solid.
    const end = walk(h, { x: 4.2, z: 1.5 }, 0.05, 0, 40);
    expect(end.x).toBeLessThan(5.0);
  });

  it("spawns every room's walker in free space inside the room", () => {
    for (const house of Object.values(fixtures)) {
      const blockers = walkBlockers(house);
      for (const room of house.rooms) {
        if (Math.min(room.width, room.depth) < 0.8) continue; // a strip narrower than the walker has no free spot
        const p = findSpawn(house, room.id);
        expect(isBlocked(blockers, p.x, p.z)).toBe(false);
        expect(p.x).toBeGreaterThan(room.x);
        expect(p.x).toBeLessThan(room.x + room.width);
        expect(p.z).toBeGreaterThan(room.z);
        expect(p.z).toBeLessThan(room.z + room.depth);
      }
    }
  });
});

describe("entrance", () => {
  it("finds the main door on an outside wall, outside it, facing in", () => {
    const e = findEntrance(fixtures.twoBhk)!; // living.west door_1: offset 0.6, width 1.0 → z 2.9
    expect(e.x).toBeCloseTo(-1.2, 9);
    expect(e.z).toBeCloseTo(2.9, 9);
    expect(Math.sin(e.yaw)).toBeCloseTo(-1, 9); // forward = (-sin yaw, -cos yaw) = east (+x)
    expect(Math.cos(e.yaw)).toBeCloseTo(0, 9);
  });

  it("skips doors that lead to another room", () => {
    // living.east door_2 (to bedroom 1) comes before no outside door only if it were wrongly accepted
    const e = findEntrance(fixtures.twoBhk)!;
    expect(e.x).toBeLessThan(0);
  });

  it("works for every fixture and the start is in free space", () => {
    for (const house of Object.values(fixtures)) {
      const e = findEntrance(house)!;
      expect(e).not.toBeNull();
      expect(isBlocked(walkBlockers(house), e.x, e.z)).toBe(false);
    }
  });

  it("faces north for a door on the south wall", () => {
    const e = findEntrance(fixtures.studio)!; // studio.south door_1
    expect(e.z).toBeCloseTo(6 + 1.2, 9);
    expect(Math.abs(e.yaw)).toBeCloseTo(0, 9);
  });

  it("walking straight ahead from the entrance goes through the door into the house", () => {
    const h = fixtures.twoBhk;
    const e = findEntrance(h)!;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const blockers = walkBlockers(h);
    let p = { x: e.x, z: e.z };
    for (let i = 0; i < 60; i++) p = moveWithCollision(blockers, p, fx * 0.05, fz * 0.05);
    expect(p.x).toBeGreaterThan(0.3); // past the west wall at x = 0
  });

  it("returns null when there is no outside door", () => {
    const h = structuredClone(fixtures.studio);
    h.rooms[0]!.sides.south.openings = [];
    expect(findEntrance(h)).toBeNull();
  });
});

describe("part-accurate collision", () => {
  it("an L sofa blocks its seat but not the empty corner of its bounding box", async () => {
    const { House } = await import("../src");
    const house = House.parse({
      version: 1, name: "t",
      rooms: [{ id: "r", name: "R", x: 0, z: 0, width: 6, depth: 6 }],
      furniture: [{ id: "sofa_1", category: "sofa", roomId: "r", x: 3, z: 3, width: 3, depth: 2, height: 0.85, color: "#888888", model: { name: "sofa", style: "l_right" } }],
    });
    const blockers = walkBlockers(house);
    // l_right at rotation 0: back along the north edge, chaise along the east end. Its south-west corner is empty.
    expect(isBlocked(blockers, 1.7, 3.9, 0.05)).toBe(false); // empty front-left of the bounding box
    expect(isBlocked(blockers, 3, 2.2, 0.05)).toBe(true); // the straight run
    expect(isBlocked(blockers, 4.3, 3.9, 0.05)).toBe(true); // the chaise
  });
});
