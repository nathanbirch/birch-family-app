import type { Metadata } from "next";

import { SeatingBoard } from "@/components/SeatingBoard";
import { requireUser } from "@/lib/auth/dal";
import { toIsoDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Seating Rotation",
};

/**
 * The seating rotation.
 *
 * This was the whole app until the dashboard arrived; it now lives at
 * `/seating` and reached from the Seats tab. The board itself is unchanged —
 * it is still handed an initial date so the first paint shows real
 * assignments before JavaScript runs.
 */
export default async function SeatingPage() {
  await requireUser();
  const initialDateIso = toIsoDate(new Date());

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-6 pt-5 sm:px-6 sm:pt-8">
      <SeatingBoard initialDateIso={initialDateIso} />
      <p
        className="mt-6 text-center text-xs"
        style={{ color: "var(--color-text-muted)" }}
      >
        Seats change every Monday
      </p>
    </main>
  );
}
