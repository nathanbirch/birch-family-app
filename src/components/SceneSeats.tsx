import { FAMILY, getPerson, type PersonId } from "@/config/family";
import type { ChildSeat, ParentSeat, SceneLayout } from "@/config/seating";
import type { ParentPair } from "@/config/seating";

import { Avatar } from "./Avatar";
import { Seat } from "./Seat";

/** Roster order, used to keep the rendered order of seats stable. */
const ROSTER_ORDER = new Map(FAMILY.map((member, index) => [member.id, index]));

type SeatPlacement = {
  personId: PersonId;
  seat: ParentSeat | ChildSeat;
  /** Position in the arrival order: parents first, then children 1 to 5. */
  arrivalIndex: number;
  isParent: boolean;
};

/**
 * Renders the seven people of one scene.
 *
 * Two orderings are at play and they are deliberately different:
 *
 *  - **Arrival order** is seat order — both parents, then child positions 1 to
 *    5 — so the two scenes fill up in step with each other.
 *  - **Render order** is roster order, which never changes. Keeping the DOM
 *    order fixed means swapping the parents reorders nothing, so no element is
 *    moved in the tree and no CSS animation is interrupted mid-flight.
 *
 * Each seat is keyed by *person*. That is what lets a parent glide to the
 * other seat rather than blinking into it.
 */
export function SceneSeats({
  layout,
  parentSeats,
  childSeats,
  parents,
  childIds,
  swapping,
  arriving,
}: {
  layout: SceneLayout;
  parentSeats: readonly ParentSeat[];
  childSeats: readonly ChildSeat[];
  parents: ParentPair;
  /** Child ids by position, 1 to 5. */
  childIds: readonly PersonId[];
  /** `true` while the parents are trading places. */
  swapping: boolean;
  /** `true` once every photograph has loaded and people may walk in. */
  arriving: boolean;
}) {
  const placements: SeatPlacement[] = [
    ...parentSeats.map((seat, index) => ({
      personId: parents[seat.key],
      seat,
      arrivalIndex: index,
      isParent: true,
    })),
    ...childSeats.map((seat) => ({
      personId: childIds[seat.position - 1],
      seat,
      arrivalIndex: parentSeats.length + seat.position - 1,
      isParent: false,
    })),
  ].sort(
    (a, b) =>
      (ROSTER_ORDER.get(a.personId) ?? 0) - (ROSTER_ORDER.get(b.personId) ?? 0),
  );

  return (
    <>
      {placements.map((placement) => (
        <Seat
          key={placement.personId}
          x={placement.seat.x}
          y={placement.seat.y}
          size={layout.avatarSize}
          fontSize={layout.fontSize}
          entry={placement.seat.entry}
          arrivalIndex={placement.arrivalIndex}
          arcing={swapping && placement.isParent}
        >
          <Avatar member={getPerson(placement.personId)} arriving={arriving} />
        </Seat>
      ))}
    </>
  );
}
