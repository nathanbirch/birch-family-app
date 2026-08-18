import type { NextRequest } from "next/server";

import {
  STREAM_HEARTBEAT_MS,
  STREAM_LIFETIME_MS,
  STREAM_POLL_MS,
} from "@/config/shopping";
import { getCurrentUser } from "@/lib/auth/dal";
import { readShoppingList, readShoppingRevision } from "@/lib/shopping/store";
import {
  BYE_EVENT,
  LIST_EVENT,
  REVISION_PARAM,
  sseComment,
  sseEvent,
  sseRetry,
} from "@/lib/shopping/stream";

/**
 * The live shopping list, as a stream.
 *
 * One long-lived `GET` that pushes the whole list every time it changes, so a
 * phone left open on the page follows what everybody else is doing without a
 * reload. See `lib/shopping/stream.ts` for why this is server-sent events rather
 * than a WebSocket, which is the first question anybody will have.
 *
 * ---------------------------------------------------------------------------
 * WHY IT POLLS, AND WHY THAT IS NOT A CLIMBDOWN
 * ---------------------------------------------------------------------------
 * The loop below asks the database "has anything changed?" every
 * `STREAM_POLL_MS`. The obvious alternative — a MongoDB change stream, or an
 * in-process event emitter the Server Actions publish to — is worse here, and
 * for a reason specific to how this app is deployed:
 *
 *   - An **in-process emitter** only reaches the browsers connected to the same
 *     instance. Vercel runs several, and which one a request lands on is not
 *     something either side chooses, so the phone in the kitchen and the phone
 *     at the shop would routinely be listening to different instances and hear
 *     nothing from each other. That is not a slower version of working; it is a
 *     feature that appears to work locally and fails in the house.
 *   - A **change stream** does work across instances, and costs an open cursor
 *     per connection plus a dependency on the cluster's oplog. It is the right
 *     answer at a scale this app will never see.
 *
 * What is actually being polled is deliberately tiny: a count and one maximum,
 * with no documents crossing the wire — see `readShoppingRevision()`. The full
 * list is read only when that token has moved. A quiet page therefore costs one
 * trivial aggregation a second and a half and nothing else, and the poll is
 * *inside* the stream rather than in the browser, so the phone still gets a push
 * and still spends no battery asking.
 *
 * ---------------------------------------------------------------------------
 * THE FIFTY-SECOND HANDOVER
 * ---------------------------------------------------------------------------
 * A serverless function has a maximum duration, and being cut off at it is
 * indistinguishable from the network dropping. So the stream retires itself ten
 * seconds early, says `bye` first, and the page opens the next one immediately —
 * handing over the revision it already has, so the handover costs no payload.
 * `maxDuration` below must stay above `STREAM_LIFETIME_MS`.
 */

/*
 * Never cached, never prerendered. Both are true anyway — the handler reads the
 * session cookie and queries MongoDB — but a streaming response is the one place
 * where a wrong answer here would be catastrophic rather than stale, so it is
 * stated.
 */
export const dynamic = "force-dynamic";

/** Seconds. Must exceed `STREAM_LIFETIME_MS`, which is 50s. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  /*
   * `getCurrentUser()` rather than `requireUser()`. The latter redirects to
   * `/signed-out`, and an `EventSource` handed a redirect to an HTML page
   * reports an opaque error and keeps retrying it forever. A 401 is what the
   * browser's reconnection logic is built to deal with, and what the hook needs
   * in order to give up rather than hammer.
   */
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Not signed in.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const encoder = new TextEncoder();

  /** What the connecting page already has. Empty means "tell me everything". */
  let known = request.nextUrl.searchParams.get(REVISION_PARAM) ?? "";

  /*
   * Guards every write. A controller that has been closed or cancelled throws on
   * `enqueue`, and the loop below is running detached from the request — so
   * without this, a page navigating away would log an unhandled rejection each
   * time the list changed.
   */
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (frame: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          open = false;
        }
      };

      /*
       * Deliberately not awaited. A `start` that returns a pending promise
       * withholds the stream from the platform until it settles, which for a
       * loop that runs for fifty seconds would mean a response that never
       * begins. Detaching it is what lets the first frame leave immediately.
       */
      void (async () => {
        // Sent first, so a connection that dies without saying goodbye — a
        // tunnel, a dropped wifi — is retried on this app's schedule rather
        // than the browser's three-second default.
        send(sseRetry());

        const deadline = Date.now() + STREAM_LIFETIME_MS;
        let lastSpoke = Date.now();

        while (open && !request.signal.aborted && Date.now() < deadline) {
          const revision = await readShoppingRevision();

          if (revision !== null && revision !== known) {
            const list = await readShoppingList();
            /*
             * The list's own token, not the polled one. A change can land
             * between the two reads, and trusting the earlier number would leave
             * this connection convinced it had already sent something it had
             * not.
             */
            known = list.revision;
            send(sseEvent(LIST_EVENT, list));
            lastSpoke = Date.now();
          } else if (Date.now() - lastSpoke >= STREAM_HEARTBEAT_MS) {
            // A shopping list is silent almost all of the time, and a silent
            // connection is one a proxy or a phone radio eventually discards.
            send(sseComment("still here"));
            lastSpoke = Date.now();
          }

          await wait(STREAM_POLL_MS, request.signal);
        }

        send(sseEvent(BYE_EVENT, { reason: "handover" }));
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the platform. Nothing left to do.
          }
        }
      })();
    },

    cancel() {
      // The page navigated away, backgrounded the stream, or closed the tab.
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      /*
       * `no-transform` matters as much as `no-store`: a proxy that helpfully
       * compresses or buffers this response turns a live stream into a fifty
       * second wait followed by everything at once. `X-Accel-Buffering` says the
       * same thing again to the one proxy family that does not read the first.
       */
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

/** `setTimeout` as a promise, cut short if the request goes away. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const settle = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", settle);
      resolve();
    };

    const timer = setTimeout(settle, ms);
    signal.addEventListener("abort", settle, { once: true });
  });
}
