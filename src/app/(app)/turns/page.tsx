import type { Metadata } from "next";

import { SeatingBoard } from "@/components/SeatingBoard";
import { requireUser } from "@/lib/auth/dal";
import { toIsoDate } from "@/lib/dates";
import { getPetRotations } from "@/lib/pets/store";

export const metadata: Metadata = {
  title: "Whose Turn",
};

/**
 * Whose turn it is: who sits where this week, and who sleeps with which animal
 * tonight.
 *
 * This was the whole app until the dashboard arrived, and was `/seating` right
 * up until the pets landed on it — at which point the name described half a
 * page. It was briefly `/rotations`; "turns" is the word the family actually
 * uses, and the one a six-year-old reads without help. `next.config.ts`
 * redirects both older paths.
 *
 * The board is still handed an initial date so the first paint shows real
 * assignments before JavaScript runs, and now also the pet rotation, which is
 * the one thing on this page that comes out of the database rather than out of
 * the source.
 */
export default async function TurnsPage() {
  await requireUser();
  const initialDateIso = toIsoDate(new Date());
  const petRotations = await getPetRotations();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-5 sm:px-6 sm:pt-8">
      {/*
        The footer note that used to sit here — "Seats change every Monday ·
        Pets change every night" — moved into the header, where it explains the
        page before you have scrolled it rather than after. Saying it in both
        places was just saying it twice.
      */}
      <SeatingBoard
        initialDateIso={initialDateIso}
        petRotations={petRotations}
      />
    </main>
  );
}
