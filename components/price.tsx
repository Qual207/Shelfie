/** A price as a yellow shelf-edge label: $18⁰⁰ with small raised cents, like the tag on the shelf. */
export function Price({ usd, className = "" }: { usd: number; className?: string }) {
  const [dollars, cents] = usd.toFixed(2).split(".");
  return (
    <span className={`tag ${className}`} aria-label={`$${usd.toFixed(2)}`}>
      ${dollars}
      <span className="tag-cents">{cents}</span>
    </span>
  );
}
