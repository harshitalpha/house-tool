import {
  OpBatch, SIDES, applyOps, emptyHistory, fixtures, pushEntry, redo as redoHistory, replaceHouseEntry, resolveOps,
  revertTo as revertHistory, undo as undoHistory,
  type ApplyOk, type House, type History, type OpInput, type PasteEvaluation,
} from "@house/core";
import { create } from "zustand";
import { cameraYaw } from "./cameraState";
import { loadSaved, pushBackup, saveHouse } from "./persistence";

export type Tab = "paste" | "prompt" | "inspect" | "history" | "feedback";

export interface FeedbackComment {
  id: number;
  /** What the comment is about: furniture ids, room ids, "room.side" walls, opening ids; empty for the whole house. */
  targetIds: string[];
  text: string;
  /** Reference photos attached to the comment (wallpaper, fabric, a colour they like). */
  images: { url: string; name: string; file: string; colors: string[] }[];
}

export interface Notice {
  id: number;
  kind: "info" | "error";
  lines: string[];
}

export type RunResult = { ok: true; messages: string[] } | { ok: false; errors: string[] };

interface State {
  house: House;
  history: History;
  selectedId: string | null;
  /** Bumps when a different house is loaded, so the camera re-frames it. */
  viewKey: number;
  notice: Notice | null;
  tab: Tab;
  /** True while a door/window is being dragged, so the camera controls stay still. */
  dragging: boolean;
  /** Night view: daylight off, lights on. */
  night: boolean;
  setNight(on: boolean): void;
  /** Soft ambient occlusion, bloom and filmic tone mapping. Off for slow machines. */
  realistic: boolean;
  traceOpen: boolean;
  setTraceOpen(on: boolean): void;
  setRealistic(on: boolean): void;
  /** Comments waiting to be sent to Claude. */
  comments: FeedbackComment[];
  addComment(targetIds: string[], text: string, images?: FeedbackComment["images"]): void;
  removeComment(id: number): void;
  clearComments(): void;
  /** Items picked for the next feedback comment (click to add or remove while the Feedback tab is open). */
  fbTargets: string[];
  clearFbTargets(): void;
  removeFbTarget(id: string): void;

  setDragging(on: boolean): void;
  setTab(tab: Tab): void;
  select(id: string | null, fromClick?: boolean): void;
  notify(kind: Notice["kind"], lines: string[]): void;
  /** Run ops built in code (inspector, keyboard). Resolves, applies atomically, records history. */
  runOps(ops: OpInput[], opts?: { label?: string; mergeKey?: string }): RunResult;
  /** Commit a successful paste evaluation. */
  commitEvaluation(ev: PasteEvaluation, label?: string): boolean;
  /** Replace the whole house (examples, load file, new). Undoable. */
  loadHouse(house: House, label: string, keepView?: boolean): void;
  undo(): void;
  redo(): void;
  revertTo(index: number): void;
}

function exists(house: House, id: string | null): boolean {
  if (!id) return false;
  if (id.includes(".")) {
    const [room, side] = id.split(".");
    return house.rooms.some((r) => r.id === room) && (SIDES as readonly string[]).includes(side!);
  }
  return house.rooms.some((r) => r.id === id) || house.furniture.some((f) => f.id === id) || house.lights.some((l) => l.id === id) || house.rooms.some((r) => SIDES.some((sd) => r.sides[sd].openings.some((o) => o.id === id)));
}

let noticeCounter = 0;
let commentCounter = 0;
const errorLines = (errors: { path: string; message: string }[]) => errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message));

export const emptyHouse = (): House => ({ version: 1, name: "New house", wallThickness: 0.15, rooms: [], furniture: [], lights: [], nextId: {} });

export const useStore = create<State>((set, get) => ({
  house: loadSaved() ?? fixtures.twoBhk,
  history: emptyHistory(),
  selectedId: null,
  dragging: false,
  night: false,
  setNight: (on) => set({ night: on }),
  traceOpen: false,
  setTraceOpen: (on) => set({ traceOpen: on }),
  realistic: localStorage.getItem("house-tool:realistic") !== "0",
  setRealistic: (on) => { localStorage.setItem("house-tool:realistic", on ? "1" : "0"); set({ realistic: on }); },
  comments: [],
  addComment: (targetIds, text, images = []) => set((s) => ({ comments: [...s.comments, { id: ++commentCounter, targetIds, text, images }] })),
  fbTargets: [],
  clearFbTargets: () => set({ fbTargets: [], selectedId: null }),
  removeFbTarget: (id) => set((s) => { const base = s.fbTargets.length ? s.fbTargets : s.selectedId ? [s.selectedId] : []; const next = base.filter((x) => x !== id); return { fbTargets: next, selectedId: next.length ? next[next.length - 1]! : null }; }),
  removeComment: (id) => set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
  clearComments: () => set({ comments: [] }),
  setDragging: (on) => set({ dragging: on }),
  viewKey: 0,
  notice: null,
  tab: "paste",

  setTab: (tab) => set({ tab }),
  select: (id, fromClick = false) => set((s) => {
    // While commenting, clicking toggles an item in or out of the picked set (multi-select).
    if (id && fromClick && s.tab === "feedback") {
      const base = s.fbTargets.length ? s.fbTargets : s.selectedId ? [s.selectedId] : [];
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      return { fbTargets: next, selectedId: next.length ? next[next.length - 1]! : null };
    }
    return { selectedId: id, fbTargets: s.tab === "feedback" && id === null ? [] : s.fbTargets, tab: id && fromClick && s.tab !== "feedback" ? "inspect" : s.tab };
  }),
  notify: (kind, lines) => set({ notice: { id: ++noticeCounter, kind, lines } }),

  runOps(ops, opts = {}) {
    const { house, selectedId } = get();
    const parsed = OpBatch.safeParse({ ops });
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message);
      get().notify("error", errors);
      return { ok: false, errors };
    }
    const resolved = resolveOps(house, parsed.data.ops, { selectedId, cameraYawDeg: cameraYaw.deg });
    if (!resolved.ok) {
      const errors = errorLines(resolved.errors);
      get().notify("error", errors);
      return { ok: false, errors };
    }
    const applied = applyOps(house, resolved.ops);
    if (!applied.ok) {
      const errors = errorLines(applied.errors);
      get().notify("error", errors);
      return { ok: false, errors };
    }
    commit(applied, opts.label ?? "Edit", opts.mergeKey);
    return { ok: true, messages: applied.messages };
  },

  commitEvaluation(ev, label) {
    if (!ev.ok || !ev.nextHouse) return false;
    const { house } = get();
    if (ev.kind === "house") {
      get().loadHouse(ev.nextHouse, label ?? "Paste house");
      return true;
    }
    if (ev.result) commit(ev.result, label ?? "Paste ops");
    return true;
  },

  loadHouse(next, label, keepView = false) {
    const { house, history } = get();
    pushBackup(house, label);
    const entry = replaceHouseEntry(house, next, label, [`${label}: "${next.name}", ${next.rooms.length} rooms, ${next.furniture.length} items`], Date.now());
    set((s) => ({ house: next, history: pushEntry(history, entry), selectedId: keepView && exists(next, s.selectedId) ? s.selectedId : null, viewKey: keepView ? s.viewKey : s.viewKey + 1 }));
    get().notify("info", entry.messages);
  },

  undo() {
    const { house, history } = get();
    const u = undoHistory(house, history);
    if (!u) return get().notify("info", ["Nothing to undo"]);
    set((s) => ({ house: u.house, history: u.history, selectedId: exists(u.house, s.selectedId) ? s.selectedId : null, viewKey: u.entry.label.startsWith("Load") || u.entry.label.startsWith("Paste house") ? s.viewKey + 1 : s.viewKey }));
    get().notify("info", [`Undid: ${u.entry.label}`]);
  },

  redo() {
    const { house, history } = get();
    const r = redoHistory(house, history);
    if (!r) return get().notify("info", ["Nothing to redo"]);
    set((s) => ({ house: r.house, history: r.history, selectedId: exists(r.house, s.selectedId) ? s.selectedId : null }));
    get().notify("info", [`Redid: ${r.entry.label}`]);
  },

  revertTo(index) {
    const { house, history } = get();
    const r = revertHistory(house, history, index);
    if (!r) return;
    set((s) => ({ house: r.house, history: r.history, selectedId: exists(r.house, s.selectedId) ? s.selectedId : null, viewKey: s.viewKey + 1 }));
    get().notify("info", ["Reverted to before that change (Redo brings it back)"]);
  },
}));

function commit(applied: ApplyOk, label: string, mergeKey?: string) {
  const { history, selectedId } = useStore.getState();
  if (applied.patches.length === 0) {
    // clarify / answer: nothing changed
    useStore.getState().notify("info", applied.messages);
    return;
  }
  const entry = { label, messages: applied.messages, patches: applied.patches, inverse: applied.inverse, at: Date.now(), mergeKey };
  useStore.setState({
    house: applied.house,
    history: pushEntry(history, entry),
    selectedId: exists(applied.house, selectedId) ? selectedId : null,
  });
  useStore.getState().notify("info", applied.messages);
}

import { pushToLinkedFile } from "./projectLink";

// Autosave (debounced) whenever the house changes.
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.house === prev.house) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    saveHouse(s.house);
    // Mirror to disk (dev server) so the Claude Code session and a file backup always have the live house.
    fetch("/__house", { method: "POST", body: JSON.stringify(s.house) }).catch(() => undefined);
    pushToLinkedFile(s.house);
  }, 300);
});
