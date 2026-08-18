# The shopping list

`/shopping` — what the family needs, on every phone at once.

Anybody signed in can add to it, tick things off, or take them back off the
list. A change made on the iPad in the kitchen appears on the phone in the
supermarket a second later, with nobody reloading anything.

---

## What makes this page different from every other one

Until this arrived, the app had two kinds of page: pages derived from the
calendar (the seating rotation, Family Home Evening), and pages that read
something stored and let one person edit it (the star charts). Both are
*read-mostly*, both are looked at by one person at a time, and neither cares
whether another device is looking at the same thing.

The shopping list breaks all three assumptions at once:

- **Two people edit it simultaneously.** One is at the shop ticking things off
  while another is at home remembering the milk.
- **A change is only useful if the other device hears about it.** A shopping
  list that needs a reload to be current is a shopping list that gets shopped
  twice.
- **There is no natural bucket.** A star belongs to a child and a week; a
  shopping item belongs to nothing but itself.

Everything unusual about the implementation follows from those three sentences.

---

## The page

```
Shopping                     ● Live
3 things to get

[ Add something…          ] [ Add ]

○  Brown bread                        🗑
○  Milk                               🗑
○  Washing-up liquid                  🗑

▸ Bought
  12 things, newest first
```

**The whole row is the tick.** Not the small circle on the left — the row. A
24px checkbox held one-handed in a supermarket is the wrong target, and the
name is the thing a thumb will aim at. The only separate control is the bin,
kept small and at the far edge because it is the one action nobody wants to hit
by accident.

**Adding keeps the keyboard.** The field clears itself and takes the focus
straight back, because adding to a shopping list is never one thing: somebody
at an open fridge adds milk, then eggs, then butter.

**Ticking waits a quarter of a second.** The one deliberate delay in the app.
Moving the row into the accordion on the same frame as the tap means it is gone
before the eye has confirmed *which* row was tapped, which on a list of similar
words is genuinely disorienting. So the row is held on screen, the tick draws
itself, the line strikes through, and then it goes. React cannot animate a node
it is about to unmount, so holding the state change **is** the exit animation.
Under `prefers-reduced-motion` there is no wait at all — the delay exists to
carry an animation, and with no animation to carry it would just be lag.

**Adding something twice is answered, not refused.** Two people both
remembering the milk is the normal case in a family. The page says "Milk is
already on the list" and highlights the row that already says so — because
"which one?" is the question the message alone only half answers. The match
ignores case, spacing and accents, so `jalapeno` finds `Jalapeño`.

**Bought is a receipt, not an archive.** The accordion holds the hundred most
recently ticked-off items, newest first. Nothing is deleted for being old;
older rows are simply past the point where anybody scrolls. Each row carries
the time it was bought, at a precision that shortens as the memory gets vaguer:
the time of day today, `Yesterday`, a weekday name inside the week, then a
date.

---

## How live works

**It is server-sent events, not a WebSocket.** That is the first question
anybody has, and the answer is in the deployment rather than in a preference.

This app is deployed as serverless functions on Vercel (see
[Deployment](deployment.md)). A serverless function receives an HTTP request
that has already been terminated by the platform, and has nowhere to keep an
upgraded socket; Next.js Route Handlers have no upgrade hook for the same
reason. A real WebSocket would need a long-lived Node process — a second host,
or a hosted realtime service — for a family shopping list.

Server-sent events give exactly the guarantee the feature needs over the
connection Vercel already serves:

| | WebSocket | SSE, as built |
|---|---|---|
| Works on Vercel | no | yes |
| Server can push | yes | yes |
| Browser can push | yes | no — but every upstream change is a Server Action anyway, and wants its authentication |
| Authentication | a second mechanism | the session cookie, checked by the same code as every page |
| Reconnects | your code | the browser's, built in |

### The shape of it

```
   browser                          route handler                MongoDB
   ───────                          ─────────────                ───────
   EventSource                 ──►  GET /api/shopping/stream
   ?revision=7:1787063026457

                                    every 1.5s:  count + max(updatedAt)  ──►
                                                 same as last time? say nothing
                                                 different?  read the list  ──►
   event: list                 ◄──               and push it
   data: {"active":[…]}

                                    every 15s of silence:
   : still here                ◄──               a comment, to keep it open

                                    at 50s:
   event: bye                  ◄──               retire, and close
   (opens a new EventSource
    with the newer revision)
```

### Why it polls, and why that is not a climbdown

The loop asks the database "has anything changed?" every 1.5 seconds. The two
obvious alternatives are both worse *here*:

- **An in-process event emitter** that the Server Actions publish to only
  reaches browsers connected to the same instance. Vercel runs several, and
  neither side chooses which one a request lands on — so the phone in the
  kitchen and the phone at the shop would routinely be listening to different
  instances and hear nothing from each other. That is not a slower version of
  working. It is a feature that appears to work locally and fails in the house.
- **A MongoDB change stream** does work across instances, and costs an open
  cursor per connection plus a dependency on the cluster's oplog. It is the
  right answer at a scale this app will never see.

What is polled is deliberately tiny: a count and one maximum, with no documents
crossing the wire. The full list is read only when that token has moved. A quiet
page costs one trivial aggregation every second and a half — and the poll is
*inside* the stream rather than in the browser, so the phone still gets a push
and still spends no battery asking.

### The revision token

```
"7:1787063026457"     ← how many rows, and the newest `updatedAt`
```

Compared for equality only; it is not an ordering. The count is in there for one
specific case: deleting the newest row *lowers* the maximum `updatedAt`, so a
timestamp alone could produce a revision the stream had already sent — and every
other phone would keep showing a deleted row until the next unrelated change.

### The fifty-second handover

A serverless function has a maximum duration, and being cut off at it is
indistinguishable from the network dropping. So the stream retires itself ten
seconds early, says `bye` first, and the page opens the next one immediately —
handing over the revision it already has, so the handover costs no payload. The
route's `maxDuration` must stay above `STREAM_LIFETIME_MS`.

If a connection dies *without* saying goodbye — a tunnel, a dropped wifi — the
browser reconnects on its own after the `retry` the stream sent first. The page
is told either way, and says `Offline` in place of `Live` until it is back. A
shared list that has silently stopped being shared is the one failure this page
must not hide.

### The connection sleeps when the page does

An open stream is a server function held open, so it is closed the moment the
page is hidden and reopened when it comes back — which for a phone in a pocket
is almost all of the time. Waking up hands over the revision already in hand, so
it costs one small query and shows anything missed at once.

### The service worker must not touch it

`public/sw.js` bypasses everything under `/api/`, and the shopping stream is why.
The worker's asset strategy ends in `cache.put(response.clone())`, and putting a
response into the Cache API reads its body to completion — which for a stream
that stays open for fifty seconds means the worker sitting on the whole
connection, buffering, and delivering nothing until it ends. A live list would
arrive all at once, a minute late.

---

## Instant, and still correct

The page has two sources of truth and one rule that keeps them apart. See
`src/hooks/useShoppingList.ts`.

**`server`** is the last list the stream pushed: authoritative, shared by every
device in the house. **`patches`** are changes *this* device has made that the
server has not confirmed yet. What you see is the second applied to the first,
which is why a tick is drawn on the frame it is tapped.

A patch is dropped the moment believing the server would show the same thing —
not when the write returns. That is what makes the handover invisible rather
than a flicker, and it means somebody *else* ticking the same item satisfies the
patch too, because it is the same fact. `reconcile()` is that rule; it is pure
and tested.

Each patch also expires after four seconds. That is the backstop for a write
that neither succeeded nor reported failing — the phone that went into a lift
mid-tap — because a local change the server will never confirm must not sit on
top of the truth until somebody reloads.

> `useOptimistic` would have been the obvious tool and does not fit. It reverts
> as soon as the transition that made it settles, and these actions deliberately
> do not revalidate the page, so it would revert to a server list that is still
> up to a poll behind and every tap would blink.

### Why the browser invents the id

`newItemId()` produces the 24 hex characters MongoDB wants for an `_id`, and the
*browser* calls it before the write goes out. Two things fall out of that:

- The row drawn optimistically has the same identity as the row that comes back
  from the database, so reconciling the two is an id comparison rather than a
  guess about which "Milk" is which.
- The write becomes idempotent. A retry after a flaky connection collides with
  its own first attempt on the `_id` index instead of adding the milk twice.

The id is not a secret and confers nothing: every item belongs to the whole
family, and the Server Action still checks the session before it writes.

---

## Storage

One document per item, in `shoppingItems`. Full field list in
[Database](database.md#shoppingitems).

That is the opposite of what the star charts do, and deliberately. `starWeeks`
buckets a whole week into one document because the paper chart is a week and a
star is never edited on its own. Here the unit somebody adds, ticks and deletes
*is* the item, two people are editing different items at the same moment, and
there is no bucket that ever closes.

**Ticking is stored; deleting is not.** Ticking something off is a fact worth
keeping — it is what the accordion is — and `completedBy` records who got it.
The bin is the "that was a typo" button and the "we don't need it after all"
button; a tombstone would keep both of those mistakes on the page forever, and
there is nothing in a shopping list worth auditing.

**Reads are forgiving, writes are not.** The same rule the pets and the chore
pools follow: an unreachable cluster gives an empty list and a console warning
rather than an error page, and the failure is recorded through
`lib/data-health.ts` so an API can tell "nothing is needed" from "we could not
ask". Writes have nothing sensible to fall back to, so they report the failure
and the page says so.

**Nothing calls `revalidatePath`.** Every other mutation in the app ends with
one; these do not, and it is the first thing to understand before editing them.
An open browser is already being told about every change by the stream, and the
device that made the change drew it before the write even left. Revalidating
would spend a full server render re-deriving a list that both parties already
have, on every tap. Nothing goes stale, because the page is uncached — a fresh
navigation queries MongoDB again on its own.

---

## The ceilings

All in [`src/config/shopping.ts`](../src/config/shopping.ts).

| | | Why |
|---|---|---|
| Item name | 80 characters | Long enough for "the big tub of yoghurt, not the small one". Names longer are **trimmed, not refused** — somebody typing a sentence into a shopping list should get their item, not an error. |
| Things wanted at once | 200 | Not a storage concern; it is a child with a thumb on the Add button. A real week's shopping is thirty or forty lines. |
| Bought history shown | 100 | The accordion is a receipt. Older rows stay in the database. |
| Poll interval | 1.5s | The *other* phones' latency. Whoever tapped saw it immediately. |
| Connection lifetime | 50s | Ten seconds under the platform's ceiling. |
| Heartbeat | 15s of silence | Inside every proxy timeout that matters; costs two bytes. |
| Unconfirmed change trusted for | 4s | Long enough for a slow write, short enough that nobody walks away with a wrong list. |

---

## Files

| File | What it is |
|---|---|
| `src/app/(app)/shopping/page.tsx` | The server component: reads the list, hands it to the island |
| `src/app/api/shopping/stream/route.ts` | The stream |
| `src/config/shopping.ts` | Every limit and timing above |
| `src/lib/shopping/list.ts` | The list as a value: names, ids, sorting, patches, reconciliation. Pure |
| `src/lib/shopping/store.ts` | MongoDB. Server-only |
| `src/lib/shopping/actions.ts` | The three Server Actions |
| `src/lib/shopping/stream.ts` | The wire format, shared by both ends. Pure |
| `src/hooks/useShoppingList.ts` | The live list, and the two-sources-of-truth rule |
| `src/hooks/useClientMinute.ts` | The device's clock, and `null` on the server |
| `src/components/shopping/ShoppingBoard.tsx` | The page |
| `src/components/shopping/AddItemForm.tsx` | The box you type into |
| `src/components/shopping/ShoppingRow.tsx` | One line, wanted or bought |
| `src/components/shopping/CompletedList.tsx` | The Bought accordion |

Tests: `tests/shopping-list.test.ts` (the value and the rules),
`tests/shopping-stream.test.ts` (the wire format),
`tests/shopping-board.test.tsx` (the page, with a faked stream).

---

## If it stops updating

1. **Does the header say `Offline`?** Then the stream is not connected. Check the
   browser console for the `EventSource` error, and that `/api/shopping/stream`
   returns `text/event-stream` rather than a redirect — a signed-out session
   redirects to `/login`, which an `EventSource` reports only as an opaque
   failure.
2. **Does it say `Live` but show nothing new?** The push happens only when the
   revision token moves. Check that writes are setting `updatedAt`; a write that
   forgets it is invisible to every other device.
3. **Does everything arrive at once, a minute late?** Something is buffering the
   response. Check the `/api/` bypass is still at the top of `public/sw.js`, and
   that nothing has removed `Cache-Control: no-transform` from the route.
4. **Is it slow only on one device?** Check whether that device's page is
   actually in the foreground. A hidden page has no connection by design, and
   picks up everything it missed on the way back.
