import { useEffect, useState } from "react";

/** Number input that commits on Enter or blur, so typing "1.25" doesn't create an edit per keystroke. */
export function NumField({ value, onCommit, step = 0.05, min }: { value: number; onCommit: (n: number) => void; step?: number; min?: number }) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return setText(String(Math.round(value * 100) / 100));
    if (Math.abs(n - value) > 1e-9) onCommit(n);
  };
  return (
    <input
      type="number" value={text} step={step} min={min}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function TextField({ value, onCommit, width }: { value: string; onCommit: (s: string) => void; width?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { if (text !== value) onCommit(text); };
  return (
    <input
      type="text" value={text} style={{ width }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}
