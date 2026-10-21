/** Live camera info written by the viewer every frame and read by actions. Not React state: it changes constantly. */
export const cameraYaw = { deg: 0 };
/** Room the walker is standing in (walk mode), or null. */
export const walkRoom: { id: string | null } = { id: null };
/** The live scene and camera of the 3D viewer, for the path-traced render to copy from. Cleared when the viewer unmounts. */
export const live: { scene: import("three").Scene | null; camera: import("three").Camera | null; width: number; height: number } = { scene: null, camera: null, width: 0, height: 0 };
