"use client";

import { STAR_DAY_LABELS } from "@/config/stars";
import type { ChartSection } from "@/lib/stars/tasks";
import { rowFor, tally, type StarMarks } from "@/lib/stars/counting";

import { StarRow } from "./StarRow";

/**
 * One chart — chores, learning or hygiene — as a card.
 *
 * The three sit stacked on one page rather than behind tabs, because on the
 * fridge they are three sheets side by side and a child checks all three in
 * one pass. The `M T W T F` header repeats on each card so the columns are
 * still labelled after you have scrolled past the first one.
 */
export function StarChartCard({
  section,
  marks,
  todayIndex,
  accent,
  accentInk,
  onToggle,
}: {
  section: ChartSection;
  marks: StarMarks;
  todayIndex: number;
  /** The child's own identifying colour, from `config/family.ts`. */
  accent: string;
  /** The same colour, mixed for readable type. */
  accentInk: string;
  onToggle: (taskId: string, dayIndex: number, value: boolean) => void;
}) {
  const totals = tally(marks, section.tasks);

  return (
    /*
      The card carries the child's colour too, not just the page behind it: a
      thumb resting on the chart covers most of the backdrop, and this is the
      surface the stars actually sit on. Tinted rather than outlined, so it
      still reads as one of the app's cards on all ten themes.
    */
    <section
      className="app-card themed-transition p-3 sm:p-4"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 8%, var(--color-surface))`,
        borderColor: `color-mix(in srgb, ${accent} 34%, var(--color-border))`,
      }}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3 px-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold tracking-tight">
            {section.chart.title.replace(/^Our Family /, "")}
          </h2>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {section.chart.blurb}
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

      {/*
        The column headings are `aria-hidden`: each star already announces its
        own day in full ("Piano practice on Wednesday"), so reading five bare
        letters out first is noise.
      */}
      <div className="mb-1 flex items-center gap-2 px-2" aria-hidden="true">
        <span className="min-w-0 flex-1" />
        <span className="flex shrink-0">
          {STAR_DAY_LABELS.map((day, index) => (
            <span
              key={index}
              className="flex h-5 w-11 items-center justify-center text-[0.7rem] font-bold"
              style={{
                color:
                  index === todayIndex
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
              }}
            >
              {day}
            </span>
          ))}
        </span>
      </div>

      <ul className="flex flex-col gap-0.5">
        {section.tasks.map((task) => (
          <StarRow
            key={task.id}
            task={task}
            row={rowFor(marks, task.id)}
            todayIndex={todayIndex}
            onToggle={(day, value) => onToggle(task.id, day, value)}
          />
        ))}
      </ul>
    </section>
  );
}
