import { SeatingBoard } from "@/components/SeatingBoard";
import { APP_NAME } from "@/config/app";
import { toIsoDate } from "@/lib/dates";

/**
 * The app opens straight onto this week's seats. No navigation, no menus.
 *
 * This page is a server component; it renders the shell and hands the seating
 * island an initial date so the first paint already shows real assignments,
 * even before JavaScript runs.
 */
export default function Home() {
  const initialDateIso = toIsoDate(new Date());

  return (
    <>
      <BackgroundDecoration />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
        <SeatingBoard initialDateIso={initialDateIso} />
      </main>
      <footer
        className="mx-auto w-full max-w-5xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        {APP_NAME} · seats change every Monday
      </footer>
    </>
  );
}

/**
 * Soft themed shapes behind the content. Fixed and non-interactive, so they
 * never affect layout or scrolling.
 */
function BackgroundDecoration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="themed-transition absolute -left-24 -top-28 h-72 w-72 rounded-full opacity-70 blur-2xl"
        style={{ backgroundColor: "var(--color-page-decoration)" }}
      />
      <div
        className="themed-transition absolute -right-24 top-1/3 h-80 w-80 rounded-full opacity-60 blur-2xl"
        style={{ backgroundColor: "var(--color-page-decoration)" }}
      />
      <div
        className="themed-transition absolute -bottom-28 left-1/4 h-72 w-72 rounded-full opacity-50 blur-2xl"
        style={{ backgroundColor: "var(--color-page-decoration)" }}
      />
    </div>
  );
}
