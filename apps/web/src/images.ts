export interface UploadedImage {
  /** Where the dev server serves it: use this as a material `image`. */
  url: string;
  name: string;
  /** Path on disk, relative to the repo, for Claude. */
  file: string;
  /** Up to four dominant colours (hex), so "what is this colour called" has a starting point. */
  colors: string[];
}

const MAX_SIDE = 1600;

/** Dominant colours via a coarse colour histogram: the most common buckets that are visibly different. */
function dominantColors(ctx: CanvasRenderingContext2D, w: number, h: number, n = 4): string[] {
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const key = ((data[i]! >> 5) << 6) | ((data[i + 1]! >> 5) << 3) | (data[i + 2]! >> 5);
    const b = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    b.r += data[i]!; b.g += data[i + 1]!; b.b += data[i + 2]!; b.n++;
    buckets.set(key, b);
  }
  const avg = [...buckets.values()].sort((a, b) => b.n - a.n).map((b) => [b.r / b.n, b.g / b.n, b.b / b.n] as const);
  const picked: (readonly [number, number, number])[] = [];
  for (const c of avg) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c);
    if (picked.length === n) break;
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return picked.map((c) => `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`);
}

/** Shrink an image file, send it to the dev server and return its URL and main colours. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const small = document.createElement("canvas");
  small.width = small.height = 48;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0, 48, 48);
  const colors = dominantColors(sctx, 48, 48);
  const res = await fetch("/__attachment", { method: "POST", body: JSON.stringify({ name: file.name || "pasted-image", dataUrl: canvas.toDataURL("image/jpeg", 0.88) }) });
  if (!res.ok) throw new Error("upload failed (feedback and photos need `npm run dev`)");
  const out = (await res.json()) as { url: string; file: string };
  return { url: out.url, file: out.file, name: file.name || "pasted image", colors };
}

/** Image files from a drop or paste event. */
export function imageFiles(items: DataTransfer | null): File[] {
  return [...(items?.files ?? [])].filter((f) => f.type.startsWith("image/"));
}
