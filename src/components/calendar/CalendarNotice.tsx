import { CALENDAR_FEED_ENV } from "@/config/calendar";

/**
 * What the page shows when there is no calendar to show.
 *
 * Two situations, deliberately worded differently, because they need different
 * things done about them:
 *
 * - **Not connected.** Nothing is broken; the app has simply never been given
 *   a calendar. The instructions to connect one are right here, because the
 *   person who sees this is the person who can fix it.
 * - **Connected but failing.** Something *is* broken, and the message names
 *   what — never quoting the feed URL itself, which is a secret.
 *
 * A server component: it renders no state and needs none of the device's date.
 */
export function CalendarNotice({ error }: { error: string | null }) {
  if (error) {
    return (
      <div className="app-card animate-soft-rise p-5">
        <h2 className="text-lg font-bold tracking-tight">
          The calendar could not be loaded
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="app-card animate-soft-rise p-5">
      <h2 className="text-lg font-bold tracking-tight">
        No calendar connected yet
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
        This page shows the family&rsquo;s Google Calendar once it has been
        pointed at one. It takes about a minute:
      </p>

      <ol
        className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        <li>
          Open Google Calendar on a computer and hover the family calendar in
          the left-hand list.
        </li>
        <li>
          Choose <strong>Options</strong> (the three dots) &rarr;{" "}
          <strong>Settings and sharing</strong>.
        </li>
        <li>
          Scroll to <strong>Integrate calendar</strong> and copy the{" "}
          <strong>Secret address in iCal format</strong>.
        </li>
        <li>
          Set it as <code className="font-mono text-xs">{CALENDAR_FEED_ENV}</code>{" "}
          locally in <code className="font-mono text-xs">.env</code>, and in the
          Vercel project&rsquo;s environment variables for the deployed app.
        </li>
      </ol>

      <p
        className="mt-4 text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        That address is a password in URL form — anyone holding it can read the
        whole calendar. Keep it out of screenshots and commits; it can be reset
        from the same settings page if it ever leaks.
      </p>
    </div>
  );
}
