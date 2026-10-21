import fs from "node:fs";
import path from "node:path";
import {
  applyOps, buildGuide, fixtures, House, Op, summarizeScene, validateHouse, stableStringify, MAX_OPS,
  type FixtureName,
} from "@house/core";

export const TEMPLATES = ["blank", ...Object.keys(fixtures)] as const;
export type Template = (typeof TEMPLATES)[number];

export interface Result {
  ok: boolean;
  text: string;
}

/** One house file plus its undo snapshots. Every tool call reads the file fresh, so edits made elsewhere (the web app, a text editor) are never overwritten blindly. */
export class Session {
  readonly file: string;
  private readonly histDir: string;

  constructor(file: string) {
    this.file = path.resolve(file);
    this.histDir = `${this.file}.history`;
  }

  exists(): boolean {
    return fs.existsSync(this.file);
  }

  load(): House {
    if (!this.exists()) throw new Error(`No house yet at ${this.file}. Call house_new first.`);
    return House.parse(JSON.parse(fs.readFileSync(this.file, "utf8")));
  }

  private save(house: House): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, stableStringify(house));
  }

  private snapshots(): string[] {
    if (!fs.existsSync(this.histDir)) return [];
    return fs.readdirSync(this.histDir).filter((f) => f.endsWith(".json")).sort();
  }

  private snapshot(): void {
    if (!this.exists()) return;
    fs.mkdirSync(this.histDir, { recursive: true });
    const n = String((this.snapshots().length ? Number(this.snapshots().at(-1)!.slice(0, -5)) : 0) + 1).padStart(5, "0");
    fs.copyFileSync(this.file, path.join(this.histDir, `${n}.json`));
    for (const old of this.snapshots().slice(0, -50)) fs.unlinkSync(path.join(this.histDir, old));
  }

  create(template: Template, name?: string): Result {
    this.snapshot();
    const base = template === "blank" ? { version: 1 as const, name: "Untitled house", rooms: [] } : structuredClone(fixtures[template as FixtureName]);
    const house = House.parse({ ...base, ...(name ? { name } : {}) });
    this.save(house);
    return { ok: true, text: `Created ${template} house at ${this.file}.\n\n${summarizeScene(house)}` };
  }

  get(format: "summary" | "json"): Result {
    const house = this.load();
    return { ok: true, text: format === "json" ? stableStringify(house) : summarizeScene(house) };
  }

  guide(): Result {
    return { ok: true, text: buildGuide() };
  }

  validate(): Result {
    const issues = validateHouse(this.load());
    return issues.length
      ? { ok: false, text: `${issues.length} problem(s):\n${issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")}` }
      : { ok: true, text: "The house is valid." };
  }

  /** Apply a batch atomically. With dryRun nothing is written. */
  apply(rawOps: unknown[], dryRun = false): Result {
    if (!rawOps.length) return { ok: false, text: "No operations given." };
    if (rawOps.length > MAX_OPS) return { ok: false, text: `Too many operations (${rawOps.length}); send at most ${MAX_OPS} per call.` };
    const ops: Op[] = [];
    for (const [i, raw] of rawOps.entries()) {
      const parsed = Op.safeParse(raw);
      if (!parsed.success) {
        const why = parsed.error.issues.slice(0, 4).map((x) => `${x.path.join(".") || "(op)"}: ${x.message}`).join("; ");
        const name = raw && typeof raw === "object" && "op" in raw ? String((raw as { op: unknown }).op) : "?";
        return { ok: false, text: `ops[${i}] (${name}) is not a valid operation: ${why}\nNothing was changed. Call house_guide for the operation list.` };
      }
      ops.push(parsed.data);
    }
    const house = this.load();
    const r = applyOps(house, ops);
    if (!r.ok) return { ok: false, text: `Nothing was changed.\n${r.errors.map((e) => `- ${e.path}: ${e.message}`).join("\n")}` };
    if (r.question) return { ok: true, text: `Question for the user (nothing changed): ${r.question.text}${r.question.candidates.length ? `\nOptions: ${r.question.candidates.join(", ")}` : ""}` };
    if (!dryRun) {
      this.snapshot();
      this.save(r.house);
    }
    return { ok: true, text: `${dryRun ? "Dry run, nothing saved. Would apply" : "Applied"} ${ops.length} operation(s):\n${r.messages.map((m) => `- ${m}`).join("\n")}` };
  }

  undo(): Result {
    const last = this.snapshots().at(-1);
    if (!last) return { ok: false, text: "Nothing to undo." };
    const p = path.join(this.histDir, last);
    fs.copyFileSync(p, this.file);
    fs.unlinkSync(p);
    return { ok: true, text: `Undid the last change.\n\n${summarizeScene(this.load())}` };
  }
}
