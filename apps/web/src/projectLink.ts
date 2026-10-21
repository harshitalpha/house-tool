import { House, stableStringify } from "@house/core";
import type { useStore as Store } from "./store";

/**
 * Optional link to a house file shared with the house-mcp server (start the dev server with HOUSE_FILE=/path/house.json).
 * The page polls the file: when an AI agent changes it, the page loads the new house (undoable, camera kept).
 * User edits are written back, so the agent always sees the current house.
 */
let linked = false;
let lastMtime = 0;
let lastSyncedJson = "";

export async function pushToLinkedFile(house: House): Promise<void> {
  if (!linked) return;
  const json = stableStringify(house);
  if (json === lastSyncedJson) return;
  lastSyncedJson = json;
  const r = await fetch("/__project", { method: "POST", body: json }).then((x) => x.json() as Promise<{ mtime?: number }>).catch(() => null);
  if (r?.mtime) lastMtime = r.mtime;
}

export function startProjectLink(store: typeof Store): void {
  const read = () => fetch("/__project").then((r) => r.json() as Promise<{ enabled: boolean; mtime?: number; house?: unknown; file?: string }>).catch(() => null);
  void read().then((first) => {
    if (!first?.enabled) return;
    linked = true;
    if (first.house) {
      const parsed = House.safeParse(first.house);
      if (parsed.success) {
        lastMtime = first.mtime ?? 0;
        lastSyncedJson = stableStringify(parsed.data);
        store.getState().loadHouse(parsed.data, `Open ${first.file ?? "house file"}`);
      }
    } else void pushToLinkedFile(store.getState().house);
    setInterval(async () => {
      const cur = await read();
      if (!cur?.enabled || !cur.house || !cur.mtime || cur.mtime === lastMtime) return;
      lastMtime = cur.mtime;
      const parsed = House.safeParse(cur.house);
      if (!parsed.success) return;
      const json = stableStringify(parsed.data);
      if (json === lastSyncedJson) return;
      lastSyncedJson = json;
      store.getState().loadHouse(parsed.data, "AI edit", true);
    }, 1500);
  });
}
