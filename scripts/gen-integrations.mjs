// Generates the per-tool instruction files from the one skill, and the prompt-only bundle from the core guide.
// Run: npm run gen:integrations
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const skill = fs.readFileSync(path.join(root, "plugins/house-design/skills/house-design/SKILL.md"), "utf8");
const body = skill.replace(/^---[\s\S]*?---\n/, "").trim();
const write = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.trimEnd() + "\n"); console.log("wrote", rel); };

write("integrations/cursor/house-design.mdc", `---\ndescription: Design or edit a 3D house or floor plan with the house MCP tools\nalwaysApply: false\n---\n\n${body}`);
write("integrations/codex/AGENTS.md", `# House design\n\n${body}`);
write("integrations/gemini-cli/GEMINI.md", `# House design\n\n${body}`);

// Prompt-only: for chat apps with no MCP (ChatGPT, Gemini app, Claude.ai). The user pastes the reply into the app's Paste tab.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "house-gen-"));
const out = path.join(tmp, "guide.mjs");
await build({
  stdin: { contents: `export { buildGuide, buildCreatePrompt } from "@house/core";`, resolveDir: path.join(root, "packages/mcp"), loader: "ts" },
  bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error",
});
const { buildGuide } = await import(out);
const section = (title) => body.split(/^## /m).find((x) => x.startsWith(title))?.replace(/^[^\n]*\n/, "").trim() ?? "";
const sizes = body.match(/Real sizes:[^\n]*/)?.[0] ?? "";
write("integrations/prompt-only/house-design-prompt.md", `# House design: copy-paste prompt

For chat apps without tool support (ChatGPT, Gemini app, Claude.ai, any model).

## How to use
- Quickest: the house tool's **Prompt** tab already builds a complete prompt (rules, operations and your current scene). Copy it into any chat, then paste the reply into the **Paste** tab and press Apply.
- Persistent: paste everything below the line once as a system prompt or custom instructions. For each request, send the current scene text (Prompt tab) plus what you want changed, then paste the JSON reply into the **Paste** tab.
- If the app reports an error, paste it back to the model and ask for a corrected batch.

---

You are an interior designer editing a 3D house model. You cannot see the house, so work only from the scene text the user gives you.
Reply with ONE JSON object and nothing else (no prose, no markdown fences): { "ops": [ ... ] }
Use only ids that appear in the scene. At most 40 operations per reply. If a request is ambiguous, reply with a single clarify op; if it is a question, reply with a single answer op.
Plan before you answer: ${sizes.replace(/^Real sizes: /, "typical sizes are ")}

RULES
${section("Rules that save retries").replace(" or replacing the house (`house_new`)", "")}

${buildGuide()}`);
fs.rmSync(tmp, { recursive: true, force: true });
