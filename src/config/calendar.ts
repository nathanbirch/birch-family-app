/**
 * The family calendar.
 *
 * ---------------------------------------------------------------------------
 * WHY A SECRET iCAL URL AND NOT THE GOOGLE CALENDAR API
 * ---------------------------------------------------------------------------
 * Google offers three ways to read a calendar from a server:
 *
 * 1. The **secret iCal address** — a long, unguessable URL Google generates per
 *    calendar, serving the whole thing as an `.ics` file over plain HTTPS.
 * 2. The **Calendar API with a service account**, with the calendar shared to
 *    the service account's address.
 * 3. The **Calendar API with an API key**, which only works if the calendar is
 *    made publicly visible.
 *
 * (3) is out on principle: this calendar has children's schedules and
 * addresses in it, and "public" means public. (2) is the more capable option
 * and Google expands repeating events for you — but it needs a Google Cloud
 * project, a service account and a private key in the environment, which is a
 * lot of standing infrastructure for a read-only family widget.
 *
 * So: (1). One environment variable, no Google Cloud project, and it works
 * against any Google account regardless of which one owns the calendar. The
 * cost is that the app has to understand iCalendar itself — including
 * expanding repeating events — which is what `src/lib/calendar/` is for.
 *
 * The URL is a **bearer secret**: anyone holding it can read the calendar.
 * It therefore lives in the environment, is only ever read on the server, and
 * is never sent to the browser. If it leaks, reset it from Google Calendar
 * (Settings → the calendar → "Reset secret address"), which invalidates the
 * old one immediately.
 */

/** The environment variable holding the secret iCal URL. */
export const CALENDAR_FEED_ENV = "CALENDAR_ICS_URL";

/**
 * How long a fetched copy of the feed may be reused, in seconds.
 *
 * Google regenerates the `.ics` file on its own schedule and is documented as
 * being "up to 24 hours" behind for some clients, so polling harder than this
 * mostly buys nothing. Fifteen minutes keeps the page responsive to a
 * same-day change without hitting Google on every render.
 */
export const CALENDAR_REFRESH_SECONDS = 900;

/**
 * How far either side of today the app expands events.
 *
 * Repeating events have to be expanded into individual occurrences against
 * *some* window — "every Tuesday, forever" has no last occurrence. The whole
 * window is expanded on the server and sent to the browser once, so the
 * Day/Week/Month views can be navigated without another round trip; the arrows
 * stop at the edges rather than silently showing an empty month.
 *
 * A month behind and six months ahead is roughly 300 occurrences for a busy
 * family calendar, which is a small payload and covers everything anyone
 * actually looks at on a phone.
 */
export const CALENDAR_MONTHS_BEHIND = 1;
export const CALENDAR_MONTHS_AHEAD = 6;

/**
 * A hard ceiling on expanded occurrences.
 *
 * A malformed or hostile `RRULE` (`FREQ=SECONDLY`, say) would otherwise
 * generate millions of occurrences and hang the render. The expansion stops
 * here and the page says so rather than pretending it showed everything.
 */
export const CALENDAR_MAX_OCCURRENCES = 3000;

/** The three ways of looking at the calendar. */
export type CalendarView = "day" | "week" | "month";

export const CALENDAR_VIEWS: readonly { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
] as const;

/**
 * Week is the default.
 *
 * Day is too narrow a window to answer "what's coming up", and Month on a
 * phone reduces each day to a dot you have to tap to read. Week shows seven
 * days with actual event titles on them, which is the question this page
 * exists to answer.
 */
export const CALENDAR_DEFAULT_VIEW: CalendarView = "week";

/** Most event chips to draw in one month-grid cell before summarising. */
export const CALENDAR_MONTH_CELL_EVENTS = 2;

/* ------------------------------------------------------------------ */
/* The timeline                                                        */
/* ------------------------------------------------------------------ */

/**
 * How Day and Week are drawn.
 *
 * - `list` — the stacked rows this app started with. Reads well on a phone
 *   held one-handed, and shows every event's title in full.
 * - `timeline` — the hour grid, as Google Calendar draws it. Costs horizontal
 *   room and truncates titles, but it is the only one that shows *shape*: a
 *   free afternoon, a double-booking, a gap big enough to fit something in.
 *
 * Neither is better, which is exactly why this is a toggle rather than a
 * replacement. `list` stays the default because it is the one that survives a
 * 390px screen without compromise.
 */
export type CalendarLayout = "list" | "timeline";

export const CALENDAR_DEFAULT_LAYOUT: CalendarLayout = "list";

/** Height of one hour row, in pixels. */
export const CALENDAR_HOUR_HEIGHT = 48;

/**
 * Where the grid scrolls to when nothing is on.
 *
 * 7am, so the school run is on screen without scrolling.
 */
export const CALENDAR_FALLBACK_HOUR = 7;

/**
 * Least width the seven-day timeline may squeeze into, in `rem`.
 *
 * Below this a column is too narrow for a time and any of a title, so the grid
 * scrolls sideways *within its card* instead of shrinking further. The page
 * itself still never scrolls sideways — see docs/accessibility.md.
 */
export const CALENDAR_WEEK_MIN_WIDTH_REM = 36;

/*
 * Note what is *not* in this file: any code that reads the feed URL out of the
 * environment. The client bundle imports this module for `CALENDAR_VIEWS`, and
 * a module that both reads a secret and ships to the browser is one careless
 * refactor away from leaking it. The reader lives in `lib/calendar/feed.ts`,
 * behind `server-only`, where that mistake is a build error.
 */
