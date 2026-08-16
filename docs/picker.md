# Finger Picker

Everybody puts a finger on the screen, a number counts down from five, and one
of them is picked at random. Their colour floods the screen and confetti comes
in from all four sides.

At `/picker`, reached from a tab in the bottom bar or from the **Handy** row on
the dashboard. Like the Note it is a *tool* rather than a page — see
[The Note](note.md#why-it-is-a-tool-rather-than-a-page) for what that means, and
for why neither is the page the app reopens on.

## The round

| Phase | What is on the screen |
|---|---|
| `waiting` | No round running. Near-black, a dim **5**, and "Everyone put a finger on the screen". |
| `counting` | A round is under way; the number counts 5 → 1, with a pulsing filled circle under each finger. |
| `winner` | The winning colour floods out from that finger, confetti from every edge, five seconds of solid colour, then it clears itself. |

### The deadline does not move

The first hand down starts a round, and from that instant the five seconds are
fixed. Hands may arrive and leave as much as they like — a child repositioning
a finger, one joining late, one giving up — and the number goes on counting the
five seconds it promised. **Only the last moment counts**: the draw is made from
whoever is on the glass when the clock reaches zero.

This is the rule the component owns, and it is the one that took two goes to
get right. Adding a finger never restarted the clock, but the screen going
*empty* used to cancel the round outright — so with one finger down, lifting it
snapped the number back to five and putting it down again began the whole thing
afresh. From the other side of the iPad that is "I moved my finger and it
started over".

A round that runs out with nobody on the screen has no winner and goes quietly
back to waiting. That is the only cost of never cancelling, it is five seconds
at worst, and for those five seconds anybody may still join — which is what
turns a tap on a winning colour into a reset *and* a starting gun. The
instruction line is shown whenever the screen is empty, counting or not, so a
number ticking down over nothing reads as an invitation rather than a fault.

### One gesture, both directions

**A tap during `winner` resets it immediately** — and because the tapping finger
is then a finger on the screen, it starts the next round's clock on the way
down, giving everybody five seconds to join.

Fingers that are still down when a round clears itself are **kept**: they are
physically still there, they will never send another touch event of their own,
and the next round starts with them in it.

## The numbers

All of them are in `config/picker.ts`, because they are the design.

| | | |
|---|---|---|
| `PICKER_SECONDS` | 5 | Long enough for a fifth child to get a finger down, short enough that nobody lets go. |
| `PICKER_HOLD_MS` | 5000 | Solid colour after the flood finishes. Long enough to see who won, short enough that the next round starts before the argument restarts. |
| `PICKER_FLOOD_MS` | 1500 | The colour expanding to fill the screen. Measured *before* the hold, so lengthening it does not eat into the five seconds of solid colour. |
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

### The flood is timed, and the easing matters more than the duration

A second and a half, on a curve that is very nearly linear
(`cubic-bezier(0.4, 0.06, 0.42, 1)`), reaching the corners at about 1.3s.

Both halves of that are deliberate, and the second is the one that is easy to
get wrong. The flood originally used the springy ease-out the rest of the app
uses, which is 90% finished in the first quarter of its duration — so
lengthening the transition changed nothing anybody could see. The colour still
hit the edges in a couple of hundred milliseconds and spent the rest of the
time imperceptibly finishing off. Fixing the curve is what made the duration
mean anything; only then was it worth spending more of it.

An ease-out is right when the destination is the point and the journey is
overhead. Here the journey *is* the point: the circle leaving the winning
finger is how everybody round the table sees whose it was.

## Multi-touch

Fingers come from **touch events**, not pointer events, and that is the one
place this page departs from the rest of the app.

A pointer event describes one pointer, so ten fingers means ten independent
streams of down/move/up and trusting that none is dropped. On an iPad they were
— the page stopped accepting fingers at five, with `setPointerCapture` on a
single element for that many concurrent pointers the most likely reason.

A `TouchEvent` carries `event.touches`: everything on the glass, recomputed and
handed over on every event. There is no stream to lose, no capture to hold and
no arithmetic — `applyFingers` simply mirrors the list. Colours are kept in a
map keyed by `Touch.identifier`, because the list is rebuilt from scratch each
time and a recomputed colour would flicker as neighbours came and went.

Pointer events are kept for `pointerType === "mouse"` alone, so the page still
works with a trackpad. That discriminator matters: an Apple Pencil raises touch
events *as well as* pointer events on iOS, so anything looser would count the
same finger twice.

### The sixth finger on an iPhone

An iPhone screen reads **five** simultaneous touches. An iPad reads ten. When a
sixth finger lands on an iPhone, iOS does not ignore it — it fires
`touchcancel` for *every* touch on the screen at once, with an empty `touches`
list.

Taken at face value, that says "everybody let go", and the board was wiped
mid-round. A child reaching in to join the game emptied it for everyone else,
which is the worst available response to somebody wanting to play.

So a cancel that takes *everything* is not believed. The circles stay, the
clock keeps running, and the round is drawn between the hands already down. The
sixth child does not get in — the phone physically cannot see them — but nobody
loses their place, and on a screen that size a sixth finger has nowhere to go
anyway.

A cancel that takes *some* touches is believed: that is the browser reporting a
real change, and `event.touches` still lists everyone remaining.

The frozen list is marked as no longer verified. The next real touch event
replaces it wholesale, and `reset` throws it away rather than starting a fresh
round from fingers nobody can confirm are still there — without which a
cancelled round would restart itself every five seconds for ever.

The same handling covers the other cause of a full cancel: a four- or
five-finger swipe or pinch on an iPad is an OS gesture that no web page can opt
out of. If that keeps interrupting rounds, the switch is **Settings → Home
Screen & Multitasking → Gestures**.

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
| `components/picker/FingerPicker.tsx` | The state machine, the touches, and the immovable deadline. |
| `components/picker/EdgeConfetti.tsx` | Paper from four sides. |
| `app/(app)/picker/page.tsx` | Almost nothing; everything is in the overlay. |
| `app/globals.css` | `finger-pulse` and `confetti-burst`. |
| `tests/finger-picker.test.ts` | Fairness, the countdown, and the flood covering every corner. |
| `tests/picker-board.test.tsx` | The round under hands that come and go, with fake timers. |

## Changing it

**More or fewer seconds** — `PICKER_SECONDS`. The number shown on the waiting
screen follows it automatically.

**A different palette** — `PICKER_COLOURS`. Every entry needs a `label` (read
out when it wins), a `hex` that is legible at full strength on near-black, and
an `on` colour for text over the flood. Keep consecutive entries far apart.

**More paper** — `PER_EDGE` in `EdgeConfetti.tsx`, currently 60 a side.
