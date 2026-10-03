const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "just now", "12 min ago", "today at 2:05 PM", "Oct 2 at 2:05 PM". */
export function seenAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (then.toDateString() === now.toDateString()) return `today at ${clock(then)}`;
  return `${then.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${clock(then)}`;
}
