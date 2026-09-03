"use client";

import confetti from "canvas-confetti";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import { FAMILY, type PersonId } from "@/config/family";
import { useImagesReady } from "@/hooks/useImagesReady";
import { useReducedMotion } from "@/hooks/useReducedMotion";

import { Avatar } from "./Avatar";

/**
 * Tap the card, everyone but one person is blown off it, that person is it.
 *
 * The one place in the app that reaches for a real animation library. Every
 * other burst here (`stars/Confetti.tsx`, `picker/EdgeConfetti.tsx`) is a
 * handful of divs and a CSS keyframe, kept that way on purpose so nothing is
 * added to what the service worker has to cache. This is the deliberate
 * exception: an explosion that has to reach every edge of the screen from an
 * arbitrary tap point, at speed, reads as genuinely explosive with
 * `canvas-confetti`'s physics in a way two hundred `translate3d` divs did not
 * — and at ~4kb gzipped, with zero dependencies of its own, the offline cost
 * is one small extra cache entry. If a second feature ever wants a library
 * animation, that is a sign the old rule should just be retired outright
 * rather than accumulating exceptions quietly.
 *
 * The sequence is a small state machine, because three different things have
 * to happen in order and then undo themselves: the losers wipe off the card
 * (`exploding`, 2s), the winner fills the screen (`revealing`, 2s), then
 * everyone is back on the card, bouncing, in `idle`.
 *
 * "Fills the screen" is done twice, deliberately. `canvas-confetti`'s physics
 * are randomised and tuned for a phone-sized viewport — asking it alone to
 * guarantee coverage on, say, a wide desktop window means either wildly
 * overshooting on a phone or falling well short of the far corners on a
 * monitor. So the actual *guarantee* of full-screen coverage is a plain CSS
 * shockwave (`picker-boom-ring`/`picker-boom-flash`) sized off the real
 * distance from the tap point to the screen's farthest corner — that part
 * cannot come up short. The fire-coloured confetti waves ride on top of it
 * for texture, not for reach.
 */

type Phase = "idle" | "exploding" | "revealing";

const EXPLODE_MS = 2000;
const REVEAL_MS = 2000;

/** A point, reused for both a bounce body's position and its velocity. */
type Vec = { x: number; y: number };

/** One avatar bouncing around the canvas, in real pixels. */
type Body = { pos: Vec; vel: Vec };

/** The canvas's measured size, in real pixels — a rectangle, not a square. */
type Size = { width: number; height: number };

/** Avatar diameter, in pixels. Fixed rather than a fraction of the canvas: a
 * rectangle can be any shape, and a size that scaled with the canvas would
 * distort into an oval the moment width and height stopped matching. */
const AVATAR_SIZE = 76;
const RADIUS = AVATAR_SIZE / 2;
/** How fast an avatar drifts, in pixels per second. */
const SPEED = 42;

/** Used before the canvas has been measured at least once. */
const FALLBACK_SIZE: Size = { width: 320, height: 240 };

/** One outward flight path for a losing avatar, rolled fresh every tap. */
type ExitVector = {
  dx: number;
  dy: number;
  rot: number;
  delay: number;
};

/** The shockwave's origin and how far it has to travel to clear the screen. */
type Boom = {
  x: number;
  y: number;
  /** Distance from the tap to the farthest corner of the viewport. */
  radius: number;
};

/**
 * A fresh, evenly-spaced starting arrangement: seven points around an ellipse
 * inscribed in the canvas — scaled to its actual width and height rather than
 * a single "side", which is what keeps this arrangement circular-looking
 * whatever the canvas's real aspect ratio turns out to be. Comfortably wider
 * than `RADIUS * 2` at any reasonable canvas size, so nobody starts
 * overlapping.
 */
function seedBodies(size: Size): Record<PersonId, Body> {
  const bodies = {} as Record<PersonId, Body>;
  const cx = size.width / 2;
  const cy = size.height / 2;
  const rx = Math.max(size.width / 2 - RADIUS, RADIUS) * 0.62;
  const ry = Math.max(size.height / 2 - RADIUS, RADIUS) * 0.62;

  FAMILY.forEach((member, index) => {
    const angle = (index / FAMILY.length) * Math.PI * 2 - Math.PI / 2;
    const speed = SPEED * (0.75 + Math.random() * 0.5);
    const heading = Math.random() * Math.PI * 2;
    bodies[member.id] = {
      pos: { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry },
      vel: { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed },
    };
  });
  return bodies;
}

/** Advances every body by `dt` seconds: walls bounce, avatars bounce off each other. */
function step(bodies: Record<PersonId, Body>, dt: number, size: Size) {
  const ids = Object.keys(bodies) as PersonId[];

  for (const id of ids) {
    const body = bodies[id];
    body.pos.x += body.vel.x * dt;
    body.pos.y += body.vel.y * dt;

    if (body.pos.x - RADIUS < 0) {
      body.pos.x = RADIUS;
      body.vel.x = Math.abs(body.vel.x);
    } else if (body.pos.x + RADIUS > size.width) {
      body.pos.x = size.width - RADIUS;
      body.vel.x = -Math.abs(body.vel.x);
    }
    if (body.pos.y - RADIUS < 0) {
      body.pos.y = RADIUS;
      body.vel.y = Math.abs(body.vel.y);
    } else if (body.pos.y + RADIUS > size.height) {
      body.pos.y = size.height - RADIUS;
      body.vel.y = -Math.abs(body.vel.y);
    }
  }

  // Equal-mass elastic collisions: every avatar is the same size, so a
  // collision simply swaps the two avatars' velocity components *along the
  // line between their centres* and leaves the sideways component alone —
  // which is what keeps this from reading as two circles glancing through
  // one another.
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = bodies[ids[i]];
      const b = bodies[ids[j]];
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);
      const minDist = RADIUS * 2;
      if (dist <= 0 || dist >= minDist) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = (minDist - dist) / 2;
      a.pos.x -= nx * overlap;
      a.pos.y -= ny * overlap;
      b.pos.x += nx * overlap;
      b.pos.y += ny * overlap;

      const aNormal = a.vel.x * nx + a.vel.y * ny;
      const bNormal = b.vel.x * nx + b.vel.y * ny;
      const delta = bNormal - aNormal;
      a.vel.x += delta * nx;
      a.vel.y += delta * ny;
      b.vel.x -= delta * nx;
      b.vel.y -= delta * ny;
    }
  }
}

export function RandomPicker() {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [winnerId, setWinnerId] = useState<PersonId | null>(null);
  const [exitVectors, setExitVectors] = useState<
    Partial<Record<PersonId, ExitVector>>
  >({});
  const [frozen, setFrozen] = useState<Partial<Record<PersonId, Vec>>>({});
  const [boom, setBoom] = useState<Boom | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRefs = useRef<Partial<Record<PersonId, HTMLDivElement | null>>>({});
  const sizeRef = useRef<Size>(FALLBACK_SIZE);
  const bodiesRef = useRef<Record<PersonId, Body>>(seedBodies(FALLBACK_SIZE));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Held back until all seven photographs have decoded, the same rule every
  // other avatar in the app follows (`globals.css`, `.js .seat-arrival`) —
  // without it, a family member's face is invisible whether or not a round is
  // even running.
  const arriving = useImagesReady(canvasRef);

  // Measures the canvas — a full-width rectangle, not a square — so the
  // bounce physics can work in real pixels instead of guessing. Declared
  // before the physics effect below so it has already run and populated
  // `sizeRef` by the time that effect's first `seedBodies()` call reads it.
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        sizeRef.current = { width: rect.width, height: rect.height };
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const paint = useCallback(() => {
    for (const member of FAMILY) {
      const el = wrapperRefs.current[member.id];
      const body = bodiesRef.current[member.id];
      if (!el || !body) continue;
      const x = body.pos.x - RADIUS;
      const y = body.pos.y - RADIUS;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, []);

  // The bounce loop: reseeds a fresh arrangement every time the card returns
  // to `idle` (including on mount), and stops the instant a tap moves the
  // phase away from it — the last frame painted is exactly what `pick()`
  // below freezes into `--freeze-x/--freeze-y` for the wipe animation to
  // continue from, so the avatars never visibly jump.
  useEffect(() => {
    if (phase !== "idle") return;
    bodiesRef.current = seedBodies(sizeRef.current);
    paint();
    if (reducedMotion) return;

    let raf = 0;
    let last: number | null = null;
    const frame = (t: number) => {
      if (last !== null) {
        const dt = Math.min((t - last) / 1000, 0.05);
        step(bodiesRef.current, dt, sizeRef.current);
        paint();
      }
      last = t;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, reducedMotion, paint]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const pick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (phase !== "idle") return;

      const winner = FAMILY[Math.floor(Math.random() * FAMILY.length)];

      const frozenPositions: Partial<Record<PersonId, Vec>> = {};
      const vectors: Partial<Record<PersonId, ExitVector>> = {};
      for (const member of FAMILY) {
        const body = bodiesRef.current[member.id];
        frozenPositions[member.id] = {
          x: body.pos.x - RADIUS,
          y: body.pos.y - RADIUS,
        };
        if (member.id === winner.id) continue;
        // A full circle of directions, not "away from the tap": the point of
        // the touch is where the shockwave fans out from, but the avatars
        // themselves just need to scatter, and aiming every one of them away
        // from one point sends six of seven flying off in roughly the same
        // direction rather than apart from each other.
        const angle = Math.random() * Math.PI * 2;
        const distance = 260 + Math.random() * 260;
        vectors[member.id] = {
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          rot: (Math.random() - 0.5) * 620,
          delay: Math.random() * 380,
        };
      }

      const originX = event.clientX;
      const originY = event.clientY;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // The farthest a shockwave centred on the tap has to reach to clear
      // every corner of the viewport, whatever the tap point or screen shape.
      const radius = Math.max(
        Math.hypot(originX, originY),
        Math.hypot(width - originX, originY),
        Math.hypot(originX, height - originY),
        Math.hypot(width - originX, height - originY),
      );

      setFrozen(frozenPositions);
      setExitVectors(vectors);
      setWinnerId(winner.id);
      setBoom({ x: originX, y: originY, radius });
      setPhase("exploding");

      if (!reducedMotion) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([50, 40, 50, 40, 50, 40, 500]);
        }

        const origin = { x: originX / width, y: originY / height };
        // Velocity scaled to the screen's own diagonal rather than a fixed
        // number: a phone and an ultrawide monitor need very different speeds
        // to both feel like an explosion that reaches the glass. This is
        // texture on top of the shockwave above, which is what actually
        // guarantees the screen is covered.
        const baseVelocity = Math.max(65, Math.hypot(width, height) / 11);

        // Fire, not confetti: a bright flash of sparks, then a wave of flame
        // colour, then a slower wave of smoke and embers that drifts rather
        // than falls — real confetti's whole visual signature is falling
        // under gravity, so each wave's `gravity` is zero or negative and
        // gets more negative as the wave gets smokier, drifting the
        // particles up and out rather than raining them down.
        const waves: readonly confetti.Options[] = [
          {
            particleCount: 160,
            startVelocity: baseVelocity * 1.15,
            gravity: -0.05,
            decay: 0.92,
            scalar: 0.85,
            ticks: 110,
            colors: ["#ffffff", "#fff8e1", "#ffee58", "#ffca28"],
          },
          {
            particleCount: 220,
            startVelocity: baseVelocity,
            gravity: -0.18,
            decay: 0.9,
            scalar: 1.25,
            ticks: 150,
            colors: ["#ff6d00", "#ff3d00", "#ff9100", "#d50000"],
          },
          {
            particleCount: 150,
            startVelocity: baseVelocity * 0.65,
            gravity: -0.3,
            decay: 0.9,
            scalar: 1.7,
            ticks: 190,
            colors: ["#4e342e", "#3e2723", "#616161", "#ff5722"],
          },
        ];

        [0, 260, 620].forEach((delay, wave) => {
          const timer = setTimeout(() => {
            confetti({
              spread: 360,
              zIndex: 9999,
              shapes: ["circle"],
              origin,
              disableForReducedMotion: true,
              ...waves[wave],
            });
          }, delay);
          timers.current.push(timer);
        });
      }

      timers.current.push(
        setTimeout(() => setPhase("revealing"), EXPLODE_MS),
        setTimeout(() => {
          setPhase("idle");
          setWinnerId(null);
          setBoom(null);
        }, EXPLODE_MS + REVEAL_MS),
      );
    },
    [phase, reducedMotion],
  );

  const winner = winnerId
    ? FAMILY.find((member) => member.id === winnerId) ?? null
    : null;

  return (
    <section aria-labelledby="picker-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2
          id="picker-heading"
          className="text-lg font-bold tracking-tight sm:text-xl"
        >
          Need a random pick?
        </h2>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Tap the card
        </p>
      </div>

      <button
        type="button"
        onClick={pick}
        disabled={phase !== "idle"}
        aria-label="Tap to randomly pick someone"
        className="app-card themed-transition block w-full p-4 transition-transform active:scale-[0.98] disabled:active:scale-100 sm:p-5"
      >
        {/*
          A fixed height, not `aspect-square`: this card spans the full width
          of the page column like every other card, and a shape that scaled
          with that width would make the canvas taller than the screen on a
          wide window. `overflow-hidden` is a backstop for the moment right
          after a resize, before the next physics frame has re-clamped
          everyone back inside the new bounds.
        */}
        <div
          ref={canvasRef}
          className="relative h-[240px] w-full overflow-hidden sm:h-[300px]"
        >
          {FAMILY.map((member) => {
            // Gone from the moment the explosion starts until the card
            // resets — not just during `exploding` — so the wipe animation's
            // end state (faded, shrunk) holds through the whole reveal
            // instead of snapping the loser back the instant the winner
            // takes the screen.
            const isLoser = phase !== "idle" && member.id !== winnerId;
            const isWinnerOnCard =
              phase === "revealing" && member.id === winnerId;
            const vector = exitVectors[member.id];
            const at = frozen[member.id];

            return (
              <div
                key={member.id}
                ref={(el) => {
                  wrapperRefs.current[member.id] = el;
                }}
                className={
                  "absolute left-0 top-0 will-change-transform" +
                  (isLoser ? " picker-avatar-wipe" : "")
                }
                style={
                  {
                    width: `${AVATAR_SIZE}px`,
                    height: `${AVATAR_SIZE}px`,
                    opacity: isWinnerOnCard ? 0 : undefined,
                    transform:
                      phase !== "idle" && at
                        ? `translate3d(${at.x}px, ${at.y}px, 0)`
                        : undefined,
                    animationDelay: isLoser ? `${vector?.delay ?? 0}ms` : undefined,
                    "--freeze-x": `${at?.x ?? 0}px`,
                    "--freeze-y": `${at?.y ?? 0}px`,
                    "--exit-dx": `${vector?.dx ?? 0}px`,
                    "--exit-dy": `${vector?.dy ?? 0}px`,
                    "--exit-rot": `${vector?.rot ?? 0}deg`,
                  } as CSSProperties
                }
              >
                <div
                  className={
                    phase === "idle" && !reducedMotion
                      ? "picker-avatar-pulse"
                      : undefined
                  }
                >
                  <Avatar member={member} showName={false} arriving={arriving} />
                </div>
              </div>
            );
          })}
        </div>
      </button>

      {phase === "exploding" && boom && !reducedMotion ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[65] overflow-hidden"
        >
          <span
            className="picker-boom-flash absolute inset-0"
            style={
              {
                "--boom-x": `${boom.x}px`,
                "--boom-y": `${boom.y}px`,
              } as CSSProperties
            }
          />
          {[0, 1, 2, 3].map((ring) => (
            <span
              key={ring}
              className="picker-boom-ring absolute rounded-full"
              style={
                {
                  left: `${boom.x}px`,
                  top: `${boom.y}px`,
                  borderColor: FIRE_RING_COLORS[ring % FIRE_RING_COLORS.length],
                  animationDelay: `${ring * 130}ms`,
                  "--boom-size": `${boom.radius * 2}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      {phase === "revealing" && winner ? (
        <div
          aria-live="polite"
          className="picker-reveal pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--color-surface) 88%, transparent)",
          }}
        >
          <div className="flex w-[min(72vw,320px)] flex-col items-center gap-4">
            <Avatar member={winner} showName={false} arriving={arriving} />
            <p
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ color: "var(--color-text)" }}
            >
              {winner.name}!
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const FIRE_RING_COLORS = ["#ffd600", "#ff9100", "#ff3d00", "#d50000"] as const;
