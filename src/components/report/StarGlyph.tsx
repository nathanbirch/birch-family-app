/**
 * A filled star, gold.
 *
 * The same outline the tappable stars on the charts use, so the thing being
 * counted at the ceremony is visibly the thing that was coloured in on the
 * fridge. Filled rather than outlined, because on this page every star shown
 * has already been earned.
 *
 * `--color-star` is gold on every theme (see `globals.css`), and the ceremony
 * slides are printed on the children's own colours rather than on themed
 * surfaces — so this stays gold whatever else is happening.
 */
export function StarGlyph({
  className = "h-5 w-5",
  color = "var(--color-star)",
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={color}
      stroke="none"
      aria-hidden="true"
    >
      <path d="m12 3.6 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 10l6-.9Z" />
    </svg>
  );
}
