# The weekly report

Every Monday there is a new one: last week's stars, read out as an award
ceremony. A title card, a slide for each of the five children — their charts
arriving one at a time, then the total, then what it is worth — and the
family's total to finish, under confetti and a brass fanfare.

Live at [`/report`](../src/app/(app)/report/page.tsx), with one ceremony per
week at [`/report/[week]`](../src/app/(app)/report/[week]/page.tsx). The
counting is [`lib/stars/report.ts`](../src/lib/stars/report.ts); the stars come
from `starWeeks`, the same documents the [star charts](stars.md) write.

## Nothing is stored

There is no `reports` collection and there should not be one. A report is
`starWeeks` read back through `counting.ts`, which buys three things:

- It **cannot drift** from the charts. A star corrected on Saturday morning is
  in Sunday's report.
- **History stays true.** The chore rotation is recomputed for the week being
  reported, so a chore that has changed hands three times since is still
  reported to whoever actually had it.
- **Nothing to publish.** No Monday job, no backfill, no half-written report if
  a deploy lands mid-week.

The cost is that a report is only as good as the rows the config still has:
retire a task and last month's report loses it. That is the same trade
`marks.ts` already makes, and the reason task ids are permanent.

## Which week

A week is reportable once it is **over**. The chart runs Monday to Friday but
the week does not end until Sunday night, so the report for the week of the 3rd
appears on Monday the 10th and is the newest one for exactly seven days — which
is what makes the big card at the top of the page a card that sits there for a
week rather than something anybody has to publish.

`latestCompletedWeekStart()` steps once, at midnight on Monday, and then holds.
The current week and every week after it are refused outright: `/report/…` for
this week 404s rather than showing a ceremony for a Wednesday half of which has
not happened, and a hand-typed URL for October cannot conjure a page of zeroes
presented as a result. A Monday is the only shape of URL accepted at all —
`parseWeekStart` rejects anything else, exactly as the star-charts action does.

A week nobody ticked a star in is **not** refused. It is a real report of a
real week and the slides say so.

### Whose clock decides

The family's, not the server's. Vercel runs in UTC and Rexburg is six or seven
hours behind, so from Sunday teatime a server-clock page would already be
publishing a report for a week that, where the children are, has not finished.
Both report pages use `familyNow().civilNoon` — the same proxy `Date` the
[family API](family-api/README.md) uses, whose calendar fields read as
Rexburg's. It is only ever fed to the helpers in `lib/dates.ts`, which is all
that proxy is safe for.

## A nickel a star

Five cents, in [`config/rewards.ts`](../src/config/rewards.ts). A full week for
the eldest is about 110 stars, so around $5.50 — enough to be worth chasing on
a Wednesday, small enough not to be argued about, and a coin the younger two
can hold.

Money is stored in **cents** and formatted once, at the end. Dollars as a
floating-point number is the oldest arithmetic bug there is: 0.05 cannot be
represented exactly, so 47 stars would print as $2.3500000000000005 in front of
a child who is counting.

`formatMoney` deliberately does not use `Intl.NumberFormat`. One family, one
currency, one country — and `Intl` would let the device's locale decide between
`$2.35`, `2,35 $` and `US$2.35`, which is also the hydration trap the note in
`lib/dates.ts` describes.

Nothing here records what has been *paid*. The report says what a week was
worth; the coins are handed over in the kitchen. The planned Rewards page is
the one that will owe somebody money.

## The ceremony

[`AwardCeremony.tsx`](../src/components/report/AwardCeremony.tsx) drives it.

### The running order

Youngest first. Two reasons, and the second decides it: the youngest is four,
and four-year-olds watch the first ninety seconds of anything, so his moment
happens while the room is still watching — and the eldest has the most rows on
her chart, so going up the ages means the totals tend to climb towards the
finale rather than sag after the first slide.

It ends on the **family's** total, which is a number nobody earned. Five slides
of individual numbers is five children being ranked whether or not anybody says
so, and the four-year-old cannot win. The family total says what the charts are
for, and it is the only number on the page that goes up when somebody else does
well.

### The shape of a slide

| When | What |
|---|---|
| 0.12s | Their face and name |
| 0.70s | The first chart line, then one every 0.42s, from alternating sides |
| +0.72s | The grand total, counting up from zero over 0.9s |
| +5.00s | The hold — and then the slide turns |

Every one of those numbers is in
[`timing.ts`](../src/components/report/timing.ts), and it is the same source
the CSS delays, the count-up and the auto-advance timer all read. The bar under
the rail arriving at the end and the slide turning over are therefore the same
moment rather than two that happen to be close.

The order matters more than the timings do: three small moments of "how did I
do on that one" before the number that answers the week. Handing over the total
first would make the rest a footnote.

### Dragging

The whole surface is the target. The gesture has to travel 12px sideways, and
further sideways than down, before it takes over from the page's own scrolling
— with `touch-action: pan-y` so the browser keeps vertical movement for itself.
Past a fifth of the width it turns the slide; short of that it snaps back; at
either end it rubber-bands at a third of the travel so the gesture is plainly
alive but plainly refusing.

Arrow keys, Home and End work too, and every slide is reachable from the rail.

### Not a carousel

No chevrons over the corners, no row of dots, no peeking edges. The slides that
are not on stage sit behind at 92% and half opacity, so it reads as a stage
with the next act in the wings. The only chrome is the rail along the bottom:
one segment per award, in that child's own colour, filling as their slide
plays. Same three facts as a dot row — how many, which one, how long left — and
it reads as a programme rather than as a widget.

Every off-stage slide is `aria-hidden` **and** `inert`. Without the second one,
tabbing off the stage lands on the Start button of a title card somewhere off
to the left.

### Colour and contrast

Each slide is printed on that child's own colour, for the same reason the star
charts have a `ChildBackdrop`: the answer to "whose turn is this" has to be
readable from across the kitchen by a four-year-old.

Their bright colour is only a **glow behind their face** — 160px of it, which
the avatar very nearly covers — and everything else is their dark shade or
darker. That is a contrast decision rather than a taste one: several of the
identifying colours, the green and the orange especially, carry white text at
about 2:1, and their dark shades all carry it at better than 5:1. Every word on
a slide sits on the dark part.

The same problem turns up twice more and is solved the same way. The finale is
a *burnt* gold rather than the star colour, which carries white at 2.4:1 — the
real gold is spent on the confetti and the star glyph, where nothing has to be
read off it. And the title card mixes the theme's primary down towards black at
every stop, because one of the ten themes has a pale sky blue as its primary.
`--color-on-primary` cannot help there: the gradient darkens as it falls, so a
theme with dark on-primary text would end up dark on dark.

### Reduced motion

Everything on a slide is a CSS animation with a `--reveal-delay`, filled
`both` — which means an element is invisible *until* its delay elapses. The
global `prefers-reduced-motion` rule in `globals.css` overrides
`animation-duration` but **not** `animation-delay`, so these classes are
switched off explicitly. Without that, a slide would sit blank for its whole
choreography and then snap into existence, which is worse than the animation.

The count-up is the one piece of motion written in JavaScript, because there is
no CSS property whose computed value is "63". Under reduced motion the number
is simply there.

## The music

A twelve-bar fanfare in D major at 128bpm, looping, played through the shared
Web Audio context at 42% volume. It is
[synthesised](../scripts/generate-fanfare.mjs), not downloaded —
`npm run music:generate`.

Four reasons it is made rather than licensed: production music is the most
aggressively licensed audio there is and "a family app" is not a licence; 22
seconds at 112kbps mono is 300KB against a stock cue's 3-4MB; the script is
deterministic, so re-running produces a byte-identical file and the same
content hash; and **it has to loop**. A ceremony runs as long as it runs, so
the music cannot be a clip with an ending.

The loop is a property of the composition rather than of the playback: the
piece is exactly twelve bars and `add()` **wraps** every voice past the end
back to the start, so the last bar's cymbal and the held top D are already
sounding when bar one comes round again. That is why there are no fades in the
file — a fade would be a hole in the loop.

The score is written as a score (`MELODY`, `PROGRESSION`, `CHORDS`) rather than
as code that makes noises, so it can be changed like music: move a note, not a
formula. Five voices — additive brass with staggered harmonic attacks, a pad, a
bass, a timpani whose pitch falls a fourth in its first 80ms, and bandpassed
noise for the crash — then delay taps for the hall and gentle saturation.

### Starting and stopping

It **only ever starts from a button**. Browsers refuse to autoplay audio, but
this goes further than the policy requires: dragging into the ceremony starts
the slides and does not start the music, because a swipe is a navigation and
brass arriving out of a page somebody was quietly looking through is how an app
gets closed. The two ways to start it are the Start button and the speaker in
the corner.

The speaker is the *same* preference the star charts' cheer uses — one device,
one answer to "does this phone make noise". Leaving the page stops the music;
without that the fanfare would play on over the star charts.

Both ends ramp — 900ms in, 700ms out — because stopping a sustained note dead
is an audible click. `startFanfare` is a no-op while it is already playing, so
a slide turning cannot stack a second copy on top, and a stop that overtakes a
start (tap Start, leave immediately) is caught by a generation counter rather
than leaving an orphaned source playing to nobody.

### One AudioContext

[`lib/audio.ts`](../src/lib/audio.ts) owns the context and the decoded samples;
the cheer and the fanfare both use it. An AudioContext holds a hardware output
stream, iOS caps how many a page may have, and each one has to be unlocked from
inside its own user gesture — so the gesture that starts the ceremony has
already unlocked the context the cheer will use. It also carries the iOS
`audioSession` fix; see the note in that file for why a phone on silent used to
run every line correctly and make no sound.

## Offline

The fanfare is deliberately **not** precached by the service worker. It is
300KB — fifteen times the cheer — for one page that is opened once a week, and
nobody opens the weekly report in a driveway. It is cached on first play like
any other same-origin asset, so the second viewing works offline anyway.

The cheer stays precached, because silence would be the only part of *that*
celebration that needed a signal.

## The list

The card at the top is the latest finished week. Everything older is a plain
list underneath, ten to a page, newest first — an archive is for finding a week
rather than for being impressed by it.

Two queries serve the whole page: `distinct` on `weekStart` for which weeks
have stars in them, and one `$in` read for the eleven weeks actually on screen.
`distinct` rather than a paged aggregation because the answer is one string per
week the family has used the app — 52 a year, about 500 bytes — and paging that
in the database would cost a round trip per page to save nothing.

The pager is Older/Newer and a count, with no numbered pages. By the time page
seven exists nobody will be aiming at page seven; they will be aiming at a
*month*, and that is a date jump rather than twenty little numbers.

## Changing things

| To change | Edit |
|---|---|
| What a star is worth | `CENTS_PER_STAR` in `src/config/rewards.ts` |
| How long a slide holds | `HOLD_MS` in `src/components/report/timing.ts` |
| How many weeks per page | `PER_PAGE` in `src/app/(app)/report/page.tsx` |
| The praise on a thin week | `praiseFor()` in `src/lib/stars/report.ts` |
| The music | The score in `scripts/generate-fanfare.mjs`, then `npm run music:generate` |
| How loud the music is | `MUSIC_VOLUME` in `AwardCeremony.tsx` |

Replacing the fanfare with a **recording** — somebody in the family actually
playing something — is a one-line change: put the file in `public/sounds/` and
point `FANFARE_SOUND` at it. It would be better than anything in that script.
