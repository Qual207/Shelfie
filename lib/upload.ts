import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, type Db } from "./db";
import { extractFrames, saveFrames } from "./frames";
import { createScan, type Scan } from "./scans";

/**
 * Stores an upload as a new scan. The form carries `shelf` plus either `video` (a file,
 * sampled with ffmpeg) or several `frames` (JPEGs captured from the webcam in the browser).
 */
export async function ingestUpload(
  db: Db,
  kind: Scan["kind"],
  form: FormData,
): Promise<{ scanId: number; frames: string[] }> {
  const shelf = String(form.get("shelf") ?? "").trim();
  if (!shelf) throw new Error("Name the shelf you filmed");
  const video = form.get("video");
  const frameFiles = form.getAll("frames").filter((f): f is File => f instanceof File);

  if (video instanceof File && video.size > 0) {
    const dir = path.join(DATA_DIR, "uploads");
    mkdirSync(dir, { recursive: true });
    const ext = path.extname(video.name).toLowerCase() || ".mp4";
    const scanId = createScan(db, kind, shelf, null);
    const file = path.join(dir, `scan-${scanId}${ext}`);
    writeFileSync(file, Buffer.from(await video.arrayBuffer()));
    db.prepare("UPDATE scans SET video_path = ? WHERE id = ?").run(`uploads/scan-${scanId}${ext}`, scanId);
    return { scanId, frames: await extractFrames(file, scanId) };
  }
  if (frameFiles.length > 0) {
    const scanId = createScan(db, kind, shelf, null);
    const images = await Promise.all(frameFiles.map(async (f) => Buffer.from(await f.arrayBuffer())));
    return { scanId, frames: saveFrames(images, scanId) };
  }
  throw new Error("Upload a video or record from the webcam first");
}

export function errorResponse(err: unknown, status = 500): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  return Response.json({ error: message }, { status });
}
