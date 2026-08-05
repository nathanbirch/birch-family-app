import type { Metadata } from "next";

import { StarsBoard } from "@/components/stars/StarsBoard";
import { requireUser } from "@/lib/auth/dal";
import { toIsoDate } from "@/lib/dates";
import { getWeekMarks } from "@/lib/stars/marks";
import { getChorePools } from "@/lib/stars/rotation-store";
import { getWeekStartIso } from "@/lib/stars/week";

export const metadata: Metadata = {
  title: "Stars",
};

/**
 * Every star the family can earn this week, in one place.
 *
 * The three charts off the fridge — chores, learning and hygiene — merged into
 * one page per child. The chores half of it rotates on the first of every
 * month; see docs/stars.md.
 *
 * Two things come out of the database here and nothing else does: the pools
 * (who is in which rotation, and where it is anchored) and this week's ticked
 * stars. Everything else — the tasks, their wording, which child has which
 * fixed row — is compiled in from `config/stars.ts`, so most of the page still
 * renders offline from the service worker's cache.
 */
export default async function StarsPage() {
  await requireUser();

  const now = new Date();
  const initialDateIso = toIsoDate(now);
  const weekStart = getWeekStartIso(now);

  const [pools, marks] = await Promise.all([
    getChorePools(),
    getWeekMarks(weekStart),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pt-10">
      <StarsBoard
        initialDateIso={initialDateIso}
        weekStart={weekStart}
        pools={pools}
        marks={marks}
      />
    </main>
  );
}
