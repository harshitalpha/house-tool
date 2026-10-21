import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Dev-server endpoints that connect the page to the Claude Code session through plain files in
 * `<repo>/feedback/`:
 *   POST /__house     the page's live house (autosave mirror), written to live-house.json
 *   POST /__feedback  comments + screenshot + house snapshot, written to inbox.json with status "pending"
 *   POST /__attachment  an uploaded photo ({name, dataUrl}) saved to feedback/attachments/, returns its URL
 *   GET  /__attachment/<file>  serves it (used as wallpaper/fabric textures and shown to Claude)
 *   GET  /__feedback  inbox status and Claude's reply, so the page can show "working..." / "done"
 * Claude reads inbox.json, then sets status "done", a short "reply" and optionally "ops": edit operations the
 * page offers as an "Apply Claude's edits" button (they land on the user's live house, undoable).
 */
export function feedbackPlugin(): Plugin {
  const dir = path.resolve(__dirname, "../../feedback");
  const inbox = path.join(dir, "inbox.json");
  const read = (req: import("node:http").IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  const send = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  return {
    name: "house-feedback",
    configureServer(server) {
      fs.mkdirSync(dir, { recursive: true });
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        try {
          if (url === "/__house" && req.method === "POST") {
            fs.writeFileSync(path.join(dir, "live-house.json"), await read(req));
            return send(res, 200, { ok: true });
          }
          // Linked house file (HOUSE_FILE env): shared with the house-mcp server so an AI agent and the page edit the same house.
          if (url === "/__project" && req.method === "GET") {
            const file = process.env.HOUSE_FILE ? path.resolve(process.env.HOUSE_FILE) : null;
            if (!file) return send(res, 200, { enabled: false });
            if (!fs.existsSync(file)) return send(res, 200, { enabled: true, file, mtime: 0, house: null });
            return send(res, 200, { enabled: true, file, mtime: fs.statSync(file).mtimeMs, house: JSON.parse(fs.readFileSync(file, "utf8")) });
          }
          if (url === "/__project" && req.method === "POST") {
            if (!process.env.HOUSE_FILE) return send(res, 400, { ok: false, error: "HOUSE_FILE is not set" });
            const file = path.resolve(process.env.HOUSE_FILE);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, await read(req));
            return send(res, 200, { ok: true, mtime: fs.statSync(file).mtimeMs });
          }
          if (url === "/__attachment" && req.method === "POST") {
            const body = JSON.parse(await read(req)) as { name?: string; dataUrl?: string };
            const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(body.dataUrl ?? "");
            if (!m) return send(res, 400, { ok: false, error: "expected a png, jpeg or webp data URL" });
            const slug = (body.name ?? "image").replace(/\.[^.]*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "image";
            const file = `${Date.now().toString(36)}-${slug}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
            fs.mkdirSync(path.join(dir, "attachments"), { recursive: true });
            fs.writeFileSync(path.join(dir, "attachments", file), Buffer.from(m[2]!, "base64"));
            return send(res, 200, { ok: true, url: `/__attachment/${file}`, file: `feedback/attachments/${file}` });
          }
          if (url?.startsWith("/__attachment/") && req.method === "GET") {
            const file = path.basename(url.slice("/__attachment/".length));
            const full = path.join(dir, "attachments", file);
            if (!/^[A-Za-z0-9._-]+$/.test(file) || !fs.existsSync(full)) { res.statusCode = 404; return res.end("not found"); }
            res.setHeader("content-type", file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg");
            return res.end(fs.readFileSync(full));
          }
          if (url === "/__feedback" && req.method === "POST") {
            const body = JSON.parse(await read(req)) as { comments: unknown[]; house: unknown; screenshot?: string; view?: unknown };
            let shot: string | null = null;
            const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(body.screenshot ?? "");
            if (m) {
              shot = `feedback/screenshot.${m[1] === "jpeg" ? "jpg" : "png"}`;
              fs.writeFileSync(path.resolve(dir, "..", shot), Buffer.from(m[2]!, "base64"));
            }
            fs.writeFileSync(path.join(dir, "house-at-submit.json"), JSON.stringify(body.house, null, 2));
            fs.writeFileSync(
              inbox,
              JSON.stringify({ status: "pending", submittedAt: new Date().toISOString(), comments: body.comments, view: body.view ?? null, screenshot: shot, houseFile: "feedback/house-at-submit.json", reply: null }, null, 2),
            );
            return send(res, 200, { ok: true });
          }
          if (url === "/__feedback" && req.method === "GET") {
            const data = fs.existsSync(inbox) ? JSON.parse(fs.readFileSync(inbox, "utf8")) : { status: "none" };
            return send(res, 200, { status: data.status, submittedAt: data.submittedAt ?? null, reply: data.reply ?? null, ops: data.ops ?? null, count: data.comments?.length ?? 0 });
          }
        } catch (e) {
          return send(res, 500, { ok: false, error: String(e) });
        }
        next();
      });
    },
  };
}
