import type * as THREE from "three";

/** The extra PBR maps a pattern texture may carry (see textures.ts). */
export function pbrMaps(map: THREE.Texture | null | undefined): { normalMap?: THREE.Texture; roughnessMap?: THREE.Texture } {
  return (map?.userData?.pbr as { normalMap?: THREE.Texture; roughnessMap?: THREE.Texture } | undefined) ?? {};
}
