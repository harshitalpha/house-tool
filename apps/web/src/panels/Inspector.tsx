import { FURNITURE_DEFAULTS, MODELS, SIDES, TEXTURES, type House, type Material, type OpInput, type Side } from "@house/core";
import { useRef, useState } from "react";
import { uploadImage } from "../images";
import { useStore } from "../store";
import { NumField, TextField } from "./NumField";

type Room = House["rooms"][number];
type Item = House["furniture"][number];

const CATEGORIES = Object.keys(FURNITURE_DEFAULTS);

export function Inspector() {
  const house = useStore((s) => s.house);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const runOps = useStore((s) => s.runOps);

  const run = (op: OpInput, label: string, mergeKey?: string) => runOps([op], { label, mergeKey });

  if (!selectedId) {
    return (
      <div>
        <p className="hint">Click a piece of furniture, a floor or a wall in the view to edit it here.</p>
        <h3>House</h3>
        <div className="kv"><span>Name</span><span>{house.name}</span>
          <span>Rooms</span><span>{house.rooms.length}</span>
          <span>Furniture</span><span>{house.furniture.length}</span></div>
        <h3>Rooms</h3>
        {house.rooms.map((r) => <div key={r.id} className="row"><button className="sm" onClick={() => select(r.id)}>{r.name}</button><span className="hint" style={{ margin: 0 }}>{r.width} × {r.depth} m</span></div>)}
        {!house.rooms.length && <p className="hint">No rooms yet. Use the Prompt tab to generate a house, or load an example from the toolbar.</p>}
        <h3>Keys</h3>
        <ul className="plain hint">
          <li>Arrow keys nudge the selection 10 cm (Shift: 50 cm)</li>
          <li>R rotates furniture 90° (Shift: back)</li>
          <li>Delete removes furniture or a selected door/window</li>
          <li>Click a door or window (brown / blue) and drag it along its wall, or use the arrows</li>
          <li>Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo, Esc deselects</li>
        </ul>
      </div>
    );
  }

  if (selectedId.includes(".")) {
    const [roomId, side] = selectedId.split(".") as [string, Side];
    const room = house.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    return <WallInspector room={room} side={side} run={run} select={select} />;
  }
  const room = house.rooms.find((r) => r.id === selectedId);
  if (room) return <RoomInspector room={room} house={house} run={run} select={select} />;
  const item = house.furniture.find((f) => f.id === selectedId);
  if (item) return <ItemInspector item={item} house={house} run={run} select={select} />;
  const light = house.lights.find((l) => l.id === selectedId);
  if (light) return <LightInspector light={light} run={run} select={select} />;
  for (const r of house.rooms) for (const sd of SIDES) {
    const o = r.sides[sd].openings.find((x) => x.id === selectedId);
    if (o) return <OpeningInspector room={r} side={sd} o={o} run={run} select={select} />;
  }
  return null;
}

function OpeningInspector({ room, side, o, run, select }: { room: Room; side: Side; o: Room["sides"][Side]["openings"][number]; run: Run; select: (id: string | null) => void }) {
  const wallId = `${room.id}.${side}`;
  const len = side === "north" || side === "south" ? room.width : room.depth;
  const move = (offset: number, merge = true) => run({ op: "move_opening", id: o.id, offset: Math.max(0, Math.round(offset * 100) / 100) }, `Move ${o.id}`, merge ? `nudge:${o.id}` : undefined);
  return (
    <div>
      <div className="row"><b>{o.type === "door" ? "Door" : "Window"}</b><span className="chip">{o.id}</span></div>
      <p className="hint">On the <a href="#" onClick={(e) => { e.preventDefault(); select(wallId); }}>{side} wall</a> of {room.name} ({len.toFixed(2)} m long, {o.width} m wide). Drag it to slide it, drag the white handles at its ends to stretch it, use the arrow keys, or type values. Offset is metres from the wall's left end, seen from inside.</p>
      <div className="row"><button className={`sm${o.locked ? " on" : ""}`} onClick={() => run({ op: "set_locked", id: o.id, locked: !o.locked }, o.locked ? `Unlock ${o.id}` : `Lock ${o.id}`)}>{o.locked ? "🔒 Locked, click to unlock" : "🔓 Lock in place"}</button></div>
      <div className="row"><label>Offset</label>
        <button className="sm" onClick={() => move(o.offset - 0.1)}>◀ 10 cm</button>
        <NumField value={o.offset} min={0} onCommit={(v) => move(v, false)} />
        <button className="sm" onClick={() => move(o.offset + 0.1)}>10 cm ▶</button></div>
      <div className="row"><label>Width</label>
        <NumField value={o.width} min={0.3} onCommit={(width) => run({ op: "resize_opening", id: o.id, width }, `Resize ${o.id}`)} />
        <label style={{ minWidth: 0 }}>m</label>
        {[0.9, 1.2, 1.8, 2.4].map((w) => <button key={w} className="sm" onClick={() => run({ op: "resize_opening", id: o.id, width: w }, `Resize ${o.id}`)}>{w}</button>)}</div>
      <div className="row"><label>Height</label>
        <NumField value={o.height} min={0.3} onCommit={(height) => run({ op: "resize_opening", id: o.id, height }, `Resize ${o.id}`)} />
        <label style={{ minWidth: 0 }}>m</label></div>
      <div className="row"><label>Colour</label>
        <input type="color" value={o.color ?? (o.type === "door" ? "#8a5a35" : "#9ecbf0")} onChange={(e) => run({ op: "set_material", id: o.id, color: e.target.value }, `${o.id} colour`, `color:${o.id}`)} /></div>
      <div className="row"><label>Gap to right end</label><span>{Math.max(0, len - o.offset - o.width).toFixed(2)} m</span></div>
      <div className="row"><button className="sm danger" onClick={() => { run({ op: "remove_opening", id: o.id }, "Remove opening"); select(null); }}>Remove</button></div>
    </div>
  );
}

type Run = (op: OpInput, label: string, mergeKey?: string) => unknown;

/** Texture, pattern size and tint for a surface (wall, floor or furniture), applied with set_finish. */
function FinishEditor({ id, finish, base, run }: { id: string; finish: Material | undefined; base: string; run: Run }) {
  const texture = finish?.texture ?? "plain";
  const file = useRef<HTMLInputElement>(null);
  const notify = useStore((s) => s.notify);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const img = await uploadImage(f);
      run({ op: "set_finish", id, image: img.url, scale: finish?.scale ?? 0.6 }, `${id} photo`);
    } catch (e) {
      notify("error", [String(e instanceof Error ? e.message : e)]);
    }
    if (file.current) file.current.value = "";
  };
  return (
    <>
      <div className="row"><label>Photo</label>
        {finish?.image && <img src={finish.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />}
        <button className="sm" onClick={() => file.current?.click()}>{finish?.image ? "Replace photo…" : "Use a photo…"}</button>
        {finish?.image && <button className="sm danger" onClick={() => run({ op: "set_finish", id, image: "" }, `${id} photo removed`)}>Remove</button>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} /></div>
      <div className="row"><label>Pattern</label>
        <select value={texture} onChange={(e) => run({ op: "set_finish", id, texture: e.target.value as never }, `${id} pattern`)}>
          {TEXTURES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <label style={{ minWidth: 0 }}>every</label>
        <NumField value={finish?.scale ?? 0.5} min={0.05} onCommit={(scale) => run({ op: "set_finish", id, scale }, `${id} pattern size`)} />
        <label style={{ minWidth: 0 }}>m</label></div>
      {(texture !== "plain" || finish?.image) && (
        <div className="row"><label>Tint</label>
          <input type="color" value={finish?.color ?? base} onChange={(e) => run({ op: "set_finish", id, color: e.target.value }, `${id} tint`, `tint:${id}`)} />
          <label style={{ minWidth: 0 }}>shine</label>
          <input type="range" min={0} max={1} step={0.05} value={1 - (finish?.roughness ?? 0.8)} onChange={(e) => run({ op: "set_finish", id, roughness: 1 - Number(e.target.value) }, `${id} shine`, `shine:${id}`)} /></div>
      )}
    </>
  );
}

function LightInspector({ light, run, select }: { light: House["lights"][number]; run: Run; select: (id: string | null) => void }) {
  return (
    <div>
      <div className="row"><b>{light.label ?? `${light.type} light`}</b><span className="chip">{light.id}</span></div>
      <p className="hint">Arrow keys move it across the room. Daylight washes lights out: switch the toolbar to Night to see them properly.</p>
      <div className="row"><label>On</label><input type="checkbox" checked={light.on} onChange={(e) => run({ op: "set_light", id: light.id, on: e.target.checked }, e.target.checked ? "Light on" : "Light off")} /></div>
      <div className="row"><label>Type</label>
        <select value={light.type} onChange={(e) => run({ op: "set_light", id: light.id, type: e.target.value as never }, "Light type")}><option value="point">point (all around)</option><option value="spot">spot (cone, aims down)</option></select></div>
      <div className="row"><label>Fixture</label>
        <select value={light.fixture} onChange={(e) => run({ op: "set_light", id: light.id, fixture: e.target.value as never }, "Light fixture")}>
          {["none", "downlight", "pendant", "bulb", "panel"].map((f) => <option key={f}>{f}</option>)}</select></div>
      <div className="row"><label>Colour</label>
        <input type="color" value={light.color} onChange={(e) => run({ op: "set_light", id: light.id, color: e.target.value }, "Light colour", `lc:${light.id}`)} />
        {[["warm", "#ffd9a8"], ["neutral", "#fff4e0"], ["cool", "#dfeaff"]].map(([n, c]) => <button key={n} className="sm" onClick={() => run({ op: "set_light", id: light.id, color: c! }, "Light colour")}>{n}</button>)}</div>
      <div className="row"><label>Brightness</label>
        <input type="range" min={0} max={10} step={0.25} value={light.intensity} onChange={(e) => run({ op: "set_light", id: light.id, intensity: Number(e.target.value) }, "Light brightness", `li:${light.id}`)} /><span>{light.intensity}</span></div>
      {light.type === "spot" && <div className="row"><label>Cone</label>
        <input type="range" min={10} max={80} step={1} value={light.angle} onChange={(e) => run({ op: "set_light", id: light.id, angle: Number(e.target.value) }, "Light cone", `la:${light.id}`)} /><span>{light.angle}°</span></div>}
      <h3>Position (m)</h3>
      <div className="row"><label>x / y / z</label>
        <NumField value={light.at.x} onCommit={(x) => run({ op: "set_light", id: light.id, at: { ...light.at, x } }, "Move light")} />
        <NumField value={light.at.y} onCommit={(y) => run({ op: "set_light", id: light.id, at: { ...light.at, y } }, "Move light")} />
        <NumField value={light.at.z} onCommit={(z) => run({ op: "set_light", id: light.id, at: { ...light.at, z } }, "Move light")} /></div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="danger" onClick={() => { run({ op: "remove_light", id: light.id }, "Remove light"); select(null); }}>Remove light</button>
      </div>
    </div>
  );
}

function ModelEditor({ item, run }: { item: Item; run: Run }) {
  const def = item.model ? MODELS[item.model.name] : undefined;
  return (
    <>
      <div className="row"><label>Shape</label>
        <select value={item.parts ? "custom" : item.model?.name ?? "box"} disabled={!!item.parts}
          onChange={(e) => run({ op: "set_model", id: item.id, name: e.target.value }, "Shape")}>
          {item.parts && <option value="custom">custom parts ({item.parts.length})</option>}
          <option value="box">plain box</option>
          {Object.keys(MODELS).map((n) => <option key={n} value={n}>{n.replace("_", " ")}</option>)}
        </select>
        {def && def.styles.length > 1 && (
          <select value={item.model?.style ?? def.styles[0]} onChange={(e) => run({ op: "set_model", id: item.id, name: def.name, style: e.target.value, count: item.model?.count }, "Style")}>
            {def.styles.map((st) => <option key={st}>{st}</option>)}</select>)}
        {def && (def.name === "sofa" || def.name === "wardrobe") && (
          <NumField value={item.model?.count ?? (def.name === "sofa" ? Math.round(item.width / 0.75) : Math.round(item.width / 0.55))} step={1} min={1}
            onCommit={(count) => run({ op: "set_model", id: item.id, name: def.name, style: item.model?.style, count: Math.round(count) }, "Count")} />)}
      </div>
      {item.parts && <p className="hint" style={{ margin: "0 0 6px" }}>Built from custom parts. Ask Claude to change the shape, or pick a model to replace it.</p>}
    </>
  );
}


function ItemInspector({ item, house, run, select }: { item: Item; house: House; run: Run; select: (id: string | null) => void }) {
  const room = house.rooms.find((r) => r.id === item.roomId);
  return (
    <div>
      <div className="row"><b>{item.label ?? item.category}</b><span className="chip">{item.id}</span></div>
      <p className="hint">in <a href="#" onClick={(e) => { e.preventDefault(); select(item.roomId); }}>{room?.name ?? item.roomId}</a></p>
      <div className="row"><label>Label</label><TextField width={200} value={item.label ?? ""} onCommit={(label) => run({ op: "set_label", id: item.id, label }, "Label")} /></div>
      <h3>Position (centre, m)</h3>
      <div className="row"><label>x / z</label>
        <NumField value={item.x} onCommit={(x) => run({ op: "move_object_to", id: item.id, x, z: item.z }, "Move")} />
        <NumField value={item.z} onCommit={(z) => run({ op: "move_object_to", id: item.id, x: item.x, z }, "Move")} /></div>
      <div className="row"><label>Rotation</label>
        <button className="sm" onClick={() => run({ op: "rotate_object", id: item.id, degrees: -90 }, "Rotate")}>⟲ 90°</button>
        <NumField value={item.rotation} step={15} onCommit={(degrees) => run({ op: "rotate_object", id: item.id, degrees, mode: "to" }, "Rotate")} />
        <button className="sm" onClick={() => run({ op: "rotate_object", id: item.id, degrees: 90 }, "Rotate")}>⟳ 90°</button></div>
      <h3>Size (m)</h3>
      <div className="row"><label>w / d / h</label>
        <NumField value={item.width} min={0.05} onCommit={(width) => run({ op: "resize_object", id: item.id, width }, "Resize")} />
        <NumField value={item.depth} min={0.05} onCommit={(depth) => run({ op: "resize_object", id: item.id, depth }, "Resize")} />
        <NumField value={item.height} min={0.05} onCommit={(height) => run({ op: "resize_object", id: item.id, height }, "Resize")} /></div>
      <h3>Look</h3>
      <ModelEditor item={item} run={run} />
      <div className="row"><label>Colour</label>
        <input type="color" value={item.material?.color ?? item.color} onChange={(e) => run({ op: "set_material", id: item.id, color: e.target.value }, "Colour", `color:${item.id}`)} /></div>
      <FinishEditor id={item.id} finish={item.material} base={item.color} run={run} />
      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => run({ op: "set_locked", id: item.id, locked: !item.locked }, item.locked ? `Unlock ${item.id}` : `Lock ${item.id}`)}>{item.locked ? "🔒 Locked" : "🔓 Lock"}</button>
        <button onClick={() => run({ op: "add_furniture", roomId: item.roomId, category: item.category, label: item.label, color: item.color, width: item.width, depth: item.depth, height: item.height, elevation: item.elevation, rotation: item.rotation, ...(item.model ? { model: item.model } : {}), ...(item.parts ? { parts: item.parts } : {}), ...(item.material ? { material: item.material } : {}) }, "Duplicate")}>Duplicate</button>
        <button className="danger" onClick={() => run({ op: "remove_furniture", id: item.id }, "Delete")}>Delete</button>
      </div>
    </div>
  );
}

function RoomInspector({ room, house, run, select }: { room: Room; house: House; run: Run; select: (id: string | null) => void }) {
  const [category, setCategory] = useState("sofa");
  const [modelName, setModelName] = useState("sofa");
  const items = house.furniture.filter((f) => f.roomId === room.id);
  const wallColor = room.sides.north.material;
  return (
    <div>
      <div className="row"><b>{room.name}</b><span className="chip">{room.id}</span></div>
      <div className="row"><label>Name</label><TextField width={200} value={room.name} onCommit={(name) => run({ op: "rename_room", id: room.id, name }, "Rename room")} /></div>
      <h3>Size and place (interior, m)</h3>
      <div className="row"><label>width / depth</label>
        <NumField value={room.width} min={0.5} onCommit={(width) => run({ op: "resize_room", id: room.id, width }, "Resize room")} />
        <NumField value={room.depth} min={0.5} onCommit={(depth) => run({ op: "resize_room", id: room.id, depth }, "Resize room")} /></div>
      <div className="row"><label>x / z</label>
        <NumField value={room.x} onCommit={(x) => run({ op: "move_room_to", id: room.id, x, z: room.z }, "Move room")} />
        <NumField value={room.z} onCommit={(z) => run({ op: "move_room_to", id: room.id, x: room.x, z }, "Move room")} /></div>
      <h3>Look</h3>
      <div className="row"><label>Floor</label>
        <input type="color" value={room.floor} onChange={(e) => run({ op: "set_material", id: room.id, color: e.target.value }, "Floor colour", `color:${room.id}`)} /></div>
      <FinishEditor id={room.id} finish={room.floorFinish} base={room.floor} run={run} />
      <div className="row"><label>All walls</label>
        <input type="color" value={wallColor} onChange={(e) => run({ op: "set_material", id: `${room.id}.walls`, color: e.target.value }, "Wall colour", `color:${room.id}.walls`)} /></div>
      <details><summary className="hint" style={{ cursor: "pointer" }}>Pattern on all walls (wallpaper, panelling...)</summary>
        <FinishEditor id={`${room.id}.walls`} finish={room.sides.north.finish} base={wallColor} run={run} /></details>
      <h3>Walls</h3>
      <div className="row">{SIDES.map((s) => <button key={s} className="sm" onClick={() => select(`${room.id}.${s}`)}>{s}{room.sides[s].open ? " (open)" : ""}</button>)}</div>
      <h3>Lights ({house.lights.filter((l) => l.at.x >= room.x && l.at.x <= room.x + room.width && l.at.z >= room.z && l.at.z <= room.z + room.depth).length})</h3>
      <div className="row">
        {house.lights.filter((l) => l.at.x >= room.x && l.at.x <= room.x + room.width && l.at.z >= room.z && l.at.z <= room.z + room.depth).map((l) => <button key={l.id} className="sm" onClick={() => select(l.id)}>{l.label ?? l.id}</button>)}
        <button onClick={() => run({ op: "add_light", roomId: room.id, type: "spot", fixture: "downlight", intensity: 3 }, "Add downlight")}>+ Downlight</button>
        <button onClick={() => run({ op: "add_light", roomId: room.id, type: "point", fixture: "pendant", intensity: 3 }, "Add pendant")}>+ Pendant</button>
      </div>
      <h3>Furniture ({items.length})</h3>
      <div className="row">{items.map((f) => <button key={f.id} className="sm" onClick={() => select(f.id)}>{f.label ?? f.id}</button>)}</div>
      <div className="row">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button onClick={() => run({ op: "add_furniture", roomId: room.id, category: category as never }, "Add furniture")}>Add to room</button>
      </div>
      <div className="row">
        <select value={modelName} onChange={(e) => setModelName(e.target.value)}>{Object.keys(MODELS).map((n) => <option key={n} value={n}>{n.replace("_", " ")}</option>)}</select>
        <button onClick={() => run({ op: "add_furniture", roomId: room.id, category: (modelName === "sofa" || modelName === "bed" ? modelName : modelName === "dining_table" || modelName === "coffee_table" ? "table" : modelName === "wardrobe" || modelName === "chair" ? modelName : modelName === "floor_lamp" ? "lamp" : modelName === "bookshelf" ? "shelf" : "other") as never, model: { name: modelName } }, `Add ${modelName}`)}>Add shaped item</button>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="danger" onClick={() => run({ op: "remove_room", id: room.id }, "Remove room")}>Remove room{items.length ? ` and ${items.length} item${items.length > 1 ? "s" : ""}` : ""}</button>
      </div>
    </div>
  );
}

function WallInspector({ room, side, run, select }: { room: Room; side: Side; run: Run; select: (id: string | null) => void }) {
  const ws = room.sides[side];
  const id = `${room.id}.${side}`;
  return (
    <div>
      <div className="row"><b>{side} wall</b><span className="chip">{id}</span></div>
      <p className="hint">of <a href="#" onClick={(e) => { e.preventDefault(); select(room.id); }}>{room.name}</a>. Offsets are metres from the wall's left end, seen from inside.</p>
      <div className="row"><label>Colour</label>
        <input type="color" value={ws.material} onChange={(e) => run({ op: "set_material", id, color: e.target.value }, "Wall colour", `color:${id}`)} /></div>
      <div className="row"><label>Open wall</label>
        <input type="checkbox" checked={ws.open} onChange={(e) => run({ op: "set_wall_open", wall: id, open: e.target.checked }, e.target.checked ? "Open wall" : "Close wall")} />
        <span className="hint" style={{ margin: 0 }}>no wall here (open-plan)</span></div>
      {!ws.open && <FinishEditor id={id} finish={ws.finish} base={ws.material} run={run} />}
      <h3>Doors and windows</h3>
      {ws.openings.map((o) => (
        <div className="row" key={o.id}>
          <span className="chip">{o.id}</span><span>{o.type}</span>
          <label style={{ minWidth: 0 }}>at</label>
          <NumField value={o.offset} min={0} onCommit={(offset) => run({ op: "move_opening", id: o.id, offset }, "Move opening")} />
          <button className="sm danger" onClick={() => run({ op: "remove_opening", id: o.id }, "Remove opening")}>Remove</button>
        </div>
      ))}
      {!ws.openings.length && !ws.open && <p className="hint">None on this wall.</p>}
      {!ws.open && (
        <div className="row">
          <button onClick={() => run({ op: "add_opening", wall: id, opening: { type: "door" } }, "Add door")}>+ Door</button>
          <button onClick={() => run({ op: "add_opening", wall: id, opening: { type: "window" } }, "Add window")}>+ Window</button>
        </div>
      )}
    </div>
  );
}
