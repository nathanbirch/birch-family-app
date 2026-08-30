"use client";

import { useRef, useState } from "react";

import { getPerson } from "@/config/family";
import { formatMoney } from "@/config/rewards";
import type { ChartId } from "@/config/stars";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { convertWeekToCoins } from "@/lib/coins/actions";
import {
  praiseFor,
  wholeRowsLabel,
  type ChildReport,
} from "@/lib/stars/report";

import { Avatar } from "../Avatar";
import { CoinAmount } from "../shop/CoinAmount";
import { Confetti } from "../stars/Confetti";

import {
  CoinFlight,
  COIN_FLIGHT_MS,
  MAX_VISIBLE_COINS,
  type FlightPoint,
} from "./CoinFlight";
import { CountUp } from "./CountUp";
import { StarGlyph } from "./StarGlyph";
import {
  COUNT_UP_MS,
  NAME_DELAY_MS,
  chartDelayMs,
  totalDelayMs,
} from "./timing";

/**
 * One child's moment.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SLIDE IS PRINTED ON THE CHILD'S OWN COLOUR
 * ---------------------------------------------------------------------------
 * The same reason the star charts have a `ChildBackdrop`: five children share
 * one phone and the answer to "whose turn is this" has to be readable from
 * across the kitchen, by a four-year-old, in half a second. Here it is the
 * whole slide.
 *
 * The gradient runs from their *dark* shade outward rather than from their
 * bright one, and that is a contrast decision rather than a taste one. Several
 * of the identifying colours — the green and the orange especially — carry
 * white text at about 2:1, which is unreadable. Their dark shades all carry it
 * at better than 5:1, so the dark shade is what the type sits on and the
 * bright one is a glow behind their face.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER THINGS ARRIVE IN
 * ---------------------------------------------------------------------------
 * Name, then the three charts one at a time, then the total. That order is the
 * point of the whole feature: a child watching their own slide gets three
 * small moments of "how did I do on that one" before the number that answers
 * the week. Handing over the total first would make the rest a footnote.
 *
 * All the slides in the ceremony are mounted at once so they can be dragged
 * between, so nothing here may animate until it is on stage — and re-entering
 * a slide must play it again rather than showing the answer. Both come from
 * `runKey`: the ceremony hands every slide a fresh one each time the stage
 * turns, and it is the key on the contents here, so an arriving slide rebuilds
 * its choreography from the top and a slide nobody is looking at does not
 * animate at all.
 */

/**
 * One word per chart, for the ceremony only.
 *
 * The `title` in `config/stars.ts` is a transcription of the paper — "Our
 * Family Chore Chart" — and must not be reworded there. This is a label of our
 * own, chosen because a line on a slide that reads "Our Family Chore Chart
 * ... 18" is a sentence, and a scoreboard wants a word.
 */
const CHART_WORD: Record<ChartId, string> = {
  chores: "Chores",
  learning: "Learning",
  hygiene: "Hygiene",
  // Two words, and the only line on the slide whose stars are not one apiece:
  // five deals on offer is fifteen stars. See `config/deals.ts`.
  deals: "Star Deals",
};

export function ChildSlide({
  report,
  weekCount,
  runKey,
  weekStart,
  initialConversion,
  canDecide,
}: {
  report: ChildReport;
  /**
   * How many weeks the ceremony covers, for the praise underneath the total —
   * "a perfect week" and "a perfect 3 weeks" are not the same compliment.
   */
  weekCount: number;
  /** Changes every time this slide arrives on stage; `null` while it is off. */
  runKey: number | null;
  /**
   * The week's own Monday, so the slide can offer "convert to coins" against
   * it — or `null` for a span. A span is several weeks added together, and
   * "convert this ceremony's week" stops meaning one thing the moment there
   * is more than one week to mean it about, so the choice is not offered at
   * all rather than guessed at.
   */
  weekStart: string | null;
  /** Coins already converted for this child and week, or `null`. */
  initialConversion: number | null;
  /**
   * Whether "Convert to coins" / "Take cash" may be offered at all.
   *
   * True only on the one render where this ceremony is being opened for the
   * first time ever *and* it is still the current week's ceremony — see the
   * ceremony page. Every render after that is a rewatch, and a rewatch shows
   * whatever was already decided (or nothing) rather than asking again.
   */
  canDecide: boolean;
}) {
  const person = getPerson(report.childId);
  const totalDelay = totalDelayMs(report.charts.length);
  const reducedMotion = useReducedMotion();

  /*
   * `converted` starts from the server's own answer — a rewatch must show
   * "already converted" without a round trip — and only ever moves from
   * `null` to a number, never back. `cashChosen` is not persisted anywhere:
   * "take cash" records nothing new, matching the payout that already
   * happens in person, so leaving the slide and coming back offers the
   * choice again rather than remembering a decision this app never wrote
   * down.
   */
  const [converted, setConverted] = useState(initialConversion);
  const [cashChosen, setCashChosen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  /** Where the flock of coins is flying, or `null` when none is in the air. */
  const [flight, setFlight] = useState<{
    from: FlightPoint;
    to: FlightPoint;
    count: number;
  } | null>(null);
  /*
   * What the money pill shows right now. Starts at zero on a rewatch — the
   * flight already happened, possibly days ago, and there is nothing left to
   * count down — and only ever animates down from `report.cents` during a
   * flight the child is watching this instant.
   */
  const [displayCents, setDisplayCents] = useState(() =>
    initialConversion !== null ? 0 : report.cents,
  );
  const moneyRef = useRef<HTMLParagraphElement>(null);

  async function convert() {
    if (!weekStart || converting) return;
    setConverting(true);
    setConvertError(null);

    const result = await convertWeekToCoins({
      childId: report.childId,
      weekStart,
    });

    if (!result.ok) {
      setConverting(false);
      setConvertError(result.message);
      return;
    }

    // A race with another device, or a rewatch that slipped through: the
    // coins already left, possibly a while ago, so there is nothing to fly.
    const points = result.alreadyConverted || reducedMotion ? null : flightPoints();
    if (!points) {
      land(result.amount, !result.alreadyConverted);
      return;
    }

    fly(points, result.amount);
  }

  /** Settles the slide on its final, permanent answer. */
  function land(amount: number, celebrateIt: boolean) {
    setConverting(false);
    setDisplayCents(0);
    setConverted(amount);
    if (celebrateIt) setCelebrate((value) => value + 1);
  }

  /**
   * The coins leave, one by one, and the cash pill dwindles at the same
   * cadence — see `CoinFlight` for why each coin is its own timed element.
   * `land()` only runs once the flock has actually finished, so the
   * "Converted" text never arrives before the animation that explains it.
   */
  function fly(points: { from: FlightPoint; to: FlightPoint }, amount: number) {
    const startCents = report.cents;
    const startedAt = performance.now();

    setFlight({
      ...points,
      count: Math.max(1, Math.min(report.earned, MAX_VISIBLE_COINS)),
    });

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / COIN_FLIGHT_MS);
      setDisplayCents(Math.round(startCents * (1 - progress)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    window.setTimeout(() => {
      setFlight(null);
      land(amount, true);
    }, COIN_FLIGHT_MS);
  }

  /** The two screen points a flight needs, or `null` if either cannot be found. */
  function flightPoints(): { from: FlightPoint; to: FlightPoint } | null {
    const moneyRect = moneyRef.current?.getBoundingClientRect();
    const shopTab = document.querySelector<HTMLElement>(
      'nav[aria-label="Main"] a[href="/shop"]',
    );
    const shopRect = shopTab?.getBoundingClientRect();
    if (!moneyRect || !shopRect) return null;

    return {
      from: {
        x: moneyRect.left + moneyRect.width / 2,
        y: moneyRect.top + moneyRect.height / 2,
      },
      to: {
        x: shopRect.left + shopRect.width / 2,
        y: shopRect.top + shopRect.height / 2,
      },
    };
  }

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-5 py-6 text-center sm:px-8"
      style={{
        /*
          Their bright colour is a *glow behind the face* and nothing more —
          160px of it, which the avatar itself very nearly covers. Every word on
          the slide therefore sits on the dark shade or darker. See the contrast
          note above: the greens and oranges carry white text at about 2:1 and
          their dark shades carry it at better than 5:1.
        */
        background: `radial-gradient(circle 160px at 50% 13%, ${report.color} 0%, transparent 72%), linear-gradient(180deg, ${report.colorDark} 0%, color-mix(in srgb, ${report.colorDark} 58%, #000000) 100%)`,
        color: "#ffffff",
      }}
    >
      <div
        key={runKey ?? "off"}
        className="flex w-full max-w-sm flex-col items-center gap-4"
      >
        <header
          className="reveal-rise flex flex-col items-center gap-2"
          style={{ "--reveal-delay": `${NAME_DELAY_MS}ms` } as React.CSSProperties}
        >
          <span className="block w-20 sm:w-24">
            <Avatar member={person} showName={false} arriving />
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            {report.name}
          </h2>
        </header>

        <ul className="flex w-full flex-col gap-2">
          {report.charts.map((result, index) => (
            <li
              key={result.chart.id}
              // Alternating sides. Three lines arriving from the same
              // direction reads as a list loading; alternating reads as a
              // scoreboard being filled in.
              className={`${index % 2 === 0 ? "reveal-left" : "reveal-right"} flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5`}
              style={
                {
                  "--reveal-delay": `${chartDelayMs(index)}ms`,
                  backgroundColor: "rgba(255, 255, 255, 0.16)",
                } as React.CSSProperties
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-base font-bold sm:text-lg">
                  {CHART_WORD[result.chart.id]}
                </span>
                {result.perfect ? (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide"
                    style={{
                      backgroundColor: "var(--color-star)",
                      color: "#4a3200",
                    }}
                  >
                    All of them
                  </span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-xl font-extrabold tabular-nums sm:text-2xl">
                  {result.earned}
                </span>
                <span className="text-xs font-semibold opacity-70 tabular-nums">
                  / {result.possible}
                </span>
                <StarGlyph className="h-5 w-5" />
              </span>
            </li>
          ))}
        </ul>

        {/* The number the whole slide has been walking towards. */}
        <div
          className="reveal-punch flex flex-col items-center"
          style={{ "--reveal-delay": `${totalDelay}ms` } as React.CSSProperties}
        >
          <span className="flex items-center gap-2">
            <StarGlyph className="h-9 w-9 sm:h-11 sm:w-11" />
            <span className="text-6xl font-extrabold tabular-nums leading-none sm:text-7xl">
              {runKey === null ? (
                report.earned
              ) : (
                <CountUp
                  target={report.earned}
                  durationMs={COUNT_UP_MS}
                  delayMs={totalDelay}
                />
              )}
            </span>
          </span>
          <span className="mt-1 text-sm font-bold uppercase tracking-[0.2em] opacity-80">
            {report.earned === 1 ? "star" : "stars"}
          </span>
        </div>

        {/*
          The money. A nickel a star, and worth showing: it is the part of this
          the children work out for themselves on the way to the slide.
        */}
        <p
          ref={moneyRef}
          className="reveal-rise relative overflow-hidden rounded-full px-5 py-1.5 text-2xl font-extrabold tabular-nums sm:text-3xl"
          style={
            {
              "--reveal-delay": `${totalDelay + 420}ms`,
              backgroundColor: "var(--color-star)",
              color: "#4a3200",
            } as React.CSSProperties
          }
        >
          {formatMoney(displayCents)}
          <span
            aria-hidden="true"
            className="coin-shine pointer-events-none absolute inset-y-0 left-0 w-8"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.55)" }}
          />
        </p>

        <p
          className="reveal-rise text-base font-bold sm:text-lg"
          style={
            { "--reveal-delay": `${totalDelay + 620}ms` } as React.CSSProperties
          }
        >
          {praiseFor(report, weekCount)}
          {report.completeRows > 0 ? (
            <span className="mt-1 block text-sm font-semibold opacity-80">
              {wholeRowsLabel(report.completeRows)} filled all the way across
            </span>
          ) : null}
        </p>

        {/*
          The first mutation this ceremony has ever made. Only offered for a
          real week (`weekStart`), only until it has been converted, and only
          while "take cash" has not been chosen *this visit* — see the note on
          `cashChosen` above.
        */}
        {weekStart && converted === null && !cashChosen && canDecide ? (
          <div
            className="reveal-rise flex w-full flex-col items-center gap-2"
            style={
              { "--reveal-delay": `${totalDelay + 820}ms` } as React.CSSProperties
            }
          >
            <p className="text-xs font-bold uppercase tracking-wide opacity-80">
              Turn this week into coins?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={convert}
                disabled={converting}
                className="rounded-full px-4 py-2 text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: "var(--color-star)", color: "#4a3200" }}
              >
                {converting ? (
                  "Converting…"
                ) : (
                  <span className="inline-flex items-center gap-1">
                    Convert to <CoinAmount amount={report.earned} />
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setCashChosen(true)}
                disabled={converting}
                className="rounded-full px-4 py-2 text-sm font-extrabold transition-transform active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
              >
                Take cash
              </button>
            </div>
            {convertError ? (
              <p className="text-xs font-semibold" style={{ color: "#ffd1d1" }}>
                {convertError}
              </p>
            ) : null}
          </div>
        ) : null}

        {weekStart && converted !== null ? (
          <p
            className="reveal-punch rounded-full px-4 py-1.5 text-sm font-extrabold"
            style={
              {
                "--reveal-delay": `${totalDelay + 820}ms`,
                backgroundColor: "rgba(255, 255, 255, 0.2)",
              } as React.CSSProperties
            }
          >
            Converted →{" "}
            <span className="inline-flex items-center gap-1">
              +<CoinAmount amount={converted} />
            </span>
          </p>
        ) : null}
      </div>

      {celebrate > 0 ? (
        <Confetti
          key={celebrate}
          scope="section"
          colors={[report.color, "var(--color-star)", "#ffffff"]}
        />
      ) : null}

      {flight ? (
        <CoinFlight from={flight.from} to={flight.to} count={flight.count} />
      ) : null}
    </div>
  );
}
