import { findEntrance, findSpawn, moveWithCollision, walkBlockers, type House } from "@house/core";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { walkRoom } from "./cameraState";

const EYE = 1.6;
const WALK_SPEED = 1.5; // m/s
const RUN_SPEED = 3.0;
const LOOK_SPEED = 0.002; // radians per pixel
const TURN_SPEED = 1.7; // radians per second for the keyboard turn keys
const SMOOTHING = 9; // higher = snappier start/stop
const FOV = 58; // vertical; wider than this makes everything look small and far away
const MAX_PITCH = Math.PI / 2 - 0.05;

/**
 * First-person walking. WASD / arrows move (Shift runs), mouse looks.
 * Click the view to capture the mouse; Esc releases it. Dragging also looks around,
 * so it works without pointer lock. Yaw 0 looks north (-Z), matching the scene convention.
 */
export function WalkControls({ house, start = "entrance" }: { house: House; start?: string }) {
  const { camera, gl } = useThree();
  const blockers = useMemo(() => walkBlockers(house), [house]);
  const pos = useRef({ x: 0, z: 0 });
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const vel = useRef({ x: 0, z: 0 });

  // Place the camera in a free spot of the chosen room, and use a wider field of view while walking.
  useEffect(() => {
    const entrance = start === "entrance" ? findEntrance(house) : null;
    const spawn = entrance ?? { ...findSpawn(house, start === "entrance" ? undefined : start), yaw: 0 };
    pos.current = { x: spawn.x, z: spawn.z };
    look.current = { yaw: spawn.yaw, pitch: 0 };
    vel.current = { x: 0, z: 0 };
    const cam = camera as import("three").PerspectiveCamera;
    const oldFov = cam.fov;
    cam.fov = FOV;
    cam.near = 0.05;
    cam.rotation.order = "YXZ";
    cam.updateProjectionMatrix();
    return () => {
      cam.fov = oldFov;
      cam.near = 0.1;
      cam.rotation.order = "XYZ";
      cam.updateProjectionMatrix();
    };
  }, [house, start, camera]);

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      keys.current.add(e.code);
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();

    const turn = (dx: number, dy: number) => {
      look.current.yaw -= dx * LOOK_SPEED;
      look.current.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, look.current.pitch - dy * LOOK_SPEED));
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === el) turn(e.movementX, e.movementY);
      else if (dragging) turn(e.movementX, e.movementY);
    };
    const onDown = () => { dragging = true; };
    const onUp = () => { dragging = false; };
    const onClick = () => { if (document.pointerLockElement !== el) el.requestPointerLock?.(); };

    addEventListener("keydown", onKeyDown);
    addEventListener("keyup", onKeyUp);
    addEventListener("blur", onBlur);
    addEventListener("mousemove", onMouseMove);
    addEventListener("mouseup", onUp);
    el.addEventListener("mousedown", onDown);
    el.addEventListener("click", onClick);
    return () => {
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
      removeEventListener("blur", onBlur);
      removeEventListener("mousemove", onMouseMove);
      removeEventListener("mouseup", onUp);
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("click", onClick);
      if (document.pointerLockElement === el) document.exitPointerLock();
      walkRoom.id = null;
    };
  }, [gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05); // a long frame must not let the walker skip through a wall
    const k = keys.current;
    const fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    const turn = (k.has("ArrowLeft") || k.has("KeyQ") ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyE") ? 1 : 0);
    look.current.yaw += turn * TURN_SPEED * dt;

    // Smooth the velocity so starting and stopping isn't jerky.
    const { yaw } = look.current;
    const len = Math.hypot(fwd, strafe) || 1;
    const speed = k.has("ShiftLeft") || k.has("ShiftRight") ? RUN_SPEED : WALK_SPEED;
    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const targetX = ((-Math.sin(yaw) * fwd + Math.cos(yaw) * strafe) / len) * speed;
    const targetZ = ((-Math.cos(yaw) * fwd - Math.sin(yaw) * strafe) / len) * speed;
    const a = Math.min(1, dt * SMOOTHING);
    vel.current.x += (targetX - vel.current.x) * a;
    vel.current.z += (targetZ - vel.current.z) * a;
    if (Math.abs(vel.current.x) > 0.001 || Math.abs(vel.current.z) > 0.001) {
      pos.current = moveWithCollision(blockers, pos.current, vel.current.x * dt, vel.current.z * dt);
    }
    walkRoom.id = house.rooms.find((r) => pos.current.x > r.x && pos.current.x < r.x + r.width && pos.current.z > r.z && pos.current.z < r.z + r.depth)?.id ?? null;
    camera.position.set(pos.current.x, EYE, pos.current.z);
    camera.rotation.set(look.current.pitch, look.current.yaw, 0, "YXZ");
  });

  return null;
}
