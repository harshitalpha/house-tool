import type { Side } from "../schema";

export const COMPASS_VECTORS: Record<Side, readonly [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};

export type RelativeWord = "forward" | "backward" | "left" | "right";
export type DirectionWord = Side | RelativeWord;

/**
 * Turn a direction word into an (x, z) vector. Camera yaw is in degrees; yaw 0 looks north (-Z).
 * With `snap`, the result is snapped to the nearest axis, so with the camera turned 30 degrees
 * "left" still moves along a wall.
 */
export function resolveDirection(dir: DirectionWord, cameraYawDeg: number, snap = true): [number, number] {
  const a = (cameraYawDeg * Math.PI) / 180;
  const forward: [number, number] = [-Math.sin(a), -Math.cos(a)];
  const right: [number, number] = [Math.cos(a), -Math.sin(a)];
  const table: Record<DirectionWord, readonly [number, number]> = {
    forward, backward: [-forward[0], -forward[1]], right, left: [-right[0], -right[1]],
    ...COMPASS_VECTORS,
  };
  const v = [...table[dir]] as [number, number];
  if (snap) return Math.abs(v[0]) > Math.abs(v[1]) ? [Math.sign(v[0]), 0] : [0, Math.sign(v[1])];
  return v;
}

export function compassOf(v: readonly [number, number]): Side {
  if (Math.abs(v[0]) > Math.abs(v[1])) return v[0] > 0 ? "east" : "west";
  return v[1] > 0 ? "south" : "north";
}

/** Which compass side of the room a camera with this yaw has on its left, ahead, etc. */
export function relativeLabel(side: Side, cameraYawDeg: number): "AHEAD" | "on your RIGHT" | "BEHIND you" | "on your LEFT" {
  const words: [RelativeWord, ReturnType<typeof relativeLabel>][] = [
    ["forward", "AHEAD"], ["right", "on your RIGHT"], ["backward", "BEHIND you"], ["left", "on your LEFT"],
  ];
  for (const [w, label] of words) if (compassOf(resolveDirection(w, cameraYawDeg)) === side) return label;
  return "AHEAD";
}
