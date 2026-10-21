# Using the House Tool with AI assistants

Everything an AI does to the house is a validated **operation** (`add_room`, `add_furniture`, `set_finish`, `add_light` ...), never a code change. The `house-mcp` server exposes those operations as tools, so any MCP-capable assistant can design a house. Chat apps without tools use a copy-paste prompt instead.

```
AI assistant ──MCP──> house-mcp ──> house.json <──sync──> web app (3D view)
```

Tools: `house_guide`, `house_new`, `house_get`, `house_apply_ops` (atomic, `dry_run`), `house_validate`, `house_undo`.

## 0. Build once

```
npm install
npm run build:mcp        # writes plugins/house-design/server/house-mcp.mjs (committed, so plugin users need no build)
```

The server reads and writes one file: `$HOUSE_FILE`, or `--file=PATH`, or `./house.json`.

## 1. See the house live (optional, any assistant)

```
HOUSE_FILE=/path/to/house.json npm run dev -w @house/web     # open http://localhost:5173
```

The page loads that file, reloads when the assistant changes it (undoable, camera kept) and writes your own edits back.

## 2. Claude Code (plugin: MCP server + skill)

```
/plugin marketplace add /path/to/house-tool
/plugin install house-design@house-tool
```

Then ask: "Design a 2 BHK, 85 m², modern, then furnish the living room". Claude loads the `house-design` skill, reads `house_guide`, and edits `./house.json`. For one-off use without the plugin: `claude mcp add house -- node /path/to/house-tool/plugins/house-design/server/house-mcp.mjs`.

## 3. Other assistants

| Assistant | Setup |
|---|---|
| Claude Desktop | merge `integrations/claude-desktop/claude_desktop_config.json` into your config, restart |
| Cursor | `integrations/cursor/mcp.json` -> `.cursor/mcp.json`; `integrations/cursor/house-design.mdc` -> `.cursor/rules/` |
| Codex CLI | `integrations/codex/config.toml` -> `~/.codex/config.toml`; `integrations/codex/AGENTS.md` -> your project's `AGENTS.md` |
| Gemini CLI | `integrations/gemini-cli/settings.json` -> `.gemini/settings.json`; `integrations/gemini-cli/GEMINI.md` -> project `GEMINI.md` |
| ChatGPT, Gemini app, Claude.ai, anything else | no tools: use `integrations/prompt-only/house-design-prompt.md`, or the app's **Prompt** tab, and paste the JSON reply into **Paste** |

Replace `/ABSOLUTE/PATH/TO` in the config files with your checkout path.

## Keeping the instructions in sync

`plugins/house-design/skills/house-design/SKILL.md` is the single source. After editing it (or the operations in `packages/core`) run `npm run gen:integrations` to regenerate the Cursor, Codex, Gemini and prompt-only files.
