import Image from "next/image";

/**
 * The photographic backdrop of a seating scene.
 *
 * The images are the family's own table and Expedition, bundled locally in
 * `public/scenes/` so the app stays fully offline-capable. A themed wash sits
 * on top so the scene belongs to the selected theme — and so the Midnight
 * theme can darken the photo instead of leaving it glaringly bright.
 */
export function ScenePhoto({ src, priority }: { src: string; priority?: boolean }) {
  return (
    <>
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        fill
        priority={priority}
        sizes="(min-width: 1024px) 480px, 100vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="themed-transition absolute inset-0"
        style={{ backgroundColor: "var(--scene-overlay)" }}
      />
    </>
  );
}
