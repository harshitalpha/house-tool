import { SIDES, resolveDirection, type Side } from "@house/core";
import { useEffect } from "react";
import { cameraYaw } from "./cameraState";
import { useStore } from "./store";
import type { ViewMode } from "./Viewer3D";

/**
 * Keyboard: arrows nudge the selection (relative to the camera view), R rotates, Delete removes,
 * Ctrl/Cmd+Z undoes, Esc deselects. Each nudge is an op; nudges in a row merge into one undo step.
 */
export function useShortcuts(mode: ViewMode) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); s.redo(); return; }
      if (mode === "walk" || mod || e.altKey) return;

      if (e.key === "Escape") { s.select(null); return; }
      const id = s.selectedId;
      if (!id) return;
      const isItem = s.house.furniture.some((f) => f.id === id);
      const isRoom = s.house.rooms.some((r) => r.id === id);
      let opening: { side: Side; room: (typeof s.house.rooms)[number] } | null = null;
      for (const r of s.house.rooms) for (const sd of SIDES) if (r.sides[sd].openings.some((o) => o.id === id)) opening = { side: sd, room: r };
      const light = s.house.lights.find((l) => l.id === id);
      if (!isItem && !isRoom && !opening && !light) return;

      const arrows: Record<string, "forward" | "backward" | "left" | "right"> = { ArrowUp: "forward", ArrowDown: "backward", ArrowLeft: "left", ArrowRight: "right" };
      const dir = arrows[e.key];
      if (light && dir) {
        e.preventDefault();
        const [vx, vz] = resolveDirection(dir, cameraYaw.deg);
        const step = e.shiftKey ? 0.5 : 0.1;
        s.runOps([{ op: "set_light", id, at: { x: Math.round((light.at.x + vx * step) * 100) / 100, y: light.at.y, z: Math.round((light.at.z + vz * step) * 100) / 100 } }], { label: "Nudge light", mergeKey: `nudge:${id}` });
      } else if (light && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        s.runOps([{ op: "remove_light", id }], { label: "Delete light" });
      } else if (opening && dir) {
        // Slide along the wall; arrows across the wall do nothing.
        e.preventDefault();
        const [vx, vz] = resolveDirection(dir, cameraYaw.deg);
        const alongX = opening.side === "north" || opening.side === "south";
        const comp = alongX ? vx : vz;
        if (comp === 0) return;
        // u grows toward +x (north), -x (south), +z (east), -z (west)
        const uSign = opening.side === "north" || opening.side === "east" ? 1 : -1;
        const o = opening.room.sides[opening.side].openings.find((x) => x.id === id)!;
        const step = (e.shiftKey ? 0.5 : 0.1) * comp * uSign;
        s.runOps([{ op: "move_opening", id, offset: Math.max(0, Math.round((o.offset + step) * 100) / 100) }], { label: "Nudge opening", mergeKey: `nudge:${id}` });
      } else if (opening && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        s.runOps([{ op: "remove_opening", id }], { label: "Delete opening" });
      } else if (dir && !opening && !light) {
        e.preventDefault();
        const distance = e.shiftKey ? 0.5 : 0.1;
        s.runOps([isItem ? { op: "move_object_by", id, direction: dir, distance } : { op: "move_room_by", id, direction: dir, distance }], { label: "Nudge", mergeKey: `nudge:${id}` });
      } else if (isItem && e.key.toLowerCase() === "r") {
        e.preventDefault();
        s.runOps([{ op: "rotate_object", id, degrees: e.shiftKey ? -90 : 90 }], { label: "Rotate", mergeKey: `rotate:${id}` });
      } else if (isItem && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        s.runOps([{ op: "remove_furniture", id }], { label: "Delete" });
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [mode]);
}
