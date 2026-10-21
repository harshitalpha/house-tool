import { GradientEquirectTexture, WebGLPathTracer } from "three-gpu-pathtracer";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { live } from "./cameraState";
import { useStore } from "./store";

const QUALITY = { draft: 48, good: 300, final: 1000 } as const;
type Quality = keyof typeof QUALITY;
const SIZES = { screen: 1, large: 1.6 } as const;
type SizeKey = keyof typeof SIZES;
const HIGHLIGHT = 0x2a78d6;

/** A copy of the live scene the path tracer can read: only opaque standard-material meshes and real lights, no selection glow. */
function buildTraceScene(src: THREE.Scene, night: boolean) {
  const out = new THREE.Scene();
  src.updateMatrixWorld(true);
  const plain = new Map<THREE.Material, THREE.Material>();
  const clean = (m: THREE.MeshStandardMaterial) => {
    const glow = m.emissive.getHex() === HIGHLIGHT || (m.emissive.getHex() === 0xffffff && m.emissiveIntensity <= 0.2);
    if (!glow) return m;
    let c = plain.get(m);
    if (!c) { const n = m.clone(); n.emissive.set(0x000000); n.emissiveIntensity = 0; plain.set(m, n); c = n; }
    return c;
  };
  src.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (Array.isArray(m) || !m.isMeshStandardMaterial) return;
      if (m.opacity < 0.95 || (m.transparent && m.opacity < 1)) return; // glass and click-through overlays
      const c = new THREE.Mesh(mesh.geometry, clean(m));
      mesh.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      out.add(c);
      return;
    }
    const l = o as THREE.Light & { isSpotLight?: boolean; isPointLight?: boolean; isDirectionalLight?: boolean };
    if (l.isSpotLight) {
      const s = l as THREE.SpotLight;
      const n = new THREE.SpotLight(s.color, s.intensity, s.distance, s.angle, s.penumbra, s.decay);
      s.getWorldPosition(n.position);
      s.target.getWorldPosition(n.target.position);
      out.add(n, n.target);
    } else if (l.isPointLight) {
      const p = l as THREE.PointLight;
      const n = new THREE.PointLight(p.color, p.intensity, p.distance, p.decay);
      p.getWorldPosition(n.position);
      out.add(n);
    } else if (l.isDirectionalLight) {
      const d = l as THREE.DirectionalLight;
      const n = new THREE.DirectionalLight(d.color, d.intensity);
      d.getWorldPosition(n.position);
      d.target.getWorldPosition(n.target.position);
      out.add(n, n.target);
    }
  });
  const sky = new GradientEquirectTexture(128);
  if (night) { sky.topColor.set("#0c1220"); sky.bottomColor.set("#141820"); }
  else { sky.topColor.set("#7fb0ea"); sky.bottomColor.set("#e9e4d8"); sky.exponent = 1.2; }
  sky.update();
  out.background = sky;
  out.environment = sky;
  out.environmentIntensity = night ? 0.04 : 1.3;
  return { scene: out, sky };
}

export function PathTrace() {
  const setOpen = useStore((s) => s.setTraceOpen);
  const night = useStore((s) => s.night);
  const [quality, setQuality] = useState<Quality>("good");
  const [size, setSize] = useState<SizeKey>("screen");
  const [exposure, setExposure] = useState(1.6);
  const [phase, setPhase] = useState<"preparing" | "rendering" | "done" | "error">("preparing");
  const [samples, setSamples] = useState(0);
  const [error, setError] = useState("");
  const [run, setRun] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const exposureRef = useRef(exposure);
  exposureRef.current = exposure;

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let tracer: WebGLPathTracer | null = null;
    let sky: GradientEquirectTexture | null = null;
    setPhase("preparing");
    setSamples(0);
    const target = QUALITY[quality];

    const go = () => {
      try {
        if (!live.scene || !live.camera) throw new Error("The 3D view is not ready.");
        const w = Math.min(2200, Math.round(live.width * SIZES[size])), h = Math.round(live.height * SIZES[size]);
        renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = exposureRef.current;
        const cv = renderer.domElement;
        cv.style.cssText = "max-width:100%;max-height:100%;width:auto;height:auto;display:block;background:#111;";
        canvasRef.current = cv;
        holder.current?.replaceChildren(cv);

        const cam = (live.camera as THREE.PerspectiveCamera).clone();
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        cam.matrixWorld.copy(live.camera.matrixWorld);
        cam.matrixWorldInverse.copy(live.camera.matrixWorldInverse);

        const built = buildTraceScene(live.scene, night);
        sky = built.sky;
        tracer = new WebGLPathTracer(renderer);
        tracer.bounces = 6;
        tracer.filterGlossyFactor = 0.4;
        tracer.renderDelay = 0;
        tracer.minSamples = 1;
        tracer.fadeDuration = 0;
        tracer.tiles.set(2, 2);
        tracer.setScene(built.scene, cam);
        setPhase("rendering");

        let frames = 0;
        const tick = () => {
          if (!alive || !tracer || !renderer) return;
          renderer.toneMappingExposure = exposureRef.current;
          tracer.renderSample();
          const n = Math.floor(tracer.samples);
          if (++frames % 3 === 0 || n >= target) setSamples(n);
          if (n >= target) { setPhase("done"); return; }
          raf = requestAnimationFrame(tick);
        };
        stopRef.current = () => { cancelAnimationFrame(raf); setPhase("done"); };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    };
    const t = setTimeout(go, 60); // let "Preparing" paint first: building the BVH blocks the page

    return () => {
      alive = false;
      clearTimeout(t);
      cancelAnimationFrame(raf);
      (tracer as unknown as { dispose?: () => void } | null)?.dispose?.();
      sky?.dispose();
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
      canvasRef.current = null;
    };
  }, [quality, size, night, run]);

  const save = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `render-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };

  const target = QUALITY[quality];
  return (
    <div className="trace">
      <div className="trace-bar">
        <b>Realistic render</b>
        <span className="trace-status">
          {phase === "preparing" && "Preparing the scene… (a few seconds)"}
          {phase === "rendering" && `Rendering… ${samples} / ${target} passes`}
          {phase === "done" && `Done · ${samples} passes`}
          {phase === "error" && `Could not render: ${error}`}
        </span>
        <label>Quality <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
          <option value="draft">Draft (fast)</option><option value="good">Good</option><option value="final">Final (slow)</option>
        </select></label>
        <label>Size <select value={size} onChange={(e) => setSize(e.target.value as SizeKey)}>
          <option value="screen">Screen size</option><option value="large">Large</option>
        </select></label>
        <label>Brightness <input type="range" min={0.6} max={4} step={0.1} value={exposure} onChange={(e) => setExposure(Number(e.target.value))} /></label>
        <span className="grow" />
        {phase === "rendering" && <button onClick={() => stopRef.current()}>Stop</button>}
        {phase === "done" && <button onClick={() => setRun((r) => r + 1)}>Render again</button>}
        <button onClick={save} disabled={phase === "preparing" || phase === "error" || samples < 1}>Save image</button>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="trace-stage" ref={holder} />
    </div>
  );
}
