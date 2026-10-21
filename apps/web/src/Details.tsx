import { SIDES, lineOf, uToWorld, sideLength, type House, type Side } from "@house/core";
import { useMemo, type ReactElement } from "react";

type Room = House["rooms"][number];

const TRIM = "#f3f0ea";
const FRAME = "#e4e5e6";

interface Box { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number }

/**
 * A box lying along a wall from `u0` to `u1` (metres from the wall's left end seen from inside), `y0..y1` high,
 * `depth` thick, with its back on the wall's inner face and standing `lift` metres out of the wall plane.
 * `into` > 0 sticks into the room; the box centre sits `into/2 + shift` from the inner face.
 */
function along(room: Room, side: Side, u0: number, u1: number, y0: number, y1: number, depth: number, shift = 0): Box {
  const a = uToWorld(room, side, u0), b = uToWorld(room, side, u1);
  const mid = (a + b) / 2, len = Math.abs(b - a);
  const line = lineOf(room, side);
  const inward = side === "north" || side === "west" ? 1 : -1;
  const off = line + inward * (depth / 2 + shift);
  const alongX = side === "north" || side === "south";
  return alongX
    ? { cx: mid, cy: (y0 + y1) / 2, cz: off, sx: len, sy: y1 - y0, sz: depth }
    : { cx: off, cy: (y0 + y1) / 2, cz: mid, sx: depth, sy: y1 - y0, sz: len };
}

/** The wall's span with the given gaps cut out. */
function spans(len: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let at = 0;
  for (const [g0, g1] of [...gaps].sort((x, y) => x[0] - y[0])) {
    if (g0 > at) out.push([at, Math.min(g0, len)]);
    at = Math.max(at, g1);
  }
  if (at < len) out.push([at, len]);
  return out.filter(([s, e]) => e - s > 0.02);
}

function Trim({ b, color, rough = 0.45 }: { b: Box; color: string; rough?: number }) {
  return (
    <mesh position={[b.cx, b.cy, b.cz]} castShadow receiveShadow>
      <boxGeometry args={[b.sx, b.sy, b.sz]} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  );
}

function RoomDetails({ room, thickness, ceiling }: { room: Room; thickness: number; ceiling: boolean }) {
  const parts = useMemo(() => {
    const trims: { b: Box; color: string; rough?: number }[] = [];
    for (const side of SIDES) {
      const ws = room.sides[side];
      if (ws.open) continue;
      const len = sideLength(room, side);
      // Skirting board all along the floor, except across doorways.
      const doors = ws.openings.filter((o) => o.type === "door").map((o) => [o.offset, o.offset + o.width] as [number, number]);
      for (const [s, e] of spans(len, doors)) trims.push({ b: along(room, side, s, e, 0, 0.1, 0.018), color: TRIM });
      // Cornice where wall meets ceiling (walk mode only: the ceiling is there).
      if (ceiling) trims.push({ b: along(room, side, 0, len, room.height - 0.07, room.height, 0.05), color: TRIM, rough: 0.7 });
      for (const o of ws.openings) {
        if (o.type === "door") {
          // Architrave: two posts and a head, around the opening.
          const w = 0.07, d = 0.024;
          trims.push({ b: along(room, side, o.offset - w, o.offset, 0, o.height + w, d), color: TRIM });
          trims.push({ b: along(room, side, o.offset + o.width, o.offset + o.width + w, 0, o.height + w, d), color: TRIM });
          trims.push({ b: along(room, side, o.offset, o.offset + o.width, o.height, o.height + w, d), color: TRIM });
        } else {
          // Window: frame in the wall's thickness, a mullion, and a sill board.
          const f = 0.05, deep = Math.min(thickness * 0.7, 0.1), sill = o.sill, top = o.sill + o.height;
          const inset = thickness * 0.15;
          trims.push({ b: along(room, side, o.offset, o.offset + o.width, sill, sill + f, deep, inset), color: FRAME, rough: 0.35 });
          trims.push({ b: along(room, side, o.offset, o.offset + o.width, top - f, top, deep, inset), color: FRAME, rough: 0.35 });
          trims.push({ b: along(room, side, o.offset, o.offset + f, sill, top, deep, inset), color: FRAME, rough: 0.35 });
          trims.push({ b: along(room, side, o.offset + o.width - f, o.offset + o.width, sill, top, deep, inset), color: FRAME, rough: 0.35 });
          if (o.width > 0.9) trims.push({ b: along(room, side, o.offset + o.width / 2 - 0.015, o.offset + o.width / 2 + 0.015, sill, top, deep * 0.8, inset), color: FRAME, rough: 0.35 });
          trims.push({ b: along(room, side, o.offset - 0.06, o.offset + o.width + 0.06, sill - 0.03, sill, 0.16), color: TRIM, rough: 0.4 });
        }
      }
    }
    return trims;
  }, [room, thickness, ceiling]);
  return <>{parts.map((p, i) => <Trim key={i} b={p.b} color={p.color} rough={p.rough} />)}</>;
}


const METAL = "#c9c6bf";
const PLATE = "#f7f6f2";

function Box({ at, size, color, rough = 0.5, metal = 0, rotY = 0, emissive }: { at: [number, number, number]; size: [number, number, number]; color: string; rough?: number; metal?: number; rotY?: number; emissive?: string }) {
  return (
    <mesh position={at} rotation={[0, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 0.8 : 0} />
    </mesh>
  );
}

/** Unit vectors (x, z) along a wall's u axis and pointing into the room. */
function axes(room: Room, side: Side) {
  const a0 = uToWorld(room, side, 0), a1 = uToWorld(room, side, 1);
  const s = Math.sign(a1 - a0);
  const alongX = side === "north" || side === "south";
  const along = alongX ? { x: s, z: 0 } : { x: 0, z: s };
  const inward = side === "north" ? { x: 0, z: 1 } : side === "south" ? { x: 0, z: -1 } : side === "west" ? { x: 1, z: 0 } : { x: -1, z: 0 };
  return { along, inward };
}

/** A point on a wall: u metres along, y high, `out` metres into the room from the inner face. */
function onWall(room: Room, side: Side, u: number, y: number, out: number): [number, number, number] {
  const a = uToWorld(room, side, u), line = lineOf(room, side);
  const { inward } = axes(room, side);
  return side === "north" || side === "south" ? [a, y, line + inward.z * out] : [line + inward.x * out, y, a];
}

/** A door leaf swung part-way open (so the doorway stays walkable), with a lever handle. */
function DoorLeaf({ room, side, o, ajar = 68 }: { room: Room; side: Side; o: { offset: number; width: number; height: number; color?: string }; ajar?: number }) {
  const { along, inward } = axes(room, side);
  const th = (ajar * Math.PI) / 180;
  const dx = along.x * Math.cos(th) + inward.x * Math.sin(th);
  const dz = along.z * Math.cos(th) + inward.z * Math.sin(th);
  const hinge = onWall(room, side, o.offset + 0.012, 0, 0.03);
  const len = o.width - 0.03, h = o.height - 0.03, t = 0.04;
  const rotY = Math.atan2(-dz, dx);
  const colour = o.color ?? "#8a5a35";
  const k = [hinge[0] + (dx * len) / 2, h / 2 + 0.015, hinge[2] + (dz * len) / 2] as [number, number, number];
  // Handle height 1.0 m, near the free end, on both faces.
  const hx = hinge[0] + dx * (len - 0.07), hz = hinge[2] + dz * (len - 0.07);
  const nx = -dz, nz = dx; // leaf normal
  return (
    <>
      <Box at={k} size={[len, h, t]} color={colour} rough={0.45} rotY={rotY} />
      {/* raised panel on each face */}
      {[1, -1].map((s) => (
        <Box key={s} at={[k[0] + nx * s * (t / 2 + 0.002), k[1], k[2] + nz * s * (t / 2 + 0.002)]} size={[len * 0.7, h * 0.78, 0.006]} color={colour} rough={0.55} rotY={rotY} />
      ))}
      {[1, -1].map((s) => (
        <group key={`h${s}`}>
          <Box at={[hx + nx * s * (t / 2 + 0.03), 1.0, hz + nz * s * (t / 2 + 0.03)]} size={[0.13, 0.02, 0.025]} color={METAL} rough={0.25} metal={0.9} rotY={rotY} />
          <Box at={[hx + nx * s * (t / 2 + 0.012), 1.0, hz + nz * s * (t / 2 + 0.012)]} size={[0.03, 0.03, 0.025]} color={METAL} rough={0.25} metal={0.9} rotY={rotY} />
        </group>
      ))}
    </>
  );
}

/** A switch plate (or double socket) on a wall. */
function Plate({ room, side, u, y, w = 0.08, h = 0.08 }: { room: Room; side: Side; u: number; y: number; w?: number; h?: number }) {
  const { along } = axes(room, side);
  const p = onWall(room, side, u, y, 0.006);
  const rotY = Math.atan2(-along.z, along.x);
  return (
    <>
      <Box at={p} size={[w, h, 0.012]} color={PLATE} rough={0.35} rotY={rotY} />
      <Box at={onWall(room, side, u, y, 0.013)} size={[w * 0.35, h * 0.5, 0.006]} color="#e5e3dc" rough={0.4} rotY={rotY} />
    </>
  );
}

/** Pleated curtains either side of a window, on a rod. */
function Curtains({ room, side, o }: { room: Room; side: Side; o: { offset: number; width: number; sill: number; height: number } }) {
  const { along } = axes(room, side);
  const rotY = Math.atan2(-along.z, along.x);
  const top = Math.min(room.height - 0.12, o.sill + o.height + 0.3);
  const bottom = 0.03;
  const pw = 0.5, pleats = 6, strip = pw / pleats;
  const rows: ReactElement[] = [];
  for (const [i, from] of [o.offset - pw - 0.04, o.offset + o.width + 0.04].entries()) {
    for (let k = 0; k < pleats; k++) {
      const u = from + strip * (k + 0.5);
      const out = 0.07 + (k % 2 === 0 ? 0.02 : 0.0);
      rows.push(<Box key={`${i}-${k}`} at={onWall(room, side, u, (top + bottom) / 2, out)} size={[strip * 1.05, top - bottom, 0.03]} color="#d9d1c4" rough={1} rotY={rotY} />);
    }
  }
  const rod = Math.abs(o.width) + 2 * pw + 0.2;
  return (
    <>
      {rows}
      <Box at={onWall(room, side, o.offset + o.width / 2, top + 0.04, 0.09)} size={[rod, 0.025, 0.025]} color="#2f2c29" rough={0.4} metal={0.5} rotY={rotY} />
    </>
  );
}

/** A three-blade ceiling fan with a down-rod and a light dome. */
function CeilingFan({ x, z, h }: { x: number; z: number; h: number }) {
  const rod = 0.18;
  const y = h - rod - 0.05;
  return (
    <group position={[x, 0, z]}>
      <Box at={[0, h - 0.03, 0]} size={[0.18, 0.05, 0.18]} color="#e9e7e1" rough={0.5} />
      <Box at={[0, h - 0.05 - rod / 2, 0]} size={[0.025, rod, 0.025]} color="#d8d5ce" rough={0.4} metal={0.4} />
      <mesh position={[0, y, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.09, 24]} />
        <meshStandardMaterial color="#e6e3dc" roughness={0.4} />
      </mesh>
      <mesh position={[0, y - 0.07, 0]}>
        <sphereGeometry args={[0.08, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#fff6e4" emissive="#ffe3b0" emissiveIntensity={0.9} roughness={0.5} />
      </mesh>
      {[0, 120, 240].map((a) => (
        <group key={a} rotation={[0, (a * Math.PI) / 180, 0]}>
          <Box at={[0.43, y - 0.015, 0]} size={[0.62, 0.012, 0.14]} color="#e9e5dc" rough={0.5} />
          <Box at={[0.14, y - 0.004, 0]} size={[0.08, 0.02, 0.05]} color="#d4d0c6" rough={0.4} />
        </group>
      ))}
    </group>
  );
}

function RoomExtras({ room, ceiling }: { room: Room; ceiling: boolean }) {
  const out: ReactElement[] = [];
  const livable = room.kind === "bedroom" || room.kind === "living" || room.kind === "dining" || room.kind === "study";
  for (const side of SIDES) {
    const ws = room.sides[side];
    if (ws.open) continue;
    for (const o of ws.openings) {
      if (o.type === "door") {
        if (o.width <= 1.4) out.push(<DoorLeaf key={o.id} room={room} side={side} o={o} />);
        // Light switch on the latch side of every door, 1.2 m up.
        if (o.width <= 1.4) out.push(<Plate key={`sw-${o.id}`} room={room} side={side} u={o.offset + o.width + 0.2} y={1.2} />);
      } else if (room.kind === "bedroom" && o.width >= 0.8) {
        out.push(<Curtains key={`cu-${o.id}`} room={room} side={side} o={o} />);
      }
    }
    // Two double sockets low on the longest free wall of each living room / bedroom.
    if (livable && side === "north") {
      const len = sideLength(room, side);
      const clear = (u: number) => !ws.openings.some((o) => u > o.offset - 0.15 && u < o.offset + o.width + 0.15);
      for (const u of [0.45, len - 0.45]) if (clear(u)) out.push(<Plate key={`so-${side}-${u}`} room={room} side={side} u={u} y={0.3} w={0.09} h={0.08} />);
    }
  }
  if (ceiling && (room.kind === "bedroom" || room.kind === "living")) out.push(<CeilingFan key="fan" x={room.x + room.width / 2} z={room.z + room.depth / 2} h={room.height} />);
  return <>{out}</>;
}

/** Skirting boards, door architraves, window frames and (when walking) cornices: what makes a box of walls read as a room. */
export function Details({ house, ceiling }: { house: House; ceiling: boolean }) {
  return (
    <>
      {house.rooms.map((r) => <RoomDetails key={r.id} room={r} thickness={house.wallThickness} ceiling={ceiling} />)}
      {house.rooms.map((r) => <RoomExtras key={`x-${r.id}`} room={r} ceiling={ceiling} />)}
    </>
  );
}
