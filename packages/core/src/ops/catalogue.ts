import type { OpInput, OpName } from "./schema";

/** One entry per op: shown to the AI in the copied prompt. A test checks every example parses. */
export interface OpDoc {
  op: OpName;
  summary: string;
  example: OpInput;
}

export const OP_CATALOGUE: OpDoc[] = [
  { op: "add_room", summary: "Add a room. Give x and z, or placeNextTo {room, side, align: start|center|end} (placed one wall thickness away). Width/depth are interior metres. Optional: kind, height, floor, sides.",
    example: { op: "add_room", room: { name: "Study", kind: "study", width: 3, depth: 2.5, placeNextTo: { room: "living", side: "north" } } } },
  { op: "remove_room", summary: "Remove a room and the furniture inside it.", example: { op: "remove_room", id: "study" } },
  { op: "resize_room", summary: "Change a room's width and/or depth (north-west corner stays fixed; furniture is pulled inside).", example: { op: "resize_room", id: "kitchen", depth: 3.4 } },
  { op: "move_room_by", summary: "Move a room, with its furniture.", example: { op: "move_room_by", id: "bed2", direction: "south", distance: 1 } },
  { op: "move_room_to", summary: "Move a room's north-west corner to x, z.", example: { op: "move_room_to", id: "bed2", x: 5.15, z: 4.15 } },
  { op: "rename_room", summary: "Rename a room.", example: { op: "rename_room", id: "bed2", name: "Guest room" } },
  { op: "add_opening", summary: "Add a door or window to a wall (\"room.side\"). offset is metres from the wall's left end seen from inside; omit to centre it. Windows take sill (default 0.9).",
    example: { op: "add_opening", wall: "bed2.west", opening: { type: "window", width: 1.2, sill: 0.9 } } },
  { op: "remove_opening", summary: "Remove a door or window by id.", example: { op: "remove_opening", id: "window_3" } },
  { op: "move_opening", summary: "Slide a door or window along its wall.", example: { op: "move_opening", id: "door_1", offset: 0.4 } },
  { op: "resize_opening", summary: "Make a door or window wider/narrower or taller/shorter. width and height in metres; offset optionally moves its left edge at the same time (so you can stretch it from one side).", example: { op: "resize_opening", id: "door_1", width: 1.8 } },
  { op: "set_wall_open", summary: "Remove (open: true) or restore a wall, e.g. to join living and dining. Drops its doors and windows.", example: { op: "set_wall_open", wall: "living.east", open: true } },
  { op: "add_furniture", summary: "Add furniture to a room. category picks default size/colour; label is free text (e.g. \"reading lamp\"). Give x and z, or against: a wall side, or omit both to auto-place. Optional: width, depth, height, elevation, rotation, color.",
    example: { op: "add_furniture", roomId: "living", category: "lamp", label: "reading lamp", against: "east" } },
  { op: "remove_furniture", summary: "Remove a furniture item.", example: { op: "remove_furniture", id: "sofa_1" } },
  { op: "move_object_by", summary: "Move furniture by a distance in metres. direction is north/east/south/west or forward/backward/left/right (relative to the user's camera). Stops at walls.",
    example: { op: "move_object_by", id: "$selected", direction: "left", distance: 0.5 } },
  { op: "move_object_to", summary: "Move furniture so its centre is at x, z.", example: { op: "move_object_to", id: "sofa_1", x: 2.5, z: 3 } },
  { op: "rotate_object", summary: "Rotate furniture clockwise seen from above. mode \"by\" (default) adds degrees, \"to\" sets them. At 0 the front faces south.",
    example: { op: "rotate_object", id: "sofa_1", degrees: 90 } },
  { op: "face_towards", summary: "Turn furniture to face an item, a room or a wall.", example: { op: "face_towards", id: "sofa_1", target: "tv_1" } },
  { op: "resize_object", summary: "Change furniture width, depth and/or height.", example: { op: "resize_object", id: "table_1", width: 1.6 } },
  { op: "set_label", summary: "Set free-text label on furniture.", example: { op: "set_label", id: "sofa_1", label: "grey sofa" } },
  { op: "set_material", summary: "Set a colour (hex). id can be a wall (\"living.north\"), a room (its floor), furniture, a door or window, \"<room>.walls\", \"all_walls\" or \"all_floors\". Use realistic paint colours.",
    example: { op: "set_material", id: "living.north", color: "#b33a3a" } },
  { op: "set_finish", summary: "Give a surface a pattern/finish on top of its colour. id: a wall (\"living.north\"), \"<room>.walls\", \"all_walls\", a room (its floor), \"all_floors\", or a furniture id. Fields (any): texture, stretch (true on a wall: the photo covers the whole wall once, a mural; crop the photo to the wall's proportions first), seamless (true for a photo of a speckled/woven surface so its tile edges and uneven lighting don't show; not for printed motifs), image (an uploaded photo path like \"/__attachment/wallpaper.jpg\" used as the pattern; \"\" removes it), color, scale (metres per repeat), roughness, metalness, opacity, emissive. Textures: plain, wood, dark_wood, fabric, linen, velvet, leather, marble, tiles, stripes, damask, fluted, brick, concrete, geometric, plaster (fine painted wall), parquet (herringbone wood floor), stone (limestone tiles). \"plain\" removes the pattern.",
    example: { op: "set_finish", id: "living.north", texture: "stripes", color: "#9db4c0", scale: 0.4 } },
  { op: "set_locked", summary: "Lock or unlock a door, window or furniture item so it can't be moved, resized or removed by dragging, arrow keys or ops. id: the item, or \"all_doors\", \"all_openings\", \"all_furniture\". Never move or change a locked item; ask the user to unlock it.",
    example: { op: "set_locked", id: "all_openings", locked: true } },
  { op: "set_model", summary: "Change an item's built-in look. name: sofa (styles straight, l_right, l_left, u, curved), armchair, bed (panel, tufted, platform), dining_table (rect, round), coffee_table (rect, round), chair, tv_unit (floating, standard), wardrobe (light, dark; count = doors), bookshelf, rug (rect, round), floor_lamp, plant; or \"box\" for a plain box. count = seats on a sofa.",
    example: { op: "set_model", id: "sofa_1", name: "sofa", style: "curved", count: 4 } },
  { op: "set_parts", summary: "Replace an item's shape with your own parts, for anything the models don't cover (a different TV panel, a custom wall unit). Parts sit in the item's frame: origin = centre of its footprint on the floor, x along its width, z along its depth, +z front. A part's \"at\" is its bottom-centre {x,y,z}. Shapes: box {size:{x,y,z}, radius?}, cylinder {radius,height,radiusTop?}, sphere {size}, torus {radius,tube}, arc {innerRadius,outerRadius,height,startDeg,endDeg} (a curved slab: 0=east, clockwise from above), polygon {points:[{x,z}],height,smooth?}, lathe {profile:[{r,y}]}. Each part may have material {color, texture, scale, roughness, metalness, opacity, emissive}; without one it uses the item's colour. Keep the parts inside the item's width/depth/height.",
    example: { op: "set_parts", id: "tv_1", parts: [{ shape: "box", size: { x: 1.4, y: 2, z: 0.05 }, at: { x: 0, y: 0, z: 0 }, material: { color: "#4b6b5c" } }] } },
  { op: "add_light", summary: "Add a light. Give at {x,y,z} (metres, y = height), or above (a furniture id: placed on the ceiling over it), or roomId (ceiling centre). type point|spot (spot aims at target, default straight down; angle = cone half-angle). color hex (warm #ffd9a8, cool #dfeaff), intensity (about 1 bedside lamp, 3 downlight, 6 bright pendant), fixture none|downlight|pendant|bulb|panel (what you see), on.",
    example: { op: "add_light", above: "sofa_1", type: "point", fixture: "pendant", color: "#ffcf94", intensity: 3, label: "pendant" } },
  { op: "remove_light", summary: "Remove a light by id.", example: { op: "remove_light", id: "light_1" } },
  { op: "set_light", summary: "Change a light: color, intensity, on, fixture, type, angle, at, target, label.", example: { op: "set_light", id: "light_1", color: "#ffe9c9", intensity: 4 } },
  { op: "clarify", summary: "Use alone when the request is ambiguous. Give the question and, if possible, candidate ids.", example: { op: "clarify", question: "Which sofa do you mean?", candidates: ["sofa_1", "sofa_2"] } },
  { op: "answer", summary: "Use alone when the user asked a question instead of requesting a change.", example: { op: "answer", text: "The bedroom is 3.5 m wide." } },
];
