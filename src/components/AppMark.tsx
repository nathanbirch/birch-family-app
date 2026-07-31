import Image from "next/image";

/**
 * The app's mark: the birch tree, five leaves for five children.
 *
 * One component, used by the login screen and the seating header, so the mark
 * can never drift between them. It renders the same generated PNG the home
 * screen and browser tab use, which is what keeps the installed icon and the
 * in-app mark identical.
 *
 * It is deliberately not an inline SVG. The mark is artwork rather than
 * geometry — hand-tracing those leaf curves into paths would produce a second
 * copy to keep in sync with `assets/icon-master.png`, and they would slowly
 * diverge. `icon-192.png` is small and already cached by the service worker.
 */
export function AppMark({
  size,
  className = "",
}: {
  /** Rendered width and height in pixels. */
  size: number;
  className?: string;
}) {
  return (
    <Image
      src="/icons/icon-192.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      // The icon is a filled blue square; the rounding is ours to apply here,
      // unlike the home-screen icon where the platform masks it.
      className={`shrink-0 rounded-[22%] ${className}`}
      style={{ boxShadow: "0 6px 16px -8px var(--color-shadow)" }}
      priority
    />
  );
}
