"use client";

import { DEAL_STAR_VALUE } from "@/config/deals";
import { STAR_DAY_NAMES } from "@/config/stars";
import { isDealTaken, tallyDeals, type StarMarks } from "@/lib/stars/counting";
import type { DealSlot } from "@/lib/stars/deals";

import { Confetti } from "./Confetti";

/**
 * The Star Deal card: one super star a day, worth three.
 *
 * ---------------------------------------------------------------------------
 * WHY THE REST OF THE WEEK IS NOT ON IT
 * ---------------------------------------------------------------------------
 * The three chart cards draw every column, because the week is the picture
 * and a child looking at Wednesday should see what Monday came to. A deal
 * cannot work that way: it is a thing that *pops up*. Thursday's deal shown on
 * Monday is no longer a surprise, and — more practically — it is an invitation
 * to clean the bathroom on Monday and tick it on Thursday, which is exactly the
 * dishonesty `openDayIndex()` exists to prevent.
 *
 * So the card shows today's deal and the ones already gone, and nothing ahead.
 * On a Sunday, when the week is over and there is nothing left to spoil, it
 * shows all of them.
 *
 * ---------------------------------------------------------------------------
 * WHY TODAY'S IS A DIFFERENT SHAPE FROM THE OTHERS
 * ---------------------------------------------------------------------------
 * There is exactly one thing to do on this card, and the rest is history. A row
 * of five identical rows would make the live one the same size as four dead
 * ones. Today's deal is therefore the whole top of the card with a tap target
 * more than twice the area of a chart star, and the days behind it are a small
 * list underneath.
 */
export function DealCard({
  slots,
  marks,
  todayIndex,
  accent,
  accentInk,
  celebration,
  celebrationColors,
  onToggle,
}: {
  /** The child's whole week, from `getWeekDealsForChild()`. */
  slots: readonly DealSlot[];
  marks: StarMarks;
  /** 0-4 when today is a weekday of this week, otherwise -1. */
  todayIndex: number;
  accent: string;
  accentInk: string;
  celebration: number | null;
  celebrationColors: readonly string[];
  onToggle: (dealId: string, dayIndex: number, value: boolean) => void;
}) {
  const totals = tallyDeals(marks, slots);

  const today = slots.find((slot) => slot.dayIndex === todayIndex) ?? null;
  /*
   * Everything already gone. On a chart day that is the days before today; on
   * a Sunday the week is closed and there is nothing left to give away, so the
   * whole week is shown at once.
   */
  const past = slots.filter((slot) =>
    todayIndex === -1 ? true : slot.dayIndex < todayIndex,
  );

  return (
    <section
      className={`app-card themed-transition relative p-3 sm:p-4${
        celebration === null ? "" : " celebrate-pulse"
      }`}
      style={{
        // Gold rather than the child's colour, unlike the three chart cards.
        // This is the one card that is the same for everybody in kind and
        // different for everybody in content, and gold is already the app's
        // word for "a star is happening here".
        backgroundColor:
          "color-mix(in srgb, var(--color-star) 14%, var(--color-surface))",
        borderColor: "color-mix(in srgb, var(--color-star) 46%, var(--color-border))",
      }}
    >
      {celebration === null ? null : (
        <Confetti key={celebration} scope="section" colors={celebrationColors} />
      )}

      <header className="mb-2 flex items-baseline justify-between gap-3 px-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight">Star Deals</h2>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            One a day, just for you — worth {DEAL_STAR_VALUE} stars.
          </p>
        </div>
        <p
          className="shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 20%, transparent)`,
            color: accentInk,
          }}
        >
          {totals.earned}/{totals.possible}
        </p>
      </header>

      {today ? (
        <TodaysDeal
          slot={today}
          taken={isDealTaken(marks, today)}
          onToggle={onToggle}
        />
      ) : (
        <p
          className="rounded-2xl px-3 py-4 text-center text-sm font-semibold"
          style={{ color: "var(--color-text-muted)" }}
        >
          {todayIndex === -1
            ? "No deal on Sunday — the next one lands on Monday."
            : "No deal today."}
        </p>
      )}

      {past.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-0.5 border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
          {past.map((slot) => {
            const taken = isDealTaken(marks, slot);
            return (
              <li
                key={slot.deal.id}
                className="flex items-center gap-2 rounded-2xl px-2 py-1.5"
              >
                <span
                  className="w-8 shrink-0 text-xs font-bold uppercase"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {STAR_DAY_NAMES[slot.dayIndex].slice(0, 3)}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm font-semibold"
                  style={{ opacity: taken ? 1 : 0.55 }}
                >
                  {slot.deal.label}
                </span>
                <span
                  className="shrink-0 text-sm font-extrabold tabular-nums"
                  style={{
                    color: taken
                      ? "var(--color-star-ink)"
                      : "var(--color-text-muted)",
                    opacity: taken ? 1 : 0.5,
                  }}
                  aria-label={
                    taken
                      ? `${slot.deal.label} on ${STAR_DAY_NAMES[slot.dayIndex]}: taken, ${DEAL_STAR_VALUE} stars`
                      : `${slot.deal.label} on ${STAR_DAY_NAMES[slot.dayIndex]}: missed`
                  }
                >
                  {taken ? `+${DEAL_STAR_VALUE} ⭐` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * The one thing on this card that can actually be done.
 *
 * The tap target is a 64px circle rather than the chart's 44px square, because
 * it is worth three of them and because it is the only control on the card —
 * there is no neighbouring star to hit by mistake, so the extra size costs
 * nothing and reads as "this one is bigger".
 */
function TodaysDeal({
  slot,
  taken,
  onToggle,
}: {
  slot: DealSlot;
  taken: boolean;
  onToggle: (dealId: string, dayIndex: number, value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <div className="min-w-0 flex-1">
        <p
          className="text-[0.65rem] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: "var(--color-star-ink)" }}
        >
          Today&rsquo;s deal · {STAR_DAY_NAMES[slot.dayIndex]}
        </p>
        <p className="mt-0.5 text-base font-extrabold leading-snug sm:text-lg">
          {slot.deal.label}
        </p>
        <p
          className="mt-0.5 text-xs font-bold"
          style={{ color: "var(--color-star-ink)" }}
        >
          {taken
            ? `Taken — ${DEAL_STAR_VALUE} stars`
            : `Worth ${DEAL_STAR_VALUE} stars`}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={taken}
        /*
         * Deliberately not "… on Monday", which is how every other star on
         * this page is named. A deal is offered on one day and one day only,
         * so naming the day tells a child nothing they can act on; what it is
         * worth is the thing they do not already know.
         */
        aria-label={`${slot.deal.label} — today’s Star Deal, worth ${DEAL_STAR_VALUE} stars`}
        onClick={() => onToggle(slot.deal.id, slot.dayIndex, !taken)}
        className="star-button flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-transform active:scale-90"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-star) 24%, transparent)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-11 w-11${taken ? " star-pop" : ""}`}
          fill={taken ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={taken ? 1 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: taken ? "var(--color-star)" : "var(--color-text-muted)",
            opacity: taken ? 1 : 0.6,
          }}
          aria-hidden="true"
        >
          <path d="m12 3.6 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 10l6-.9Z" />
        </svg>
      </button>
    </div>
  );
}
