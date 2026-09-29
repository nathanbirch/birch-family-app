import { FAMILY_SIZE } from "@/config/meals";
import type { MealGroup, RatingSummary } from "@/lib/meals/browse";
import { formatMinutes, formatMoney, type CostedRecipe } from "@/lib/meals/costing";

import { HeartIcon, MUTED_TEXT, TagChip } from "./ui";

/**
 * One meal on the list.
 *
 * The per-person price is the biggest thing on it on purpose: it is the
 * question the page exists to answer, and the one number that compares across
 * a pot of chili and a pan of brownies. The family price sits under it, then
 * calories and time, then a few tags.
 */
export function MealCard({
  group,
  cost,
  favorite,
  ratings,
  onOpen,
}: {
  group: MealGroup;
  cost: CostedRecipe | undefined;
  favorite: boolean;
  ratings: RatingSummary;
  onOpen: () => void;
}) {
  const recipe = group.primary;
  const tags = [...recipe.tags, ...(cost?.autoTags ?? [])].slice(0, 3);
  const priced = cost?.priced ?? false;
  const pricedCount = cost ? cost.lines.filter((line) => line.cost !== null).length : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="app-card themed-transition flex h-full w-full flex-col overflow-hidden text-left transition-transform active:scale-[0.98]"
    >
      {recipe.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private, versioned photo behind the login; the optimiser would fetch it without the cookie
        <img
          src={recipe.photoUrl}
          alt=""
          loading="lazy"
          className="aspect-[16/9] w-full object-cover"
        />
      ) : null}

      <span className="flex flex-1 flex-col gap-2 p-3.5">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-base font-bold leading-snug">{recipe.name}</span>
            <span className="mt-0.5 block text-xs" style={MUTED_TEXT}>
              {recipe.type}
              {group.versions.length > 1 ? ` · ${group.versions.length} versions` : ""}
            </span>
          </span>
          {favorite ? (
            <span style={{ color: "#e11d48" }} className="shrink-0">
              <HeartIcon filled className="h-4 w-4" />
              <span className="sr-only">Favourite</span>
            </span>
          ) : null}
        </span>

        <span className="flex items-end justify-between gap-2">
          {priced ? (
            <span>
              <span className="block text-2xl font-extrabold leading-none tabular-nums">
                {formatMoney(cost?.perPerson ?? null)}
              </span>
              <span className="text-xs" style={MUTED_TEXT}>
                per person · {formatMoney(cost?.family ?? null)} for {FAMILY_SIZE}
              </span>
            </span>
          ) : (
            <span>
              <span className="block text-base font-extrabold leading-tight" style={MUTED_TEXT}>
                No price yet
              </span>
              <span className="text-xs" style={MUTED_TEXT}>
                {pricedCount} of {recipe.lines.length} ingredients priced
              </span>
            </span>
          )}
          <span className="text-right text-xs leading-tight" style={MUTED_TEXT}>
            {cost?.nutrition ? (
              <span className="block tabular-nums">{Math.round(cost.nutrition.calories)} kcal</span>
            ) : null}
            <span className="block">{formatMinutes(recipe.totalMinutes)}</span>
          </span>
        </span>

        {tags.length > 0 || ratings.love > 0 ? (
          <span className="mt-auto flex flex-wrap items-center gap-1">
            {ratings.love > 0 ? (
              <span className="mr-1 text-xs font-bold" title={`${ratings.love} love it`}>
                😋 {ratings.love}
              </span>
            ) : null}
            {tags.map((tag) => (
              <TagChip key={tag} tag={tag} auto={!recipe.tags.includes(tag)} />
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}
