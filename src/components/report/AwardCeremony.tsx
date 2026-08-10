"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getServerSoundOnSnapshot,
  getSoundOnSnapshot,
  setSoundOn,
  subscribeToSoundOn,
} from "@/lib/sound-store";
import {
  primeFanfare,
  startFanfare,
  stopFanfare,
} from "@/lib/stars/fanfare";
import { formatMoney } from "@/config/rewards";
import type { WeekReport } from "@/lib/stars/report";

import { SoundToggle } from "../stars/SoundToggle";

import { ChildSlide } from "./ChildSlide";
import { FinaleSlide } from "./FinaleSlide";
import { SlideRail, type RailSlide } from "./SlideRail";
import { TitleSlide } from "./TitleSlide";
import { childSlideMs } from "./timing";

/**
 * The weekly report, as an award ceremony.
 *
 * A title card, one slide per child, and the family's total to finish. It runs
 * itself — each child's slide reveals their charts, lands on their total, and
 * holds it for five seconds before the next child takes the stage — and it can
 * be dragged through by hand at any point.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY SLIDE IS MOUNTED AT ONCE
 * ---------------------------------------------------------------------------
 * Because it is dragged. A slide that mounts when it becomes current cannot be
 * half-dragged into view, so the gesture would have nothing to follow and
 * would end in a jump. Seven slides of a handful of elements each is cheap;
 * what is not cheap is animation running behind slides nobody is looking at,
 * so every slide is told whether it is `active` and does nothing until it is.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS A CAROUSEL
 * ---------------------------------------------------------------------------
 * Deliberately none of the usual furniture: no chevrons over the corners, no
 * row of dots, no visible edges of the neighbouring slides. The whole surface
 * is the target, the neighbours sit behind it scaled down and dimmed so it
 * reads as a stage with the next act waiting in the wings, and the only
 * chrome is the rail along the bottom (see `SlideRail`).
 *
 * ---------------------------------------------------------------------------
 * THE MUSIC ONLY EVER STARTS FROM A BUTTON
 * ---------------------------------------------------------------------------
 * Browsers refuse to autoplay audio, so it *cannot* start on load — but this
 * goes further than the policy requires: dragging into the ceremony starts the
 * slides and does not start the music. A swipe is a navigation, and brass
 * arriving out of a page somebody was quietly looking through is the kind of
 * thing that gets an app closed. The two ways to start it are both unambiguous
 * — the Start button and the speaker in the corner.
 */

/**
 * How loud the fanfare plays, 0-1.
 *
 * Well under full: it is *under* the ceremony. A phone on a kitchen counter
 * with five children round it has to carry a name being read out over the top
 * of this, and music that competes is louder rather than better.
 */
const MUSIC_VOLUME = 0.42;

/** How far the slide has to be dragged, as a share of its width, to turn. */
const DRAG_THRESHOLD = 0.2;

/** Sideways travel before a drag takes over from a vertical scroll. */
const DRAG_LOCK_PX = 12;

type Slide =
  | { kind: "title"; key: string }
  | { kind: "child"; key: string; childIndex: number }
  | { kind: "finale"; key: string };

export function AwardCeremony({
  report,
  dateLabel,
  title,
}: {
  report: WeekReport;
  /** e.g. "Aug 3 – Aug 7", already formatted by the page. */
  dateLabel: string;
  /**
   * What the title card is called, when it is not the weekly awards — a
   * ceremony spanning several weeks was given a name by whoever put it
   * together, and that name is the point of it. Left out for a weekly report,
   * which is always "The Birch Family Star Awards".
   */
  title?: string;
}) {
  const slides = useMemo<Slide[]>(
    () => [
      { kind: "title", key: "title" },
      ...report.children.map((child, childIndex) => ({
        kind: "child" as const,
        key: child.childId,
        childIndex,
      })),
      { kind: "finale", key: "finale" },
    ],
    [report],
  );
  const last = slides.length - 1;

  /**
   * Which slide is on stage, and how many times the stage has turned.
   *
   * The two are one piece of state because they always change together: `run`
   * is what the slides key their contents on, so bumping it is how an arriving
   * slide is told to play its choreography again. Held separately they could
   * be updated out of step, and a slide would arrive already finished.
   */
  const [{ index, run }, setStage] = useState({ index: 0, run: 0 });
  const [started, setStarted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    /** Set once the gesture has committed to being a sideways drag. */
    locked: boolean;
  } | null>(null);

  const soundOn = useSyncExternalStore(
    subscribeToSoundOn,
    getSoundOnSnapshot,
    getServerSoundOnSnapshot,
  );

  const go = useCallback(
    (next: number) => {
      setStage((stage) => ({
        index: Math.max(0, Math.min(last, next)),
        run: stage.run + 1,
      }));
      // Any deliberate move is the ceremony beginning, whether or not anybody
      // pressed Start — from here on the slides turn by themselves.
      setStarted(true);
    },
    [last],
  );

  /* --- The music ------------------------------------------------------- */

  // Leaving the page, by any route, takes the music with it. Without this the
  // fanfare would keep playing over the star charts.
  useEffect(() => stopFanfare, []);

  function start() {
    // The button only exists on the title card — every other slide is `inert`
    // — so this always means "on with the first award".
    go(1);
    if (soundOn) startFanfare(MUSIC_VOLUME);
  }

  function toggleSound(next: boolean) {
    setSoundOn(next);
    // This click is itself the user gesture the autoplay policy wants, so the
    // music can begin right here rather than at the next slide.
    if (next) startFanfare(MUSIC_VOLUME);
    else stopFanfare();
  }

  /* --- The slide that turns by itself ---------------------------------- */

  const current = slides[index];
  const slideDuration =
    current.kind === "child"
      ? childSlideMs(report.children[current.childIndex].charts.length)
      : null;

  useEffect(() => {
    // Not before it has begun, not on the title or the finale, and not while a
    // thumb is holding the slide still.
    if (!started || dragging || slideDuration === null) return;

    const timer = setTimeout(
      () =>
        setStage((stage) => ({
          index: Math.min(last, stage.index + 1),
          run: stage.run + 1,
        })),
      slideDuration,
    );
    return () => clearTimeout(timer);
  }, [started, dragging, slideDuration, index, run, last]);

  /* --- Dragging -------------------------------------------------------- */

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      locked: false,
    };
    // Warm the file so that if they press Start next, the brass is ready.
    if (soundOn) primeFanfare();
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = pointer.current;
    if (!gesture || gesture.id !== event.pointerId) return;

    const moved = event.clientX - gesture.x;
    const movedDown = event.clientY - gesture.y;

    /*
     * Wait until the gesture has said what it is. The page scrolls vertically
     * and the stage is most of the screen, so grabbing every touch would make
     * the report the one page in the app you cannot scroll. Sideways has to
     * win by a clear margin before this takes over.
     */
    if (!gesture.locked) {
      if (Math.abs(moved) < DRAG_LOCK_PX || Math.abs(moved) <= Math.abs(movedDown)) {
        return;
      }
      gesture.locked = true;
      setDragging(true);
      /*
       * Capture, so a thumb that slides off the stage — or off the screen —
       * still finishes its drag here rather than leaving the slide stranded
       * half way. Guarded because it is allowed to fail: the pointer may
       * already have been released, and not every environment implements it.
       */
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // The drag still works, it just stops if the pointer leaves.
      }
    }

    // Rubber-banding at the two ends: it still moves, so the gesture is not
    // dead, but it plainly does not want to.
    const resisted =
      (index === 0 && moved > 0) || (index === last && moved < 0);
    setOffset(resisted ? moved * 0.32 : moved);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = pointer.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    pointer.current = null;

    const travelled = offset;
    setOffset(0);
    setDragging(false);
    if (!gesture.locked) return;

    const width = stage.current?.clientWidth ?? 1;
    if (travelled <= -width * DRAG_THRESHOLD) go(index + 1);
    else if (travelled >= width * DRAG_THRESHOLD) go(index - 1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(last);
    else return;
    event.preventDefault();
  }

  /* --- The rail -------------------------------------------------------- */

  const rail: RailSlide[] = slides.map((slide) => {
    if (slide.kind === "child") {
      const child = report.children[slide.childIndex];
      return { key: slide.key, label: child.name, color: child.color };
    }
    return {
      key: slide.key,
      label: slide.kind === "title" ? "the start" : "the family total",
      color: slide.kind === "title" ? "var(--color-primary)" : "var(--color-star)",
    };
  });

  return (
    <section aria-label="The award ceremony" className="flex flex-col gap-1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-muted)" }}
        >
          {dateLabel}
        </p>
        <SoundToggle
          on={soundOn}
          onChange={toggleSound}
          labels={{
            on: "Turn the ceremony music off",
            off: "Turn the ceremony music on",
          }}
        />
      </div>

      <div
        ref={stage}
        role="group"
        tabIndex={0}
        aria-roledescription="Award ceremony"
        aria-label={`Slide ${index + 1} of ${slides.length}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        /*
          The safety net for a browser that would not give us pointer capture:
          without it, a thumb that leaves the stage stops sending moves, and the
          drag — and with it the auto-advance — would be stuck open forever.
          Where capture *did* work this never fires until the pointer is
          released, so it costs nothing.
        */
        onPointerLeave={onPointerUp}
        onKeyDown={onKeyDown}
        className="relative h-[min(74svh,44rem)] min-h-[27rem] w-full overflow-hidden rounded-[var(--radius-card)] select-none"
        style={{
          // `pan-y`: the browser keeps vertical scrolling for itself and hands
          // horizontal movement to the handlers above, which is what stops a
          // drag and a scroll fighting each other.
          touchAction: "pan-y",
          boxShadow:
            "0 1px 2px var(--color-shadow), 0 24px 48px -24px var(--color-shadow)",
        }}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${offset}px), 0, 0)`,
            transition: dragging
              ? "none"
              : "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {slides.map((slide, position) => {
            const isCurrent = position === index;
            return (
              <div
                key={slide.key}
                /*
                  The slides that are not on stage are hidden from screen
                  readers entirely — six copies of "63 stars" read out in a row
                  is not a ceremony — and `inert` takes them out of the tab
                  order with it. Without that, tabbing off the stage lands on
                  the Start button of a title card that is somewhere off to the
                  left, and pressing it does something nobody can see.
                */
                aria-hidden={!isCurrent}
                inert={!isCurrent}
                className="h-full w-full shrink-0"
                style={{
                  transform: isCurrent ? "scale(1)" : "scale(0.92)",
                  opacity: isCurrent ? 1 : 0.5,
                  transition:
                    "transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms ease",
                }}
              >
                {slide.kind === "title" ? (
                  <TitleSlide
                    dateLabel={dateLabel}
                    title={title}
                    childCount={report.children.length}
                    started={started}
                    onStart={start}
                  />
                ) : slide.kind === "child" ? (
                  <ChildSlide
                    report={report.children[slide.childIndex]}
                    weekCount={report.weekCount}
                    runKey={isCurrent ? run : null}
                  />
                ) : (
                  <FinaleSlide report={report} runKey={isCurrent ? run : null} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <SlideRail
        slides={rail}
        index={index}
        durationMs={dragging ? null : slideDuration}
        onSelect={go}
      />

      {/*
        The ceremony in words, for a screen reader and for anybody who cannot
        see the slide that just turned. It is the same information the slide
        carries, said once, rather than a description of the animation.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {describe(report, slides[index], title)}
      </p>
    </section>
  );
}

function describe(report: WeekReport, slide: Slide, title?: string): string {
  if (slide.kind === "title") {
    return `${title ?? "The Birch Family Star Awards"}. Press start to begin.`;
  }
  if (slide.kind === "finale") {
    return `All together: ${report.earned} stars, ${formatMoney(report.cents)}.`;
  }
  const child = report.children[slide.childIndex];
  const charts = child.charts
    .map((result) => `${result.chart.title}, ${result.earned}`)
    .join("; ");
  return `${child.name}: ${charts}. ${child.earned} stars in total, worth ${formatMoney(child.cents)}.`;
}
