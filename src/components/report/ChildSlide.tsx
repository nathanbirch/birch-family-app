"use client";

import { getPerson } from "@/config/family";
import { formatMoney } from "@/config/rewards";
import type { ChartId } from "@/config/stars";
import {
  praiseFor,
  wholeRowsLabel,
  type ChildReport,
} from "@/lib/stars/report";

import { Avatar } from "../Avatar";

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
}: {
  report: ChildReport;
  /**
   * How many weeks the ceremony covers, for the praise underneath the total —
   * "a perfect week" and "a perfect 3 weeks" are not the same compliment.
   */
  weekCount: number;
  /** Changes every time this slide arrives on stage; `null` while it is off. */
  runKey: number | null;
}) {
  const person = getPerson(report.childId);
  const totalDelay = totalDelayMs(report.charts.length);

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
          className="reveal-rise relative overflow-hidden rounded-full px-5 py-1.5 text-2xl font-extrabold tabular-nums sm:text-3xl"
          style={
            {
              "--reveal-delay": `${totalDelay + 420}ms`,
              backgroundColor: "var(--color-star)",
              color: "#4a3200",
            } as React.CSSProperties
          }
        >
          {formatMoney(report.cents)}
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
      </div>
    </div>
  );
}
