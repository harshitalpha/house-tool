import { z } from "zod";

/**
 * Scene schema, phase 1. Conventions (shared with the viewer, the validator and the prompt):
 *  - Units are metres. North is -Z, east is +X. Y is up.
 *  - A room is an axis-aligned rectangle. x, z is its NORTH-WEST INTERIOR corner;
 *    width runs along x, depth along z. Dimensions are interior (what a tape measures).
 *  - Walls are derived from rooms: each side is a slab of half the wall thickness just
 *    outside the rectangle. Neighbouring rooms sit exactly one wall thickness apart.
 *  - Walls go clockwise seen from above: north, east, south, west. An opening's `offset`
 *    is measured from the side's left end seen from INSIDE the room:
 *    north: from the west end, east: from the north end,
 *    south: from the east end, west: from the south end.
 *  - Furniture x, z is its centre. `rotation` is degrees clockwise seen from above;
 *    at 0 the item's width runs along x and its front faces south (+Z).
 *  - Only named objects, never tuples: tuples break structured-output JSON Schema
 *    and let a model swap axes.
 */

export const SCHEMA_VERSION = 1;

export const Id = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "ids use lowercase letters, digits and underscores, starting with a letter");
export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must look like #aabbcc");

export const SIDES = ["north", "east", "south", "west"] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;

export const RoomKind = z.enum([
  "living", "dining", "bedroom", "kitchen", "bathroom", "hallway", "balcony", "study", "other",
]);

export const FurnitureCategory = z.enum([
  "bed", "sofa", "table", "chair", "desk", "wardrobe", "tv", "shelf", "lamp",
  "counter", "sink", "fridge", "toilet", "other",
]);


// ---------------------------------------------------------------------------
// Appearance: materials, free-form parts, lights
// ---------------------------------------------------------------------------

/** Surface patterns (some procedural, some photographic PBR sets). They are tinted by the material colour. */
export const TEXTURES = [
  "plain", "wood", "dark_wood", "fabric", "velvet", "leather", "marble", "tiles", "stripes", "damask",
  "fluted", "brick", "concrete", "geometric", "linen", "plaster", "parquet", "stone",
] as const;
export const Texture = z.enum(TEXTURES);
export type Texture = z.infer<typeof Texture>;

/** A surface look. Everything is optional so a part or wall can inherit the object's colour. */
export const Material = z.object({
  color: Hex.optional(),
  texture: Texture.default("plain"),
  /** A photo used as the pattern instead of a preset (wallpaper, fabric swatch). Uploaded through the app: "/__attachment/<file>". Overrides `texture`. */
  image: z.string().regex(/^(\/__attachment\/[A-Za-z0-9._-]+|https?:\/\/\S+)$/, "image must be an uploaded attachment path or an http(s) URL").optional(),
  /** For a photo of a speckled or woven surface (granite wallpaper, fabric): even out its lighting and mirror-tile it so no tile edges show. Leave off for printed motifs. */
  seamless: z.boolean().optional(),
  /** Walls only: show the photo once across the whole wall (a mural) instead of tiling it. `scale` is ignored. */
  stretch: z.boolean().optional(),
  /** Metres per repeat of the pattern (a stripe or tile every `scale` metres). */
  scale: z.number().positive().default(0.5),
  roughness: z.number().min(0).max(1).default(0.8),
  metalness: z.number().min(0).max(1).default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Glow colour (LED strips, lamp shades). It lights nothing by itself: add a light for that. */
  emissive: Hex.optional(),
  emissiveIntensity: z.number().min(0).max(5).default(1),
});
export type Material = z.infer<typeof Material>;

export const Vec3 = z.object({ x: z.number().default(0), y: z.number().default(0), z: z.number().default(0) });
export const Size3 = z.object({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() });
const Planar = z.object({ x: z.number(), z: z.number() });

const PartBase = {
  /** Bottom-centre of the part in the object's frame: x, z centre, y the underside, metres. */
  at: Vec3.prefault({}),
  /** Degrees clockwise seen from above, about the part's own centre. */
  rotation: z.number().default(0),
  material: Material.optional(),
};

/**
 * One primitive of a free-form object. Parts live in the object's local frame: origin at the centre of
 * its footprint on its base, x along its width, z along its depth, +z is the front (south at rotation 0).
 * Curved or odd shapes are built from these: "arc" (curved sofa, curved wall), "polygon" (L shapes,
 * smooth blobs), "lathe" (anything round and turned: vases, lampshades, round tables).
 */
export const Part = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("box"), size: Size3, radius: z.number().min(0).default(0), ...PartBase }),
  z.object({ shape: z.literal("cylinder"), radius: z.number().positive(), height: z.number().positive(), radiusTop: z.number().min(0).optional(), ...PartBase }),
  z.object({ shape: z.literal("sphere"), size: Size3, ...PartBase }),
  z.object({ shape: z.literal("torus"), radius: z.number().positive(), tube: z.number().positive(), ...PartBase }),
  z.object({
    shape: z.literal("arc"),
    innerRadius: z.number().min(0), outerRadius: z.number().positive(), height: z.number().positive(),
    /** Degrees, 0 = +x (east), growing clockwise seen from above, so 90 = +z (front). */
    startDeg: z.number(), endDeg: z.number(),
    ...PartBase,
  }),
  z.object({ shape: z.literal("polygon"), points: z.array(Planar).min(3).max(64), height: z.number().positive(), smooth: z.boolean().default(false), ...PartBase }),
  z.object({ shape: z.literal("lathe"), profile: z.array(z.object({ r: z.number().min(0), y: z.number() })).min(2).max(48), ...PartBase }),
]);
export type Part = z.infer<typeof Part>;

export const LIGHT_FIXTURES = ["none", "downlight", "pendant", "bulb", "panel"] as const;
export const Light = z.object({
  id: Id,
  label: z.string().optional(),
  type: z.enum(["point", "spot"]).default("point"),
  /** World position, metres (y is height above the floor). */
  at: Vec3,
  /** Spot lights aim at this point; default straight down. */
  target: Vec3.optional(),
  /** Spot cone half-angle in degrees. */
  angle: z.number().min(5).max(80).default(50),
  color: Hex.default("#ffd9a8"),
  /** Brightness: about 1 is a bedside lamp, 3 a ceiling downlight, 6 a bright pendant. */
  intensity: z.number().min(0).max(20).default(2),
  /** What you see: a recessed disc, a hanging globe, a bare bulb, a flat panel, or nothing. */
  fixture: z.enum(LIGHT_FIXTURES).default("none"),
  on: z.boolean().default(true),
});
export type Light = z.infer<typeof Light>;

/** Names of the built-in parametric models (see models/). `style` picks a variant. */
export const Model = z.object({
  name: z.string().min(1),
  style: z.string().optional(),
  /** Number of seats / places where it makes sense (sofa cushions, dining chairs). */
  count: z.number().int().min(1).max(12).optional(),
});
export type Model = z.infer<typeof Model>;

export const DoorOpening = z.object({
  id: Id,
  type: z.literal("door"),
  offset: z.number().min(0),
  width: z.number().positive().default(0.9),
  height: z.number().positive().default(2.05),
  color: Hex.optional(),
  /** Locked items ignore drags, nudges and move/resize/remove ops until unlocked. */
  locked: z.boolean().optional(),
});
export const WindowOpening = z.object({
  id: Id,
  type: z.literal("window"),
  offset: z.number().min(0),
  width: z.number().positive().default(1.2),
  height: z.number().positive().default(1.2),
  sill: z.number().min(0).default(0.9),
  color: Hex.optional(),
  locked: z.boolean().optional(),
});
export const Opening = z.discriminatedUnion("type", [DoorOpening, WindowOpening]);
export type Opening = z.infer<typeof Opening>;

export const DEFAULT_WALL = "#e8e4dc";
export const DEFAULT_FLOOR = "#c9b99a";

export const WallSide = z.object({
  material: Hex.default(DEFAULT_WALL),
  openings: z.array(Opening).default([]),
  /** No wall on this side: open-plan living + dining is two rectangles with open sides. */
  open: z.boolean().default(false),
  /** Pattern/finish on top of `material` (wallpaper, panelling, tiles...). `material` stays the base colour. */
  finish: Material.optional(),
});
export type WallSide = z.infer<typeof WallSide>;

export const Sides = z.object({
  north: WallSide.prefault({}),
  east: WallSide.prefault({}),
  south: WallSide.prefault({}),
  west: WallSide.prefault({}),
});

export const Room = z.object({
  id: Id,
  name: z.string().min(1),
  kind: RoomKind.default("other"),
  x: z.number(),
  z: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive().default(2.7),
  sides: Sides.prefault({}),
  floor: Hex.default(DEFAULT_FLOOR),
  floorFinish: Material.optional(),
});
export type Room = z.infer<typeof Room>;

export const Furniture = z.object({
  id: Id,
  locked: z.boolean().optional(),
  category: FurnitureCategory,
  /** Free text for language ("reading lamp"); `category` only picks the box colour/shape. */
  label: z.string().optional(),
  roomId: Id,
  x: z.number(),
  z: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  /** Height of the item's underside above the floor (wall-mounted TV, shelves). */
  elevation: z.number().min(0).default(0),
  rotation: z.number().default(0),
  color: Hex.default("#8d8d8d"),
  /** Built-in parametric look (sofa, bed...). Used when `parts` is absent. */
  model: Model.optional(),
  /** Free-form geometry: replaces the plain box. Anything the models don't cover is built from these. */
  parts: z.array(Part).max(80).optional(),
  /** Surface look for the whole object (parts without their own material inherit it). */
  material: Material.optional(),
});
export type Furniture = z.infer<typeof Furniture>;

export const House = z.object({
  version: z.literal(SCHEMA_VERSION),
  name: z.string().default("Untitled house"),
  wallThickness: z.number().positive().default(0.15),
  rooms: z.array(Room),
  furniture: z.array(Furniture).default([]),
  lights: z.array(Light).default([]),
  /** Per-prefix ID counters, so ids are minted deterministically and never reused. */
  nextId: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type House = z.infer<typeof House>;
export type HouseInput = z.input<typeof House>;
