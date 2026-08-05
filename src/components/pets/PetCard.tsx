import Image from "next/image";

import { getPerson } from "@/config/family";
import type { ChildId } from "@/config/family";
import { PET_PHOTO_HEIGHT, PET_PHOTO_WIDTH } from "@/config/pet-manifest";
import type { Pet } from "@/config/pets";
import { formatLongDate, toIsoDate } from "@/lib/dates";

import { Avatar } from "../Avatar";
import { SceneFrame, Seat } from "../Seat";

/**
 * One animal, and the child sleeping with it tonight.
 *
 * The photograph is a cut-out on a fixed 3:2 canvas — see
 * `scripts/optimise-pets.mjs` — which is what lets the child's avatar be
 * pinned at a percentage of the frame and land on the animal's back at every
 * screen size. `object-contain` rather than `object-cover`: the canvas already
 * has the right shape, and containing it means a tall phone can never crop an
 * ear off.
 */

/** Avatar diameter, in container-query height units of the photo frame. */
export const PET_AVATAR_SIZE = 30;

/** Base text size inside the avatar, in the same units. */
export const PET_FONT_SIZE = 5;

export function PetCard({
  pet,
  childId,
  tomorrowChildId,
  date,
  /** Position in the arrival order across the whole section. */
  arrivalIndex,
  /** `true` once every photograph has loaded and the child may walk in. */
  arriving,
  /** Load this card's photograph eagerly. Only the first one needs it. */
  priority = false,
}: {
  pet: Pet;
  childId: ChildId;
  tomorrowChildId: ChildId;
  date: Date;
  arrivalIndex: number;
  arriving: boolean;
  priority?: boolean;
}) {
  const child = getPerson(childId);
  const tomorrow = getPerson(tomorrowChildId);

  return (
    <section className="app-card themed-transition animate-soft-rise overflow-hidden">
      <header className="flex items-center gap-2.5 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "var(--color-surface-muted)",
            color: "var(--color-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <PawIcon />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight sm:text-xl">
            {pet.name}
          </h3>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {pet.species}
          </p>
        </div>
      </header>

      <div className="px-3 pb-4 pt-2 sm:px-5">
        <SceneFrame aspect={`${PET_PHOTO_WIDTH} / ${PET_PHOTO_HEIGHT}`}>
          <Image
            src={pet.photo}
            alt={pet.alt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 480px, 100vw"
            className="object-contain"
          />
          <Seat
            x={pet.avatarSpot.x}
            y={pet.avatarSpot.y}
            size={PET_AVATAR_SIZE}
            fontSize={PET_FONT_SIZE}
            // The child comes in from the foot of the bed, so to speak: up
            // from below the frame rather than in from a doorway.
            entry={{ id: `${pet.id}-below`, x: pet.avatarSpot.x, y: 135 }}
            arrivalIndex={arrivalIndex}
          >
            <Avatar member={child} arriving={arriving} />
          </Seat>
        </SceneFrame>
      </div>

      <p
        className="border-t px-5 py-3 text-sm sm:px-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-surface-muted)",
          color: "var(--color-text-muted)",
        }}
      >
        <strong style={{ color: "var(--color-text)" }}>{child.name}</strong>{" "}
        sleeps with {pet.name} tonight,{" "}
        <time dateTime={toIsoDate(date)}>{formatLongDate(date)}</time>. Tomorrow
        it is {tomorrow.name}&rsquo;s turn.
      </p>
    </section>
  );
}

function PawIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <ellipse cx="8" cy="7.5" rx="2.1" ry="2.8" fill="currentColor" />
      <ellipse cx="16" cy="7.5" rx="2.1" ry="2.8" fill="currentColor" />
      <ellipse cx="4.4" cy="12.6" rx="2" ry="2.4" fill="currentColor" />
      <ellipse cx="19.6" cy="12.6" rx="2" ry="2.4" fill="currentColor" />
      <path
        d="M12 11.4c3.1 0 5.6 2.4 5.6 5 0 2-1.6 3.1-3.4 3.1-1 0-1.6-.4-2.2-.4s-1.2.4-2.2.4c-1.8 0-3.4-1.1-3.4-3.1 0-2.6 2.5-5 5.6-5Z"
        fill="currentColor"
      />
    </svg>
  );
}
