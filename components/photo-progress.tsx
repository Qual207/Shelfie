import type { StateProduct } from "@/app/api/state/route";

/** Page-level progress while product photos are being cropped, checked and retouched. */
export function PhotoProgress({ products }: { products: StateProduct[] }) {
  const tracked = products.filter((p) => p.frame_path);
  const working = tracked.filter((p) => !p.imaged_at && p.imaging_attempts < 3);
  if (working.length === 0) return null;
  const done = tracked.length - working.length;
  const active = working.filter((p) => p.imaging_stage && p.imaging_stage !== "queued").length;
  return (
    <div className="panel px-5 py-4 flex flex-col gap-2 border-accent" role="status">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-semibold">Improving product photos</span>
        <span className="text-muted">
          {done} of {tracked.length} done{active ? `, ${active} in progress` : ""}
        </span>
        <span className="text-sm text-muted sm:ml-auto">Each product is found in the video, checked and retouched, about a minute each.</span>
      </div>
      <div className="h-2 rounded-full bg-accent-tint overflow-hidden relative">
        <div className="h-full bg-accent transition-[width] duration-700" style={{ width: `${(done / tracked.length) * 100}%` }} />
        <div className="absolute inset-y-0 w-1/4 bg-white/40 animate-[slide_1.6s_ease-in-out_infinite]" aria-hidden />
      </div>
    </div>
  );
}
