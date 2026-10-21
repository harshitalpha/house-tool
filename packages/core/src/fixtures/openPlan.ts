import { House } from "../schema";

// Edge cases: an open side (living + dining as two rectangles), neighbours exactly one wall
// thickness apart, a window spanning a full side (offset 0), and a high-sill window.
export const openPlan = House.parse({
  version: 1,
  name: "Test open plan",
  rooms: [
    {
      id: "living", name: "Living area", kind: "living", x: 0, z: 0, width: 4, depth: 4,
      sides: {
        north: { openings: [{ id: "window_1", type: "window", offset: 0, width: 4, sill: 0.8, height: 1.5 }] },
        east: { open: true },
        south: { openings: [{ id: "door_1", type: "door", offset: 2.9, width: 1.0 }] },
      },
    },
    {
      id: "dining", name: "Dining area", kind: "dining", x: 4.15, z: 0, width: 3, depth: 4,
      sides: {
        west: { open: true },
        north: { openings: [{ id: "window_2", type: "window", offset: 0.5, width: 2.0, sill: 1.4, height: 0.6 }] },
      },
    },
  ],
  furniture: [
    { id: "sofa_1", category: "sofa", roomId: "living", x: 1.6, z: 3.2, width: 2.0, depth: 0.9, height: 0.85, color: "#556b8d" },
    { id: "table_1", category: "table", label: "dining table", roomId: "dining", x: 5.65, z: 2.0, width: 1.6, depth: 0.9, height: 0.75, color: "#b08968" },
    { id: "chair_1", category: "chair", roomId: "dining", x: 5.65, z: 1.15, width: 0.45, depth: 0.45, height: 0.9, color: "#8c6f4e" },
  ],
  nextId: { window: 2, door: 1, sofa: 1, table: 1, chair: 1 },
});
