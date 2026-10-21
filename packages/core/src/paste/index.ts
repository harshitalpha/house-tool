import type { ZodError } from "zod";
import { applyOps, resolveOps, type ApplyOk, type OpContext } from "../ops/apply";
import { OpBatch, type Op } from "../ops/schema";
import { House } from "../schema";
import { validateHouse } from "../validator";

export interface Issue {
  path: string;
  message: string;
}

/** "rooms.0.sides.north" → "rooms[0].sides.north" */
export function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");
}

export function formatZodIssues(error: ZodError, prefix = ""): Issue[] {
  return error.issues.map((i) => ({ path: prefix + formatPath(i.path), message: i.message }));
}

export type Extracted = { ok: true; value: unknown; how: "fence" | "whole" | "slice" } | { ok: false; error: string };

/** Pull a JSON value out of text an AI might have wrapped in a code fence or a sentence. */
export function extractJson(text: string): Extracted {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Nothing pasted yet." };

  const candidates: { src: string; how: "fence" | "whole" | "slice" }[] = [];
  for (const m of trimmed.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)) candidates.push({ src: m[1]!.trim(), how: "fence" });
  candidates.push({ src: trimmed, how: "whole" });
  const first = trimmed.search(/[{[]/);
  const last = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (first >= 0 && last > first) candidates.push({ src: trimmed.slice(first, last + 1), how: "slice" });

  let lastError = "";
  for (const c of candidates) {
    try {
      const value = JSON.parse(c.src);
      if (value !== null && typeof value === "object") return { ok: true, value, how: c.how };
    } catch (e) {
      // keep the error from the most JSON-looking candidate
      if (c.how !== "whole" || !lastError) lastError = (e as Error).message;
    }
  }
  if (first < 0) return { ok: false, error: "No JSON found. Paste the object the AI returned, starting with { }." };
  return { ok: false, error: `That is not valid JSON: ${lastError}` };
}

export interface PasteEvaluation {
  kind: "empty" | "invalid" | "house" | "ops";
  ok: boolean;
  errors: Issue[];
  /** Human-readable summary of what Apply will do. */
  messages: string[];
  /** The scene after applying, when ok. */
  nextHouse?: House;
  /** Resolved ops (concrete ids and compass directions), when kind is "ops" and ok. */
  resolvedOps?: Op[];
  result?: ApplyOk;
  question?: { text: string; candidates: string[] };
  answer?: string;
}

const fail = (kind: PasteEvaluation["kind"], errors: Issue[]): PasteEvaluation => ({ kind, ok: false, errors, messages: [] });

/** Everything the Paste panel needs, without touching the scene: parse, check, resolve, dry-run. */
export function evaluatePaste(text: string, current: House, ctx: OpContext = {}): PasteEvaluation {
  if (!text.trim()) return { kind: "empty", ok: false, errors: [], messages: [] };
  const ex = extractJson(text);
  if (!ex.ok) return fail("invalid", [{ path: "", message: ex.error }]);

  let value = ex.value;
  const isObj = !Array.isArray(value) && typeof value === "object" && value !== null;
  const obj = value as Record<string, unknown>;

  if (isObj && "rooms" in obj) {
    if (obj.version === undefined) value = { ...obj, version: 1 };
    const parsed = House.safeParse(value);
    if (!parsed.success) return fail("house", formatZodIssues(parsed.error));
    const issues = validateHouse(parsed.data);
    if (issues.length) return fail("house", issues);
    const h = parsed.data;
    return {
      kind: "house", ok: true, errors: [], nextHouse: h,
      messages: [`Replace the current house with "${h.name}": ${h.rooms.length} room${h.rooms.length === 1 ? "" : "s"}, ${h.furniture.length} furniture item${h.furniture.length === 1 ? "" : "s"}`],
    };
  }

  if (Array.isArray(value) || (isObj && "ops" in obj)) {
    const batch = OpBatch.safeParse(Array.isArray(value) ? { ops: value } : value);
    if (!batch.success) return fail("ops", formatZodIssues(batch.error));
    const resolved = resolveOps(current, batch.data.ops, ctx);
    if (!resolved.ok) return fail("ops", resolved.errors);
    const applied = applyOps(current, resolved.ops);
    if (!applied.ok) return fail("ops", applied.errors);
    return {
      kind: "ops", ok: true, errors: [], messages: applied.messages, nextHouse: applied.house,
      resolvedOps: resolved.ops, result: applied, question: applied.question, answer: applied.answer,
    };
  }

  return fail("invalid", [{ path: "", message: 'Expected a house ({ "version": 1, "rooms": [...] }) or an op batch ({ "ops": [...] }).' }]);
}
