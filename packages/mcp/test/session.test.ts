import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Session } from "../src/session";

const tmp = () => new Session(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "house-mcp-")), "house.json"));

describe("Session", () => {
  it("builds a room from blank, adds furniture, and undoes", () => {
    const s = tmp();
    expect(s.create("blank").ok).toBe(true);
    const room = s.apply([{ op: "add_room", room: { name: "Living", kind: "living", x: 0, z: 0, width: 5, depth: 4 } }]);
    expect(room.ok).toBe(true);
    const sofa = s.apply([{ op: "add_furniture", roomId: "living", category: "sofa", against: "south" }]);
    expect(sofa.ok).toBe(true);
    expect(s.get("summary").text).toContain("sofa");
    expect(s.undo().ok).toBe(true);
    expect(s.get("summary").text).not.toContain("sofa");
    expect(s.validate().ok).toBe(true);
  });

  it("rejects bad ops without changing the file", () => {
    const s = tmp();
    s.create("studio");
    const before = fs.readFileSync(s.file, "utf8");
    expect(s.apply([{ op: "nonsense" }]).ok).toBe(false);
    expect(s.apply([{ op: "remove_furniture", id: "ghost" }]).ok).toBe(false);
    expect(fs.readFileSync(s.file, "utf8")).toBe(before);
  });

  it("dry run saves nothing", () => {
    const s = tmp();
    s.create("studio");
    const before = fs.readFileSync(s.file, "utf8");
    const r = s.apply([{ op: "add_furniture", roomId: s.load().rooms[0]!.id, category: "lamp" }], true);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(s.file, "utf8")).toBe(before);
  });
});
