import { applyPatches, enablePatches, type Patch } from "immer";
import type { House } from "../schema";

enablePatches();

export interface HistoryEntry {
  label: string;
  messages: string[];
  patches: Patch[];
  inverse: Patch[];
  at: number;
  /** Consecutive entries with the same key (keyboard nudges) merge into one undo step. */
  mergeKey?: string;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

export const MERGE_WINDOW_MS = 1000;

/** Record a committed change. Clears redo. Merges into the previous entry when keys match and it is recent. */
export function pushEntry(history: History, entry: HistoryEntry): History {
  const last = history.past.at(-1);
  if (entry.mergeKey && last && last.mergeKey === entry.mergeKey && entry.at - last.at <= MERGE_WINDOW_MS) {
    const merged: HistoryEntry = {
      ...last,
      patches: [...last.patches, ...entry.patches],
      inverse: [...entry.inverse, ...last.inverse],
      messages: entry.messages,
      at: entry.at,
    };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  return { past: [...history.past, entry], future: [] };
}

export function undo(house: House, history: History): { house: House; history: History; entry: HistoryEntry } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    house: applyPatches(house, entry.inverse),
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    entry,
  };
}

export function redo(house: House, history: History): { house: House; history: History; entry: HistoryEntry } | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    house: applyPatches(house, entry.patches),
    history: { past: [...history.past, entry], future: history.future.slice(1) },
    entry,
  };
}

/** Undo everything from entry `index` onwards ("revert to before this"). Each undone entry stays redoable. */
export function revertTo(house: House, history: History, index: number): { house: House; history: History } | null {
  if (index < 0 || index >= history.past.length) return null;
  let state = { house, history };
  while (state.history.past.length > index) {
    const u = undo(state.house, state.history);
    if (!u) return null;
    state = { house: u.house, history: u.history };
  }
  return state;
}

/** A whole-house replacement expressed as patches, so pasting a new house is undoable like any edit. */
export function replaceHouseEntry(oldHouse: House, newHouse: House, label: string, messages: string[], at: number): HistoryEntry {
  return {
    label, messages, at,
    patches: [{ op: "replace", path: [], value: newHouse }],
    inverse: [{ op: "replace", path: [], value: oldHouse }],
  };
}
