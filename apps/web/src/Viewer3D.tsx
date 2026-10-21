import { SIDES, buildWalls, partsFor, lineOf, uToWorld, worldToU, type House, type Side } from "@house/core";
import { MapControls, OrbitControls, useCursor } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Details } from "./Details";
import { pbrMaps } from "./pbrMaps";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cameraYaw, live } from "./cameraState";
import { useStore } from "./store";
import { PartMesh } from "./Parts";
import { materialTexture, photoTint } from "./textures";
import { WalkControls } from "./WalkControls";

export type ViewMode = "orbit" | "top" | "walk";

/** Furniture rotation is degrees clockwise seen from above; three.js Y rotation is counter-clockwise. */
const toRadians = (deg: number) => (-deg * Math.PI) / 180;
const HIGHLIGHT = "#2a78d6";

/** True for the primary selection and for any item picked while writing feedback. */
const useSelected = (id: string) => useStore((s) => s.selectedId === id || s.fbTargets.includes(id));

function Mat({ color, selected, hovered, ...rest }: { color: string; selected: boolean; hovered: boolean } & Record<string, unknown>) {
  const pbr = pbrMaps(rest.map as THREE.Texture | null | undefined);
  const rough = typeof rest.roughness === "number" ? rest.roughness : 0.8;
  return (
    <meshStandardMaterial
      key={`${rest.map ? 1 : 0}${pbr.normalMap ? 1 : 0}`}
      color={color}
      emissive={selected ? HIGHLIGHT : hovered ? "#ffffff" : "#000000"}
      emissiveIntensity={selected ? (rest.map ? 0.12 : 0.55) : hovered ? (rest.map ? 0.05 : 0.15) : 0}
      {...rest}
    />
  );
}

function WallMesh({ box, pickable, plan, finish, room }: { box: ReturnType<typeof buildWalls>[number]; pickable: boolean; plan: boolean; finish?: House["rooms"][number]["sides"][Side]["finish"]; room?: House["rooms"][number] }) {
  const id = `${box.roomId}.${box.side}`;
  const select = useStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(pickable && hovered);
  const isSel = useSelected(id);
  const selected = pickable && isSel;
  const glass = box.kind === "glass";
  const alongX = box.side === "north" || box.side === "south";
  const texture = useMemo(() => {
    if (!finish || (finish.texture === "plain" && !finish.image) || plan || glass) return null;
    const len = alongX ? box.sx : box.sz;
    const left = (alongX ? box.cx : box.cz) - len / 2;
    if (finish.stretch && room) {
      // One picture across the whole wall: this box shows its own slice of it.
      const wallLen = alongX ? room.width : room.depth;
      const start = alongX ? room.x : room.z;
      const u0 = Math.max(0, left - start) / wallLen, u1 = Math.min(wallLen, left + len - start) / wallLen;
      return materialTexture(finish, Math.max(0.01, u1 - u0), box.sy / room.height, u0, (box.cy - box.sy / 2) / room.height);
    }
    return materialTexture(finish, len / finish.scale, box.sy / finish.scale, left / finish.scale, (box.cy - box.sy / 2) / finish.scale);
  }, [finish, plan, glass, alongX, box.sx, box.sz, box.sy, box.cx, box.cz, box.cy, room]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  return (
    <mesh
      position={[box.cx, box.cy, box.cz]}
      castShadow={!glass}
      receiveShadow={!glass}
      onClick={pickable ? (e) => { e.stopPropagation(); if (e.delta <= 4) select(id, true); } : undefined}
      onPointerOver={pickable ? (e) => { e.stopPropagation(); setHovered(true); } : undefined}
      onPointerOut={pickable ? () => setHovered(false) : undefined}
    >
      <boxGeometry args={[box.sx, box.sy, box.sz]} />
      {glass ? (
        <meshStandardMaterial color={box.color} transparent opacity={0.35} roughness={0.1} />
      ) : (
        <Mat color={plan ? "#2f3a48" : finish?.image ? photoTint(finish, box.color) : finish?.color ?? box.color} selected={selected} hovered={hovered && pickable} roughness={finish?.roughness ?? 0.95} metalness={finish?.metalness ?? 0} map={texture} />
      )}
    </mesh>
  );
}


type RoomT = House["rooms"][number];
type OpeningT = RoomT["sides"][Side]["openings"][number];

/**
 * A door or window you can pick and drag along its wall. It sits in the gap: a tinted panel for
 * doors, an invisible hit area for windows (their glass is part of the wall boxes).
 */
function OpeningMesh({ room, side, o, wallT }: { room: RoomT; side: Side; o: OpeningT; wallT: number }) {
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const setDragging = useStore((s) => s.setDragging);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const [hovered, setHovered] = useState(false);
  const [handleHover, setHandleHover] = useState(false);
  useCursor(hovered || handleHover);
  const selected = selectedId === o.id;
  const isDoor = o.type === "door";
  const sill = o.type === "window" ? o.sill : 0;
  const a = uToWorld(room, side, o.offset + o.width / 2);
  const outward = side === "north" || side === "west" ? -1 : 1;
  const line = lineOf(room, side) + (outward * wallT) / 2;
  const alongX = side === "north" || side === "south";
  const cy = sill + o.height / 2;
  const thick = wallT * 0.7;
  const pos: [number, number, number] = alongX ? [a, cy, line] : [line, cy, a];
  const size: [number, number, number] = alongX ? [o.width, o.height, thick] : [thick, o.height, o.width];

  /** "move" slides the whole opening; "start"/"end" stretch it from that end, the other end stays put. */
  const startDrag = (mode: "move" | "start" | "end", e: { clientX: number; clientY: number }) => {
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cy);
    const hit = new THREE.Vector3();
    const toU = (ev: { clientX: number; clientY: number }) => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      return worldToU(room, side, alongX ? hit.x : hit.z);
    };
    if (o.locked) return;
    const u0 = toU(e);
    if (u0 === null) return;
    const startOff = o.offset, startEnd = o.offset + o.width;
    const grab = u0 - (mode === "move" ? startOff + o.width / 2 : mode === "start" ? startOff : startEnd);
    let last = -1;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const u = toU(ev);
      if (u === null) return;
      const at = Math.round((u - grab) * 100) / 100;
      if (Math.abs(at - last) < 0.005) return;
      last = at;
      const run = useStore.getState().runOps;
      if (mode === "move") run([{ op: "move_opening", id: o.id, offset: Math.max(0, Math.round((at - o.width / 2) * 100) / 100) }], { label: `Move ${o.id}`, mergeKey: `drag:${o.id}` });
      else if (mode === "start") run([{ op: "resize_opening", id: o.id, width: Math.max(0.01, startEnd - at), anchor: "end" }], { label: `Resize ${o.id}`, mergeKey: `resize:${o.id}` });
      else run([{ op: "resize_opening", id: o.id, width: Math.max(0.01, at - startOff), anchor: "start" }], { label: `Resize ${o.id}`, mergeKey: `resize:${o.id}` });
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setDragging(false);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  const handle = (mode: "start" | "end") => {
    const hu = mode === "start" ? o.offset : o.offset + o.width;
    const ha = uToWorld(room, side, hu);
    const hp: [number, number, number] = alongX ? [ha, cy, line] : [line, cy, ha];
    const hs: [number, number, number] = alongX ? [0.14, Math.max(0.5, o.height * 0.5), thick * 1.6] : [thick * 1.6, Math.max(0.5, o.height * 0.5), 0.14];
    return (
      <mesh
        key={mode}
        position={hp}
        onPointerDown={(e) => { e.stopPropagation(); startDrag(mode, e); }}
        onPointerOver={(e) => { e.stopPropagation(); setHandleHover(true); }}
        onPointerOut={() => setHandleHover(false)}
      >
        <boxGeometry args={hs} />
        <meshStandardMaterial color="#ffffff" emissive={HIGHLIGHT} emissiveIntensity={handleHover ? 1 : 0.6} />
      </mesh>
    );
  };

  return (
    <>
      <mesh
        position={pos}
        onPointerDown={(e) => { e.stopPropagation(); select(o.id, true); startDrag("move", e); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={selected ? HIGHLIGHT : o.color ?? (isDoor ? "#8a5a35" : "#9ecbf0")}
          emissive={selected ? HIGHLIGHT : "#000000"}
          emissiveIntensity={selected ? 0.4 : 0}
          transparent
          opacity={selected ? 0.8 : hovered ? 0.6 : o.color ? 0.55 : isDoor ? 0.22 : 0}
          depthWrite={false}
        />
      </mesh>
      {selected && !o.locked && handle("start")}
      {selected && !o.locked && handle("end")}
    </>
  );
}

function Openings({ house }: { house: House }) {
  return (
    <>
      {house.rooms.flatMap((r) => SIDES.flatMap((sd) => r.sides[sd].openings.map((o) => <OpeningMesh key={o.id} room={r} side={sd} o={o} wallT={house.wallThickness} />)))}
    </>
  );
}

function Walls({ house, wallHeight, pickable, plan }: { house: House; wallHeight?: number; pickable: boolean; plan: boolean }) {
  const boxes = useMemo(() => buildWalls(house, wallHeight), [house, wallHeight]);
  return <>{boxes.map((b) => <WallMesh key={b.key} box={b} pickable={pickable} plan={plan} room={house.rooms.find((r) => r.id === b.roomId)} finish={house.rooms.find((r) => r.id === b.roomId)?.sides[b.side].finish} />)}</>;
}

function Floor({ room, pickable, t }: { room: House["rooms"][number]; pickable: boolean; t: number }) {
  // Where a side is open the wall gap would show as a hole: stretch the floor half a wall that way (the neighbour does the same).
  const h = t / 2;
  const e = room.sides.east.open ? h : 0, w = room.sides.west.open ? h : 0, n = room.sides.north.open ? h : 0, so = room.sides.south.open ? h : 0;
  const fw = room.width + e + w, fd = room.depth + n + so;
  const ff = room.floorFinish;
  const floorTex = useMemo(() => (ff ? materialTexture(ff, fw / ff.scale, fd / ff.scale) : null), [ff, fw, fd]);
  useEffect(() => () => { floorTex?.dispose(); }, [floorTex]);
  const floorSel = useSelected(room.id);
  const select = useStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(pickable && hovered);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[room.x + room.width / 2 + (e - w) / 2, 0, room.z + room.depth / 2 + (so - n) / 2]}
      receiveShadow
      onClick={pickable ? (e) => { e.stopPropagation(); if (e.delta <= 4) select(room.id, true); } : undefined}
      onPointerOver={pickable ? (e) => { e.stopPropagation(); setHovered(true); } : undefined}
      onPointerOut={pickable ? () => setHovered(false) : undefined}
    >
      <planeGeometry args={[fw, fd]} />
      <Mat color={ff?.image ? photoTint(ff, room.floor) : ff?.color ?? room.floor} selected={pickable && floorSel} hovered={pickable && hovered} roughness={ff?.roughness ?? 0.9} metalness={ff?.metalness ?? 0} map={floorTex} />
    </mesh>
  );
}

const toFeet = (m: number) => {
  const totalIn = Math.round((m / 0.0254) * 4) / 4;
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  return `${ft}'-${inch}"`;
};

/** Room name and interior size, painted on the floor (top and 3D views). Canvas texture: no DOM. */
function RoomLabel({ room }: { room: House["rooms"][number] }) {
  const { texture, aspect } = useMemo(() => {
    const lines = [room.name, `${room.width.toFixed(2)} × ${room.depth.toFixed(2)} m`, `${toFeet(room.width)} × ${toFeet(room.depth)}`];
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const font = (i: number) => `${i === 0 ? "bold " : ""}${i === 0 ? 44 : 36}px system-ui, sans-serif`;
    c.width = Math.ceil(Math.max(...lines.map((l, i) => (ctx.font = font(i), ctx.measureText(l).width)))) + 24;
    c.height = 150;
    lines.forEach((l, i) => {
      ctx.font = font(i);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.fillStyle = i === 0 ? "#1f2933" : "#3e4c59";
      const y = 30 + i * 45;
      ctx.strokeText(l, c.width / 2, y);
      ctx.fillText(l, c.width / 2, y);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { texture: t, aspect: c.width / c.height };
  }, [room.name, room.width, room.depth]);
  const h = Math.min(0.95, room.depth * 0.5, (room.width * 0.9) / aspect);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.x + room.width / 2, 0.03, room.z + room.depth / 2]} renderOrder={5}>
      <planeGeometry args={[h * aspect, h]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function FurnitureMesh({ f, pickable }: { f: House["furniture"][number]; pickable: boolean }) {
  const isSel = useSelected(f.id);
  const select = useStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(pickable && hovered);
  const parts = useMemo(() => partsFor(f), [f.parts, f.model, f.width, f.depth, f.height]);
  const selected = pickable && isSel;
  const events = {
    onClick: pickable ? (e: { stopPropagation(): void; delta: number }) => { e.stopPropagation(); if (e.delta <= 4) select(f.id, true); } : undefined,
    onPointerOver: pickable ? (e: { stopPropagation(): void }) => { e.stopPropagation(); setHovered(true); } : undefined,
    onPointerOut: pickable ? () => setHovered(false) : undefined,
  };
  if (parts) {
    return (
      <group position={[f.x, f.elevation, f.z]} rotation={[0, toRadians(f.rotation), 0]} {...events}>
        {parts.map((p, i) => <PartMesh key={i} part={p} base={{ color: f.color, material: f.material }} selected={selected} hovered={pickable && hovered} />)}
      </group>
    );
  }
  const m = f.material;
  return (
    <mesh position={[f.x, f.elevation + f.height / 2, f.z]} rotation={[0, toRadians(f.rotation), 0]} castShadow receiveShadow {...events}>
      <boxGeometry args={[f.width, f.height, f.depth]} />
      <Mat color={m?.image ? photoTint(m, f.color) : m?.color ?? f.color} selected={selected} hovered={pickable && hovered} roughness={m?.roughness ?? 0.7} />
    </mesh>
  );
}


const MAX_REAL_LIGHTS = 14;

/** One light: the real three.js light (up to a cap) and its visible fixture, which can be picked. */
function LightMesh({ light, ceiling, real, night, pickable }: { light: House["lights"][number]; ceiling: number; real: boolean; night: boolean; pickable: boolean }) {
  const isSel = useSelected(light.id);
  const select = useStore((s) => s.select);
  const [hovered, setHovered] = useState(false);
  useCursor(pickable && hovered);
  const selected = pickable && isSel;
  const lit = light.on;
  const glow = lit ? (night ? 2.2 : 0.6) : 0;
  const k = night ? 1 : 0.25; // daylight washes lights out
  const power = lit ? light.intensity * 6 * k : 0;
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(light.target?.x ?? light.at.x, light.target?.y ?? 0, light.target?.z ?? light.at.z);
  const events = {
    onClick: pickable ? (e: { stopPropagation(): void; delta: number }) => { e.stopPropagation(); if (e.delta <= 4) select(light.id, true); } : undefined,
    onPointerOver: pickable ? (e: { stopPropagation(): void }) => { e.stopPropagation(); setHovered(true); } : undefined,
    onPointerOut: pickable ? () => setHovered(false) : undefined,
  };
  const emissive = { color: "#ffffff", emissive: selected ? HIGHLIGHT : light.color, emissiveIntensity: selected ? 1.2 : glow, toneMapped: false };
  const cord = Math.max(0.05, ceiling - light.at.y);
  return (
    <group>
      {real && lit && light.type === "point" && <pointLight position={[light.at.x, light.at.y, light.at.z]} color={light.color} intensity={power} distance={0} decay={2} />}
      {real && lit && light.type === "spot" && (
        <>
          <primitive object={target} />
          <spotLight position={[light.at.x, light.at.y, light.at.z]} color={light.color} intensity={power * 2} angle={(light.angle * Math.PI) / 180} penumbra={0.6} decay={2} distance={0} target={target} />
        </>
      )}
      <group position={[light.at.x, light.at.y, light.at.z]} {...events}>
        {light.fixture === "downlight" && <mesh position={[0, 0.005, 0]}><cylinderGeometry args={[0.09, 0.09, 0.012, 24]} /><meshStandardMaterial {...emissive} /></mesh>}
        {light.fixture === "panel" && <mesh><boxGeometry args={[0.6, 0.02, 0.6]} /><meshStandardMaterial {...emissive} /></mesh>}
        {light.fixture === "bulb" && <mesh><sphereGeometry args={[0.05, 16, 12]} /><meshStandardMaterial {...emissive} /></mesh>}
        {light.fixture === "pendant" && (
          <>
            <mesh><sphereGeometry args={[0.15, 24, 16]} /><meshStandardMaterial {...emissive} opacity={0.95} transparent /></mesh>
            <mesh position={[0, 0.15 + cord / 2, 0]}><cylinderGeometry args={[0.006, 0.006, cord, 6]} /><meshStandardMaterial color="#222222" /></mesh>
          </>
        )}
        {(light.fixture === "none" || (pickable && (selected || hovered))) && pickable && (
          <mesh><sphereGeometry args={[selected || hovered ? 0.11 : 0.06, 12, 10]} /><meshBasicMaterial color={selected ? HIGHLIGHT : light.color} transparent opacity={selected || hovered ? 0.55 : 0.8} depthWrite={false} /></mesh>
        )}
      </group>
    </group>
  );
}

function Lights({ house, night, pickable }: { house: House; night: boolean; pickable: boolean }) {
  // Real lights are costly: the first MAX_REAL_LIGHTS that are on get one, the rest only show their fixture.
  let used = 0;
  return (
    <>
      {house.lights.map((l) => {
        const real = l.on && used < MAX_REAL_LIGHTS;
        if (real) used++;
        const room = house.rooms.find((r) => l.at.x >= r.x && l.at.x <= r.x + r.width && l.at.z >= r.z && l.at.z <= r.z + r.depth);
        return <LightMesh key={l.id} light={l} ceiling={room?.height ?? 2.7} real={real} night={night} pickable={pickable} />;
      })}
    </>
  );
}

/** Ceilings, only while walking: they would hide the interior from the overview. No shadow, so light still comes in. */
function Ceilings({ house }: { house: House }) {
  return (
    <>
      {house.rooms.map((r) => (
        <mesh key={r.id} rotation={[Math.PI / 2, 0, 0]} position={[r.x + r.width / 2, r.height, r.z + r.depth / 2]}>
          <planeGeometry args={[r.width, r.depth]} />
          <meshStandardMaterial color="#f6f5f1" roughness={1} />
        </mesh>
      ))}
    </>
  );
}

/** Writes the camera's yaw (0 = looking north) so "left" and "forward" can be resolved against the view. */
function CameraTracker() {
  const v = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    camera.getWorldDirection(v.current);
    const flat = Math.hypot(v.current.x, v.current.z);
    // Looking straight down (top view): use the camera's up vector as "forward on screen".
    const x = flat < 0.05 ? camera.up.x : v.current.x;
    const z = flat < 0.05 ? camera.up.z : v.current.z;
    cameraYaw.deg = (Math.atan2(-x, -z) * 180) / Math.PI;
  });
  return null;
}

function OrbitRig({ position, target, span }: { position: [number, number, number]; target: [number, number, number]; span: number }) {
  const camera = useThree((s) => s.camera);
  const dragging = useStore((s) => s.dragging);
  useLayoutEffect(() => {
    camera.position.set(...position);
    camera.rotation.order = "XYZ";
    camera.lookAt(...target);
  }, [camera, position, target]);
  return <OrbitControls makeDefault enabled={!dragging} target={target} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={2} maxDistance={Math.max(60, span * 4)} />;
}

function TopRig({ center, span }: { center: readonly [number, number, number]; span: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const dragging = useStore((s) => s.dragging);
  useLayoutEffect(() => {
    camera.up.set(0, 0, -1); // north is up the screen
    camera.position.set(center[0], 60, center[2]);
    camera.zoom = Math.min(size.width, size.height) / (span + 2.5);
    camera.lookAt(center[0], 0, center[2]);
    camera.updateProjectionMatrix();
    // re-frame only when the house or the mode changes, not on every resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, center[0], center[2], span]);
  return <MapControls makeDefault enabled={!dragging} enableRotate={false} target={[center[0], 0, center[2]]} screenSpacePanning />;
}

/** Hands the live scene and camera to the path-traced render. */
function TraceBridge() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    live.scene = scene; live.camera = camera; live.width = size.width; live.height = size.height;
    return () => { live.scene = null; live.camera = null; };
  }, [scene, camera, size.width, size.height]);
  return null;
}

/** Soft image-based light from a procedural studio room: walls and furniture pick up bounce light and reflections. */
function Env({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const rt = pm.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    return () => { scene.environment = null; rt.dispose(); pm.dispose(); };
  }, [gl, scene]);
  useEffect(() => { scene.environmentIntensity = intensity; }, [scene, intensity]);
  return null;
}

interface Props {
  house: House;
  mode: ViewMode;
  wallHeight?: number;
  walkStart?: string;
}

export function Viewer3D({ house, mode, wallHeight, walkStart }: Props) {
  const viewKey = useStore((s) => s.viewKey);
  const select = useStore((s) => s.select);
  const down = useRef({ x: 0, y: 0 });

  const { center, span } = useMemo(() => {
    if (!house.rooms.length) return { center: [0, 0, 0] as const, span: 6 };
    const minX = Math.min(...house.rooms.map((r) => r.x));
    const maxX = Math.max(...house.rooms.map((r) => r.x + r.width));
    const minZ = Math.min(...house.rooms.map((r) => r.z));
    const maxZ = Math.max(...house.rooms.map((r) => r.z + r.depth));
    return { center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] as const, span: Math.max(maxX - minX, maxZ - minZ) };
  }, [house]);

  // The overview camera only re-frames when a different house is loaded, not on every edit.
  const frame = useRef({ center, span, key: viewKey });
  if (frame.current.key !== viewKey) frame.current = { center, span, key: viewKey };
  const f = frame.current;

  const d = f.span * 1.0 + 2;
  const overview = useMemo(() => [f.center[0] + d * 0.55, d * 0.85, f.center[2] + d * 0.95] as [number, number, number], [f, d]);
  const orbitTarget = useMemo(() => [f.center[0], 0.6, f.center[2]] as [number, number, number], [f]);
  const pickable = mode !== "walk";
  const night = useStore((s) => s.night);
  const realistic = useStore((s) => s.realistic) && mode !== "top";

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      onPointerDownCapture={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
    >
      <Canvas
        key={`${viewKey}-${mode === "top" ? "top" : "persp"}`}
        shadows={mode === "top" ? false : "soft"}
        gl={{ preserveDrawingBuffer: true }}
        orthographic={mode === "top"}
        camera={mode === "top" ? { position: [f.center[0], 60, f.center[2]], zoom: 40, near: 0.1, far: 200 } : { position: overview, fov: 42, near: 0.1, far: 200 }}
        style={{ width: "100%", height: "100%" }}
        onPointerMissed={(e) => {
          if (!pickable || useStore.getState().tab === "feedback") return;
          if (Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) < 4) select(null);
        }}
      >
        <color attach="background" args={[night ? "#14171d" : mode === "walk" ? "#c9dcee" : "#f3f4f6"]} />
        {mode !== "top" && <Env intensity={night ? 0.05 : realistic ? 0.3 : 0.35} />}
        <hemisphereLight args={["#ffffff", "#d8d4ca", night ? 0.12 : mode === "top" ? 1.3 : realistic ? 0.25 : 1.0]} />
        <directionalLight
          position={[f.center[0] + 6, 12, f.center[2] + 4]}
          intensity={night ? 0.05 : realistic ? 1.1 : 1.6}
          castShadow={mode !== "top"}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-f.span}
          shadow-camera-right={f.span}
          shadow-camera-top={f.span}
          shadow-camera-bottom={-f.span}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0005}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[f.center[0], -0.02, f.center[2]]} receiveShadow onClick={pickable ? () => undefined : undefined}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color={night ? "#23272f" : "#e9ebee"} />
        </mesh>
        {house.rooms.map((r) => <Floor key={r.id} room={r} pickable={pickable} t={house.wallThickness} />)}
        {mode !== "walk" && house.rooms.map((r) => <RoomLabel key={r.id} room={r} />)}
        {mode !== "walk" && <Openings house={house} />}
        <Lights house={house} night={night} pickable={pickable} />
        <Walls house={house} wallHeight={wallHeight} pickable={pickable} plan={mode === "top"} />
        {house.furniture.map((fu) => <FurnitureMesh key={fu.id} f={fu} pickable={pickable} />)}
        {mode !== "top" && <Details house={house} ceiling={mode === "walk"} />}
        {mode === "walk" && <Ceilings house={house} />}
        {realistic && (
          <EffectComposer multisampling={0}>
            <N8AO aoRadius={0.7} distanceFalloff={1.2} intensity={2.4} quality="medium" />
            <Bloom intensity={0.4} luminanceThreshold={1} mipmapBlur />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <SMAA />
          </EffectComposer>
        )}
        <CameraTracker />
        <TraceBridge />
        {mode === "walk" ? (
          <WalkControls house={house} start={walkStart} />
        ) : mode === "top" ? (
          <TopRig center={f.center} span={f.span} />
        ) : (
          <OrbitRig position={overview} target={orbitTarget} span={f.span} />
        )}
      </Canvas>
    </div>
  );
}
