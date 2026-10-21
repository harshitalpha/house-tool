# 3D House Tool

Phase 1: render a house from pasted JSON, edit it by pasting op batches. No LLM inside the app.


```
npm install
npm test            # core unit tests
npm run typecheck
npm run dev         # web app (B0 placeholder until the viewer lands in B1)
```

If `npm install` fails with `ERR_INVALID_AUTH`, your global `~/.npmrc` has a legacy `_auth` key.
Run with an empty user config: `NPM_CONFIG_USERCONFIG=/tmp/empty.npmrc npm install`.

Layout: `packages/core` (pure TS: schema, geometry, validator, ids, serialize, fixtures),
`apps/web` (Vite + React). `core` is consumed as TypeScript source, so there is no build step.

## Use it with AI assistants

An MCP server (`packages/mcp`) and a Claude Code plugin (`plugins/house-design`) let an assistant design the house through validated operations; setup for Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI and copy-paste prompts for chat apps is in [docs/ai-tools.md](docs/ai-tools.md).

## Licence

MIT, see [LICENSE](LICENSE). Textures in `apps/web/public/textures` are CC0 from Poly Haven.
