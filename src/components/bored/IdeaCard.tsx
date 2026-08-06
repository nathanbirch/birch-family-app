import { formatDadBucks, type BoredIdea } from "@/config/bored";

import { BoredArt, type BoredPalette } from "./BoredArt";

/**
 * One idea, as a tile in the grid.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A LINK OR A BUTTON
 * ---------------------------------------------------------------------------
 * There is nowhere to go and nothing to record. Tapping "Trampoline" cannot
 * open a trampoline, and this page deliberately tracks nothing — no favourites,
 * no history, no "I did this". Making these interactive would promise a child
 * something would happen, and then nothing would.
 *
 * So they are plain list items, and the tap target rule does not apply. What
 * does apply is the *reading* target: the picture is the biggest thing on the
 * tile, because the four-year-old this page is really for cannot read the word
 * underneath it.
 *
 * ---------------------------------------------------------------------------
 * THE PRICE
 * ---------------------------------------------------------------------------
 * Money ideas carry a pill with the amount in Dad Bucks. It sits *on* the
 * picture rather than beside the label, so it is legible at a glance while
 * scanning down the grid for something worth doing — which is exactly how this
 * list gets used.
 */
export function IdeaCard({
  idea,
  palette,
}: {
  idea: BoredIdea;
  palette: BoredPalette;
}) {
  return (
    <div className="app-card themed-transition flex h-full flex-col items-center gap-2 p-3 text-center sm:p-4">
      <span
        className="relative flex aspect-square w-full items-center justify-center rounded-2xl"
        style={{ backgroundColor: palette.soft }}
      >
        <BoredArt id={idea.id} className="h-4/5 w-4/5" />

        {idea.price !== undefined && (
          <span
            className="absolute -bottom-1.5 rounded-full px-2.5 py-1 text-sm font-extrabold tabular-nums shadow-sm"
            style={{
              backgroundColor: palette.ink,
              color: "#ffffff",
            }}
          >
            {formatDadBucks(idea.price)}
          </span>
        )}
      </span>

      <span
        className={`text-sm font-bold leading-tight ${
          idea.price !== undefined ? "mt-1.5" : ""
        }`}
      >
        {idea.label}
      </span>
    </div>
  );
}
