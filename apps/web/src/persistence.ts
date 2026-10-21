import { House, evaluatePaste, stableStringify, validateHouse } from "@house/core";

const KEY = "house-tool:house:v1";

/** The autosaved house, if there is one and it still validates. */
export function loadSaved(): House | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = House.safeParse(JSON.parse(text));
    if (!parsed.success || validateHouse(parsed.data).length) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveHouse(house: House): void {
  try {
    localStorage.setItem(KEY, stableStringify(house));
  } catch {
    /* storage full or unavailable: autosave is best effort */
  }
}

export function downloadHouse(house: House): void {
  const slug = house.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "house";
  const url = URL.createObjectURL(new Blob([stableStringify(house)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a saved house file. Errors come back as readable strings. */
export async function readHouseFile(file: File, current: House): Promise<{ house: House } | { errors: string[] }> {
  const ev = evaluatePaste(await file.text(), current);
  if (ev.kind === "house" && ev.ok && ev.nextHouse) return { house: ev.nextHouse };
  if (ev.kind === "ops") return { errors: ["That file contains edit operations, not a house. Use the Paste tab for those."] };
  return { errors: ev.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)) };
}

const BACKUPS = "house-tool:backups:v1";
const MAX_BACKUPS = 12;

export interface Backup {
  at: number;
  reason: string;
  house: House;
}

export function listBackups(): Backup[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BACKUPS) ?? "[]") as { at: number; reason: string; house: unknown }[];
    return raw.flatMap((b) => {
      const parsed = House.safeParse(b.house);
      return parsed.success ? [{ at: b.at, reason: b.reason, house: parsed.data }] : [];
    });
  } catch {
    return [];
  }
}

/** Keep the house that is about to be replaced (example, paste, new, load), newest first. */
export function pushBackup(house: House, reason: string): void {
  if (!house.rooms.length) return;
  try {
    const list = listBackups();
    if (list[0] && stableStringify(list[0].house) === stableStringify(house)) return;
    const next = [{ at: Date.now(), reason, house }, ...list].slice(0, MAX_BACKUPS);
    localStorage.setItem(BACKUPS, JSON.stringify(next));
  } catch {
    /* best effort */
  }
}
