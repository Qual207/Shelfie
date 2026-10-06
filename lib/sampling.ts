// How many frames a video becomes. Shared by the server (ffmpeg) and the browser (webcam clips).

export const FRAMES_PER_SECOND = 1;
export const MIN_FRAMES = 3; // even a 1-2 s clip gets three looks at the shelf
// ponytail: past a minute, frames spread evenly over the video instead (vision cost and latency
// grow with every frame). Raise this, or lower FRAMES_PER_SECOND, for long store walk-throughs.
export const MAX_FRAMES = 60;

/** Frames to sample from a video of this length: one per second, at least MIN_FRAMES, at most MAX_FRAMES. */
export function frameCount(durationSeconds: number): number {
  return Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.round(durationSeconds * FRAMES_PER_SECOND)));
}

/** Frames per tool reply. ZooWork takes at most 16 images (8 MiB) per custom-tool result. */
export const FRAMES_PER_PAGE = 12;
