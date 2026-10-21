import { OP_CATALOGUE } from "../ops/catalogue";
import { MAX_OPS } from "../ops/schema";
import { summarizeScene, type SummaryContext } from "../summarize";
import type { House } from "../schema";

/** A small valid house, shown to the AI as the target format. A test keeps it valid. */
export const EXAMPLE_HOUSE_JSON = `{
  "version": 1,
  "name": "Small flat",
  "rooms": [
    {
      "id": "living", "name": "Living room", "kind": "living",
      "x": 0, "z": 0, "width": 5, "depth": 4,
      "sides": {
        "north": { "openings": [{ "id": "window_1", "type": "window", "offset": 1, "width": 1.8 }] },
        "south": { "openings": [{ "id": "door_1", "type": "door", "offset": 0.6 }] }
      }
    },
    {
      "id": "bedroom", "name": "Bedroom", "kind": "bedroom",
      "x": 5.15, "z": 0, "width": 3.5, "depth": 4, "floor": "#bfae92",
      "sides": { "west": { "openings": [{ "id": "door_2", "type": "door", "offset": 2.4 }] } }
    }
  ],
  "furniture": [
    { "id": "sofa_1", "category": "sofa", "roomId": "living", "x": 2, "z": 3.2, "width": 2, "depth": 0.9, "height": 0.85, "color": "#556b8d" },
    { "id": "bed_1", "category": "bed", "roomId": "bedroom", "x": 7, "z": 2, "width": 1.6, "depth": 2, "height": 0.5, "rotation": 90, "color": "#a7b4c4" }
  ]
}`;

const CONVENTIONS = `CONVENTIONS
- Units are metres. Y is up. North is -Z, east is +X. Never use arrays for coordinates: always named fields like "x" and "z".
- A room is an axis-aligned rectangle. "x","z" is its NORTH-WEST INTERIOR corner; "width" runs along x, "depth" along z. Dimensions are interior (what a tape measure gives).
- Walls are derived from rooms (thickness "wallThickness", default 0.15). Neighbouring rooms must sit exactly one wall thickness apart: a room east of one that ends at x = 5 starts at x = 5.15. Rooms must not overlap.
- Each room has "sides": north, east, south, west. Each side may have "material" (hex), "open": true (no wall, for open-plan), and "openings": doors and windows.
- An opening's "offset" is metres from the side's left end seen from INSIDE the room: north: from the west end, east: from the north end, south: from the east end, west: from the south end. offset + width must fit the side's length. A door cuts through the neighbour's wall too; define it once, on one room.
- Doors: {"id","type":"door","offset","width"(0.9),"height"(2.05)}. Windows: {"id","type":"window","offset","width"(1.2),"height"(1.2),"sill"(0.9)}.
- Furniture "x","z" is its centre and must lie fully inside its room. "rotation" is degrees clockwise seen from above; at 0 the width runs along x and the front faces south. Categories: bed, sofa, table, chair, desk, wardrobe, tv, shelf, lamp, counter, sink, fridge, toilet, other. Add a free-text "label" for anything specific.
- Ids are lowercase letters, digits and underscores, start with a letter, and are unique across ALL rooms, furniture and openings.
- Colours are hex like "#e8e4dc". Prefer realistic paint and material colours.
- Looks beyond a plain colour: a wall/floor/furniture "finish" or "material" has image (an uploaded photo path, used instead of texture) or texture (plain, wood, dark_wood, fabric, linen, velvet, leather, marble, tiles, stripes, damask, fluted, brick, concrete, geometric), color (tints the pattern), scale (metres per repeat), roughness, metalness, opacity, emissive. Wall: sides.<side>.finish. Floor: room.floorFinish. Furniture: material.
- Furniture shape: "model" {name, style, count} picks a built-in look (sofa: straight, l_right, l_left, u, curved; armchair; bed: panel, tufted, platform; dining_table and coffee_table: rect, round; chair; tv_unit; wardrobe; bookshelf; rug: rect, round; floor_lamp; plant). For anything else give "parts": free-form pieces in the item's own frame (origin = centre of its footprint on the floor, x along width, z along depth, +z front; each part's "at" is its bottom-centre). Part shapes: box {size:{x,y,z}, radius}, cylinder {radius,height,radiusTop}, sphere {size}, torus {radius,tube}, arc {innerRadius,outerRadius,height,startDeg,endDeg} (curved slab, 0 = east, clockwise seen from above), polygon {points:[{x,z}],height,smooth}, lathe {profile:[{r,y}]}; each with optional rotation and material. Keep parts inside the item's width, depth and height.
- Lights: "lights": [{id, type: point|spot, at:{x,y,z} (y = height), target, angle, color, intensity (about 1 lamp, 3 downlight, 6 bright pendant), fixture: none|downlight|pendant|bulb|panel, on}].`;

export function buildEditPrompt(house: House, request: string, ctx: SummaryContext = {}): string {
  const ops = OP_CATALOGUE.map((d) => `- ${d.op}: ${d.summary}\n  ${JSON.stringify(d.example)}`).join("\n");
  return `You are editing a 3D house model by choosing operations from a fixed list.
Reply with ONE JSON object and nothing else (no prose, no markdown fences):
{ "ops": [ ... ] }

RULES
- Use only ids that appear in the SCENE below. Use "$selected" for "this", "it" or "that" when something is marked [SELECTED].
- Keep direction words as the user said them: north/east/south/west, or forward/backward/left/right (the app resolves left/right/forward/backward against the user's camera). Do not convert them.
- Walls are named "<roomId>.<side>", e.g. "living.north". "<roomId>.walls" means all four walls of a room; "all_walls" and "all_floors" mean everything.
- Distances and sizes are metres. Colours are hex, preferably realistic paint colours.
- Later operations in a batch can use things created by earlier ones (for example add_room, then add_furniture in it).
- If the request is ambiguous, reply with a single clarify op. If it is a question, reply with a single answer op.
- At most ${MAX_OPS} operations. If an operation would be impossible, choose the closest sensible one rather than inventing new fields.

${CONVENTIONS}

OPERATIONS
${ops}

SCENE
${summarizeScene(house, ctx)}

REQUEST
${request.trim() || "(describe what you want to change here)"}
`;
}

export function buildCreatePrompt(requirements: string): string {
  return `You are designing a house for a 3D interior-design tool.
Reply with ONE JSON object and nothing else (no prose, no markdown fences), in exactly this format:

${EXAMPLE_HOUSE_JSON}

Fields not shown can be omitted and get sensible defaults (room "height" 2.7, side "material" "#e8e4dc", "floor" "#c9b99a", furniture "color", etc.).

${CONVENTIONS}

CHECK BEFORE ANSWERING
- Every room is a rectangle; no two rooms overlap; neighbours are exactly 0.15 m apart.
- Every door and window fits inside its wall (offset + width <= the side's length) and no two openings on a side overlap.
- Furniture is fully inside its room, and ids are unique everywhere.
- Every room can be reached through a door, and one door on an outside wall is the main entrance.

REQUIREMENTS
${requirements.trim() || "(describe the house you want here: rooms, sizes, furniture, style)"}
`;
}

/** Conventions, house format and operation list, with no scene or request: the reference an AI agent reads once before editing. */
export function buildGuide(): string {
  const ops = OP_CATALOGUE.map((d) => `- ${d.op}: ${d.summary}\n  ${JSON.stringify(d.example)}`).join("\n");
  return `HOUSE FORMAT (a house file is JSON like this; fields not shown take defaults)
${EXAMPLE_HOUSE_JSON}

${CONVENTIONS}

OPERATIONS (send them as a list; at most ${MAX_OPS} per call; a batch is atomic: all apply or none)
${ops}
`;
}
