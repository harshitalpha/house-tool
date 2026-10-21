import { fixtures, type FixtureName } from "@house/core";
import { useEffect, useRef, useState } from "react";
import { HistoryPanel } from "./panels/HistoryPanel";
import { Inspector } from "./panels/Inspector";
import { FeedbackPanel } from "./panels/FeedbackPanel";
import { PathTrace } from "./PathTrace";
import { PastePanel } from "./panels/PastePanel";
import { PromptPanel } from "./panels/PromptPanel";
import { downloadHouse, listBackups, readHouseFile } from "./persistence";
import { emptyHouse, useStore, type Tab } from "./store";
import { useShortcuts } from "./useShortcuts";
import { Viewer3D, type ViewMode } from "./Viewer3D";

const CUTAWAY = 1.2;
const TABS: [Tab, string][] = [["paste", "Paste"], ["prompt", "Prompt"], ["inspect", "Inspect"], ["history", "History"], ["feedback", "Feedback"]];

export function App() {
  const house = useStore((s) => s.house);
  const history = useStore((s) => s.history);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const notice = useStore((s) => s.notice);
  const loadHouse = useStore((s) => s.loadHouse);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const notify = useStore((s) => s.notify);
  const selectedId = useStore((s) => s.selectedId);
  const night = useStore((s) => s.night);
  const setNight = useStore((s) => s.setNight);
  const realistic = useStore((s) => s.realistic);
  const setRealistic = useStore((s) => s.setRealistic);
  const runOps = useStore((s) => s.runOps);
  const traceOpen = useStore((s) => s.traceOpen);
  const setTraceOpen = useStore((s) => s.setTraceOpen);
  const allLocked = useStore((s) => {
    const os = s.house.rooms.flatMap((r) => Object.values(r.sides).flatMap((w) => w.openings));
    return os.length > 0 && os.every((o) => o.locked);
  });

  const [mode, setMode] = useState<ViewMode>(() => {
    const q = new URLSearchParams(location.search).get("mode");
    return q === "walk" || q === "top" ? q : "orbit";
  });
  const [cutaway, setCutaway] = useState(true);
  const [walkStart, setWalkStart] = useState("entrance");
  const [toast, setToast] = useState(notice);
  const fileRef = useRef<HTMLInputElement>(null);

  useShortcuts(mode);

  // Show each notice briefly.
  useEffect(() => {
    setToast(notice);
    if (!notice) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === notice.id ? null : cur)), notice.kind === "error" ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = await readHouseFile(file, house);
    if ("house" in r) loadHouse(r.house, `Load ${file.name}`);
    else notify("error", [`Could not load ${file.name}`, ...r.errors.slice(0, 4)]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>3D House Tool</h1>
        <button onClick={undo} disabled={!history.past.length} title="Undo (Ctrl/Cmd+Z)">↶</button>
        <button onClick={redo} disabled={!history.future.length} title="Redo (Shift+Ctrl/Cmd+Z)">↷</button>
        <span className="sep" />
        <button className={mode === "orbit" ? "on" : ""} onClick={() => setMode("orbit")}>3D</button>
        <button className={mode === "top" ? "on" : ""} onClick={() => setMode("top")}>Top plan</button>
        <button className={mode === "walk" ? "on" : ""} onClick={() => setMode("walk")} disabled={!house.rooms.length}>Walk inside</button>
        {mode === "walk" ? (
          <select value={walkStart} onChange={(e) => setWalkStart(e.target.value)} title="Where to start">
            <option value="entrance">main entrance</option>
            {house.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : (
          <label style={{ cursor: "pointer" }}><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Cutaway walls</label>
        )}
        <button className={night ? "on" : ""} onClick={() => setNight(!night)} title="Daylight off, lights on">{night ? "☾ Night" : "☀ Day"}</button>
        <button className={realistic ? "on" : ""} onClick={() => setRealistic(!realistic)} title="Soft shadows in corners, bloom and filmic colours. Turn off if it feels slow.">✨ Realistic</button>
        {mode !== "top" && <button onClick={() => { document.exitPointerLock?.(); setTraceOpen(true); }} disabled={!house.rooms.length} title="Photo-quality still of the current view, with real light bounces and soft shadows. Takes a minute or two.">📸 Render</button>}
        <button className={allLocked ? "on" : ""} onClick={() => runOps([{ op: "set_locked", id: "all_openings", locked: !allLocked }], { label: allLocked ? "Unlock doors and windows" : "Lock doors and windows" })} title="Locked doors and windows can't be dragged, nudged or resized">{allLocked ? "🔒 Doors" : "🔓 Doors"}</button>
        <span className="grow" />
        <select value="" onChange={(e) => { if (e.target.value) loadHouse(fixtures[e.target.value as FixtureName], `Load example ${e.target.value}`); }}>
          <option value="">Examples…</option>
          {(Object.keys(fixtures) as FixtureName[]).map((n) => <option key={n} value={n}>{fixtures[n].name}</option>)}
        </select>
        <select value="" title="Your house as it was before each example, paste, new or load" onChange={(e) => { const b = listBackups()[Number(e.target.value)]; if (b) loadHouse(b.house, "Restore backup"); }}>
          <option value="">Restore…</option>
          {listBackups().map((b, i) => <option key={b.at} value={i}>{new Date(b.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {b.house.name} · {b.house.furniture.length} items (before: {b.reason})</option>)}
        </select>
        <button onClick={() => loadHouse(emptyHouse(), "New house")}>New</button>
        <button onClick={() => downloadHouse(house)}>Save</button>
        <button onClick={() => fileRef.current?.click()}>Load…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {traceOpen && <PathTrace />}
      <div className="main">
        <div className="stage">
          <Viewer3D house={house} mode={mode} wallHeight={mode !== "walk" && cutaway ? CUTAWAY : undefined} walkStart={walkStart} />
          {mode === "walk" ? (
            <div className="legend">Click to look · W A S D move · Q / E or ← → turn · Shift run · Esc releases the mouse</div>
          ) : (
            <div className="legend">{selectedId ? <>Selected <b>{selectedId}</b> · arrows nudge · R rotate · Del delete</> : "Click anything to select it"}</div>
          )}
          {toast && <div className={`toast ${toast.kind}`}>{toast.lines.slice(0, 4).map((l, i) => <div key={i}>{l}</div>)}</div>}
        </div>

        <div className="side">
          <div className="tabs">{TABS.map(([t, label]) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{label}</button>)}</div>
          <div className="tabbody">
            {tab === "paste" && <PastePanel />}
            {tab === "prompt" && <PromptPanel />}
            {tab === "inspect" && <Inspector />}
            {tab === "history" && <HistoryPanel />}
            {tab === "feedback" && <FeedbackPanel mode={mode} />}
          </div>
        </div>
      </div>
    </div>
  );
}
