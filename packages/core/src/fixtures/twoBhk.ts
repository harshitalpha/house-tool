import { House } from "../schema";

// Wall thickness 0.15: neighbouring interiors sit exactly 0.15 apart.
export const twoBhk = House.parse({
  version: 1,
  name: "Test 2BHK",
  rooms: [
    {
      id: "living", name: "Living room", kind: "living", x: 0, z: 0, width: 5, depth: 4,
      sides: {
        north: { openings: [{ id: "window_1", type: "window", offset: 1.0, width: 1.8, height: 1.3 }] },
        east: { openings: [{ id: "door_2", type: "door", offset: 2.4 }] },
        south: {
          openings: [
            { id: "door_3", type: "door", offset: 0.3, width: 0.8 }, // to bathroom
            { id: "door_4", type: "door", offset: 3.2 }, // to kitchen
          ],
        },
        west: { openings: [{ id: "door_1", type: "door", offset: 0.6, width: 1.0, height: 2.1 }] }, // main door
      },
    },
    {
      id: "bed1", name: "Bedroom 1", kind: "bedroom", x: 5.15, z: 0, width: 3.5, depth: 4,
      sides: {
        north: { openings: [{ id: "window_2", type: "window", offset: 1.2, width: 1.4 }] },
        east: { openings: [{ id: "window_3", type: "window", offset: 1.2, width: 1.4 }] },
      },
      floor: "#bfae92",
    },
    {
      id: "kitchen", name: "Kitchen", kind: "kitchen", x: 0, z: 4.15, width: 3, depth: 3,
      sides: { west: { openings: [{ id: "window_4", type: "window", offset: 1.0, width: 1.0, height: 1.0, sill: 1.0 }] } },
      floor: "#d8d3c8",
    },
    {
      id: "bath", name: "Bathroom", kind: "bathroom", x: 3.15, z: 4.15, width: 1.85, depth: 3,
      sides: { south: { openings: [{ id: "window_5", type: "window", offset: 0.6, width: 0.6, height: 0.5, sill: 1.5 }] } },
      floor: "#cfd8dc",
    },
    {
      id: "bed2", name: "Bedroom 2", kind: "bedroom", x: 5.15, z: 4.15, width: 3.5, depth: 3,
      sides: {
        north: { openings: [{ id: "door_5", type: "door", offset: 1.0 }] }, // to bedroom 1
        east: { openings: [{ id: "window_6", type: "window", offset: 1.0, width: 1.4 }] },
        south: { openings: [{ id: "window_7", type: "window", offset: 1.0, width: 1.4 }] },
      },
      floor: "#bfae92",
    },
  ],
  furniture: [
    { id: "sofa_1", category: "sofa", roomId: "living", x: 2.0, z: 3.3, width: 2.0, depth: 0.9, height: 0.85, color: "#556b8d" },
    { id: "table_1", category: "table", label: "coffee table", roomId: "living", x: 2.0, z: 2.2, width: 1.1, depth: 0.6, height: 0.4, color: "#b08968" },
    { id: "tv_1", category: "tv", roomId: "living", x: 2.0, z: 0.3, width: 1.2, depth: 0.3, height: 0.7, elevation: 0.5, color: "#222222" },
    { id: "bed_1", category: "bed", roomId: "bed1", x: 7.0, z: 2.0, width: 1.6, depth: 2.0, height: 0.5, rotation: 90, color: "#a7b4c4" },
    { id: "wardrobe_1", category: "wardrobe", roomId: "bed1", x: 6.1, z: 0.35, width: 1.8, depth: 0.6, height: 2.1, color: "#c8b79b" },
    { id: "counter_1", category: "counter", label: "kitchen counter", roomId: "kitchen", x: 1.5, z: 4.5, width: 2.4, depth: 0.6, height: 0.9, color: "#d9d6cf" },
    { id: "fridge_1", category: "fridge", roomId: "kitchen", x: 2.6, z: 6.75, width: 0.7, depth: 0.7, height: 1.8, color: "#e5e7ea" },
    { id: "toilet_1", category: "toilet", roomId: "bath", x: 4.5, z: 6.8, width: 0.4, depth: 0.7, height: 0.4, color: "#f2f2f2" },
    { id: "sink_1", category: "sink", roomId: "bath", x: 3.6, z: 4.5, width: 0.5, depth: 0.4, height: 0.9, color: "#f2f2f2" },
    { id: "bed_2", category: "bed", roomId: "bed2", x: 7.2, z: 5.65, width: 1.4, depth: 2.0, height: 0.5, rotation: 90, color: "#b4a7c4" },
  ],
  nextId: { door: 5, window: 7, sofa: 1, table: 1, tv: 1, bed: 2, wardrobe: 1, counter: 1, fridge: 1, toilet: 1, sink: 1 },
});
