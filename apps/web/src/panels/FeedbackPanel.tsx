import { SIDES } from "@house/core";
import { useEffect, useRef, useState } from "react";
import { imageFiles, uploadImage, type UploadedImage } from "../images";
import { cameraYaw } from "../cameraState";
import { useStore } from "../store";
import type { ViewMode } from "../Viewer3D";

interface Status {
  status: "none" | "pending" | "done";
  submittedAt: string | null;
  reply: string | null;
  ops?: unknown[] | null;
  count: number;
}

function describe(house: ReturnType<typeof useStore.getState>["house"], id: string | null): string {
  if (!id) return "the whole house";
  if (id.includes(".")) { const [r, s] = id.split("."); const room = house.rooms.find((x) => x.id === r); return `${s} wall of ${room?.name ?? r}`; }
  const room = house.rooms.find((r) => r.id === id);
  if (room) return room.name;
  const item = house.furniture.find((f) => f.id === id);
  if (item) return item.label ?? item.category;
  for (const r of house.rooms) for (const sd of SIDES) { const o = r.sides[sd].openings.find((x) => x.id === id); if (o) return `${o.type} on the ${sd} wall of ${r.name}`; }
  return id;
}

function describeAll(house: ReturnType<typeof useStore.getState>["house"], ids: string[]): string {
  return ids.length ? ids.map((id) => describe(house, id)).join(" + ") : "the whole house";
}

export function FeedbackPanel({ mode }: { mode: ViewMode }) {
  const house = useStore((s) => s.house);
  const selectedId = useStore((s) => s.selectedId);
  const fbTargets = useStore((s) => s.fbTargets);
  const clearFbTargets = useStore((s) => s.clearFbTargets);
  const removeFbTarget = useStore((s) => s.removeFbTarget);
  const targets = fbTargets.length ? fbTargets : selectedId ? [selectedId] : [];
  const comments = useStore((s) => s.comments);
  const addComment = useStore((s) => s.addComment);
  const removeComment = useStore((s) => s.removeComment);
  const clearComments = useStore((s) => s.clearComments);
  const notify = useStore((s) => s.notify);
  const runOps = useStore((s) => s.runOps);
  const [applied, setApplied] = useState(() => localStorage.getItem("fb-applied"));
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ status: "none", submittedAt: null, reply: null, count: 0 });
  const [sending, setSending] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const attach = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const done = await Promise.all(files.map(uploadImage));
      setImages((cur) => [...cur, ...done]);
    } catch (e) {
      notify("error", [String(e instanceof Error ? e.message : e)]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Poll for Claude's reply while something is pending.
  useEffect(() => {
    let alive = true;
    const poll = () => fetch("/__feedback").then((r) => r.json()).then((s: Status) => alive && setStatus(s)).catch(() => undefined);
    poll();
    const t = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const add = () => {
    if (!text.trim() && !images.length) return;
    addComment(targets, text.trim() || "(see the attached photo)", images);
    clearFbTargets();
    setText("");
    setImages([]);
  };

  const send = async () => {
    const draft = text.trim() || images.length ? [{ id: -1, targetIds: targets, text: text.trim() || "(see the attached photo)", images }] : [];
    const list = [...comments, ...draft];
    if (!list.length) return;
    setSending(true);
    try {
      const canvas = document.querySelector("canvas");
      const screenshot = canvas ? canvas.toDataURL("image/jpeg", 0.85) : undefined;
      const res = await fetch("/__feedback", {
        method: "POST",
        body: JSON.stringify({
          comments: list.map((c) => ({ targetId: c.targetIds[0] ?? null, targetIds: c.targetIds, target: describeAll(house, c.targetIds), text: c.text, images: c.images.map((i) => ({ file: i.file, url: i.url, name: i.name, dominantColors: i.colors })) })),
          house,
          screenshot,
          view: { mode, cameraYawDeg: Math.round(cameraYaw.deg) },
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      clearComments();
      clearFbTargets();
      setText("");
      setImages([]);
      setStatus({ status: "pending", submittedAt: new Date().toISOString(), reply: null, count: list.length });
      notify("info", [`Sent ${list.length} comment${list.length > 1 ? "s" : ""} to Claude`]);
    } catch {
      notify("error", ["Could not send. Is the dev server running? (feedback only works in `npm run dev`)"]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <p className="hint">Click items in the view to pick them (click again to un-pick; pick as many as you like), write what you want changed for all of them, add as many comments as you like, then send them to Claude. Claude edits the design and replies here.</p>
      <div className="row" style={{ flexWrap: "wrap" }}><b>About:</b>
        {targets.length === 0 && <span className="chip">the whole house</span>}
        {targets.map((id) => <span key={id} className="chip">{describe(house, id)} <a href="#" title="Un-pick" onClick={(e) => { e.preventDefault(); removeFbTarget(id); }}>×</a></span>)}
        {targets.length > 0 && <button className="sm" onClick={clearFbTargets}>{targets.length > 1 ? "clear all" : "whole house"}</button>}</div>
      <textarea rows={3} value={text} placeholder="e.g. make this sofa curved, in a dark teal velvet. You can paste or drop a photo here." onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
        onPaste={(e) => { const f = imageFiles(e.clipboardData); if (f.length) { e.preventDefault(); attach(f); } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const f = imageFiles(e.dataTransfer); if (f.length) { e.preventDefault(); attach(f); } }} />
      <div className="row">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "📎 Attach photo"}</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => attach([...(e.target.files ?? [])])} />
        <span className="hint" style={{ margin: 0 }}>a texture, wallpaper or colour you like</span>
      </div>
      {images.length > 0 && <Thumbs images={images} onRemove={(i) => setImages((cur) => cur.filter((_, k) => k !== i))} />}
      <div className="row">
        <button onClick={add} disabled={!text.trim() && !images.length}>Add comment</button>
        <button className="primary" onClick={send} disabled={sending || (!comments.length && !text.trim() && !images.length)}>
          Send to Claude{comments.length || text.trim() || images.length ? ` (${comments.length + (text.trim() || images.length ? 1 : 0)})` : ""}
        </button>
      </div>
      {comments.length > 0 && (
        <>
          <h3>Ready to send</h3>
          {comments.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: "flex-start" }}>
              <span className="chip">{describeAll(house, c.targetIds)}</span>
              <span style={{ flex: 1 }}>{c.text}{c.images.length > 0 && <Thumbs images={c.images} />}</span>
              <button className="sm danger" onClick={() => removeComment(c.id)}>×</button>
            </div>
          ))}
        </>
      )}
      <h3>Status</h3>
      {status.status === "none" && <p className="hint">Nothing sent yet.</p>}
      {status.status === "pending" && <p className="hint">⏳ Sent {status.count} comment{status.count === 1 ? "" : "s"}. Waiting for Claude…</p>}
      {status.status === "done" && <p className="hint">✅ Claude finished.{status.reply ? <><br /><b>{status.reply}</b></> : null}</p>}
      {status.status === "done" && status.ops?.length && status.submittedAt !== applied ? (
        <div className="row">
          <button className="primary" onClick={() => {
            const r = runOps(status.ops as never[], { label: "Claude's edits" });
            if (r.ok) { localStorage.setItem("fb-applied", status.submittedAt ?? ""); setApplied(status.submittedAt); }
          }}>Apply Claude's edits ({status.ops.length})</button>
          <span className="hint" style={{ margin: 0 }}>one undo step</span>
        </div>
      ) : status.status === "done" && status.ops?.length ? <p className="hint">Claude's edits were applied (Ctrl+Z undoes them).</p> : null}
    </div>
  );
}

function Thumbs({ images, onRemove }: { images: { url: string; name: string; colors: string[] }[]; onRemove?: (i: number) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "6px 0" }}>
      {images.map((im, i) => (
        <div key={im.url} style={{ width: 96 }}>
          <div style={{ position: "relative" }}>
            <img src={im.url} alt={im.name} title={im.name} style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
            {onRemove && <button className="sm danger" style={{ position: "absolute", top: 2, right: 2, padding: "0 5px" }} onClick={() => onRemove(i)}>×</button>}
          </div>
          <div style={{ display: "flex", height: 10, marginTop: 3, borderRadius: 3, overflow: "hidden" }} title={im.colors.join(" ")}>
            {im.colors.map((c) => <span key={c} style={{ flex: 1, background: c }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
