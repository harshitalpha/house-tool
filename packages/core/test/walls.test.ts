import { describe, expect, it } from "vitest";
import { buildWalls, fixtures, wallRects, type House } from "../src";

const area = (rs: { u0: number; u1: number; v0: number; v1: number }[]) =>
  rs.reduce((s, r) => s + (r.u1 - r.u0) * (r.v1 - r.v0), 0);

describe("wallRects", () => {
  it("a wall with no openings is one rectangle", () => {
    expect(wallRects(4, 2.7, [])).toEqual([{ u0: 0, u1: 4, v0: 0, v1: 2.7 }]);
  });

  it("area equals wall area minus the openings", () => {
    const rs = wallRects(5, 2.7, [
      { offset: 0.5, width: 0.9, sill: 0, height: 2.05 },
      { offset: 2.5, width: 1.8, sill: 0.9, height: 1.3 },
    ]);
    expect(area(rs)).toBeCloseTo(5 * 2.7 - 0.9 * 2.05 - 1.8 * 1.3, 9);
  });

  it("handles openings flush with both ends and floor-to-ceiling openings", () => {
    expect(area(wallRects(4, 2.7, [{ offset: 0, width: 4, sill: 0.8, height: 1.5 }]))).toBeCloseTo(4 * 2.7 - 4 * 1.5, 9);
    expect(wallRects(4, 2.7, [{ offset: 1, width: 1, sill: 0, height: 2.7 }])).toHaveLength(2);
  });

  it("clamps to a cutaway height: a high-sill window disappears below the cut", () => {
    const rs = wallRects(2, 1.2, [{ offset: 0.5, width: 0.6, sill: 1.5, height: 0.5 }]);
    expect(area(rs)).toBeCloseTo(2 * 1.2, 9); // window sits entirely above the cut: full wall remains
    expect(rs.every((r) => r.v1 <= 1.2 + 1e-9)).toBe(true);
  });

  it("clamps a window that straddles the cut", () => {
    const rs = wallRects(2, 1.2, [{ offset: 0.5, width: 1, sill: 0.9, height: 1.3 }]);
    expect(area(rs)).toBeCloseTo(2 * 1.2 - 1 * 0.3, 9);
  });
});

describe("buildWalls", () => {
  it("produces boxes for every fixture, none with zero or negative size", () => {
    for (const house of Object.values(fixtures)) {
      const boxes = buildWalls(house);
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.sx).toBeGreaterThan(0);
        expect(b.sy).toBeGreaterThan(0);
        expect(b.sz).toBeGreaterThan(0);
      }
    }
  });

  it("a full wall without openings has volume length x height x half thickness", () => {
    const h = structuredClone(fixtures.studio) as House;
    for (const s of Object.values(h.rooms[0]!.sides)) s.openings = [];
    const west = buildWalls(h).filter((b) => b.side === "west");
    expect(west).toHaveLength(1);
    expect(west[0]!.sx * west[0]!.sy * west[0]!.sz).toBeCloseTo(6 * 2.7 * 0.075, 9);
  });

  it("open sides get no wall", () => {
    const boxes = buildWalls(fixtures.openPlan);
    expect(boxes.some((b) => b.roomId === "living" && b.side === "east")).toBe(false);
    expect(boxes.some((b) => b.roomId === "dining" && b.side === "west")).toBe(false);
  });

  it("a door cuts through the neighbour's slab too", () => {
    // living.east door_2 spans z 2.4..3.3; bed1.west must be open there below 2.05 m.
    const west = buildWalls(fixtures.twoBhk).filter((b) => b.roomId === "bed1" && b.side === "west" && b.kind === "wall");
    const blocking = west.filter((b) => b.cy - b.sy / 2 < 2.0 && b.cz + b.sz / 2 > 2.4 + 1e-6 && b.cz - b.sz / 2 < 3.3 - 1e-6);
    expect(blocking).toEqual([]);
    // ...but the wall is still there beside the door.
    expect(west.some((b) => b.cz + b.sz / 2 <= 2.4 + 1e-6)).toBe(true);
  });

  it("slabs of neighbouring rooms meet with no gap and no overlap", () => {
    // living.east slab: x 5..5.075, bed1.west slab: x 5.075..5.15
    const boxes = buildWalls(fixtures.twoBhk);
    const e = boxes.find((b) => b.roomId === "living" && b.side === "east")!;
    const w = boxes.find((b) => b.roomId === "bed1" && b.side === "west")!;
    expect(e.cx + e.sx / 2).toBeCloseTo(5.075, 9);
    expect(w.cx - w.sx / 2).toBeCloseTo(5.075, 9);
  });

  it("cutaway caps wall height", () => {
    const top = Math.max(...buildWalls(fixtures.twoBhk, 1.2).filter((b) => b.kind === "wall").map((b) => b.cy + b.sy / 2));
    expect(top).toBeCloseTo(1.2, 9);
  });

  it("only north and south walls extend past the corners", () => {
    const h = structuredClone(fixtures.studio) as House; // 4.5 x 6, wall thickness 0.15
    for (const sd of Object.values(h.rooms[0]!.sides)) sd.openings = [];
    const boxes = buildWalls(h);
    const extent = (side: string, axis: "x" | "z") => {
      const bs = boxes.filter((b) => b.side === side);
      const c = axis === "x" ? "cx" : "cz", s = axis === "x" ? "sx" : "sz";
      return Math.max(...bs.map((b) => b[c] + b[s] / 2)) - Math.min(...bs.map((b) => b[c] - b[s] / 2));
    };
    expect(extent("north", "x")).toBeCloseTo(4.5 + 0.15, 9); // t/2 added at each end
    expect(extent("south", "x")).toBeCloseTo(4.5 + 0.15, 9);
    expect(extent("east", "z")).toBeCloseTo(6, 9); // no extension
    expect(extent("west", "z")).toBeCloseTo(6, 9);
  });
});
