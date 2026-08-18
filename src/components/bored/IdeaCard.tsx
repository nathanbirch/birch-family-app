import { formatDadBucks } from "@/config/bored";
import type { BoredItem } from "@/lib/bored/ideas";

import { BoredArt, BORED_ART_IDS, type BoredPalette } from "./BoredArt";

/**
 * One idea, as a tile in the grid.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TILE ITSELF IS NOT A LINK OR A BUTTON
 * ---------------------------------------------------------------------------
 * There is nowhere to go and nothing to record. Tapping "Trampoline" cannot open
 * a trampoline, and this page deliberately tracks nothing — no favourites, no
 * history, no "I did this". Making the tiles interactive would promise a child
 * that something would happen, and then nothing would.
 *
 * So the tile is still a plain list item. What changed when the family could add
 * their own is that a *family-added* tile carries one small control — the cross
 * that takes it off again — because an idea a four-year-old typed has to be
 * removable by somebody who is not holding a MongoDB client. Built-in tiles have
 * no controls at all, which is also what makes the cross mean something: it is
 * only ever on the ones that are ours.
 *
 * ---------------------------------------------------------------------------
 * A DRAWING, OR AN EMOJI
 * ---------------------------------------------------------------------------
 * The thirty-nine built-ins have a hand-drawn SVG; anything added in the app has
 * an emoji. The drawing is preferred where one exists, so this degrades in the
 * right direction — a built-in whose drawing were ever deleted falls back to
 * whatever picture it has rather than to a blank square, and the *emoji* is
 * always what a custom idea gets, because no custom id can collide with a
 * drawing's (see `newIdeaId`).
 *
 * ---------------------------------------------------------------------------
 * THE PRICE
 * ---------------------------------------------------------------------------
 * Money ideas carry a pill with the amount in Dad Bucks. It sits *on* the picture
 * rather than beside the label, so it is legible at a glance while scanning down
 * the grid for something worth doing — which is exactly how this list gets used.
 */
export function IdeaCard({
  idea,
  palette,
  entering,
  onRemove,
}: {
  idea: BoredItem;
  palette: BoredPalette;
  /** Just added, on this device or another. Plays the arrival animation. */
  entering?: boolean;
  /**
   * Offered only for a family-added idea, and only where there is something to
   * handle it — the tile is rendered on the server in tests and in the index's
   * fallback, where there is nothing to remove it with.
   */
  onRemove?: () => void;
}) {
  const drawn = BORED_ART_IDS.includes(idea.id);
  const removable = idea.custom && onRemove !== undefined;

  return (
    <div
      className={`app-card themed-transition relative flex h-full flex-col items-center gap-2 p-3 text-center sm:p-4 ${
        entering ? "bored-tile-in" : ""
      }`}
    >
      <span
        className="bored-tile-frame relative flex aspect-square w-full items-center justify-center rounded-2xl"
        style={{ backgroundColor: palette.soft }}
      >
        {drawn ? (
          <BoredArt id={idea.id} className="h-4/5 w-4/5" />
        ) : (
          // Sized against this square with a container query, so an emoji is as
          // big as a drawing would have been at every screen width. See
          // `.bored-emoji` in globals.css.
          <span className="bored-emoji select-none" aria-hidden="true">
            {idea.emoji}
          </span>
        )}

        {idea.price !== null && (
          <span
            className="absolute -bottom-1.5 rounded-full px-2.5 py-1 text-sm font-extrabold tabular-nums shadow-sm"
            style={{ backgroundColor: palette.ink, color: "#ffffff" }}
          >
            {formatDadBucks(idea.price)}
          </span>
        )}
      </span>

      <span
        className={`text-sm font-bold leading-tight ${
          idea.price !== null ? "mt-1.5" : ""
        }`}
      >
        {idea.label}
      </span>

      {removable && (
        /*
         * Top corner, small, and faint until it is touched. It has to be findable
         * by a parent and not be the most obvious thing on a tile to a child who
         * is looking for something to do — the picture is what should catch the
         * eye. The tap target is padded well past what the cross itself measures.
         */
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Take ${idea.label} off the list`}
          className="absolute right-0 top-0 rounded-full p-2.5 opacity-40 transition-all duration-150 hover:opacity-100 active:scale-90"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
