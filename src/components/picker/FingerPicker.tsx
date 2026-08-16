"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PICKER_BACKGROUND,
  PICKER_CIRCLE_PX,
  PICKER_COLOURS,
  PICKER_DIM,
  PICKER_FLOOD_MS,
  PICKER_HOLD_MS,
  PICKER_PULSE_MS,
  PICKER_SECONDS,
} from "@/config/picker";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  chooseIndex,
  countdownNumber,
  floodScale,
  nextColourIndex,
  type PickerPhase,
} from "@/lib/picker/game";

import { BURST_DURATION_MS, EdgeConfetti } from "./EdgeConfetti";

/**
 * Everybody puts a finger on the screen and it picks one.
 *
 * The whole thing is one gesture: a hand goes down, a number counts to itself,
 * and a colour wins. There is no start button, no settings, no "how many
 * players", and no sound — which is not an omission but the point. This gets
 * opened in the middle of an argument about who goes first, and anything that
 * has to be read or configured first is a reason to go back to arguing.
 *
 * ---------------------------------------------------------------------------
 * WHY IT COVERS THE WHOLE SCREEN, NAVIGATION AND ALL
 * ---------------------------------------------------------------------------
 * `fixed inset-0` at a z-index above the tab bar. Five children put their
 * hands on an iPad at once and they do not aim; a finger landing on the bottom
 * bar would navigate away mid-draw, and one landing near it would be a circle
 * cut in half by a strip of app furniture.
 *
 * That leaves the page with no visible way out, so it grows its own: the Done
 * button in the corner, which is the only thing on the screen that is not part
 * of the game. It is deliberately small, deliberately in the least-reachable
 * corner for a hand coming from below, and deliberately the one element that
 * stops a tap from reaching the reset.
 *
 * ---------------------------------------------------------------------------
 * THE THREE PHASES
 * ---------------------------------------------------------------------------
 *   `waiting`  — nothing down. The number sits at 5, unlit.
 *   `counting` — at least one finger down, clock running. Lift every finger
 *                and it goes back to `waiting` with the clock reset, because a
 *                round nobody is in is not a round.
 *   `winner`   — one has been drawn. Its colour floods out from where that
 *                finger was, paper comes in from all four edges, and after
 *                five seconds of solid colour it resets itself.
 *
 * A tap during `winner` resets it immediately, and — because the tapping
 * finger is then a finger on the screen — starts the next round on the way
 * down. Lifting it goes back to `waiting`. That is one gesture doing the
 * obvious thing in both directions rather than a reset button.
 */

/** A finger that is currently on the glass. */
type Finger = {
  pointerId: number;
  /** Viewport pixels. */
  x: number;
  y: number;
  /** Index into `PICKER_COLOURS`. */
  colour: number;
};

type Winner = {
  x: number;
  y: number;
  colour: number;
  /** How far the circle has to grow to cover the screen from there. */
  scale: number;
};

export function FingerPicker() {
  const reducedMotion = useReducedMotion();

  const [fingers, setFingers] = useState<readonly Finger[]>([]);
  const [phase, setPhase] = useState<PickerPhase>("waiting");
  const [showing, setShowing] = useState(PICKER_SECONDS);
  const [winner, setWinner] = useState<Winner | null>(null);
  /** Flipped a frame after the winner lands, which is what runs the flood. */
  const [flooded, setFlooded] = useState(false);
  const [confetti, setConfetti] = useState(false);

  /*
   * The fingers again, and the authoritative copy.
   *
   * Every change writes here first and to React state second, so a handler can
   * read what is on the screen *now* rather than what was there at the last
   * render. Two things need that. The draw runs inside an animation frame and
   * must see the hand that landed a moment ago — on a five-second countdown,
   * the difference is a child who joined at the last second being left out of
   * their own round. And two fingers landing in the same frame are batched by
   * React, so a handler reading state would see "no fingers" twice and start
   * the clock twice.
   */
  const fingersRef = useRef<readonly Finger[]>([]);
  const deadlineRef = useRef(0);
  /** Whether the clock is running, readable in the same tick it is set. */
  const countingRef = useRef(false);

  const setFingersNow = useCallback((next: readonly Finger[]) => {
    fingersRef.current = next;
    setFingers(next);
  }, []);

  /* ---------------------------------------------------------------- */
  /* The round                                                         */
  /* ---------------------------------------------------------------- */

  const startCounting = useCallback(() => {
    if (countingRef.current) return;
    countingRef.current = true;
    deadlineRef.current = performance.now() + PICKER_SECONDS * 1000;
    setShowing(PICKER_SECONDS);
    setPhase("counting");
  }, []);

  const stopCounting = useCallback(() => {
    countingRef.current = false;
    setShowing(PICKER_SECONDS);
    setPhase("waiting");
  }, []);

  /**
   * Back to a blank screen.
   *
   * Fingers already on the glass are deliberately *kept*. They are still
   * physically there, they will never send another `pointerdown`, and dropping
   * them would leave a hand pressed on the screen with no circle under it — so
   * if any remain, the next round starts here rather than waiting for a
   * gesture that is never coming.
   */
  const reset = useCallback(() => {
    countingRef.current = false;
    setWinner(null);
    setFlooded(false);
    setConfetti(false);

    if (fingersRef.current.length > 0) {
      startCounting();
      return;
    }
    stopCounting();
  }, [startCounting, stopCounting]);

  const draw = useCallback(() => {
    countingRef.current = false;
    const entrants = fingersRef.current;
    const index = chooseIndex(entrants.length, Math.random());

    // Everybody let go on the last frame. No round happened.
    if (index < 0) {
      stopCounting();
      return;
    }

    const chosen = entrants[index];
    setWinner({
      x: chosen.x,
      y: chosen.y,
      colour: chosen.colour,
      scale: floodScale(
        chosen,
        { width: window.innerWidth, height: window.innerHeight },
        PICKER_CIRCLE_PX,
      ),
    });
    setPhase("winner");
  }, [stopCounting]);

  /* The clock. Runs only while somebody is in the round. */
  useEffect(() => {
    if (phase !== "counting") return;

    let frame = 0;
    const tick = () => {
      const remaining = deadlineRef.current - performance.now();
      if (remaining <= 0) {
        draw();
        return;
      }
      // Identical values are a no-op in React, so this is one render per
      // second rather than one per frame.
      setShowing(countdownNumber(remaining));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, draw]);

  /*
   * Start the flood and the paper one frame after the winner is known.
   *
   * A transition needs two different values in two different frames; setting
   * the final scale in the same commit that mounts the circle would simply
   * draw it full-size with nothing to animate.
   */
  useEffect(() => {
    if (!winner) return;
    const frame = requestAnimationFrame(() => {
      setFlooded(true);
      setConfetti(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [winner]);

  /* Five seconds of solid colour, then it clears itself. */
  useEffect(() => {
    if (phase !== "winner") return;
    // Measured from the end of the flood, not the start of it, so the colour
    // is actually on screen for the full five seconds.
    const timer = setTimeout(reset, PICKER_FLOOD_MS + PICKER_HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase, reset]);

  /* Take the paper away once the last piece has landed. */
  useEffect(() => {
    if (!confetti) return;
    const timer = setTimeout(() => setConfetti(false), BURST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [confetti]);

  /* ---------------------------------------------------------------- */
  /* Hands                                                             */
  /* ---------------------------------------------------------------- */

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // One tap on the winning colour clears it. The same finger then joins
      // the round below, which is what makes tap-and-hold start the next one.
      if (phase === "winner") reset();

      const current = fingersRef.current;
      if (current.some((finger) => finger.pointerId === event.pointerId)) return;

      event.currentTarget.setPointerCapture(event.pointerId);

      const next = [
        ...current,
        {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          colour: nextColourIndex(current.map((finger) => finger.colour)),
        },
      ];
      setFingersNow(next);
      // `startCounting` ignores a second call while the clock is already
      // running, so this is safe whether this is the first hand of a fresh
      // round or the fifth of one already under way.
      startCounting();
    },
    [phase, reset, setFingersNow, startCounting],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = fingersRef.current;
      const index = current.findIndex(
        (finger) => finger.pointerId === event.pointerId,
      );
      if (index === -1) return;

      const finger = current[index];
      if (finger.x === event.clientX && finger.y === event.clientY) return;

      const next = [...current];
      next[index] = { ...finger, x: event.clientX, y: event.clientY };
      setFingersNow(next);
    },
    [setFingersNow],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = fingersRef.current;
      const next = current.filter(
        (finger) => finger.pointerId !== event.pointerId,
      );
      if (next.length === current.length) return;

      setFingersNow(next);

      // A round nobody is in is not a round: the clock stops and the number
      // goes back to five rather than running down to a draw with no entrants.
      if (next.length === 0 && countingRef.current) stopCounting();
    },
    [setFingersNow, stopCounting],
  );

  /* ---------------------------------------------------------------- */

  const winningColour = winner ? PICKER_COLOURS[winner.colour] : null;

  return (
    <div
      className="fixed inset-0 z-50 select-none overflow-hidden"
      style={{
        backgroundColor: PICKER_BACKGROUND,
        /*
         * Without these the first hand scrolls the page, drags the iPad's
         * pull-to-refresh down over the game, or raises the copy bubble.
         * `touch-action: none` is the one that matters most: a multi-touch
         * gesture the browser claims is a gesture the game never sees.
         */
        touchAction: "none",
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/*
        The number, behind everything. It is the clock and the instruction at
        once: a big dim 5 on an empty black screen is a question, and the only
        way to answer it is to touch the screen.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      >
        <span
          className="font-extrabold leading-none tabular-nums"
          style={{
            fontSize: "min(46vh, 46vw)",
            color: phase === "counting" ? "#f4f4f8" : PICKER_DIM,
            opacity: phase === "counting" ? 0.22 : 1,
            transition: "color 240ms ease, opacity 240ms ease",
          }}
        >
          {showing}
        </span>
        {phase === "waiting" ? (
          <span
            className="mt-6 px-8 text-center text-lg font-semibold sm:text-xl"
            style={{ color: PICKER_DIM }}
          >
            Everyone put a finger on the screen
          </span>
        ) : null}
      </div>

      {/*
        The circles. Not rendered during `winner` — the flood has taken the
        screen and a ring of losing colours poking out of it would say the
        round is still running.
      */}
      {phase !== "winner"
        ? fingers.map((finger, index) => {
            const colour = PICKER_COLOURS[finger.colour];
            return (
              <div
                key={finger.pointerId}
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: finger.x,
                  top: finger.y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className="finger-pulse rounded-full"
                  style={
                    {
                      width: PICKER_CIRCLE_PX,
                      height: PICKER_CIRCLE_PX,
                      backgroundColor: colour.hex,
                      // A soft halo of the circle's own colour, which is what
                      // stops ten flat discs on black looking like stickers.
                      boxShadow: `0 0 44px -6px ${colour.hex}`,
                      "--pulse-duration": `${PICKER_PULSE_MS}ms`,
                      // Negative, so each circle starts already part-way
                      // through the cycle instead of every one of them
                      // beginning at the same instant.
                      "--pulse-delay": `${index * -170}ms`,
                    } as React.CSSProperties
                  }
                />
              </div>
            );
          })
        : null}

      {/* The winning colour, expanding from where that finger was. */}
      {winner && winningColour ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            left: winner.x,
            top: winner.y,
            width: PICKER_CIRCLE_PX,
            height: PICKER_CIRCLE_PX,
            marginLeft: -PICKER_CIRCLE_PX / 2,
            marginTop: -PICKER_CIRCLE_PX / 2,
            backgroundColor: winningColour.hex,
            transform: `scale(${flooded ? winner.scale : 1})`,
            transition: `transform ${PICKER_FLOOD_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            zIndex: 20,
          }}
        />
      ) : null}

      {/*
        No paper for anyone who has asked for less movement. The stylesheet
        would hide it anyway, but not building two hundred and forty elements
        is better than building them and setting them to `display: none`.
      */}
      {confetti && !reducedMotion ? (
        <EdgeConfetti colours={burstColours(winner?.colour)} />
      ) : null}

      {/*
        The one thing on the screen that is not the game. `stopPropagation` on
        the way down, or leaving would also reset the round underneath — which
        does not matter, except that the flood would restart under the finger
        for the frame before the page changes.
      */}
      <Link
        href="/"
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute left-4 top-4 z-40 flex h-11 items-center gap-1.5 rounded-full pe-4 ps-3 text-sm font-bold"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.42)",
          color: "#ffffff",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          marginTop: "env(safe-area-inset-top)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 5-7 7 7 7" />
        </svg>
        Done
      </Link>

      {/*
        The draw, in words. Everything else on this page is colour and
        position, neither of which a screen reader can convey — and the winner
        is the one piece of information the page exists to produce.
      */}
      <p aria-live="polite" className="sr-only">
        {winningColour
          ? `${winningColour.label} wins.`
          : phase === "counting"
            ? `${fingers.length} on the screen. Choosing in ${showing}.`
            : "Waiting for fingers."}
      </p>
    </div>
  );
}

/**
 * The colours the paper comes in.
 *
 * Everything except the one that just won. Paper in the winning colour is
 * invisible against a screen that has just turned that colour, so including it
 * would quietly throw away a tenth of the burst.
 */
function burstColours(winning: number | undefined): readonly string[] {
  return PICKER_COLOURS.filter((_, index) => index !== winning).map(
    (colour) => colour.hex,
  );
}
