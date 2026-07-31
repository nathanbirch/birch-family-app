/**
 * Soft themed shapes behind the content. Fixed and non-interactive, so they
 * never affect layout or scrolling.
 *
 * Lifted out of the old single-page `page.tsx` when the app grew a second
 * page, so every screen sits on the same backdrop.
 */
export function PageBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="themed-transition absolute -left-24 -top-28 h-72 w-72 rounded-full opacity-70 blur-2xl"
        style={{ backgroundColor: "var(--color-page-decoration)" }}
      />
      <div
        className="themed-transition absolute -right-24 top-1/3 h-80 w-80 rounded-full opacity-60 blur-2xl"
        style={{ backgroundColor: "var(--color-page-decoration)" }}
      />
      <div
        className="themed-transition absolute -bottom-28 left-1/4 h-72 w-72 rounded-full opacity-50 blur-2xl"
        style={{ backgroundColor: "var(--color-page-decoration)" }}
      />
    </div>
  );
}
