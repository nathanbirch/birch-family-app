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
 *   `waiting`  — no round running. The number sits at 5, unlit.
 *   `counting` — a round is under way and the clock is running.
 *   `winner`   — one has been drawn. Its colour floods out from where that
 *                finger was, paper comes in from all four edges, and after
 *                five seconds of solid colour it resets itself.
 *
 * ---------------------------------------------------------------------------
 * THE DEADLINE DOES NOT MOVE
 * ---------------------------------------------------------------------------
 * The first hand down starts a round, and from that instant the five seconds
 * are fixed. Hands may arrive and leave as much as they like — a child
 * repositioning a finger, one joining late, one giving up — and the number goes
 * on counting the five seconds it promised. **Only the last moment counts**:
 * the draw is made from whoever is on the glass when the clock reaches zero.
 *
 * It used to cancel the round the moment the screen emptied, which was the same
 * bug wearing a different hat. With one finger down, lifting it reset the clock
 * to five, so putting it back started the whole thing again — "I moved my
 * finger and it started over".
 *
 * A round that runs out with nobody on the screen has no winner and goes quietly
 * back to waiting. That is the only cost of never cancelling, and it is a
 * five-second one; in the meantime anybody may still join, which is what makes
 * a tap on a winning colour a *reset plus a starting gun*.
 *
 * ---------------------------------------------------------------------------
 * TOUCH EVENTS, NOT POINTER EVENTS
 * ---------------------------------------------------------------------------
 * Every other interactive surface in this app uses pointer events, which are
 * the modern answer and unify mouse, pen and touch. This one does not, and the
 * reason is the only thing it does: **hold ten fingers at once**.
 *
 * Pointer events describe one pointer per event, so ten fingers means tracking
 * ten independent streams of down/move/up and trusting that none of them is
 * dropped. On an iPad they are dropped — the page stopped taking fingers at
 * five, and `setPointerCapture` on a single element for that many concurrent
 * pointers is the most likely reason.
 *
 * A `TouchEvent` carries `event.touches`: the complete list of everything
 * currently on the glass, recomputed and handed over on every single event.
 * There is no stream to lose track of, no capture to hold, and no arithmetic —
 * the component simply mirrors that list. It is both more reliable and less
 * code, and it is what a picker like this has always been built on.
 *
 * Pointer events are kept for `pointerType === "mouse"` alone, so the page can
 * still be used and tested with a trackpad. That discriminator matters: an
 * Apple Pencil raises touch events *as well as* pointer events on iOS, so
 * routing on "is it touch" would count the same finger twice.
 */

/** A finger that is currently on the glass. */
type Finger = {
  /** `Touch.identifier`, or a `pointerId` on the mouse path. */
  id: number;
  /** Viewport pixels. */
  x: number;
  y: number;
  /** Index into `PICKER_COLOURS`. */
  colour: number;
};

/** A finger before it has been given a colour. */
type RawFinger = { id: number; x: number; y: number };

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
  /** The phase, for the same reason. See `setPhaseNow`. */
  const phaseRef = useRef<PickerPhase>("waiting");

  /**
   * Which colour each finger has, by its id.
   *
   * Kept outside the finger list because the list is *rebuilt from scratch* on
   * every touch event — that is the whole point of using touch events — and a
   * colour that was recomputed each time would flicker through the palette as
   * neighbours came and went. The map is the memory the rebuilt list does not
   * have.
   */
  const coloursRef = useRef(new Map<number, number>());

  /**
   * Whether the finger list is one the browser has stopped confirming.
   *
   * Set when a `touchcancel` takes every touch at once — see
   * `handleTouchCancel` for the iPhone behaviour that causes it. Cleared by
   * the next real touch event, and honoured by `reset`.
   */
  const frozenRef = useRef(false);

  const setFingersNow = useCallback((next: readonly Finger[]) => {
    fingersRef.current = next;
    setFingers(next);
  }, []);

  /** Set the phase where a handler can read it back in the same tick. */
  const setPhaseNow = useCallback((next: PickerPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /* ---------------------------------------------------------------- */
  /* The round                                                         */
  /* ---------------------------------------------------------------- */

  const startCounting = useCallback(() => {
    if (countingRef.current) return;
    countingRef.current = true;
    deadlineRef.current = performance.now() + PICKER_SECONDS * 1000;
    setShowing(PICKER_SECONDS);
    setPhaseNow("counting");
  }, [setPhaseNow]);

  const stopCounting = useCallback(() => {
    countingRef.current = false;
    setShowing(PICKER_SECONDS);
    setPhaseNow("waiting");
  }, [setPhaseNow]);

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

    /*
     * A frozen list is one a cancel left behind — see `handleTouchCancel`.
     * Those circles were worth keeping for the round they were already in, but
     * they are not evidence that anybody is still touching the screen, and
     * starting a fresh round off them would draw a winner nobody is playing
     * for and then do it again five seconds later, for ever.
     */
    if (frozenRef.current) {
      frozenRef.current = false;
      coloursRef.current.clear();
      setFingersNow([]);
      stopCounting();
      return;
    }

    if (fingersRef.current.length > 0) {
      startCounting();
      return;
    }
    stopCounting();
  }, [setFingersNow, startCounting, stopCounting]);

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
    setPhaseNow("winner");
  }, [setPhaseNow, stopCounting]);

  /*
   * The clock.
   *
   * It reads `deadlineRef` rather than counting down a value of its own, which
   * is what makes the deadline immovable: nothing but `startCounting` writes
   * it, and `startCounting` refuses while a round is already under way.
   */
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

  /**
   * Everything on the glass, right now.
   *
   * The single way fingers get into this component. It is handed the complete
   * list every time — never a delta — which is what makes ten fingers no
   * harder than one: there is no per-finger stream that could go out of step
   * with the others.
   *
   * `arriving` is true only for a touch (or click) *starting*, which is the
   * one case that may need to clear a winning colour first.
   */
  const applyFingers = useCallback(
    (raw: readonly RawFinger[], arriving: boolean) => {
      // Whatever the browser has just told us is the truth, so the frozen list
      // left behind by a cancelled round is no longer anything to protect.
      frozenRef.current = false;

      const colours = coloursRef.current;

      // Forget the colours of fingers that have left, so the palette is walked
      // from the top again rather than running out after ten *cumulative*
      // fingers across a long session.
      const present = new Set(raw.map((finger) => finger.id));
      for (const id of [...colours.keys()]) {
        if (!present.has(id)) colours.delete(id);
      }

      const next = raw.map((finger) => {
        let colour = colours.get(finger.id);
        if (colour === undefined) {
          colour = nextColourIndex([...colours.values()]);
          colours.set(finger.id, colour);
        }
        return { id: finger.id, x: finger.x, y: finger.y, colour };
      });

      const wasWinner = phaseRef.current === "winner";
      setFingersNow(next);

      // One tap on the winning colour clears it *and* starts the next round's
      // clock, so everybody has five seconds to get a finger down — which is a
      // better reset than one that waits for somebody to go first. `reset` is
      // called after the new list is installed so it counts the hand that is
      // actually on the screen.
      if (arriving && wasWinner) {
        reset();
        return;
      }

      // The flood owns the screen; a finger sliding across it must not quietly
      // start a new round underneath.
      if (wasWinner) return;

      /*
       * Ignored while the clock is already running, which is the whole rule.
       * Once a round has started its deadline does not move, so hands may come
       * and go as much as they like and the number goes on counting the five
       * seconds it promised. Only the *last* moment matters: `draw` reads the
       * fingers that are on the glass when the clock reaches zero.
       *
       * There is deliberately nothing here that stops it. An empty screen
       * mid-round used to cancel the round, which read as "removing a finger
       * restarts the countdown" — the last hand lifts, the number snaps back to
       * five, and putting it down again begins the whole thing afresh. A child
       * repositioning a finger should not cost everybody five seconds.
       *
       * A round that runs out with nobody on the screen simply has no winner,
       * and `draw` puts it back to waiting. That is the only cost of never
       * cancelling; it is five seconds at worst, and for those five seconds
       * anybody may still join.
       */
      if (next.length > 0) startCounting();
    },
    [reset, setFingersNow, startCounting],
  );

  /** `event.touches` — every finger on the screen — as plain data. */
  const touchList = (event: React.TouchEvent<HTMLDivElement>): RawFinger[] =>
    Array.from(event.touches, (touch) => ({
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
    }));

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => applyFingers(touchList(event), true),
    [applyFingers],
  );

  const handleTouchChange = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => applyFingers(touchList(event), false),
    [applyFingers],
  );

  /**
   * A touch the browser has taken away rather than the person lifting it.
   *
   * This exists because of one specific thing an iPhone does. Its screen reads
   * **five** fingers — the iPad reads ten — and when a sixth lands, iOS does
   * not ignore it: it cancels *every* touch on the screen at once. The list
   * that arrives here is empty, and taking it at face value wiped the board
   * mid-round. A child reaching in to join emptied the game for everybody,
   * which is the worst possible response to somebody wanting to play.
   *
   * So a cancel that takes everything is not believed. The circles stay where
   * they are, the clock keeps running, and the round is drawn between the
   * hands that were already down. The sixth child does not get in — an iPhone
   * physically cannot see them — but nobody loses their place, and on a screen
   * that size a sixth finger has nowhere to go anyway.
   *
   * A cancel that takes *some* touches is a different thing, and is believed:
   * that is the browser reporting a real change, and `event.touches` still
   * lists everyone left.
   *
   * `frozenRef` marks the list as no longer verified. The next real touch
   * event replaces it wholesale, and `reset` throws it away rather than
   * starting a fresh round off fingers nobody can confirm are still there —
   * without which a cancelled round would restart itself for ever.
   */
  const handleTouchCancel = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.touches.length === 0 && fingersRef.current.length > 0) {
        frozenRef.current = true;
        return;
      }
      applyFingers(touchList(event), false);
    },
    [applyFingers],
  );

  /*
   * The mouse path, so the page is usable and testable without a touchscreen.
   *
   * Restricted to `pointerType === "mouse"` rather than to "not touch": an
   * Apple Pencil raises touch events *and* pointer events on iOS, so anything
   * looser would count the same finger twice and give it two circles.
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      applyFingers(
        [
          ...fingersRef.current,
          { id: event.pointerId, x: event.clientX, y: event.clientY },
        ],
        true,
      );
    },
    [applyFingers],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      if (!fingersRef.current.some((finger) => finger.id === event.pointerId)) return;
      applyFingers(
        fingersRef.current.map((finger) =>
          finger.id === event.pointerId
            ? { id: finger.id, x: event.clientX, y: event.clientY }
            : finger,
        ),
        false,
      );
    },
    [applyFingers],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      applyFingers(
        fingersRef.current.filter((finger) => finger.id !== event.pointerId),
        false,
      );
    },
    [applyFingers],
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchChange}
      onTouchEnd={handleTouchChange}
      onTouchCancel={handleTouchCancel}
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
        {/*
          Shown whenever there is nothing on the glass, counting or not. A
          round now runs to its deadline even if everybody lets go, so a
          screen with a number ticking down and no circles on it is a real
          state — and without this line it would look like a fault rather than
          like five seconds anybody may still join.
        */}
        {fingers.length === 0 && phase !== "winner" ? (
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
                key={finger.id}
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
            /*
             * Very nearly linear, and that is the whole point of this line.
             *
             * This was `cubic-bezier(0.22, 1, 0.36, 1)` — the springy ease-out
             * used everywhere else in the app, and completely wrong here.
             * That curve is 90% finished in the first quarter of its duration,
             * so lengthening the transition did nothing you could see: the
             * colour still arrived at the edges of the screen in a couple of
             * hundred milliseconds and then spent the rest of the second
             * imperceptibly finishing off.
             *
             * An ease-out is right when the *destination* is the point and the
             * journey is overhead. Here the journey is the point — the circle
             * leaving the winning finger is how everybody round the table sees
             * whose it was — so the radius should grow at a steady, watchable
             * rate and reach the corners as the second runs out. The gentle
             * ends are just to stop it starting and stopping with a jolt.
             */
            transition: `transform ${PICKER_FLOOD_MS}ms cubic-bezier(0.4, 0.06, 0.42, 1)`,
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
