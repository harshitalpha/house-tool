import { useStore } from "../store";

export function HistoryPanel() {
  const history = useStore((s) => s.history);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const revertTo = useStore((s) => s.revertTo);

  return (
    <div>
      <div className="row">
        <button onClick={undo} disabled={!history.past.length}>↶ Undo</button>
        <button onClick={redo} disabled={!history.future.length}>↷ Redo</button>
        <span className="hint" style={{ margin: 0 }}>{history.past.length} change{history.past.length === 1 ? "" : "s"}{history.future.length ? `, ${history.future.length} undone` : ""}</span>
      </div>
      {!history.past.length && <p className="hint">Changes you make appear here. History lasts until you reload the page; the house itself is autosaved.</p>}
      {[...history.past].map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
        <div className="histitem" key={i}>
          <div className="t">{e.label}</div>
          <div className="m">{e.messages.slice(0, 4).map((m, j) => <div key={j}>{m}</div>)}{e.messages.length > 4 && <div>+{e.messages.length - 4} more</div>}</div>
          <button className="sm" style={{ marginTop: 4 }} onClick={() => revertTo(i)}>Revert to before this</button>
        </div>
      ))}
    </div>
  );
}
