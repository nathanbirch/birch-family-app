# The Note

A pad on the fridge, in the app. Write on it with the Apple Pencil; it is still
there tomorrow, and it stays until somebody clears it.

At `/note`, reached from a tab in the bottom bar or from the **Handy** row on
the dashboard. It is a *tool* rather than a page — see
[the navigation note](#why-it-is-a-tool-rather-than-a-page) below.

## What it does

| | |
|---|---|
| **Tools** | Pen (pressure-sensitive), marker, highlighter, eraser. |
| **Inks** | Eight, fixed. Graphite, blue, red, green, purple, orange, pink, teal. |
| **Nibs** | Fine, medium, broad — stored as a fraction of the pad, so a note scales as one picture between the iPad and a phone. |
| **Paper** | Ruled, plain or squared. Saved with the note. |
| **History** | Undo and redo, thirty deep. Clear counts as one undoable step. |
| **Saving** | Automatic, half a second after the last mark, into `localStorage`. |

## The three decisions worth knowing

### It is not in the database

`localStorage`, on the device it was written on. A note on the fridge belongs
to the fridge — it is written on the iPad in the kitchen and read on the iPad
in the kitchen. Syncing it would mean deciding what happens when two people
write at once, which is a genuinely hard question for a feature whose entire
value is that it is as simple as a sticky note.

The consequence is worth stating plainly rather than discovering: clear the
browser's data and the note is gone. That is the same deal a real sticky note
offers. It also means the note does **not** appear on Dad's phone.

The key is `birch-family-app:note:v1` (`config/app.ts`).

### It is stored as strokes, not as a picture

The obvious way to save a canvas is `toDataURL()`, and it is wrong for all four
things this page has to do — undo, the object eraser, being read on a screen a
third the size it was written on, and fitting in the five megabytes
`localStorage` allows. `lib/note/strokes.ts` has the full argument at the top.

Points are `[x, y, pressure]` triples in a 0-1 space over a pad whose
proportions are **fixed** at 3:2 (`NOTE_ASPECT`). Inks and nibs are stored by
*id*, not by hex or pixel size, so the palette can be re-tuned and every note
already written picks up the correction.

A saved note is validated field by field on the way in. Anything it does not
recognise — a truncated write, a format from a future build, an `Infinity`
where a coordinate should be — means a blank pad rather than a crash. One bad
stroke drops that stroke, not the note.

### The sheet is as big as the screen allows

The page does not scroll. It is a column with a height — `100svh` less the tab
bar's space — the heading and the tray take what they need, and the sheet gets
everything left over. `fitPad` then picks the largest 3:2 rectangle that fits
in it, which is why there is a margin at the sides on a wide window and above
and below on a tall one.

Three things about that are worth knowing before changing it:

- **The height is handed down by `flex-1`, never by `h-full`.** A percentage
  height resolves against the parent's *computed* height, and a flex item's
  computed height is `auto` however definite its used height is — `h-full`
  collapsed the sheet to nothing.
- **The fit is done in JavaScript, not with `aspect-ratio`.** A box with
  `aspect-ratio` and a `max-height` has its height clamped and its width left
  alone, so a short window gives a *squashed* pad rather than a smaller one.
  The CSS-only alternative needs the available height as a constant, and it is
  not one — the tray wraps to four rows on a phone and one on an iPad.
- **It is a `min-height`, with a floor under the sheet.** On a 320px phone
  there is genuinely not room for both; at a fixed height the sheet was
  squeezed to a 41-pixel stamp. Now it stops at 13rem and the page scrolls the
  last little bit instead.

`BOTTOM_NAV_SPACE` lives in `config/navigation.ts` rather than beside the bar
it describes, because `BottomNav.tsx` is a `"use client"` module and every
export of one reaches a Server Component as a client *reference* rather than
as its value — a page importing it from there interpolates an object into its
stylesheet and silently gets no height at all.

### Ink does not follow the theme

Every other surface in the app takes its colours from the active theme. The
pad does not: it is ink on paper. A message written in red must still be red
tomorrow on a different theme, and the paper is a fixed warm off-white in all
ten. The *tray* under the pad is themed, because that is app chrome.

## How the drawing works

Two stacked canvases. The lower one holds every finished stroke; the upper one
holds only the stroke under the nib and is wiped and redrawn whole on each
animation frame.

The split exists because of the highlighter. Ink at 32% opacity drawn
incrementally goes dark everywhere the segments overlap, and consecutive
segments of a stroke overlap constantly, so a translucent line comes out as a
string of dark beads. For the same reason, `renderStroke` paints a
constant-width stroke as **one path with one `stroke()` call** — alpha is
applied when a path is painted, so fifty overlapping segments composite the ink
against itself fifty times. Only the pen, which varies its width and is fully
opaque, is drawn segment by segment.

The paper — colour and rules — is painted *into* the canvas rather than sitting
behind it in CSS, because `multiply` blending needs real pixels underneath, and
because a highlighter dragged over a rule should darken the rule.

### Pressure

From an Apple Pencil, `event.pressure` is the real thing. A finger and a mouse
report a flat 0.5 forever, so their "pressure" is derived from how fast the nib
is travelling (`pressureFromSpeed`) — real handwriting thins where the hand
speeds up. Both are eased rather than used raw, which keeps the edge of a line
smooth instead of serrated.

`getCoalescedEvents()` is used on every move. A pencil reports around 240
positions a second and the browser hands over the ones between frames in a
batch; using them is the difference between a smooth curve and a polygon.

### Palm rejection

Once a stylus has been used on the pad, touches are ignored — the only way to
rest a hand on an iPad while writing. It is a **setting**, not a rule: the
"Draw with a finger" checkbox appears under the tray once a pencil has been
seen, because the pad is also used by children with no pencil in reach and a
pad that silently refuses to draw is indistinguishable from a broken one.

### Running off the edge

Leaving the sheet ends the stroke and coming back starts a new one, which is
what a real pen does. Clamping to the edge instead is the tempting version and
it draws a long straight line down the side of the paper.

## Clearing

Clear asks twice: the button becomes "Tap again" for four seconds. Undo covers
a mistaken stroke; nothing covers a mistaken Clear, and this button sits on a
page five children are encouraged to poke at. The clear itself *is* undoable —
but the stored copy goes immediately, because the promise the button makes is
that Clear means cleared.

## Saving on the way out

The half-second debounce would lose the last stroke every time on an iPad,
because nobody closes a note app — they close the lid. Three things flush it:
`visibilitychange`, `pagehide`, and the component unmounting (which is what a
tap on the bottom bar looks like). `beforeunload` is unreliable on mobile
Safari and is not used.

## Why it is a tool rather than a page

`NavGroup` in `config/navigation.ts` splits the dashboard into pages and tools.
The Note is a tool: you do not go to it to find something out, you pick it up
for a minute. Two consequences survive:

- It gets a small card in the **Handy** row rather than a full-width card, so
  the page list stays short enough to take in without scrolling. It also has a
  tab in the bottom bar — the shelf is how somebody finds it the first time, the
  tab is how they get back to it the twentieth.
- It is **not** remembered by the last-page memory (`lib/last-page-storage.ts`).
  Open it from the Calendar, close the app, and it reopens on the Calendar —
  launching two days later onto a note that has already been read is not
  resuming anything. Reachable and *resumed* are different questions, and having
  a tab only answers the first.

## The files

| File | What's in it |
|---|---|
| `config/note.ts` | Tools, inks, nibs, papers, the pad's aspect ratio. |
| `lib/note/strokes.ts` | The model: points, geometry, the eraser, the storage format. Pure. |
| `lib/note/render.ts` | Everything that touches a canvas context. |
| `lib/note/storage.ts` | The wrapped `localStorage` access. |
| `lib/note/store.ts` | The external store: the note, its history, and saving. |
| `components/note/StickyNote.tsx` | Pointer events into strokes, and painting. |
| `components/note/NoteToolbar.tsx` | The tray. |
| `app/(app)/note/page.tsx` | Four lines of page. |
| `tests/note-strokes.test.ts` | The model and the storage format. |
| `tests/note-store.test.ts` | Saving, undo, clearing, and what a corrupt note does. |

## Changing it

**Add an ink** — one entry in `NOTE_INKS`. It must be legible on the warm
paper; a pale yellow is not, however nice the swatch looks.

**Re-tune an ink or a nib** — change the hex or the size in `config/note.ts`.
Every note already written picks it up, because they are stored by id.

**Change the pad's shape** — `NOTE_ASPECT`. Note that this invalidates the
proportions of every saved note, which will come back stretched. Bump
`NOTE_FORMAT_VERSION` at the same time if that matters.

**Let it hold more** — `MAX_POINTS`. It is a storage limit, not a performance
one; the ceiling that actually exists is `localStorage`'s five megabytes for
everything the app stores.
