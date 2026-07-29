import type { CSSProperties, ReactNode } from "react";

import {
  ARRIVAL_DURATION_MS,
  ARRIVAL_STEP_MS,
  SWAP_DURATION_MS,
  type EntryPoint,
} from "@/config/seating";

/**
 * Positions one person in a scene, and choreographs how they got there.
 *
 * Coordinates are percentages of the scene box and sizes are container-query
 * *height* units, so a seat holds its position and proportion identically on a
 * 320px phone and a 1400px desktop. Height units rather than width units
 * matter here: both photos are portrait, and sizing off the width would make
 * avatars far taller than the gap between rows.
 *
 * Two movements live here:
 *
 *  - **Arrival.** On first paint the person is offset back to their doorway
 *    and walks in, `arrivalIndex` places determining when their turn comes.
 *    The offset is expressed in `cqw`/`cqh`, which resolve against the scene
 *    frame — so the same numbers work at any size.
 *  - **Swapping.** A seat is keyed by *person*, not by seat, so when the
 *    parents trade places React keeps the same element and its `left`/`top`
 *    simply change. The `seat-glide` transition carries them across.
 */
export function Seat({
  x,
  y,
  size,
  fontSize,
  entry,
  arrivalIndex,
  arcing = false,
  children,
}: {
  /** Percentage of scene width. */
  x: number;
  /** Percentage of scene height. */
  y: number;
  /** Avatar diameter in container-query height units (`cqh`). */
  size: number;
  /** Text size in `cqh`, which everything inside scales from. */
  fontSize: number;
  /** The doorway this person walks in through. */
  entry: EntryPoint;
  /** Position in the arrival order, 0-based. */
  arrivalIndex: number;
  /** Arc this person over the furniture, used while parents trade places. */
  arcing?: boolean;
  children: ReactNode;
}) {
  const style: CSSProperties & Record<string, string | number> = {
    left: `${x}%`,
    top: `${y}%`,
    width: `${size}cqh`,
    fontSize: `${fontSize}cqh`,
    "--swap-duration": `${SWAP_DURATION_MS}ms`,
    // Offset from the seat back to the doorway, in scene-relative units.
    "--enter-x": `${entry.x - x}cqw`,
    "--enter-y": `${entry.y - y}cqh`,
    "--arrive-delay": `${arrivalIndex * ARRIVAL_STEP_MS}ms`,
    "--arrive-duration": `${ARRIVAL_DURATION_MS}ms`,
  };

  return (
    <div
      className="seat-glide absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={style}
    >
      {/* Separate element so the swap arc never fights the arrival animation. */}
      <div className={arcing ? "seat-swap-arc w-full" : "w-full"}>
        {children}
      </div>
    </div>
  );
}

/**
 * The fixed-aspect, container-query root every scene renders into.
 *
 * `container-type: size` (rather than `inline-size`) is what makes `cqh`
 * available; it is safe here because the height comes from `aspect-ratio`, not
 * from the content. `overflow-hidden` is what hides everyone until they step
 * through their doorway.
 */
export function SceneFrame({
  aspect,
  children,
}: {
  /** CSS `aspect-ratio` value, e.g. `"2 / 3"`. */
  aspect: string;
  children: ReactNode;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{
        aspectRatio: aspect,
        containerType: "size",
        backgroundColor: "var(--scene-floor)",
        boxShadow: "inset 0 0 0 2px var(--scene-frame)",
      }}
    >
      {children}
    </div>
  );
}
