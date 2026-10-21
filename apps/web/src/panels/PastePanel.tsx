import { evaluatePaste } from "@house/core";
import { useMemo, useState } from "react";
import { cameraYaw } from "../cameraState";
import { useStore } from "../store";

export function PastePanel() {
  const house = useStore((s) => s.house);
  const selectedId = useStore((s) => s.selectedId);
  const commitEvaluation = useStore((s) => s.commitEvaluation);
  const select = useStore((s) => s.select);
  const notify = useStore((s) => s.notify);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ answer?: string; question?: { text: string; candidates: string[] } } | null>(null);

  // Live preview: parse, check, resolve and dry-run on every change, without touching the scene.
  const ev = useMemo(
    () => evaluatePaste(text, house, { selectedId, cameraYawDeg: cameraYaw.deg }),
    [text, house, selectedId],
  );

  const apply = () => {
    // Re-evaluate at the moment of applying, so "left" and "$selected" use the current view.
    const fresh = evaluatePaste(text, house, { selectedId, cameraYawDeg: cameraYaw.deg });
    if (!fresh.ok) return;
    commitEvaluation(fresh, fresh.kind === "house" ? "Paste house" : "Paste ops");
    if (fresh.answer || fresh.question) setReply({ answer: fresh.answer, question: fresh.question });
    else setReply(null);
    setText("");
  };

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      notify("error", ["The browser blocked clipboard access. Paste into the box with Cmd/Ctrl+V."]);
    }
  };

  return (
    <div>
      <p className="hint">Paste the JSON your AI returned: a whole <b>house</b> or a batch of <b>ops</b>. Code fences and extra text are fine.</p>
      <textarea
        rows={12} value={text} spellCheck={false}
        placeholder={'{ "ops": [ { "op": "move_object_by", "id": "$selected", "direction": "left", "distance": 0.5 } ] }'}
        onChange={(e) => { setText(e.target.value); setReply(null); }}
      />
      <div className="row">
        <button className="primary" disabled={!ev.ok} onClick={apply}>
          {ev.kind === "house" ? "Replace house" : ev.kind === "ops" && ev.result?.patches.length === 0 ? "OK" : "Apply"}
        </button>
        <button onClick={paste}>Paste from clipboard</button>
        <button onClick={() => { setText(""); setReply(null); }} disabled={!text}>Clear</button>
        {ev.kind !== "empty" && (
          <span className={`chip ${ev.ok ? "" : "bad"}`} style={{ marginLeft: "auto" }}>
            {ev.ok ? (ev.kind === "house" ? "House ✓" : "Ops ✓") : "Can't apply"}
          </span>
        )}
      </div>

      {ev.errors.length > 0 && (
        <div className="errors">
          <b>Fix these and paste again</b>
          <ul className="plain">
            {ev.errors.map((e, i) => <li key={i}>{e.path && <code>{e.path}</code>} {e.message}</li>)}
          </ul>
          <button className="sm" onClick={() => navigator.clipboard?.writeText(ev.errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join("\n"))}>
            Copy errors (to send back to the AI)
          </button>
        </div>
      )}

      {ev.ok && (
        <div className="preview">
          <b>{ev.kind === "house" ? "This will" : "This will do"}</b>
          <ul className="plain">{ev.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {reply?.answer && <div className="preview"><b>AI answered</b><div>{reply.answer}</div></div>}
      {reply?.question && (
        <div className="preview">
          <b>The AI needs to know</b>
          <div>{reply.question.text}</div>
          {reply.question.candidates.length > 0 && (
            <div className="row">
              {reply.question.candidates.map((c) => <button key={c} className="sm" onClick={() => select(c)}>{c}</button>)}
              <span className="hint" style={{ margin: 0 }}>Click one to select it, then ask again.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
