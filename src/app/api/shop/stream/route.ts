import type { NextRequest } from "next/server";

import {
  SHOP_STREAM_HEARTBEAT_MS,
  SHOP_STREAM_LIFETIME_MS,
  SHOP_STREAM_POLL_MS,
} from "@/config/shop";
import { getCurrentUser } from "@/lib/auth/dal";
import { readShopState, sameShopState } from "@/lib/shop/state";
import { BYE_EVENT, sseComment, sseEvent, sseRetry, STATE_EVENT } from "@/lib/shop/stream";

/**
 * The live shop: balances, the family goal's progress, and how many requests
 * are waiting on a parent — pushed to every open `/shop` and `/shop/admin` so
 * a purchase on one phone updates another without a reload.
 *
 * A straight copy of `src/app/api/shopping/stream/route.ts`'s shape — see
 * that file for why this is a polling SSE endpoint rather than a WebSocket or
 * a MongoDB change stream, and for the fifty-second handover this repeats
 * below almost verbatim. The one difference: there is no cheap "has anything
 * changed" pre-query here, because `readShopState()` already is that query —
 * five balances and one pool, nothing a `$count`/`$max` could beat.
 */

export const dynamic = "force-dynamic";

/** Seconds. Must exceed `SHOP_STREAM_LIFETIME_MS`, which is 50s. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // `getCurrentUser()` rather than `requireUser()` — see the shopping route
  // for why a redirect is the wrong answer for an `EventSource`.
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Not signed in.", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const encoder = new TextEncoder();
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

      void (async () => {
        send(sseRetry());

        let known = await readShopState();
        send(sseEvent(STATE_EVENT, known));

        const deadline = Date.now() + SHOP_STREAM_LIFETIME_MS;
        let lastSpoke = Date.now();

        while (open && !request.signal.aborted && Date.now() < deadline) {
          await wait(SHOP_STREAM_POLL_MS, request.signal);
          if (!open || request.signal.aborted) break;

          const current = await readShopState();
          if (!sameShopState(current, known)) {
            known = current;
            send(sseEvent(STATE_EVENT, known));
            lastSpoke = Date.now();
          } else if (Date.now() - lastSpoke >= SHOP_STREAM_HEARTBEAT_MS) {
            send(sseComment("still here"));
            lastSpoke = Date.now();
          }
        }

        send(sseEvent(BYE_EVENT, { reason: "handover" }));
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the platform.
          }
        }
      })();
    },

    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

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
