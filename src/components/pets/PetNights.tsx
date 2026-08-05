"use client";

import { useMemo, useRef } from "react";

import { getPerson } from "@/config/family";
import { getPet, type PetRotationConfig } from "@/config/pets";
import { useImagesReady } from "@/hooks/useImagesReady";
import { addDays } from "@/lib/dates";
import { getPetNights } from "@/lib/pets/rotation";

import { PetCard } from "./PetCard";

/**
 * Tonight's pets, beneath the dinner table and the Expedition.
 *
 * The seating above rotates every Monday; this rotates every night, so it is
 * its own section rather than a third scene card. It is a client component for
 * the same reason `SeatingBoard` is: the answer depends on the *device's*
 * local date and has to change at local midnight without a reload.
 *
 * The configuration comes from MongoDB and is handed down from the page —
 * see `src/lib/pets/store.ts`. Nothing here queries anything.
 */
export function PetNights({
  configs,
  date,
}: {
  configs: readonly PetRotationConfig[];
  date: Date;
}) {
  const tonight = useMemo(() => getPetNights(configs, date), [configs, date]);
  const tomorrow = useMemo(
    () => getPetNights(configs, addDays(date, 1)),
    [configs, date],
  );

  // Keyed on the day: at midnight the cards remount and the children walk in
  // to their new animal, exactly as the seating scenes do on a Monday.
  const cards = useRef<HTMLDivElement>(null);
  const arriving = useImagesReady(cards, { key: tonight.map((n) => n.childId).join() });

  return (
    <section aria-labelledby="pet-nights-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="pet-nights-heading" className="text-lg font-bold tracking-tight sm:text-xl">
          Tonight&rsquo;s Pets
        </h2>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Changes every night
        </p>
      </div>

      <div
        key={tonight.map((night) => night.childId).join("-")}
        ref={cards}
        className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start"
      >
        {tonight.map((night, index) => (
          <PetCard
            key={night.petId}
            pet={getPet(night.petId)}
            childId={night.childId}
            tomorrowChildId={tomorrow[index].childId}
            date={date}
            arrivalIndex={index}
            arriving={arriving}
            priority={index === 0}
          />
        ))}
      </div>

      {/* The accessible equivalent of the two pictures above. */}
      <div className="sr-only">
        <h3>Who sleeps with which pet tonight</h3>
        <ul>
          {tonight.map((night) => (
            <li key={night.petId}>
              {getPerson(night.childId).name} sleeps with{" "}
              {getPet(night.petId).name} the{" "}
              {getPet(night.petId).species.toLowerCase()}.
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
