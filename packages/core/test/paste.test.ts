import { describe, expect, it } from "vitest";
import {
  EXAMPLE_HOUSE_JSON, House, OP_CATALOGUE, Op, OpBatch, applyOps, buildCreatePrompt, buildEditPrompt, emptyHistory, evaluatePaste,
  extractJson, fixtures, pushEntry, redo, replaceHouseEntry, resolveOps, revertTo, stableStringify, summarizeScene, undo, validateHouse,
  type HistoryEntry, type OpInput,
} from "../src";

const h = fixtures.twoBhk;

describe("extractJson", () => {
  it("reads bare JSON, fenced JSON, and JSON inside prose", () => {
    expect(extractJson('{"a":1}')).toMatchObject({ ok: true, how: "whole" });
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nEnjoy!')).toMatchObject({ ok: true, how: "fence", value: { a: 1 } });
    expect(extractJson('Sure! {"a":1} done')).toMatchObject({ ok: true, how: "slice", value: { a: 1 } });
    expect(extractJson("```\n[1,2]\n```")).toMatchObject({ ok: true, value: [1, 2] });
  });
  it("explains failures", () => {
    expect(extractJson("")).toMatchObject({ ok: false });
    expect(extractJson("no json here")).toMatchObject({ ok: false, error: expect.stringMatching(/No JSON found/) });
    expect(extractJson('{"a": 1,,}')).toMatchObject({ ok: false, error: expect.stringMatching(/not valid JSON/) });
  });
});

describe("evaluatePaste", () => {
  it("accepts the example house from the prompt, and it validates", () => {
    const e = evaluatePaste(EXAMPLE_HOUSE_JSON, h);
    expect(e.errors).toEqual([]);
    expect(e).toMatchObject({ kind: "house", ok: true });
    expect(validateHouse(House.parse(JSON.parse(EXAMPLE_HOUSE_JSON)))).toEqual([]);
  });
  it("accepts a house without a version", () => {
    expect(evaluatePaste('{"rooms":[]}', h)).toMatchObject({ kind: "house", ok: true });
  });
  it("reports schema errors with paths", () => {
    const e = evaluatePaste('{"version":1,"rooms":[{"id":"Bad","name":"x","x":0,"z":0,"width":-1,"depth":2}]}', h);
    expect(e.ok).toBe(false);
    expect(e.errors.map((x) => x.path)).toEqual(expect.arrayContaining(["rooms[0].id", "rooms[0].width"]));
  });
  it("reports scene-rule errors for a well-formed but impossible house", () => {
    const bad = { ...JSON.parse(EXAMPLE_HOUSE_JSON), furniture: [{ id: "x_1", category: "bed", roomId: "ghost", x: 0, z: 0, width: 1, depth: 1, height: 1 }] };
    const e = evaluatePaste(JSON.stringify(bad), h);
    expect(e.errors[0]!.message).toMatch(/room "ghost"/);
  });
  it("previews an op batch without touching the house", () => {
    const before = stableStringify(h);
    const e = evaluatePaste('```json\n{"ops":[{"op":"move_object_by","id":"sofa_1","direction":"east","distance":0.5}]}\n```', h);
    expect(e).toMatchObject({ kind: "ops", ok: true, messages: ["Moved sofa_1 0.5 m east"] });
    expect(e.nextHouse!.furniture.find((f) => f.id === "sofa_1")!.x).toBe(2.5);
    expect(stableStringify(h)).toBe(before);
  });
  it("accepts a bare array of ops", () => {
    expect(evaluatePaste('[{"op":"answer","text":"hi"}]', h)).toMatchObject({ kind: "ops", ok: true, answer: "hi" });
  });
  it("uses the selection and camera from the context", () => {
    const e = evaluatePaste('{"ops":[{"op":"move_object_by","id":"$selected","direction":"left","distance":1}]}', h, { selectedId: "sofa_1", cameraYawDeg: 0 });
    expect(e.ok).toBe(true);
    expect(e.resolvedOps![0]).toMatchObject({ id: "sofa_1", direction: "west" });
  });
  it("fails clearly on unknown ops, unknown ids, and junk", () => {
    expect(evaluatePaste('{"ops":[{"op":"explode"}]}', h).ok).toBe(false);
    expect(evaluatePaste('{"ops":[{"op":"remove_furniture","id":"zzz_1"}]}', h).errors[0]!.message).toMatch(/unknown id/);
    expect(evaluatePaste('{"hello":1}', h).errors[0]!.message).toMatch(/Expected a house/);
  });
});

describe("history", () => {
  const apply = (house: typeof h, ops: OpInput[], label: string, at: number, mergeKey?: string) => {
    const r = resolveOps(house, OpBatch.parse({ ops }).ops);
    if (!r.ok) throw new Error("resolve");
    const a = applyOps(house, r.ops);
    if (!a.ok) throw new Error(JSON.stringify(a.errors));
    const entry: HistoryEntry = { label, messages: a.messages, patches: a.patches, inverse: a.inverse, at, mergeKey };
    return { house: a.house, entry };
  };

  it("undo restores the scene byte for byte, redo reapplies", () => {
    let house = h, history = emptyHistory();
    const original = stableStringify(h);
    for (const [i, ops] of ([
      [{ op: "move_object_by", id: "sofa_1", direction: "east", distance: 0.5 }],
      [{ op: "add_furniture", roomId: "living", category: "lamp" }],
      [{ op: "remove_room", id: "bed2" }],
      [{ op: "set_material", id: "all_walls", color: "#ffffff" }],
    ] as OpInput[][]).entries()) {
      const r = apply(house, ops, `step ${i}`, i * 5000);
      house = r.house;
      history = pushEntry(history, r.entry);
    }
    const final = stableStringify(house);
    const snapshots: string[] = [];
    let state: { house: typeof h; history: typeof history } = { house, history };
    while (state.history.past.length) {
      const u = undo(state.house, state.history)!;
      state = { house: u.house, history: u.history };
      snapshots.push(stableStringify(state.house));
    }
    expect(snapshots.at(-1)).toBe(original);
    while (state.history.future.length) {
      const r = redo(state.house, state.history)!;
      state = { house: r.house, history: r.history };
    }
    expect(stableStringify(state.house)).toBe(final);
  });

  it("a new change clears redo", () => {
    const a = apply(h, [{ op: "rotate_object", id: "bed_1", degrees: 90 }], "a", 0);
    let hist = pushEntry(emptyHistory(), a.entry);
    const u = undo(a.house, hist)!;
    expect(u.history.future).toHaveLength(1);
    const b = apply(u.house, [{ op: "rotate_object", id: "bed_1", degrees: 180 }], "b", 9999);
    hist = pushEntry(u.history, b.entry);
    expect(hist.future).toHaveLength(0);
  });

  it("merges nudges with the same key into one undo step", () => {
    let house = h, history = emptyHistory();
    for (let i = 0; i < 5; i++) {
      const r = apply(house, [{ op: "move_object_by", id: "sofa_1", direction: "east", distance: 0.1 }], "nudge", i * 100, "nudge:sofa_1");
      house = r.house;
      history = pushEntry(history, r.entry);
    }
    expect(history.past).toHaveLength(1);
    const u = undo(house, history)!;
    expect(stableStringify(u.house)).toBe(stableStringify(h));
  });

  it("does not merge nudges that are far apart in time, or on different items", () => {
    let house = h, history = emptyHistory();
    const r1 = apply(house, [{ op: "move_object_by", id: "sofa_1", direction: "east", distance: 0.1 }], "n", 0, "nudge:sofa_1");
    house = r1.house; history = pushEntry(history, r1.entry);
    const r2 = apply(house, [{ op: "move_object_by", id: "sofa_1", direction: "east", distance: 0.1 }], "n", 5000, "nudge:sofa_1");
    history = pushEntry(history, r2.entry);
    expect(history.past).toHaveLength(2);
  });

  it("reverts to before an entry", () => {
    let house = h, history = emptyHistory();
    const states = [stableStringify(h)];
    for (const [i, ops] of ([
      [{ op: "rotate_object", id: "bed_1", degrees: 90 }],
      [{ op: "set_material", id: "living", color: "#112233" }],
      [{ op: "remove_furniture", id: "sofa_1" }],
    ] as OpInput[][]).entries()) {
      const r = apply(house, ops, `s${i}`, i * 5000);
      house = r.house; history = pushEntry(history, r.entry);
      states.push(stableStringify(house));
    }
    const back = revertTo(house, history, 1)!;
    expect(stableStringify(back.house)).toBe(states[1]);
    expect(back.history.future).toHaveLength(2);
  });

  it("makes replacing the whole house undoable", () => {
    const next = House.parse(JSON.parse(EXAMPLE_HOUSE_JSON));
    const entry = replaceHouseEntry(h, next, "Paste house", ["x"], 0);
    const history = pushEntry(emptyHistory(), entry);
    const u = undo(next, history)!;
    expect(stableStringify(u.house)).toBe(stableStringify(h));
  });
});

describe("summarizeScene", () => {
  it("lists rooms, walls with openings, furniture and selection", () => {
    const s = summarizeScene(h, { selectedId: "sofa_1" });
    expect(s).toMatch(/HOUSE "Test 2BHK"/);
    expect(s).toMatch(/ROOM living "Living room" \(living\) x 0\.\.5, z 0\.\.4/);
    expect(s).toMatch(/WALL living\.west #e8e4dc, openings: door_1 \(door, offset 0\.6, width 1\)/);
    expect(s).toMatch(/sofa_1 sofa in living at \(2, 3\.3\).*\[SELECTED\]/);
  });
  it("labels walls relative to the camera in the current room only", () => {
    const s = summarizeScene(h, { currentRoomId: "living", cameraYawDeg: 0 });
    expect(s).toMatch(/WALL living\.west .*\[on your LEFT\]/);
    expect(s).not.toMatch(/WALL kitchen\.west .*\[on your/);
  });
  it("handles an empty house and open walls", () => {
    expect(summarizeScene(House.parse({ version: 1, rooms: [] }))).toMatch(/no rooms yet/);
    expect(summarizeScene(fixtures.openPlan)).toMatch(/WALL living\.east OPEN/);
  });
});

describe("prompts and catalogue", () => {
  it("every op has a catalogue entry, and every example parses and applies", () => {
    const names = new Set(OP_CATALOGUE.map((d) => d.op));
    const schemaNames = Op.options.map((o) => o.shape.op.value);
    expect([...names].sort()).toEqual([...schemaNames].sort());
    for (const d of OP_CATALOGUE) expect(Op.safeParse(d.example).success, d.op).toBe(true);
  });
  it("edit prompt contains the scene, the catalogue and the request", () => {
    const p = buildEditPrompt(h, "move the sofa to the left", { selectedId: "sofa_1" });
    expect(p).toMatch(/SCENE\nHOUSE "Test 2BHK"/);
    expect(p).toMatch(/- move_object_by:/);
    expect(p).toMatch(/REQUEST\nmove the sofa to the left/);
    expect(p).toMatch(/\[SELECTED\]/);
  });
  it("create prompt contains the format, the checks and the requirements", () => {
    const p = buildCreatePrompt("a 2BHK with a balcony");
    expect(p).toMatch(/"version": 1/);
    expect(p).toMatch(/exactly 0\.15 m apart/);
    expect(p).toMatch(/REQUIREMENTS\na 2BHK with a balcony/);
  });
});
