import { Suspense } from "react";
import Link from "next/link";

import { NavIcon } from "@/components/nav/NavIcon";
import { CalendarCardBadge } from "@/components/dashboard/CalendarCardBadge";
import { MottoBanner } from "@/components/motto/MottoBanner";
import { SeatingCardBadge } from "@/components/dashboard/SeatingCardBadge";
import { APP_NAME } from "@/config/app";
import {
  DASHBOARD_PAGES,
  DASHBOARD_TOOLS,
  PLANNED_FEATURES,
} from "@/config/navigation";
import { requireUser } from "@/lib/auth/dal";
import { upcomingEvents } from "@/lib/calendar/events";
import { loadCalendarFeed } from "@/lib/calendar/feed";
import { toIsoDate } from "@/lib/dates";

/**
 * How many upcoming events the calendar card is given.
 *
 * Enough that the client can pick the right "next" one after correcting to the
 * device's timezone, and few enough that the payload stays negligible.
 */
const CARD_EVENT_COUNT = 10;

/**
 * The dashboard — one card per page, plus what is still to come.
 *
 * A Server Component. It knows who is signed in (via the DAL) and renders the
 * cards from `config/navigation.ts`, so adding a feature to that list adds it
 * here without touching this file.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const initialDateIso = toIsoDate(new Date());

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-6 sm:mb-8">
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-muted)" }}
        >
          Welcome back
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {user.displayName}
        </h1>
      </header>

      {/*
        Above the page cards, and the only filled panel on the screen. The
        motto is what the family is working on this week; it should be read
        before anybody decides where they are going next, so it sits between
        the greeting and the navigation rather than below either.
      */}
      <MottoBanner initialDateIso={initialDateIso} />

      <section aria-labelledby="pages-heading" className="mt-8">
        <h2 id="pages-heading" className="sr-only">
          Pages
        </h2>
        <ul className="animate-soft-rise flex flex-col gap-3">
          {DASHBOARD_PAGES.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="app-card themed-transition flex items-center gap-4 p-4 transition-transform active:scale-[0.98] sm:p-5"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: "var(--color-primary)",
                    color: "var(--color-on-primary)",
                  }}
                >
                  <NavIcon name={item.icon} className="h-6 w-6" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold tracking-tight">
                      {item.title}
                    </span>
                    {item.href === "/turns" ? (
                      <SeatingCardBadge initialDateIso={initialDateIso} />
                    ) : null}
                    {item.href === "/calendar" ? (
                      /*
                        Behind its own boundary with an empty fallback, so a
                        slow or unreachable Google never holds up the dashboard.
                        The badge simply appears a moment later, or not at all.
                      */
                      <Suspense fallback={null}>
                        <CalendarBadgeSlot initialDateIso={initialDateIso} />
                      </Suspense>
                    ) : null}
                  </span>
                  <span
                    className="mt-0.5 block text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {item.description}
                  </span>
                </span>

                <ChevronRight />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/*
        The tools.
        -----------------------------------------------------------------
        Below the pages and above Coming Soon, in the small two-across shape
        rather than a full-width card. That is not a demotion — see `NavGroup`
        — it is what these two are: things you pick up for a minute, not
        places you go. Ten full-width cards would also mean scrolling the
        dashboard to reach Account, which is the one thing the page has always
        managed to avoid.
      */}
      <section aria-labelledby="tools-heading" className="mt-8">
        <h2
          id="tools-heading"
          className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Handy
        </h2>
        <ul className="animate-soft-rise grid grid-cols-2 gap-3">
          {DASHBOARD_TOOLS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="app-card themed-transition flex h-full flex-col gap-2 p-4 transition-transform active:scale-[0.97]"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: "var(--color-primary)",
                    color: "var(--color-on-primary)",
                  }}
                >
                  <NavIcon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="text-sm font-bold leading-tight">
                  {item.title}
                </span>
                <span
                  className="text-xs leading-snug"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {item.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="planned-heading" className="mt-8">
        <h2
          id="planned-heading"
          className="mb-3 px-1 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--color-text-muted)" }}
        >
          Coming soon
        </h2>
        {/*
          Deliberately not links and not buttons: there is nothing behind them
          yet, and a tappable card that does nothing is worse than an honest
          one that says so.
        */}
        <ul className="grid grid-cols-2 gap-3">
          {PLANNED_FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="app-card flex flex-col gap-2 p-4 opacity-60"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: "var(--color-surface-muted)",
                  color: "var(--color-text-muted)",
                }}
              >
                <NavIcon name={feature.icon} className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold leading-tight">
                {feature.title}
              </span>
              <span
                className="text-xs leading-snug"
                style={{ color: "var(--color-text-muted)" }}
              >
                {feature.description}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p
        className="mt-8 text-center text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        {APP_NAME}
      </p>
    </main>
  );
}

/**
 * Fetches just enough of the calendar to name the next event.
 *
 * The feed is shared with `/calendar` through Next's data cache, so on a warm
 * cache this costs nothing. When no calendar is configured — or Google is
 * unreachable — it renders nothing at all: the dashboard is not the place to
 * explain a calendar problem, and the calendar page already does.
 */
async function CalendarBadgeSlot({
  initialDateIso,
}: {
  initialDateIso: string;
}) {
  const now = new Date();
  const feed = await loadCalendarFeed(now);
  if (feed.status !== "ok") return null;

  const events = upcomingEvents(feed.events, now.getTime(), CARD_EVENT_COUNT);
  if (events.length === 0) return null;

  return (
    <CalendarCardBadge events={events} initialDateIso={initialDateIso} />
  );
}

function ChevronRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--color-text-muted)" }}
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
