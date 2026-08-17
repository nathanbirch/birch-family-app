import { getPerson } from "@/config/family";
import { FHE_LAYOUT } from "@/config/fhe";
import { formatLongDate, toIsoDate } from "@/lib/dates";
import { getFheSummary, type FheStatus } from "@/lib/fhe";

import { Avatar } from "../Avatar";
import { SceneCard } from "../SceneCard";
import { ScenePhoto } from "../ScenePhoto";
import { Seat } from "../Seat";

/**
 * The cutaway of the house, with everybody standing in the room whose job they
 * have this week.
 *
 * Full width and landscape, under the two seating scenes and above the pets: it
 * is a picture of the whole house, so it is as wide as the table and the
 * Expedition are side by side rather than sharing a column with either.
 *
 * The room names are painted into the photograph, so nothing here labels them
 * again — the only thing drawn on top is the seven people. Which room each
 * avatar stands in comes from `config/fhe.ts`; who is in it comes from
 * `lib/fhe.ts`. This component decides neither.
 */
export function FamilyHomeEvening({
  status,
  arriving,
}: {
  status: FheStatus;
  /** `true` once every photograph has loaded and people may walk in. */
  arriving: boolean;
}) {
  return (
    <SceneCard
      title="Family Home Evening"
      icon={<HouseIcon />}
      aspect={FHE_LAYOUT.aspect}
      summaryTitle="Family Home Evening jobs this week"
      summary={getFheSummary(status.assignments)}
      scene={<ScenePhoto src={FHE_LAYOUT.photo} />}
      footer={
        <>
          This is the rotation for the week of{" "}
          <time dateTime={toIsoDate(status.weekStart)}>
            {formatLongDate(status.weekStart)}
          </time>
          .{" "}
          <strong style={{ color: "var(--color-text)" }}>
            {status.countdownLabel}
          </strong>
          .
        </>
      }
    >
      {/*
        Rendered in role order, which is the order the rooms run down the
        picture: the arrival index is the index in that list, so the house
        fills from the top floor down. Keyed by *person* rather than by room,
        matching `SceneSeats` — a job changing hands should move the same
        element, not swap two.
      */}
      {status.assignments.map(({ role, personId }, index) => (
        <Seat
          key={personId}
          x={role.spot.x}
          y={role.spot.y}
          size={FHE_LAYOUT.avatarSize}
          fontSize={FHE_LAYOUT.fontSize}
          entry={role.entry}
          arrivalIndex={index}
        >
          <Avatar member={getPerson(personId)} arriving={arriving} />
        </Seat>
      ))}
    </SceneCard>
  );
}

function HouseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3.5 10.8 12 4l8.5 6.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.6 11.4V19.5h12.8V11.4"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 19.5v-4.6h3.6v4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
