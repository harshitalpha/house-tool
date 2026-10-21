import { buildCreatePrompt, buildEditPrompt } from "@house/core";
import { useState } from "react";
import { cameraYaw, walkRoom } from "../cameraState";
import { useStore } from "../store";

export function PromptPanel() {
  const house = useStore((s) => s.house);
  const selectedId = useStore((s) => s.selectedId);
  const setTab = useStore((s) => s.setTab);
  const [kind, setKind] = useState<"edit" | "create">(house.rooms.length ? "edit" : "create");
  const [request, setRequest] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const build = () => {
    const selectedRoom = selectedId ? (selectedId.includes(".") ? selectedId.split(".")[0] : house.furniture.find((f) => f.id === selectedId)?.roomId ?? selectedId) : null;
    const currentRoomId = walkRoom.id ?? selectedRoom ?? (house.rooms.length === 1 ? house.rooms[0]!.id : null);
    return kind === "create"
      ? buildCreatePrompt(request)
      : buildEditPrompt(house, request, { selectedId, currentRoomId, cameraYawDeg: cameraYaw.deg });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(build());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="row">
        <button className={kind === "edit" ? "on" : ""} onClick={() => setKind("edit")} disabled={!house.rooms.length}>Edit this house</button>
        <button className={kind === "create" ? "on" : ""} onClick={() => setKind("create")}>Create a new house</button>
      </div>
      <p className="hint">
        {kind === "edit"
          ? "Describe the change. The prompt includes the current scene, your selection and which way you are looking, so \"this\" and \"left\" work."
          : "Describe the house you want. The prompt includes the exact JSON format and the rules the tool checks."}
      </p>
      <textarea
        rows={5} value={request} spellCheck={false}
        placeholder={kind === "edit" ? "e.g. move this sofa to the left, make the bedroom walls sage green, add a desk by the window" : "e.g. a 2BHK, living room 5x4 m, two bedrooms, kitchen and bathroom, with furniture"}
        onChange={(e) => setRequest(e.target.value)}
        style={{ fontFamily: "inherit", fontSize: 14 }}
      />
      {kind === "edit" && selectedId && <p className="hint">Selected: <b>{selectedId}</b> (the AI will see it as <code>$selected</code>)</p>}
      <div className="row">
        <button className="primary" onClick={copy}>{copied ? "Copied ✓" : "Copy prompt"}</button>
        <button onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Hide" : "Preview"} prompt</button>
        <button onClick={() => setTab("paste")} style={{ marginLeft: "auto" }}>Go to Paste →</button>
      </div>
      <p className="hint">Paste it into Claude Code (or any AI), then bring its JSON reply to the <b>Paste</b> tab.</p>
      {showPrompt && <textarea rows={18} readOnly value={build()} />}
    </div>
  );
}
