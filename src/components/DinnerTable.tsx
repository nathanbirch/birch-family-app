import {
  TABLE_CHILD_SEATS,
  TABLE_LAYOUT,
  TABLE_PARENT_SEATS,
} from "@/config/seating";
import type { WeeklyAssignments } from "@/lib/rotation";
import { getTableSummary } from "@/lib/seating-summary";

import { SceneCard } from "./SceneCard";
import { ScenePhoto } from "./ScenePhoto";
import { SceneSeats } from "./SceneSeats";

/**
 * The family's dinner table, photographed from above.
 *
 *   Parent 1                   Parent 2
 *   Child 1       table        Child 3
 *   Child 2                    Child 4
 *                              Child 5
 *
 * Parents take the top of each bench, across from one another; the left bench
 * seats three and the right bench seats four.
 */
export function DinnerTable({
  assignments,
  swapping,
  arriving,
}: {
  assignments: WeeklyAssignments;
  swapping: boolean;
  /** `true` once every photograph has loaded and people may walk in. */
  arriving: boolean;
}) {
  return (
    <SceneCard
      title="Dinner Table"
      icon={<PlateIcon />}
      aspect={TABLE_LAYOUT.aspect}
      summaryTitle="Dinner table seating this week"
      summary={getTableSummary(assignments)}
      scene={<ScenePhoto src={TABLE_LAYOUT.photo} priority />}
    >
      <SceneSeats
        layout={TABLE_LAYOUT}
        parentSeats={TABLE_PARENT_SEATS}
        childSeats={TABLE_CHILD_SEATS}
        parents={assignments.tableParents}
        childIds={assignments.children.map((entry) => entry.childId)}
        swapping={swapping}
        arriving={arriving}
      />
    </SceneCard>
  );
}

function PlateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="12"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeOpacity="0.6"
      />
    </svg>
  );
}
