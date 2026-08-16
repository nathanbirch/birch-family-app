"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  DEFAULT_INK,
  DEFAULT_NIB,
  NOTE_PAPER_COLOUR,
  noteTool,
  type NoteNib,
  type NotePaper,
  type NoteTool,
} from "@/config/note";
import {
  clearCanvas,
  fitPad,
  renderNote,
  renderStroke,
  sizeCanvas,
  type PadSize,
} from "@/lib/note/render";
import {
  applyNoteStrokes,
  clearNoteStrokes,
  flushNoteSave,
  getNoteSnapshot,
  getServerNoteSnapshot,
  redoNote,
  setNotePaper,
  subscribeToNote,
  undoNote,
} from "@/lib/note/store";
import {
  appendPoint,
  clamp01,
  distance,
  eraseAt,
  pressureFromSpeed,
  smoothPressure,
  type NotePoint,
  type NoteStroke,
} from "@/lib/note/strokes";

import { NoteToolbar } from "./NoteToolbar";

/**
 * The pad on the fridge.
 *
 * A sheet of paper you write on with an Apple Pencil, and which is still there
 * tomorrow. That is the whole feature. It is not a drawing app, it is not
 * shared, and it does not go anywhere near the database — see
 * `NOTE_STORAGE_KEY` for why that is a decision rather than a shortcut.
 *
 * The note itself, its undo history and its saving all live in
 * `lib/note/store`. What is left here is the part that genuinely belongs to a
 * component: turning pointer events into strokes, and painting.
 *
 * ---------------------------------------------------------------------------
 * TWO CANVASES
 * ---------------------------------------------------------------------------
 * The lower one holds every finished stroke. The upper one holds only the
 * stroke currently under the nib, and is wiped and redrawn from scratch on
 * every animation frame.
 *
 * The split exists because of the highlighter. Ink at 32% opacity drawn
 * *incrementally* — a new segment appended to what is already on the canvas —
 * goes dark everywhere the segments overlap, and consecutive segments of a
 * stroke overlap constantly, so a translucent line comes out as a string of
 * dark beads. Redrawing the live stroke whole, onto an empty surface, is the
 * only way to get one even wash. Doing that to the *whole note* every frame
 * would mean repainting thousands of segments at 60Hz, which an iPad will not
 * do; doing it to one stroke costs nothing.
 *
 * The one visible consequence is that a highlighter stroke crossing existing
 * ink looks very slightly lighter while it is being drawn than it does the
 * instant the pencil lifts, because `multiply` has the real note underneath it
 * only after the stroke is committed. Over bare paper — which is where a
 * highlighter mostly goes — the two are identical.
 *
 * ---------------------------------------------------------------------------
 * WHY THE STROKE IN FLIGHT IS A REF
 * ---------------------------------------------------------------------------
 * An Apple Pencil reports around 240 positions a second. Putting the
 * in-progress stroke in React state would mean a render per position, and a
 * render is orders of magnitude more expensive than the two lines of canvas
 * work each position actually needs. The stroke is therefore built up in a ref
 * and handed to the store exactly once, when the pencil lifts — which is also
 * the only moment anything else on the page cares about it.
 */

/** How long the Clear button stays armed before it forgets it was asked. */
const CLEAR_CONFIRM_MS = 4000;

/** Pressure a stroke starts at before there is any movement to judge it by. */
const INITIAL_PRESSURE = 0.6;

/** What the pad is doing with the pointer that is currently down. */
type Drawing = {
  pointerId: number;
  /**
   * The stroke being drawn, or `null` when the pointer is down but outside the
   * sheet. See `pointFor` — running off the edge of the paper ends the stroke
   * rather than smearing it along the edge, and coming back on starts a new
   * one, which is what a real pen does.
   */
  stroke: NoteStroke | null;
  /** Set when the eraser is the tool, in which case `stroke` stays `null`. */
  erasing: boolean;
  /** Whether this rub has actually taken anything off yet. */
  erasedSomething: boolean;
  lastPoint: NotePoint | null;
  lastTime: number;
  pressure: number;
};

export function StickyNote() {
  const note = useSyncExternalStore(
    subscribeToNote,
    getNoteSnapshot,
    getServerNoteSnapshot,
  );

  const [tool, setTool] = useState<NoteTool>("pen");
  const [ink, setInk] = useState(DEFAULT_INK.id);
  const [nib, setNib] = useState<NoteNib>(DEFAULT_NIB);
  const [size, setSize] = useState<PadSize | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  /** Whether a stylus has ever touched this pad. Drives palm rejection. */
  const [penSeen, setPenSeen] = useState(false);
  const [fingerDrawing, setFingerDrawing] = useState(true);

  /** The space left for the sheet, once the heading and the tray have theirs. */
  const areaRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<HTMLCanvasElement | null>(null);

  const drawingRef = useRef<Drawing | null>(null);
  const frameRequestRef = useRef<number | null>(null);

  /*
   * Mirrors of the things a pointer handler needs to read synchronously.
   * Filled in an effect below, never during render.
   */
  const toolRef = useRef(tool);
  const inkRef = useRef(ink);
  const nibRef = useRef(nib);
  const sizeRef = useRef<PadSize | null>(null);
  const fingerDrawingRef = useRef(fingerDrawing);
  const strokesRef = useRef<readonly NoteStroke[]>(note.strokes);

  useEffect(() => {
    toolRef.current = tool;
    inkRef.current = ink;
    nibRef.current = nib;
    sizeRef.current = size;
    fingerDrawingRef.current = fingerDrawing;
    strokesRef.current = note.strokes;
  }, [tool, ink, nib, size, fingerDrawing, note.strokes]);

  /* ---------------------------------------------------------------- */
  /* Clearing                                                          */
  /* ---------------------------------------------------------------- */

  const handleClear = useCallback(() => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setClearArmed(false);
    // Recorded in the undo stack, so a Clear tapped by a five-year-old is one
    // Undo away — but the stored copy goes immediately, because the promise
    // the button makes is that Clear means cleared.
    clearNoteStrokes();
  }, [clearArmed]);

  /* Arming Clear is a mode; it should not outlive somebody walking away. */
  useEffect(() => {
    if (!clearArmed) return;
    const timer = setTimeout(() => setClearArmed(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [clearArmed]);

  /* ---------------------------------------------------------------- */
  /* Saving on the way out                                             */
  /* ---------------------------------------------------------------- */

  /*
   * The store's debounce loses the last half-second of writing if the tab is
   * closed or backgrounded mid-stroke — which on an iPad is what *always*
   * happens, because you put the cover down rather than navigating away.
   * `visibilitychange` is the event that actually fires in that case;
   * `beforeunload` is unreliable on mobile Safari and is not used.
   *
   * The unmount cleanup covers the other exit: tapping a tab in the bottom
   * bar, which is a client-side navigation and fires no page event at all.
   */
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") flushNoteSave();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      flushNoteSave();
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Painting                                                          */
  /* ---------------------------------------------------------------- */

  /*
   * The pad's size, from the space left over for it.
   *
   * What is measured is the **area**, not the sheet — the sheet's size is
   * derived from it by `fitPad`. Measuring the sheet and sizing the sheet from
   * that measurement is a loop, and a loop that settles differently on each
   * device; the area's height comes from the page's flex layout and owes
   * nothing to the pad, so there is nothing to feed back.
   *
   * The sheet is absolutely positioned inside the area for the same reason: it
   * cannot push the box that measures it, however wrong the arithmetic ever
   * gets.
   */
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const measure = () => {
      const rect = area.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const next = fitPad(rect);
      setSize((box) =>
        box && box.width === next.width && box.height === next.height
          ? box
          : next,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  /* Repaint the finished note whenever it, the paper or the pad changes. */
  useEffect(() => {
    const canvas = baseRef.current;
    const live = liveRef.current;
    if (!canvas || !live || !size) return;

    const context = sizeCanvas(canvas, size, window.devicePixelRatio);
    const liveContext = sizeCanvas(live, size, window.devicePixelRatio);
    if (!context || !liveContext) return;

    renderNote(context, note.strokes, size, note.paper);
    // Resizing a canvas wipes it, so the live layer is already blank — but a
    // stroke in flight during a rotation would otherwise be left behind on a
    // stale backing store, and being explicit costs nothing.
    clearCanvas(liveContext, size);
  }, [note.strokes, note.paper, size]);

  /** Redraw the in-progress stroke, whole, on the upper canvas. */
  const paintLive = useCallback(() => {
    frameRequestRef.current = null;
    const live = liveRef.current;
    const box = sizeRef.current;
    if (!live || !box) return;
    const context = live.getContext("2d");
    if (!context) return;

    clearCanvas(context, box);
    const stroke = drawingRef.current?.stroke;
    if (stroke) renderStroke(context, stroke, box);
  }, []);

  const requestLivePaint = useCallback(() => {
    if (frameRequestRef.current !== null) return;
    frameRequestRef.current = requestAnimationFrame(paintLive);
  }, [paintLive]);

  useEffect(
    () => () => {
      if (frameRequestRef.current !== null) {
        cancelAnimationFrame(frameRequestRef.current);
      }
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* The pencil                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Where on the sheet a pointer is, as a fraction of it — or `null` if it is
   * off the paper.
   *
   * `null` rather than a clamped edge value. Clamping is the tempting version
   * and it is wrong: a pencil that leaves the pad on the right and comes back
   * lower down would be joined by a long straight line down the right-hand
   * edge, which is not what the hand did.
   */
  const pointFor = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = liveRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return { x, y };
    },
    [],
  );

  /**
   * How hard the nib is pressed, 0-1.
   *
   * A stylus is believed. Everything else reports a flat 0.5 forever, so its
   * "pressure" is inferred from how fast it is travelling — see
   * `pressureFromSpeed`. Either source is then eased rather than used raw,
   * which is what keeps the edge of a line smooth instead of serrated.
   */
  const pressureFor = useCallback(
    (
      event: { pointerType: string; pressure: number },
      point: { x: number; y: number },
      now: number,
      drawing: Drawing,
    ): number => {
      let raw: number;
      if (event.pointerType === "pen" && event.pressure > 0) {
        raw = clamp01(event.pressure);
      } else if (drawing.lastPoint && now > drawing.lastTime) {
        raw = pressureFromSpeed(
          distance(drawing.lastPoint, point) / (now - drawing.lastTime),
        );
      } else {
        raw = INITIAL_PRESSURE;
      }
      return smoothPressure(drawing.pressure, raw);
    },
    [],
  );

  /** Commit the stroke in flight, if there is one, and start it afresh. */
  const commitLiveStroke = useCallback(() => {
    const drawing = drawingRef.current;
    if (!drawing?.stroke) return;
    const next = [...strokesRef.current, drawing.stroke];
    strokesRef.current = next;
    drawing.stroke = null;
    applyNoteStrokes(next, true);
  }, []);

  /** Take one reported position and do whatever the current tool does with it. */
  const consume = useCallback(
    (
      event: {
        pointerType: string;
        pressure: number;
        clientX: number;
        clientY: number;
      },
      now: number,
    ) => {
      const drawing = drawingRef.current;
      if (!drawing) return;

      const point = pointFor(event.clientX, event.clientY);
      if (!point) {
        // Off the paper. Put the finished stroke down and wait to see whether
        // the pencil comes back.
        commitLiveStroke();
        drawing.lastPoint = null;
        requestLivePaint();
        return;
      }

      if (drawing.erasing) {
        const radius = nibRef.current.size * noteTool("eraser").scale;
        const next = eraseAt(strokesRef.current, point, radius);
        if (next !== strokesRef.current) {
          strokesRef.current = next;
          // One undo entry for the whole rub, not one per position: an eraser
          // is dragged, and fifty identical entries would bury everything
          // worth undoing.
          applyNoteStrokes(next, !drawing.erasedSomething);
          drawing.erasedSomething = true;
        }
        drawing.lastPoint = { ...point, p: 1 };
        drawing.lastTime = now;
        return;
      }

      const pressure = pressureFor(event, point, now, drawing);
      const next: NotePoint = { x: point.x, y: point.y, p: pressure };

      if (!drawing.stroke) {
        drawing.stroke = {
          // `toolRef` cannot be the eraser here — that is the branch above —
          // but the type does not know it, and a cast would be a lie waiting
          // to become true.
          tool: toolRef.current === "eraser" ? "pen" : toolRef.current,
          ink: inkRef.current,
          nib: nibRef.current.id,
          points: [next],
        };
      } else {
        const points = appendPoint(drawing.stroke.points, next);
        // `null` means the nib has not moved far enough to be worth a point.
        if (!points) return;
        drawing.stroke = { ...drawing.stroke, points };
      }

      drawing.lastPoint = next;
      drawing.lastTime = now;
      drawing.pressure = pressure;
      requestLivePaint();
    },
    [commitLiveStroke, pointFor, pressureFor, requestLivePaint],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      /*
       * Palm rejection. Once a stylus has been used on this pad, touches are
       * ignored — which is the only way to rest a hand on an iPad while
       * writing. It is a *setting* rather than a rule because the pad is also
       * used by children with no pencil in reach, and a pad that silently
       * refuses to draw is indistinguishable from a broken one; the toggle it
       * controls only appears once there is a pencil to explain it.
       */
      if (event.pointerType === "pen") {
        if (!penSeen) setPenSeen(true);
      } else if (
        event.pointerType === "touch" &&
        penSeen &&
        !fingerDrawingRef.current
      ) {
        return;
      }

      // One nib at a time. A second finger during a stroke is a palm, a page
      // turn, or a child joining in — none of which should split the letter
      // being written.
      if (drawingRef.current) return;
      if (toolRef.current !== "eraser" && !note.hasRoom) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      drawingRef.current = {
        pointerId: event.pointerId,
        stroke: null,
        erasing: toolRef.current === "eraser",
        erasedSomething: false,
        lastPoint: null,
        lastTime: event.timeStamp,
        pressure: INITIAL_PRESSURE,
      };
      consume(event, event.timeStamp);
    },
    [consume, note.hasRoom, penSeen],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drawing = drawingRef.current;
      if (!drawing || drawing.pointerId !== event.pointerId) return;

      /*
       * A pencil reports far faster than the screen refreshes, and the browser
       * hands the extra positions over in a batch rather than throwing them
       * away. Using them is the difference between a smooth curve and a
       * polygon: at speed, one event per frame is a point every twenty pixels.
       */
      const native = event.nativeEvent;
      const coalesced =
        typeof native.getCoalescedEvents === "function"
          ? native.getCoalescedEvents()
          : [];

      if (coalesced.length > 0) {
        for (const step of coalesced) consume(step, step.timeStamp);
      } else {
        consume(event, event.timeStamp);
      }
    },
    [consume],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drawing = drawingRef.current;
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      commitLiveStroke();
      drawingRef.current = null;
      requestLivePaint();
    },
    [commitLiveStroke, requestLivePaint],
  );

  const handlePaperChange = useCallback(
    (paper: NotePaper) => setNotePaper(paper),
    [],
  );

  /* ---------------------------------------------------------------- */

  const empty = note.strokes.length === 0;

  return (
    /*
     * A column that fills whatever height the page gives it. The tray and the
     * line under it take what they need; the sheet gets the rest, which is the
     * whole point — a note pad should be as big as the screen allows, not as
     * big as some fraction somebody guessed.
     *
     * `flex-1` rather than `h-full`, all the way up to the `<main>` that has a
     * real height on it. A percentage height resolves against the parent's
     * *computed* height, and a flex item's computed height is `auto` however
     * definite its used height turns out to be — so `h-full` here collapsed
     * the sheet to nothing at all. Flex grow carries down where percentages do
     * not.
     *
     * `min-h-0` on both this and the area below it is the other half. A flex
     * item's default `min-height: auto` refuses to shrink below its content,
     * so without it the sheet would push the tray off the bottom of the screen
     * instead of giving way to it.
     */
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        `min-h-[13rem]` is the floor a sheet stops shrinking at. Below about
        this, handwriting stops being legible and the pad stops being a pad —
        so on a screen too small to hold both it and the tray, the page grows
        past the viewport and scrolls rather than squeezing the paper away. See
        the note on the page's `minHeight`.
      */}
      <div ref={areaRef} className="relative min-h-[13rem] flex-1">
        <div
          className="absolute overflow-hidden"
          style={{
            /*
             * Centred in the leftover space. The sheet matches whichever of
             * the two dimensions runs out first, so on any screen that is not
             * exactly 3:2 there is spare room in the other one — a margin
             * either side on a wide window, above and below on a tall one.
             *
             * Positioned rather than laid out, so it cannot push against the
             * box whose size decided it. `left`/`top` and an explicit size,
             * never `inset-0`, which would fight both of them.
             */
            left: size ? `calc(50% - ${size.width / 2}px)` : 0,
            top: size ? `calc(50% - ${size.height / 2}px)` : 0,
            width: size ? size.width : "100%",
            height: size ? size.height : "100%",
            borderRadius: "var(--radius-card)",
            backgroundColor: NOTE_PAPER_COLOUR,
            boxShadow:
              "0 1px 2px var(--color-shadow), 0 18px 44px -24px var(--color-shadow)",
            border: "1px solid var(--color-border)",
          }}
        >
          <canvas
            ref={baseRef}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
          />
          <canvas
            ref={liveRef}
            role="img"
            aria-label={
              empty
                ? "An empty note. Write on it with a pencil or a finger."
                : "A handwritten note."
            }
            className="absolute inset-0 h-full w-full"
            style={{
              /*
               * The three that make a stylus usable at all. Without
               * `touch-action` the first stroke scrolls the page instead of
               * drawing; without the callout and selection suppression, a slow
               * mark on an iPad raises the copy/paste bubble over the paper.
               */
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
              cursor: tool === "eraser" ? "cell" : "crosshair",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            /*
             * `pointercancel` and nothing else. There is deliberately no
             * `pointerleave` handler: the pointer is captured, so leaving the
             * sheet does not lose the stroke, and running the nib off the edge
             * and back on is handled properly in `consume` — ending the stroke
             * on leave would break that and turn an overrun into a lost letter.
             */
            onPointerCancel={handlePointerUp}
            onContextMenu={(event) => event.preventDefault()}
          />

          {empty ? (
            <p
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-base font-semibold sm:text-lg"
              style={{ color: "#b9b3a0" }}
            >
              Write the note here
            </p>
          ) : null}
        </div>
      </div>

      {/*
        `shrink-0`, so the tray keeps its full height and the sheet above gives
        way instead. The other way round is the failure worth naming: a tray
        squeezed to fit would put the ink swatches half off the bottom of an
        iPad in landscape, which is the exact device this page is for.
      */}
      <div className="shrink-0">
        <NoteToolbar
          tool={tool}
          onToolChange={setTool}
          ink={ink}
          onInkChange={setInk}
          nib={nib}
          onNibChange={setNib}
          paper={note.paper}
          onPaperChange={handlePaperChange}
          canUndo={note.canUndo}
          onUndo={undoNote}
          canRedo={note.canRedo}
          onRedo={redoNote}
          clearArmed={clearArmed}
          onClear={handleClear}
        />

        <NoteFooter
          savedAt={note.savedAt}
          storageWorks={note.storageWorks}
          hasRoom={note.hasRoom}
          penSeen={penSeen}
          fingerDrawing={fingerDrawing}
          onFingerDrawingChange={setFingerDrawing}
        />
      </div>
    </div>
  );
}

/**
 * The line under the tray: when it was written, and anything that has gone
 * wrong.
 *
 * The timestamp is the part that makes this a *note* rather than a canvas. A
 * message on the fridge that might be from this morning or from last Tuesday
 * is worth much less than one you can date at a glance, and it is the only
 * thing on the page that answers "is this still current?".
 *
 * It is formatted straight in the render, which is safe here for a reason
 * worth stating: `savedAt` comes from the note store, whose *server* snapshot
 * is always a blank pad. So the server and the hydrating client both render
 * the fallback sentence, and `toLocaleString` — whose answer depends on a
 * timezone and locale the server cannot know — is only ever reached on a
 * render that happens after hydration.
 */
function NoteFooter({
  savedAt,
  storageWorks,
  hasRoom,
  penSeen,
  fingerDrawing,
  onFingerDrawingChange,
}: {
  savedAt: string | null;
  storageWorks: boolean;
  hasRoom: boolean;
  penSeen: boolean;
  fingerDrawing: boolean;
  onFingerDrawingChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {!storageWorks ? (
          <span style={{ color: "#d92d20", fontWeight: 700 }}>
            This device will not let the note be saved — it will be gone when
            the page is closed.
          </span>
        ) : !hasRoom ? (
          <span style={{ color: "#d92d20", fontWeight: 700 }}>
            The page is full. Rub something out, or clear it and start again.
          </span>
        ) : savedAt ? (
          `Written ${writtenAt(savedAt)} · saved on this device.`
        ) : (
          "Stays on this device until somebody clears it."
        )}
      </p>

      {/*
        Only once a stylus has been seen. Before that the toggle would be a
        control for a problem nobody has, and it would raise a question — "why
        would I turn drawing off?" — that has no answer until there is a hand
        resting on the glass.
      */}
      {penSeen ? (
        <label
          className="flex items-center gap-2 text-xs font-semibold"
          style={{ color: "var(--color-text-muted)" }}
        >
          <input
            type="checkbox"
            checked={fingerDrawing}
            onChange={(event) => onFingerDrawingChange(event.target.checked)}
            className="h-4 w-4"
            style={{ accentColor: "var(--color-primary)" }}
          />
          Draw with a finger
        </label>
      ) : null}
    </div>
  );
}

/** "Saturday at 8:14 am", in the reader's own locale and timezone. */
function writtenAt(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "earlier";
  return when.toLocaleString(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}
