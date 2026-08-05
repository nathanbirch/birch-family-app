import type { Metadata } from "next";
import { Suspense } from "react";

import { CalendarBoard } from "@/components/calendar/CalendarBoard";
import { CalendarNotice } from "@/components/calendar/CalendarNotice";
import { loadCalendarFeed } from "@/lib/calendar/feed";
import { requireUser } from "@/lib/auth/dal";
import { toIsoDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Calendar",
};

/**
 * The family calendar.
 *
 * The page shell renders immediately and the calendar streams in behind a
 * `<Suspense>` boundary, because the one slow thing here is a network round
 * trip to Google that the app does not control. Without the boundary a cold
 * cache would hold the whole page — heading, tab bar and all — for as long as
 * Google took to answer.
 *
 * Fetching happens on the server and only on the server: the feed URL is a
 * bearer secret, and `lib/calendar/feed.ts` imports `"server-only"` so that
 * stays true by construction rather than by care. What crosses to the browser
 * is the expanded list of occurrences and nothing else.
 */
export default async function CalendarPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Calendar
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Everything on the family&rsquo;s Google Calendar.
        </p>
      </header>

      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent />
      </Suspense>
    </main>
  );
}

async function CalendarContent() {
  const feed = await loadCalendarFeed();

  if (feed.status === "unconfigured") return <CalendarNotice error={null} />;
  if (feed.status === "error") return <CalendarNotice error={feed.message} />;

  return (
    <CalendarBoard
      events={feed.events}
      // The device corrects this immediately after mount; it exists so the
      // first paint is the right week rather than a placeholder.
      initialDateIso={toIsoDate(new Date())}
      windowStart={feed.windowStart}
      windowEnd={feed.windowEnd}
      truncated={feed.truncated}
    />
  );
}

/**
 * The shape of the week view, greyed out.
 *
 * Deliberately not a spinner: this occupies the same space the real content
 * will, so the page does not lurch when it arrives.
 */
function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div
        className="h-12 rounded-2xl"
        style={{ backgroundColor: "var(--color-surface-muted)" }}
      />
      <div className="app-card flex flex-col gap-3 p-3">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div
              className="h-8 w-8 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--color-surface-muted)" }}
            />
            <div
              className="h-4 flex-1 rounded"
              style={{ backgroundColor: "var(--color-surface-muted)" }}
            />
          </div>
        ))}
      </div>
      <p className="sr-only">Loading the calendar…</p>
    </div>
  );
}
