import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Session, TEMPLATES, type Result } from "./session";

const argFile = process.argv.find((a) => a.startsWith("--file="))?.slice(7);
const session = new Session(argFile ?? process.env.HOUSE_FILE ?? "house.json");

const run = (fn: () => Result) => {
  try {
    const r = fn();
    return { content: [{ type: "text" as const, text: r.text }], isError: !r.ok };
  } catch (e) {
    return { content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
};

const server = new McpServer({ name: "house-tool", version: "0.1.0" });

server.registerTool("house_guide", {
  description: "Read this FIRST. Returns the house file format, the coordinate conventions (metres, north = -Z, east = +X, rotation, wall offsets) and every edit operation with an example. Call once per conversation before house_apply_ops.",
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, () => run(() => session.guide()));

server.registerTool("house_new", {
  description: `Create (or replace) the house file from a template: ${TEMPLATES.join(", ")}. The previous file is kept for house_undo. Use "blank" to build from scratch with add_room.`,
  inputSchema: { template: z.enum(TEMPLATES).default("blank"), name: z.string().optional() },
}, ({ template, name }) => run(() => session.create(template, name)));

server.registerTool("house_get", {
  description: "Read the current house. format \"summary\" (default) is a compact text view with every id, size, position, opening and light: use it to find ids and free space. \"json\" returns the full file.",
  inputSchema: { format: z.enum(["summary", "json"]).default("summary") },
  annotations: { readOnlyHint: true },
}, ({ format }) => run(() => session.get(format)));

server.registerTool("house_apply_ops", {
  description: "Apply a batch of edit operations (add_room, add_furniture, set_material, add_light, move_object_to ...; see house_guide). Atomic: if any op fails or the result is invalid (overlap, furniture outside its room, opening too wide) nothing changes and the errors say why, so fix and resend. Use dry_run to test first. Always house_get after big changes to check positions.",
  inputSchema: {
    ops: z.array(z.record(z.string(), z.unknown())).min(1).describe("List of operation objects, each with an \"op\" field, e.g. {\"op\":\"add_furniture\",\"roomId\":\"living\",\"category\":\"sofa\",\"against\":\"south\"}"),
    dry_run: z.boolean().default(false),
  },
}, ({ ops, dry_run }) => run(() => session.apply(ops, dry_run)));

server.registerTool("house_validate", {
  description: "Check the current house file for problems (overlapping rooms, furniture outside rooms, openings that do not fit, duplicate ids).",
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, () => run(() => session.validate()));

server.registerTool("house_undo", {
  description: "Undo the last applied batch (up to 50 steps).",
  inputSchema: {},
}, () => run(() => session.undo()));

await server.connect(new StdioServerTransport());
