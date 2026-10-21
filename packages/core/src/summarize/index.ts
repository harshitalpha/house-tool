import { SIDES, type House, type Material } from "../schema";
import { relativeLabel } from "../ops/direction";

export interface SummaryContext {
  selectedId?: string | null;
  /** Room the user is in (walk mode) or looking at; "the left wall" is ambiguous without it. */
  currentRoomId?: string | null;
  cameraYawDeg?: number;
}

const m = (n: number) => String(Math.round(n * 100) / 100);
const finishText = (f: Material | undefined) => (f ? ` [${[f.image ? `photo ${f.image}` : f.texture !== "plain" ? f.texture : "", f.color ?? ""].filter(Boolean).join(" ")}${f.image || f.texture !== "plain" ? `, scale ${m(f.scale)}` : ""}]` : "");

/** Compact text view of the scene for the prompt. Template-based, so it always matches the data. */
export function summarizeScene(house: House, ctx: SummaryContext = {}): string {
  const lines: string[] = [];
  lines.push(`HOUSE "${house.name}" (metres; north = -Z, east = +X; wall thickness ${m(house.wallThickness)})`);
  if (!house.rooms.length) lines.push("(no rooms yet)");
  for (const r of house.rooms) {
    const tags = [r.id === ctx.currentRoomId ? "CURRENT ROOM" : "", r.id === ctx.selectedId ? "SELECTED floor" : ""].filter(Boolean);
    lines.push(
      `ROOM ${r.id} "${r.name}" (${r.kind}) x ${m(r.x)}..${m(r.x + r.width)}, z ${m(r.z)}..${m(r.z + r.depth)} (${m(r.width)} x ${m(r.depth)} m, height ${m(r.height)}), floor ${r.floor}${finishText(r.floorFinish)}${tags.length ? `  [${tags.join(", ")}]` : ""}`,
    );
    for (const s of SIDES) {
      const ws = r.sides[s];
      const id = `${r.id}.${s}`;
      const view = ctx.cameraYawDeg !== undefined && r.id === ctx.currentRoomId ? `  [${relativeLabel(s, ctx.cameraYawDeg)}]` : "";
      const sel = id === ctx.selectedId ? "  [SELECTED]" : "";
      if (ws.open) { lines.push(`  WALL ${id} OPEN (no wall)${view}`); continue; }
      const ops = ws.openings.map((o) => `${o.id} (${o.type}, offset ${m(o.offset)}, width ${m(o.width)}${o.type === "window" ? `, sill ${m(o.sill)}` : ""})`);
      lines.push(`  WALL ${id} ${ws.material}${finishText(ws.finish)}${ops.length ? `, openings: ${ops.join("; ")}` : ""}${view}${sel}`);
    }
  }
  if (house.furniture.length) lines.push("FURNITURE");
  for (const f of house.furniture) {
    const label = f.label ? ` "${f.label}"` : "";
    const elev = f.elevation ? `, elevation ${m(f.elevation)}` : "";
    const sel = f.id === ctx.selectedId ? "  [SELECTED]" : "";
    const look = f.parts ? `, custom parts (${f.parts.length})` : f.model ? `, model ${f.model.name}${f.model.style ? ` ${f.model.style}` : ""}${f.model.count ? ` x${f.model.count}` : ""}` : "";
    lines.push(`  ${f.id} ${f.category}${label} in ${f.roomId} at (${m(f.x)}, ${m(f.z)}), size ${m(f.width)}x${m(f.depth)}x${m(f.height)}${elev}, rotation ${m(f.rotation)}, ${f.color}${finishText(f.material)}${look}${sel}`);
  }
  if (house.lights.length) lines.push("LIGHTS");
  for (const l of house.lights) {
    const sel = l.id === ctx.selectedId ? "  [SELECTED]" : "";
    lines.push(`  ${l.id} ${l.type}${l.label ? ` "${l.label}"` : ""} at (${m(l.at.x)}, ${m(l.at.y)}, ${m(l.at.z)}), ${l.color}, intensity ${m(l.intensity)}, fixture ${l.fixture}, ${l.on ? "on" : "off"}${sel}`);
  }
  if (ctx.cameraYawDeg !== undefined) {
    lines.push(`VIEW: camera yaw ${Math.round(ctx.cameraYawDeg)} degrees${ctx.currentRoomId ? `, in room ${ctx.currentRoomId}` : ""}; "left/right/forward/backward" are resolved by the app`);
  }
  return lines.join("\n");
}
