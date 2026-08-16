# Finger Picker

Everybody puts a finger on the screen, a number counts down from five, and one
of them is picked at random. Their colour floods the screen and confetti comes
in from all four sides.

Reached from the **Handy** row on the dashboard, at `/picker`. Like the Note,
it is a *tool* rather than a page — see [The Note](note.md#why-it-is-not-a-page)
for what that means and why.

## The round

| Phase | What is on the screen |
|---|---|
| `waiting` | Near-black, a dim **5**, and "Everyone put a finger on the screen". |
| `counting` | A pulsing filled circle under each finger; the number counts 5 → 1. |
| `winner` | The winning colour floods out from that finger, confetti from every edge, five seconds of solid colour, then it clears itself. |

Two more rules that make it one gesture rather than a set of buttons:

- **Lift every finger mid-count and the clock stops**, back to five. A round
  nobody is in is not a round, and it must not run down to a draw with no
  entrants.
- **A tap during `winner` resets it immediately** — and because the tapping
  finger is then a finger on the screen, it starts the next round on the way
  down. Lifting it goes back to waiting. That is one gesture doing the obvious
  thing in both directions.

Fingers that are still down when a round clears itself are **kept**: they are
physically still there, they will never send another `pointerdown`, and the
next round starts for them rather than waiting for a gesture that is not
coming.

## The numbers

All of them are in `config/picker.ts`, because they are the design.

| | | |
|---|---|---|
| `PICKER_SECONDS` | 5 | Long enough for a fifth child to get a finger down, short enough that nobody lets go. |
| `PICKER_HOLD_MS` | 5000 | Solid colour after the flood finishes. Long enough to see who won, short enough that the next round starts before the argument restarts. |
| `PICKER_FLOOD_MS` | 900 | The colour expanding to fill the screen. |
| `PICKER_CIRCLE_PX` | 132 | About two fingers wide. The circle is a token saying *you are in the draw*, not a cursor — everyone can already see where their own finger is. |

## The draw

`lib/picker/game.ts`, and it is pure on purpose. This settles arguments between
five children, which makes it the one piece of code in the app that has to be
*provably* fair: `chooseIndex` takes the random number as an argument rather
than calling `Math.random()` itself, so `tests/finger-picker.test.ts` can check
both the spread over a hundred thousand rounds and that it can never return an
index that is not on the screen.

`floodScale` measures to the **furthest** corner of the viewport. Measuring to
the nearest leaves a wedge of background showing for the whole round.

Colours are handed out by `nextColourIndex` — the lowest one nobody is holding,
so a finger that lifts frees its colour for the next one down. The palette's
*order* is not a colour wheel: it is arranged so consecutive fingers get
colours as far apart as possible, because the first two circles are the ones
most likely to end up side by side.

## Why it covers the whole screen

`fixed inset-0` at a z-index above the bottom tab bar. Five children put their
hands on an iPad at once and they do not aim; a finger landing on the bar would
navigate away mid-draw, and one landing near it would be a circle cut in half
by a strip of app furniture.

That leaves no visible way out, so the page grows its own: the **Done** button
in the top-left corner. It is deliberately small, deliberately in the least
reachable corner for a hand coming from below, and it is the one element that
stops a tap from reaching the reset.

## Why it ignores the theme

The only screen in the app that does. Ten saturated circles need a neutral
ground or they fight the theme's own colour for attention — and the winning
colour has to flood the whole screen, which on a pale theme looks like a bug
and on a coloured one looks like the wrong colour won.

## Motion, sound and screen readers

**No sound at all.** Not an omission — this gets opened in the middle of an
argument, often at bedtime.

The circles pulse with one CSS keyframe, each offset into the cycle by a
fraction of a period so ten of them breathe out of step rather than throbbing
in unison. The confetti is the same divs-and-one-keyframe technique as the star
charts' (see [`components/stars/Confetti.tsx`](../src/components/stars/Confetti.tsx)),
with one difference: each piece is fired **square to the edge it came from**
with a wide sideways spread, not aimed at the middle. Aiming at the middle is
the obvious version and it bunches all 240 pieces into a knot in the centre.

Under `prefers-reduced-motion` the circles sit still and the confetti is not
built at all. The draw is announced in words by an `aria-live` region, which is
the only way this page can convey its result to a screen reader — everything
else on it is colour and position.

## The files

| File | What's in it |
|---|---|
| `config/picker.ts` | The timings, the ten colours, the dark. |
| `lib/picker/game.ts` | The draw, the clock, the flood geometry. Pure. |
| `components/picker/FingerPicker.tsx` | The state machine and the pointers. |
| `components/picker/EdgeConfetti.tsx` | Paper from four sides. |
| `app/(app)/picker/page.tsx` | Almost nothing; everything is in the overlay. |
| `app/globals.css` | `finger-pulse` and `confetti-burst`. |
| `tests/finger-picker.test.ts` | Fairness, the countdown, and the flood covering every corner. |

## Changing it

**More or fewer seconds** — `PICKER_SECONDS`. The number shown on the waiting
screen follows it automatically.

**A different palette** — `PICKER_COLOURS`. Every entry needs a `label` (read
out when it wins), a `hex` that is legible at full strength on near-black, and
an `on` colour for text over the flood. Keep consecutive entries far apart.

**More paper** — `PER_EDGE` in `EdgeConfetti.tsx`, currently 60 a side.
