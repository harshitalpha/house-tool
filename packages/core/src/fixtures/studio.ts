import { House } from "../schema";

export const studio = House.parse({
  version: 1,
  name: "Test studio",
  rooms: [
    {
      id: "studio", name: "Studio", kind: "living", x: 0, z: 0, width: 4.5, depth: 6,
      sides: {
        north: { openings: [{ id: "window_1", type: "window", offset: 1.5, width: 1.8 }] },
        east: { openings: [{ id: "window_2", type: "window", offset: 2.0, width: 1.4 }] },
        south: { openings: [{ id: "door_1", type: "door", offset: 0.6 }] },
      },
    },
  ],
  furniture: [
    { id: "bed_1", category: "bed", label: "double bed", roomId: "studio", x: 1.1, z: 1.1, width: 1.6, depth: 2.0, height: 0.5, color: "#a7b4c4" },
    { id: "sofa_1", category: "sofa", roomId: "studio", x: 3.3, z: 3.2, width: 2.0, depth: 0.9, height: 0.85, rotation: 90, color: "#556b8d" },
    { id: "table_1", category: "table", label: "dining table", roomId: "studio", x: 1.2, z: 4.6, width: 1.2, depth: 0.8, height: 0.75, color: "#b08968" },
    { id: "counter_1", category: "counter", label: "kitchen counter", roomId: "studio", x: 3.4, z: 5.65, width: 2.0, depth: 0.6, height: 0.9, color: "#d9d6cf" },
  ],
  nextId: { window: 2, door: 1, bed: 1, sofa: 1, table: 1, counter: 1 },
});
