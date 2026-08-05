"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import type { ChorePool } from "@/config/chore-rotation";
import { CHILD_IDS, getPerson, type ChildId } from "@/config/family";
import {
  STAR_DAY_COUNT,
  STAR_DAY_NAMES,
  getChart,
  getStarTask,
  type ChartId,
} from "@/config/stars";
import { useCurrentDate } from "@/hooks/useCurrentDate";
import {
  addDays,
  differenceInCalendarDays,
  formatDateRange,
  parseLocalDate,
  startOfWeekMonday,
} from "@/lib/dates";
import {
  getServerSoundOnSnapshot,
  getSoundOnSnapshot,
  setSoundOn,
  subscribeToSoundOn,
} from "@/lib/sound-store";
import { setStar } from "@/lib/stars/actions";
import { playCheer, primeCheer } from "@/lib/stars/cheer";
import {
  isColumnComplete,
  rowFor,
  tally,
  withMark,
  type StarMarks,
  type WeekMarks,
} from "@/lib/stars/counting";
import { getChoreCountdownLabel } from "@/lib/stars/rotation";
import { getChartSectionsForChild, getTasksForChild } from "@/lib/stars/tasks";
import { getWeekStartIso, referenceDateFor } from "@/lib/stars/week";

import { Avatar } from "../Avatar";

import { ChildBackdrop } from "./ChildBackdrop";
import { ChildTabs } from "./ChildTabs";
import { Confetti, CONFETTI_DURATION_MS } from "./Confetti";
import { SoundToggle } from "./SoundToggle";
import { StarChartCard } from "./StarChartCard";

/**
 * The star charts, one child at a time.
 *
 * A client component for the same reason `SeatingBoard` is: which chores a
 * child has depends on the *device's* local date, and it has to be right at
 * midnight on the first of the month without a reload. The pools and the
 * week's marks are handed down by the page — nothing here queries anything.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE CHILD AT A TIME
 * ---------------------------------------------------------------------------
 * The paper chart shows five columns at once because it is A3 and taped to a
 * fridge. On a phone, five columns of five stars is 25 targets across a
 * 390-pixel screen — about 14px each, well under the ~44px a thumb hits
 * reliably. So the phone shows one child's chart at full size and puts the
 * other four one tap away, which is also the order a child does this in: they
 * come to fill in *their* stars.
 */
export function StarsBoard({
  initialDateIso,
  weekStart,
  pools,
  marks,
}: {
  initialDateIso: string;
  /** The Monday the `marks` belong to, `YYYY-MM-DD`. */
  weekStart: string;
  pools: readonly ChorePool[];
  marks: WeekMarks;
}) {
  const router = useRouter();
  const date = useCurrentDate(initialDateIso);
  const [selected, setSelected] = useState<ChildId>(CHILD_IDS[0]);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  /*
   * The device's own preference, straight out of `localStorage` via an
   * external store — the same mechanism the theme and the parent swap use, and
   * for the same reason: the value genuinely lives outside React, and reading
   * it this way keeps the server's first render and the client's in step
   * without an effect that re-renders the page a beat after it appears.
   */
  const soundOn = useSyncExternalStore(
    subscribeToSoundOn,
    getSoundOnSnapshot,
    getServerSoundOnSnapshot,
  );
  const [, startTransition] = useTransition();

  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const burstId = useRef(0);

  // A burst outlives the tap that caused it, so it has to be cancelled if the
  // page is left in the meantime — otherwise the timeout fires into an
  // unmounted component.
  useEffect(
    () => () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    },
    [],
  );

  /*
   * Optimistic ticking. The star fills the instant it is tapped and the write
   * goes out behind it; when the action's `revalidatePath` lands, `marks`
   * arrives fresh from the database and this collapses back onto the truth.
   * A child colouring in a row should never watch a spinner between stars.
   */
  const [optimistic, applyOptimistic] = useOptimistic(
    marks,
    (state: WeekMarks, patch: StarPatch): WeekMarks => {
      const child = state[patch.childId] ?? {};
      const row = [...rowFor(child, patch.taskId)];
      row[patch.dayIndex] = patch.value;
      return {
        ...state,
        [patch.childId]: { ...child, [patch.taskId]: row },
      };
    },
  );

  const monday = useMemo(
    () => parseLocalDate(weekStart) ?? startOfWeekMonday(date),
    [weekStart, date],
  );

  /*
   * The device has crossed into a new week (or started the app up on a Monday
   * morning that the server-rendered page predates). The marks in hand are
   * last week's, so ask the server for this week's rather than showing stale
   * stars against a fresh chart.
   */
  useEffect(() => {
    if (getWeekStartIso(date) !== weekStart) router.refresh();
  }, [date, weekStart, router]);

  /** Which column is today, or -1 at the weekend and in any other week. */
  const todayIndex = useMemo(() => {
    const offset = differenceInCalendarDays(monday, date);
    return offset >= 0 && offset < STAR_DAY_COUNT ? offset : -1;
  }, [monday, date]);

  // Chores change hands on the 1st, so a week that straddles a month shows
  // whoever has the chore *now*. See `lib/stars/week.ts`.
  const reference = useMemo(() => referenceDateFor(monday, date), [monday, date]);

  const sections = useMemo(
    () => getChartSectionsForChild(pools, reference, selected),
    [pools, reference, selected],
  );

  const totals = useMemo(() => {
    const counts = {} as Record<ChildId, number>;
    for (const childId of CHILD_IDS) {
      counts[childId] = tally(
        optimistic[childId] ?? {},
        getTasksForChild(pools, reference, childId),
      ).earned;
    }
    return counts;
  }, [optimistic, pools, reference]);

  // Memoised because `?? {}` would hand a brand-new object to the tally below
  // on every render, defeating its own memo.
  const childMarks = useMemo(
    () => optimistic[selected] ?? {},
    [optimistic, selected],
  );
  const weekTotal = useMemo(
    () => tally(childMarks, getTasksForChild(pools, reference, selected)),
    [childMarks, pools, reference, selected],
  );

  const person = getPerson(selected);
  /*
   * The child's own colour, mixed with the theme's text colour so it keeps its
   * contrast on all ten themes — their identifying hue, still readable as
   * type. Same trick as `--color-star-ink`; see globals.css.
   */
  const accentInk = `color-mix(in srgb, ${person.avatarColor} 62%, var(--color-text))`;

  /* --- The celebration -------------------------------------------------- */

  /**
   * Confetti is thrown at *columns*, not rows.
   *
   * A row is one job done five days running, which takes until Friday. A
   * column is everything owed for one day — and that is the thing a child
   * finishes, notices themselves finishing, and can be congratulated for while
   * they are still holding the phone. Two sizes, because the two are not the
   * same achievement: one chart's column showers that card, and *every* star
   * for the day showers the whole screen.
   *
   * The check runs against what the chart is about to look like rather than
   * what it looks like now, which is why `withMark` exists — the optimistic
   * update has not committed yet at this point.
   */
  const celebrationColors = useMemo(
    () => [
      person.avatarColor,
      person.avatarColorDark,
      "#f5b301",
      "#ffd970",
      "#ffffff",
    ],
    [person],
  );

  function celebrateIfFinished(
    marks: StarMarks,
    taskId: string,
    dayIndex: number,
  ) {
    const day = STAR_DAY_NAMES[dayIndex];
    const tasks = getTasksForChild(pools, reference, selected);

    if (isColumnComplete(marks, tasks, dayIndex)) {
      throwConfetti("page", `${person.name} finished everything for ${day}!`);
      return;
    }

    const chartId = getStarTask(taskId)?.chart;
    if (!chartId) return;

    const onThisChart = tasks.filter((task) => task.chart === chartId);
    if (isColumnComplete(marks, onThisChart, dayIndex)) {
      throwConfetti(
        chartId,
        `${day}: ${shortChartName(getChart(chartId).title)} all done!`,
      );
    }
  }

  function throwConfetti(scope: CelebrationScope, message: string) {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);

    // A card's celebration is quieter than the whole day's — the same clip,
    // turned down, so finishing one chart does not sound like finishing
    // everything.
    if (soundOn) playCheer(scope === "page" ? 1 : 0.6);

    // The id is what remounts `<Confetti>`, so finishing two columns in a row
    // throws a second burst rather than leaving the first one hanging.
    burstId.current += 1;
    setCelebration({ id: burstId.current, scope, message });
    celebrationTimer.current = setTimeout(
      () => setCelebration(null),
      CONFETTI_DURATION_MS,
    );
  }

  function toggle(taskId: string, dayIndex: number, value: boolean) {
    setError(null);

    /*
     * Warm the sound on every tap, not just the ones that celebrate. This is
     * inside a user gesture, which is the only place iOS will let an
     * AudioContext start, and it means the file is fetched and decoded long
     * before any column is finished — so the cheer lands on the same frame as
     * the confetti instead of a beat behind it.
     */
    if (soundOn) primeCheer();

    // Only ever on the way *up*. Rubbing out a star to correct a mistake is
    // not an achievement, and unticking then reticking should not be a way to
    // farm confetti.
    if (value) {
      celebrateIfFinished(
        withMark(childMarks, taskId, dayIndex, true),
        taskId,
        dayIndex,
      );
    }

    startTransition(async () => {
      applyOptimistic({ childId: selected, taskId, dayIndex, value });
      const result = await setStar({
        childId: selected,
        weekStart,
        taskId,
        dayIndex,
        value,
      });
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ChildBackdrop selected={selected} />

      {/*
        The whole-day burst. Rendered here rather than inside a card because it
        falls across the entire screen — it is fixed-position, so it is the one
        piece of this page that escapes the column the rest of it lives in.
      */}
      {celebration?.scope === "page" ? (
        <Confetti
          key={celebration.id}
          scope="page"
          colors={celebrationColors}
        />
      ) : null}

      {/*
        Keyed on the child, so the whole header — face, name, colour — is
        replaced rather than edited when you switch. It arrives with the same
        soft fade the rest of the app uses, which is the movement that tells a
        child at a glance that the page changed under them.
      */}
      <header
        key={`header-${selected}`}
        className="animate-soft-fade flex items-center gap-3"
      >
        <span className="block w-14 shrink-0 sm:w-16">
          <Avatar member={person} showName={false} arriving />
        </span>

        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ color: accentInk }}
          >
            {person.name}&rsquo;s Stars
          </h1>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {formatDateRange(monday, addDays(monday, 4))} ·{" "}
            {getChoreCountdownLabel(reference)}
          </p>
        </div>

        <SoundToggle
          on={soundOn}
          onChange={(next) => {
            setSoundOn(next);
            // Turning it *on* is itself a gesture, so the file can be fetched
            // and the context resumed right here — the first celebration after
            // switching it on is then in time, rather than the one after that.
            if (next) primeCheer();
          }}
        />
      </header>

      <ChildTabs selected={selected} totals={totals} onSelect={setSelected} />

      {/*
        The celebration in words. It carries the whole message on its own,
        which is what makes the confetti safe to switch off entirely under
        `prefers-reduced-motion` — and it is what a screen reader hears.
      */}
      {celebration ? (
        <p
          role="status"
          className="animate-soft-rise rounded-2xl px-4 py-2 text-center text-base font-extrabold"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--color-star) 26%, var(--color-surface))",
            color: "var(--color-star-ink)",
          }}
        >
          🎉 {celebration.message}
        </p>
      ) : null}

      <p
        className="themed-transition rounded-2xl px-4 py-2 text-center text-sm font-bold"
        style={{
          backgroundColor: `color-mix(in srgb, ${person.avatarColor} 18%, var(--color-surface))`,
          color: accentInk,
        }}
        aria-live="polite"
      >
        {person.name} has {weekTotal.earned} of {weekTotal.possible} stars this
        week
        {weekTotal.completeRows > 0
          ? ` · ${weekTotal.completeRows} whole ${weekTotal.completeRows === 1 ? "row" : "rows"}`
          : ""}
      </p>

      {error ? (
        <p
          role="status"
          className="rounded-2xl px-4 py-2 text-center text-sm font-semibold"
          style={{
            backgroundColor: "color-mix(in srgb, #dc2626 14%, transparent)",
            color: "#b91c1c",
          }}
        >
          {error}
        </p>
      ) : null}

      {/*
        Keyed on the child so switching charts re-runs the entrance animation
        — it reads as *their* chart arriving rather than the labels silently
        changing under your thumb.
      */}
      {/*
        Both this and the header are keyed on the child, and the two keys are
        deliberately *prefixed differently*. Siblings sharing a key value is a
        duplicate key as far as React is concerned: it kept the outgoing header
        mounted, so switching child left Hannah's name sitting above Clara's
        chart. `tests/stars-board.test.tsx` covers it.
      */}
      <div
        key={`charts-${selected}`}
        className="animate-soft-rise flex flex-col gap-3"
      >
        {sections.map((section) => (
          <StarChartCard
            key={section.chart.id}
            section={section}
            marks={childMarks}
            todayIndex={todayIndex}
            accent={person.avatarColor}
            accentInk={accentInk}
            celebration={
              celebration?.scope === section.chart.id ? celebration.id : null
            }
            celebrationColors={celebrationColors}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

type StarPatch = {
  childId: ChildId;
  taskId: string;
  dayIndex: number;
  value: boolean;
};

/** Which confetti to throw: one chart's card, or the whole screen. */
type CelebrationScope = ChartId | "page";

type Celebration = {
  /** Bumped per burst, so a second one remounts rather than merging. */
  id: number;
  scope: CelebrationScope;
  message: string;
};

/** "Our Family Chore Chart" -> "Chore Chart". The card headings do this too. */
function shortChartName(title: string): string {
  return title.replace(/^Our Family /, "");
}
