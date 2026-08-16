import type { Metadata } from "next";

import { StickyNote } from "@/components/note/StickyNote";
import { BOTTOM_NAV_SPACE } from "@/config/navigation";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "The Note",
};

/**
 * A pad on the fridge, in the app.
 *
 * A Server Component with nothing on it but the pad — no data, no clock, no
 * database. Everything this page does happens in the browser, and the note
 * itself never leaves the device it was written on (see `NOTE_STORAGE_KEY`).
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS ALMOST NO PAGE HERE
 * ---------------------------------------------------------------------------
 * A single line of explanation and then the paper. The temptation on a page
 * like this is a row of examples, a "recent notes" list, a heading that
 * explains what handwriting is. All of it would be furniture around the one
 * thing anybody came for, and the pad is already six inches tall and covered
 * in tools — it explains itself the moment a pencil touches it.
 *
 * The subtitle earns its place because it says the one thing the pad *cannot*
 * show: that the note stays. Without it, the honest assumption on opening a
 * blank canvas in a web app is that anything written will be gone by tea.
 */
export default async function NotePage() {
  await requireUser();

  return (
    /*
     * The one page in the app that does not scroll, and therefore the one that
     * needs a height rather than a minimum.
     *
     * Everywhere else the content is as tall as it is and the page scrolls to
     * suit. Here it is the other way round: the pad should be the biggest sheet
     * that fits, which is a subtraction, and a subtraction needs something
     * definite to subtract from. `100svh` is the *small* viewport height — the
     * one with the browser's chrome showing — so the tray can never end up
     * underneath an address bar that reappears.
     *
     * `BOTTOM_NAV_SPACE` is taken off because the layout renders the tab bar's
     * spacer after this element, and the two together have to come to a
     * screenful.
     *
     * A *minimum* rather than a fixed height, which is the difference between
     * "fill the screen" and "never exceed it". On any normal screen the two
     * are the same and the page does not scroll. On a small phone the tray
     * wraps to four rows and there is genuinely not enough room for both — at
     * a fixed height the sheet was squeezed to a 41-pixel stamp. With a
     * minimum, the sheet stops at the floor set below and the page scrolls the
     * last little bit instead. Scrolling on a 320px phone is a far better
     * answer than a pad nobody could write on.
     */
    <main
      className="mx-auto flex w-full max-w-5xl shrink-0 flex-col px-4 pb-3 pt-4 sm:px-6 sm:pt-6"
      style={{ minHeight: `calc(100svh - ${BOTTOM_NAV_SPACE})` }}
    >
      <header className="animate-soft-fade mb-3 shrink-0 sm:mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          The Note
        </h1>
        <p
          className="mt-0.5 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Write something for everyone. It stays here until it is cleared.
        </p>
      </header>

      {/*
        A flex column itself, not just a box — the height has to be handed
        down by `flex-1` at every step from the `<main>` above to the sheet
        itself. See the note in `StickyNote` for why `h-full` cannot do it.
      */}
      <div className="animate-soft-rise flex min-h-0 flex-1 flex-col">
        <StickyNote />
      </div>
    </main>
  );
}
