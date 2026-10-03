import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DATA_DIR } from "@/lib/db";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

const stream = (file: string, range?: { start: number; end: number }) =>
  Readable.toWeb(createReadStream(file, range)) as ReadableStream;

/** Serves scan frames and uploaded videos from data/, with byte ranges so videos can seek. */
export async function GET(request: Request, ctx: RouteContext<"/api/media/[...path]">) {
  const parts = (await ctx.params).path;
  const file = path.resolve(DATA_DIR, ...parts);
  if (!["frames", "uploads"].includes(parts[0]) || !file.startsWith(DATA_DIR + path.sep)) {
    return new Response("Not found", { status: 404 });
  }
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers = {
    "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
  };

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    return new Response(stream(file, { start, end }), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(stream(file), { headers: { ...headers, "Content-Length": String(size) } });
}
