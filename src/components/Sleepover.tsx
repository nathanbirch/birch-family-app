import {
  SLEEPOVER_CHILD_SEATS,
  SLEEPOVER_LAYOUT,
  SLEEPOVER_PARENTS,
  SLEEPOVER_PARENT_SEATS,
} from "@/config/seating";
import type { WeeklyAssignments } from "@/lib/rotation";
import { getSleepoverSummary } from "@/lib/seating-summary";

import { SceneCard } from "./SceneCard";
import { ScenePhoto } from "./ScenePhoto";
import { SceneSeats } from "./SceneSeats";

/**
 * Family sleepover night: the five kids on camping mats on the floor, with
 * Nathan and Sarah pictured on the bed above them for reference.
 *
 * Uses the same five-week schedule as the Dinner Table and the Expedition —
 * `assignments` is the very same `WeeklyAssignments` passed to those two, so
 * all three rotations turn over together. Nathan and Sarah are fixed on the
 * bed; there's no swap toggle here the way the table and car have one, since
 * there's only one bed to put them on.
 */
export function Sleepover({
  assignments,
  arriving,
}: {
  assignments: WeeklyAssignments;
  /** `true` once every photograph has loaded and people may walk in. */
  arriving: boolean;
}) {
  return (
    <SceneCard
      title="Sleepover Night"
      icon={<MoonIcon />}
      aspect={SLEEPOVER_LAYOUT.aspect}
      summaryTitle="Sleepover floor spots this week"
      summary={getSleepoverSummary(assignments)}
      scene={<ScenePhoto src={SLEEPOVER_LAYOUT.photo} />}
    >
      <SceneSeats
        layout={SLEEPOVER_LAYOUT}
        parentSeats={SLEEPOVER_PARENT_SEATS}
        childSeats={SLEEPOVER_CHILD_SEATS}
        parents={SLEEPOVER_PARENTS}
        childIds={assignments.children.map((entry) => entry.childId)}
        swapping={false}
        arriving={arriving}
      />
    </SceneCard>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M15.5 4.5a8 8 0 1 0 4 12.9 6.3 6.3 0 0 1-4-12.9Z"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
