import type { Metadata } from "next";

import { FingerPicker } from "@/components/picker/FingerPicker";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Finger Picker",
};

/**
 * Who goes first.
 *
 * There is nothing on this page but the game, and the game paints over the
 * whole screen — the tab bar included. See the note in `FingerPicker` for why
 * covering the navigation is the right call rather than a shortcut, and where
 * the way out went.
 *
 * The `<main>` is still here, empty, because the app's layout expects a page
 * to fill the space between the header and the tab bar and because a route
 * with no landmark at all is a hole in the document outline. It has no height
 * of its own: everything is in the fixed overlay.
 */
export default async function PickerPage() {
  await requireUser();

  return (
    <main className="flex-1">
      <h1 className="sr-only">Finger Picker</h1>
      <FingerPicker />
    </main>
  );
}
