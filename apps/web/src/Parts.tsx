import type { Material as MaterialT, Part } from "@house/core";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { materialTexture, photoTint } from "./textures";
import { pbrMaps } from "./pbrMaps";

/** How strongly a photo/pattern also reads as relief under light (weave, speckle, flutes). */
const BUMP = 0.6;

const HIGHLIGHT = "#2a78d6";
const toRadians = (deg: number) => (-deg * Math.PI) / 180;

/** Geometry for one part in its own frame (bottom-centre at the origin), plus the sizes used to scale textures. */
function build(part: Part): { geometry: THREE.BufferGeometry; w: number; h: number } {
  switch (part.shape) {
    case "box": {
      const { x, y, z } = part.size;
      const r = Math.min(part.radius, x / 2, y / 2, z / 2) * 0.999;
      const g = r > 0.002 ? new RoundedBoxGeometry(x, y, z, 3, r) : new THREE.BoxGeometry(x, y, z);
      g.translate(0, y / 2, 0);
      return { geometry: g, w: Math.max(x, z), h: y };
    }
    case "cylinder": {
      const g = new THREE.CylinderGeometry(part.radiusTop ?? part.radius, part.radius, part.height, 40);
      g.translate(0, part.height / 2, 0);
      return { geometry: g, w: part.radius * 2 * Math.PI, h: part.height };
    }
    case "sphere": {
      const g = new THREE.SphereGeometry(0.5, 32, 20);
      g.scale(part.size.x, part.size.y, part.size.z);
      g.translate(0, part.size.y / 2, 0);
      return { geometry: g, w: Math.max(part.size.x, part.size.z), h: part.size.y };
    }
    case "torus": {
      const g = new THREE.TorusGeometry(part.radius, part.tube, 16, 48);
      g.rotateX(Math.PI / 2);
      g.translate(0, part.tube, 0);
      return { geometry: g, w: part.radius * 2, h: part.tube * 2 };
    }
    case "arc": {
      // Shape space (X, Y) = world (x, z). Angles run clockwise seen from above: x = cos, z = sin.
      const a0 = (part.startDeg * Math.PI) / 180, a1 = (part.endDeg * Math.PI) / 180;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, part.outerRadius, a0, a1, false);
      if (part.innerRadius > 0.001) shape.absarc(0, 0, part.innerRadius, a1, a0, true);
      else shape.lineTo(0, 0);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: part.height, bevelEnabled: false, curveSegments: 48 });
      g.rotateX(Math.PI / 2);
      g.translate(0, part.height, 0);
      return { geometry: g, w: part.outerRadius * (a1 - a0), h: part.height };
    }
    case "polygon": {
      const pts = part.points.map((p) => new THREE.Vector2(p.x, p.z));
      const shape = new THREE.Shape(part.smooth ? new THREE.SplineCurve([...pts, pts[0]!]).getPoints(80) : pts);
      const g = new THREE.ExtrudeGeometry(shape, { depth: part.height, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, part.height, 0);
      const xs = pts.map((p) => p.x), zs = pts.map((p) => p.y);
      return { geometry: g, w: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), h: part.height };
    }
    case "lathe": {
      const g = new THREE.LatheGeometry(part.profile.map((p) => new THREE.Vector2(Math.max(p.r, 0.0001), p.y)), 40);
      const maxR = Math.max(...part.profile.map((p) => p.r));
      return { geometry: g, w: maxR * 2 * Math.PI, h: Math.max(...part.profile.map((p) => p.y)) - Math.min(...part.profile.map((p) => p.y)) };
    }
  }
}

export interface Look {
  color: string;
  material?: MaterialT;
}

/** The material of a part: its own (colour falling back to the item's), else the item's. */
function resolve(part: Part, base: Look): { color: string; m: MaterialT | undefined } {
  const m = part.material ?? base.material;
  return { color: m?.image || part.material ? photoTint(m, part.material?.color ?? base.material?.color ?? base.color) : base.material?.color ?? base.color, m };
}

export function PartMesh({ part, base, selected, hovered, cast = true }: { part: Part; base: Look; selected: boolean; hovered: boolean; cast?: boolean }) {
  const built = useMemo(() => build(part), [part]);
  useEffect(() => () => built.geometry.dispose(), [built]);
  const { color, m } = resolve(part, base);
  const texture = useMemo(() => (m ? materialTexture(m, built.w / m.scale, built.h / m.scale) : null), [m, built]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);
  const opacity = m?.opacity ?? 1;
  return (
    <mesh
      geometry={built.geometry}
      position={[part.at.x, part.at.y, part.at.z]}
      rotation={[0, toRadians(part.rotation), 0]}
      castShadow={cast && opacity > 0.9}
      receiveShadow
    >
      <meshStandardMaterial
        // Gaining or losing a map changes the shader, so a new material is needed (three does not recompile on its own).
        key={`${texture ? 1 : 0}${pbrMaps(texture).normalMap ? 1 : 0}`}
        color={color}
        map={texture}
        bumpMap={texture && !pbrMaps(texture).normalMap ? texture : null}
        bumpScale={texture && !pbrMaps(texture).normalMap ? BUMP : 0}
        normalMap={pbrMaps(texture).normalMap ?? null}
        roughnessMap={pbrMaps(texture).roughnessMap ?? null}
        roughness={pbrMaps(texture).roughnessMap ? Math.min(1, (m?.roughness ?? 0.7) * 1.25) : m?.roughness ?? 0.7}
        metalness={m?.metalness ?? 0}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={selected ? HIGHLIGHT : m?.emissive ?? (hovered ? "#ffffff" : "#000000")}
        emissiveIntensity={selected ? (texture ? 0.15 : 0.5) : m?.emissive ? m.emissiveIntensity : hovered ? 0.15 : 0}
      />
    </mesh>
  );
}
