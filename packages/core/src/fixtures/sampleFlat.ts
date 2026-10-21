import { House } from "../schema";

/**
 * A 2 BHK sample flat (about 84 m2) modelled from a floor plan. Room sizes are metres, positions are
 * approximate, and doors and windows are placed by best guess. Page-up is "north" in this tool.
 */
export const sampleFlat = House.parse({
  version: 1,
  name: "Sample 2 BHK flat",
  rooms: [
    {
      id: "kitchen", name: "Kitchen", kind: "kitchen", x: 2.35, z: 0, width: 2.407, depth: 4.337, floor: "#d9d4c7",
      sides: {
        north: { openings: [{ id: "window_kitchen", type: "window", offset: 0.55, width: 1.2, height: 1.1, sill: 1.0 }] },
        east: { openings: [{ id: "door_kitchen", type: "door", offset: 2.8, width: 0.9 }] },
      },
    },
    {
      id: "toilet1", name: "Toilet (bedroom 1)", kind: "bathroom", x: 2.35, z: 4.487, width: 2.407, depth: 1.499, floor: "#cfd6d9",
      sides: { south: { openings: [{ id: "door_toilet1", type: "door", offset: 1.25, width: 0.75 }] } },
    },
    {
      id: "balcony1", name: "Balcony (bedroom 1)", kind: "balcony", x: 0, z: 4.64, width: 2.2, depth: 1.346, floor: "#b9b4aa",
      sides: {
        north: { open: true }, west: { open: true },
        south: { openings: [{ id: "door_balcony1", type: "door", offset: 0.35, width: 1.5, height: 2.1 }] },
      },
    },
    {
      id: "bed1", name: "Bedroom 1", kind: "bedroom", x: 0, z: 6.136, width: 3.899, depth: 4.292, floor: "#e3dccd",
      sides: { east: { openings: [{ id: "door_bed1", type: "door", offset: 2.9, width: 0.9 }] } },
    },
    {
      id: "dining", name: "Dining area", kind: "dining", x: 4.907, z: 1.64, width: 2.686, depth: 4.346, floor: "#e3dccd",
      sides: { south: { open: true }, east: { open: true } },
    },
    {
      // The strip beside toilet 2: part of the same dining/drawing space (the plan's column widens here).
      id: "dining_east", name: "Dining area (east)", kind: "dining", x: 7.743, z: 4.473, width: 0.536, depth: 1.513, floor: "#e3dccd",
      sides: { west: { open: true }, south: { open: true } },
    },
    {
      id: "balcony2", name: "Balcony (dining)", kind: "balcony", x: 4.907, z: 0.576, width: 2.337, depth: 0.914, floor: "#b9b4aa",
      sides: {
        north: { open: true },
        south: { openings: [{ id: "door_balcony2", type: "door", offset: 0.4, width: 1.5, height: 2.1 }] },
      },
    },
    {
      id: "drawing", name: "Drawing area", kind: "living", x: 4.049, z: 6.136, width: 4.363, depth: 4.292, floor: "#e3dccd", floorFinish: { texture: "tiles", scale: 0.8, color: "#ebe5da" },
      sides: {
        // Custom-made wood partition between the drawing and dining areas. It runs the full width; the
        // doorway in it is a guess (drag it to where the real opening is).
        north: { material: "#8a6244", finish: { texture: "fluted", scale: 0.6, color: "#8a6244" }, openings: [{ id: "doorway_partition", type: "door", offset: 1.2, width: 0.9, height: 2.69 }] },
        east: { material: "#d8ccb4", finish: { texture: "damask", scale: 0.5, color: "#d8ccb4" } },
        south: { openings: [{ id: "door_main", type: "door", offset: 0.25, width: 1.05, height: 2.1 }] },
      },
    },
    {
      id: "bed2", name: "Bedroom 2", kind: "bedroom", x: 7.743, z: 0.1, width: 3.023, depth: 4.223, floor: "#e3dccd",
      sides: {
        west: { openings: [{ id: "door_bed2", type: "door", offset: 0.3, width: 0.9 }] },
        east: { openings: [{ id: "window_bed2", type: "window", offset: 1.2, width: 1.5, height: 1.2, sill: 0.9 }] },
      },
    },
    {
      id: "toilet2", name: "Toilet (bedroom 2)", kind: "bathroom", x: 8.429, z: 4.473, width: 2.337, depth: 1.499, floor: "#cfd6d9",
      sides: { north: { openings: [{ id: "door_toilet2", type: "door", offset: 0.5, width: 0.75 }] } },
    },
  ],
  furniture: [
    // --- Drawing area, TV wall = the entrance wall (south, z = 10.428). Facing it from inside, the main door is at
    // the left (east) end, then a green panel, the big green TV panel and a second green panel running west.
    // Sizes are estimated from the site photo (panels about 2.4 m tall, TV unit about 1.4 m wide).
    ...[
      { id: "panel_left_frame", label: "white moulding (left panel)", x: 6.64, width: 0.84, height: 2.5, elevation: 0.08, depth: 0.02, color: "#f3f1ec" },
      { id: "panel_left", label: "green wall panel (left)", x: 6.64, width: 0.74, height: 2.4, elevation: 0.13, depth: 0.04, color: "#4b6b5c" },
      { id: "panel_tv", label: "green TV panel", x: 5.5, width: 1.3, height: 2.0, elevation: 0.6, depth: 0.04, color: "#4b6b5c" },
      { id: "panel_right_frame", label: "white moulding (right panel)", x: 4.43, width: 0.7, height: 2.5, elevation: 0.08, depth: 0.02, color: "#f3f1ec" },
      { id: "panel_right", label: "green wall panel (right)", x: 4.43, width: 0.6, height: 2.4, elevation: 0.13, depth: 0.04, color: "#4b6b5c" },
      { id: "tv_unit", label: "floating TV unit", x: 5.5, width: 1.4, height: 0.35, elevation: 0.3, depth: 0.38, color: "#e6dfd3" },
    ].map((p) => ({ category: "other", roomId: "drawing", z: 10.428 - p.depth / 2, rotation: 180, ...p })),
    // --- Drawing area: one L-shaped sofa. Back against the east wall (x = 8.412), the short arm along the partition.
    { id: "sofa_l", category: "sofa", label: "L-shaped sofa", roomId: "drawing", x: 7.387, z: 7.811, width: 3.35, depth: 2.05, height: 0.85, rotation: 90, color: "#b7a590", model: { name: "sofa", style: "l_left", count: 4 }, material: { texture: "fabric", scale: 0.35 } },
    { id: "db_panel", category: "other", label: "DB panel", roomId: "drawing", x: 8.372, z: 9.75, width: 0.45, depth: 0.08, height: 0.75, elevation: 1.45, rotation: 90, color: "#d6d9dc" },
  ],
  lights: [
    { id: "light_dl_1", type: "spot", label: "downlight", at: { x: 5.2, y: 2.69, z: 7.3 }, color: "#ffd9a8", intensity: 3, fixture: "downlight", angle: 60 },
    { id: "light_dl_2", type: "spot", label: "downlight", at: { x: 5.2, y: 2.69, z: 9.3 }, color: "#ffd9a8", intensity: 3, fixture: "downlight", angle: 60 },
    { id: "light_dl_3", type: "spot", label: "downlight", at: { x: 7.0, y: 2.69, z: 9.3 }, color: "#ffd9a8", intensity: 3, fixture: "downlight", angle: 60 },
    { id: "light_tv_wash", type: "spot", label: "TV wall wash", at: { x: 5.5, y: 2.65, z: 9.6 }, target: { x: 5.5, y: 1.2, z: 10.4 }, color: "#ffe2b8", intensity: 4, fixture: "none", angle: 40 },
    { id: "light_pendant", type: "point", label: "pendant over the sofa", at: { x: 7.3, y: 2.0, z: 7.8 }, color: "#ffcf94", intensity: 3, fixture: "pendant" },
  ],
  nextId: { window: 1, door: 1 },
});
