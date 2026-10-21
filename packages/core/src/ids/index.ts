import type { House } from "../schema";

/**
 * Mint the next id for a prefix ("chair" → "chair_1", "chair_2", ...). Works on a draft
 * (Immer) or any mutable House. The counter lives in the house, so the same sequence of
 * ops always mints the same ids, and removed ids are never reused.
 */
export function mintId(house: House, prefix: string): string {
  const used = new Set<string>();
  for (const r of house.rooms) {
    used.add(r.id);
    for (const s of Object.values(r.sides)) for (const o of s.openings) used.add(o.id);
  }
  for (const f of house.furniture) used.add(f.id);
  let n = house.nextId[prefix] ?? 0;
  let id: string;
  do {
    n += 1;
    id = `${prefix}_${n}`;
  } while (used.has(id));
  house.nextId[prefix] = n;
  return id;
}
