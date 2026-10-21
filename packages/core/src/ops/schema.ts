import { z } from "zod";
import { DoorOpening, FurnitureCategory, Hex, Id, LIGHT_FIXTURES, Material, Model, Part, Room, Side, Texture, Vec3, WindowOpening } from "../schema";

/** Direction words the AI may use. Relative ones (forward/left/...) are resolved against the camera by the app. */
export const Direction = z.enum(["north", "east", "south", "west", "forward", "backward", "left", "right"]);

/**
 * A reference to something in the scene: a furniture id ("sofa_1"), a room id ("living", its floor),
 * a wall ("living.north"), an opening id ("door_1"), "$selected", or a bulk target
 * ("living.walls", "all_walls", "all_floors"). Checked against the scene when the op is applied.
 */
const Ref = z.string().min(1);

/** A partial surface look: only the fields given change, the rest of the existing finish is kept. */
const MaterialPatch = {
  color: Hex.optional(),
  texture: Texture.optional(),
  /** Use an uploaded photo as the pattern. Pass an empty string to remove it. */
  image: z.string().regex(/^(|\/__attachment\/[A-Za-z0-9._-]+|https?:\/\/\S+)$/).optional(),
  seamless: z.boolean().optional(),
  stretch: z.boolean().optional(),
  scale: z.number().positive().optional(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  emissive: Hex.optional(),
  emissiveIntensity: z.number().min(0).max(5).optional(),
};

const LightFields = {
  type: z.enum(["point", "spot"]).optional(),
  at: Vec3.optional(),
  target: Vec3.optional(),
  angle: z.number().min(5).max(80).optional(),
  color: Hex.optional(),
  intensity: z.number().min(0).max(20).optional(),
  fixture: z.enum(LIGHT_FIXTURES).optional(),
  on: z.boolean().optional(),
  label: z.string().optional(),
};
const Metres = z.number().finite();

const OpeningDraft = z.discriminatedUnion("type", [
  DoorOpening.extend({ id: Id.optional(), offset: z.number().min(0).optional() }),
  WindowOpening.extend({ id: Id.optional(), offset: z.number().min(0).optional() }),
]);

const RoomDraft = Room.omit({ id: true, x: true, z: true }).extend({
  id: Id.optional(),
  x: Metres.optional(),
  z: Metres.optional(),
  /** Place the new room against an existing one, one wall thickness away. */
  placeNextTo: z
    .object({ room: Id, side: Side, align: z.enum(["start", "center", "end"]).default("start") })
    .optional(),
});

export const Op = z.discriminatedUnion("op", [
  // rooms
  z.object({ op: z.literal("add_room"), room: RoomDraft }),
  z.object({ op: z.literal("remove_room"), id: Ref }),
  z.object({ op: z.literal("resize_room"), id: Ref, width: z.number().positive().optional(), depth: z.number().positive().optional() }),
  z.object({ op: z.literal("move_room_by"), id: Ref, direction: Direction, distance: z.number().positive() }),
  z.object({ op: z.literal("move_room_to"), id: Ref, x: Metres, z: Metres }),
  z.object({ op: z.literal("rename_room"), id: Ref, name: z.string().min(1) }),
  // walls and openings
  z.object({ op: z.literal("add_opening"), wall: Ref, opening: OpeningDraft }),
  z.object({ op: z.literal("remove_opening"), id: Ref }),
  z.object({ op: z.literal("move_opening"), id: Ref, offset: z.number().min(0) }),
  z.object({
    op: z.literal("resize_opening"), id: Ref,
    width: z.number().positive().optional(), height: z.number().positive().optional(), offset: z.number().min(0).optional(),
    /** Which end stays put when width changes: "start" (the offset end) or "end". Default: the offset stays. */
    anchor: z.enum(["start", "end"]).optional(),
  }),
  z.object({ op: z.literal("set_wall_open"), wall: Ref, open: z.boolean() }),
  // furniture
  z.object({
    op: z.literal("add_furniture"),
    roomId: Ref,
    category: FurnitureCategory,
    label: z.string().optional(),
    x: Metres.optional(),
    z: Metres.optional(),
    against: Side.optional(),
    width: z.number().positive().optional(),
    depth: z.number().positive().optional(),
    height: z.number().positive().optional(),
    elevation: z.number().min(0).optional(),
    rotation: z.number().optional(),
    color: Hex.optional(),
    /** Built-in parametric look, e.g. { name: "sofa", style: "curved" }. */
    model: Model.optional(),
    /** Free-form geometry for anything the models don't cover. */
    parts: z.array(Part).min(1).max(80).optional(),
    material: Material.optional(),
  }),
  z.object({ op: z.literal("remove_furniture"), id: Ref }),
  z.object({ op: z.literal("move_object_by"), id: Ref, direction: Direction, distance: z.number().positive() }),
  z.object({ op: z.literal("move_object_to"), id: Ref, x: Metres, z: Metres }),
  z.object({ op: z.literal("rotate_object"), id: Ref, degrees: z.number(), mode: z.enum(["by", "to"]).default("by") }),
  z.object({ op: z.literal("face_towards"), id: Ref, target: Ref }),
  z.object({
    op: z.literal("resize_object"), id: Ref,
    width: z.number().positive().optional(), depth: z.number().positive().optional(), height: z.number().positive().optional(),
  }),
  z.object({ op: z.literal("set_label"), id: Ref, label: z.string() }),
  // appearance
  z.object({ op: z.literal("set_material"), id: Ref, color: Hex }),
  z.object({ op: z.literal("set_finish"), id: Ref, ...MaterialPatch }),
  z.object({ op: z.literal("set_locked"), id: Ref, locked: z.boolean() }),
  z.object({ op: z.literal("set_model"), id: Ref, name: z.string().min(1), style: z.string().optional(), count: z.number().int().min(1).max(12).optional() }),
  z.object({ op: z.literal("set_parts"), id: Ref, parts: z.array(Part).min(1).max(80) }),
  // lights
  z.object({ op: z.literal("add_light"), above: Ref.optional(), roomId: Ref.optional(), ...LightFields }),
  z.object({ op: z.literal("remove_light"), id: Ref }),
  z.object({ op: z.literal("set_light"), id: Ref, ...LightFields }),
  // conversation (no scene change)
  z.object({ op: z.literal("clarify"), question: z.string().min(1), candidates: z.array(z.string()).default([]) }),
  z.object({ op: z.literal("answer"), text: z.string().min(1) }),
]);
export type Op = z.infer<typeof Op>;
export type OpName = Op["op"];
export type OpInput = z.input<typeof Op>;

export const MAX_OPS = 40;
export const OpBatch = z.object({ ops: z.array(Op).min(1).max(MAX_OPS) });
export type OpBatch = z.infer<typeof OpBatch>;
