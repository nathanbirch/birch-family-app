import type { Metadata } from "next";

import { StickyNote } from "@/components/note/StickyNote";
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
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <header className="animate-soft-fade mb-4 sm:mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          The Note
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          Write something for everyone. It stays here until it is cleared.
        </p>
      </header>

      <div className="animate-soft-rise">
        <StickyNote />
      </div>
    </main>
  );
}
