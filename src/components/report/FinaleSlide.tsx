"use client";

import { getPerson } from "@/config/family";
import { formatMoney } from "@/config/rewards";
import {
  STAR_RATE_LABEL,
  totalCaption,
  type WeekReport,
} from "@/lib/stars/report";

import { Avatar } from "../Avatar";
import { Confetti } from "../stars/Confetti";

import { CountUp } from "./CountUp";
import { StarGlyph } from "./StarGlyph";
import { COUNT_UP_MS } from "./timing";

/**
 * The last slide: what the five of them did together.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CEREMONY ENDS ON A TOTAL NOBODY EARNED
 * ---------------------------------------------------------------------------
 * Five slides of individual numbers is five children being ranked, whether or
 * not anybody says so — the eldest has the most rows on her chart and will
 * usually top it, and the four-year-old cannot win. Ending on the family's
 * total says what the charts are actually for: the house ran, and it took all
 * of them. It is also the only number on the whole page that goes up when
 * somebody else does well.
 *
 * The faces are in roster order here rather than in ceremony order — this is
 * the family portrait at the end, not the running order.
 *
 * This is the one slide that does not auto-advance. It is where the ceremony
 * stops, and a slide that turned over into nothing would undo the ending.
 */
export function FinaleSlide({
  report,
  runKey,
}: {
  report: WeekReport;
  /** Changes every time this slide arrives on stage; `null` while it is off. */
  runKey: number | null;
}) {
  // Roster order (oldest first), which `ceremonyOrder()` deliberately reverses.
  const portrait = [...report.children].reverse();

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-5 py-6 text-center sm:px-8"
      style={{
        /*
          Gold, but a *burnt* gold. The obvious move is the star colour itself,
          and it carries white text at about 2.4:1 — so the slide is the darkest
          part of the same family, and the actual gold is spent on the confetti
          and the star, where nothing has to be read off it.
        */
        background:
          "radial-gradient(circle at 50% 18%, #a3560a 0%, #7c3f00 55%, #43210a 100%)",
        color: "#ffffff",
      }}
    >
      {/*
        The paper only falls here. Keyed on the visit so coming back to the
        finale throws a fresh burst rather than nothing at all — and only while
        the slide is on screen, because it is fixed to the viewport and would
        otherwise rain on whichever slide the ceremony had moved to.
      */}
      {runKey !== null ? (
        <Confetti key={runKey} scope="page" colors={CONFETTI_COLORS} />
      ) : null}

      <div
        key={runKey ?? "off"}
        className="flex w-full max-w-sm flex-col items-center gap-4"
      >
        <h2
          className="reveal-rise text-2xl font-extrabold tracking-tight sm:text-3xl"
          style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
        >
          All together
        </h2>

        <ul
          className="reveal-rise flex w-full items-start justify-center gap-1.5 sm:gap-3"
          style={{ "--reveal-delay": "320ms" } as React.CSSProperties}
        >
          {portrait.map((child) => (
            <li
              key={child.childId}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <span className="block w-full max-w-[3.5rem]">
                <Avatar member={getPerson(child.childId)} showName={false} arriving />
              </span>
              <span className="text-xs font-bold tabular-nums opacity-90">
                {child.earned}
              </span>
            </li>
          ))}
        </ul>

        <div
          className="reveal-punch flex flex-col items-center"
          style={{ "--reveal-delay": "700ms" } as React.CSSProperties}
        >
          <span className="flex items-center gap-2">
            <StarGlyph className="h-9 w-9 sm:h-11 sm:w-11" color="#ffffff" />
            <span className="text-6xl font-extrabold tabular-nums leading-none sm:text-7xl">
              {runKey === null ? (
                report.earned
              ) : (
                <CountUp target={report.earned} durationMs={COUNT_UP_MS} delayMs={700} />
              )}
            </span>
          </span>
          <span className="mt-1 text-sm font-bold uppercase tracking-[0.2em] opacity-85">
            {totalCaption(report.weekCount)}
          </span>
        </div>

        <p
          className="reveal-rise rounded-full px-5 py-1.5 text-2xl font-extrabold tabular-nums sm:text-3xl"
          style={
            {
              "--reveal-delay": "1200ms",
              backgroundColor: "#ffffff",
              color: "#7c3f00",
            } as React.CSSProperties
          }
        >
          {formatMoney(report.cents)}
        </p>

        <p
          className="reveal-rise text-sm font-semibold opacity-85"
          style={{ "--reveal-delay": "1400ms" } as React.CSSProperties}
        >
          {STAR_RATE_LABEL} · {report.earned} of {report.possible} stars earned
        </p>
      </div>
    </div>
  );
}

/**
 * Gold and white, plus a little of each parent-free celebration colour.
 *
 * Not the children's colours: this burst falls on the *family* slide, and
 * picking five hues would make it somebody's confetti.
 */
const CONFETTI_COLORS = ["#f5b301", "#ffd970", "#ffffff", "#ffb703", "#fff3c4"];
