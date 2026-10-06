import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { DATA_DIR } from "./db";
import { frameCount } from "./sampling";

const run = promisify(execFile);

/** Frames live under data/frames/<scanId>/; paths are stored relative to data/. */
function frameDir(scanId: number): string {
  const dir = path.join(DATA_DIR, "frames", String(scanId));
  mkdirSync(dir, { recursive: true });
  return dir;
}

const relative = (file: string) => path.relative(DATA_DIR, file).split(path.sep).join("/");

/** Samples one frame per second (see lib/sampling.ts) spread evenly across the video, long side at most 1024 px. */
export async function extractFrames(videoPath: string, scanId: number): Promise<string[]> {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath,
  ]);
  const duration = Number.parseFloat(stdout);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the video's length");

  const count = frameCount(duration);
  const dir = frameDir(scanId);
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", videoPath,
    "-vf", `fps=${count / duration},scale='if(gt(iw,ih),min(1024,iw),-2)':'if(gt(iw,ih),-2,min(1024,ih))'`,
    "-frames:v", String(count), "-q:v", "4", "-start_number", "0",
    path.join(dir, "frame-%02d.jpg"),
  ]);
  const frames = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
  if (frames.length === 0) throw new Error("No frames could be extracted from the video");
  return frames.map((f) => relative(path.join(dir, f)));
}

/** Saves JPEG frames captured in the browser (webcam clips). */
export function saveFrames(images: Buffer[], scanId: number): string[] {
  const dir = frameDir(scanId);
  return images.map((data, i) => {
    const file = path.join(dir, `frame-${String(i).padStart(2, "0")}.jpg`);
    writeFileSync(file, data);
    return relative(file);
  });
}
