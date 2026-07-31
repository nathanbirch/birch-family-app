import {
  VEHICLE_CHILD_SEATS,
  VEHICLE_LAYOUT,
  VEHICLE_PARENT_SEATS,
} from "@/config/seating";
import type { WeeklyAssignments } from "@/lib/rotation";
import { getVehicleSummary } from "@/lib/seating-summary";

import { SceneCard } from "./SceneCard";
import { ScenePhoto } from "./ScenePhoto";
import { SceneSeats } from "./SceneSeats";

/**
 * The Expedition interior, photographed from above.
 *
 *   Driver                 Front passenger
 *   Child 2    Child 4    Child 5      (second row)
 *   Child 1               Child 3      (third row)
 *
 * The child numbers are inverted relative to the dinner table on purpose — see
 * the Expedition section of `config/seating.ts`.
 */
export function Expedition({
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
      title="Ford Expedition"
      icon={<SteeringIcon />}
      aspect={VEHICLE_LAYOUT.aspect}
      summaryTitle="Ford Expedition seating this week"
      summary={getVehicleSummary(assignments)}
      scene={<ScenePhoto src={VEHICLE_LAYOUT.photo} />}
    >
      <SceneSeats
        layout={VEHICLE_LAYOUT}
        parentSeats={VEHICLE_PARENT_SEATS}
        childSeats={VEHICLE_CHILD_SEATS}
        parents={assignments.vehicleParents}
        childIds={assignments.children.map((entry) => entry.childId)}
        swapping={swapping}
        arriving={arriving}
      />
    </SceneCard>
  );
}

function SteeringIcon() {
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
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path
        d="M4 11.2 H9.8 M14.2 11.2 H20 M12 14.2 V20.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
