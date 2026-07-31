"use client";

import { useMemo, useRef } from "react";

import { useCurrentDate } from "@/hooks/useCurrentDate";
import { useImagesReady } from "@/hooks/useImagesReady";
import { useParentSwap } from "@/hooks/useParentSwap";
import { getRotationStatus } from "@/lib/rotation";

import { AppHeader } from "./AppHeader";
import { DinnerTable } from "./DinnerTable";
import { Expedition } from "./Expedition";
import { RotationStatus } from "./RotationStatus";

/**
 * The one interactive island on the page.
 *
 * It exists as a client component for a single reason: the assignments depend
 * on the *device's* local date, and they must update at local midnight without
 * a reload. Everything it renders is a plain, pure component.
 */
export function SeatingBoard({ initialDateIso }: { initialDateIso: string }) {
  const date = useCurrentDate(initialDateIso);
  const { swapped, swapping, toggle } = useParentSwap();
  const status = useMemo(
    () => getRotationStatus(date, undefined, { swapParents: swapped }),
    [date, swapped],
  );

  // Keyed on the week so a rollover re-measures: those scenes remount with a
  // fresh set of <img> elements.
  const scenes = useRef<HTMLDivElement>(null);
  const arriving = useImagesReady(scenes, { key: status.weekNumber });

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <AppHeader
        date={date}
        status={status}
        parentsSwapped={swapped}
        onSwapParents={toggle}
      />
      <RotationStatus status={status} />

      {/*
        `key` is the week number: when the rotation rolls over, the scenes
        remount and everyone walks in and takes their new seat again.
        Swapping the parents deliberately does *not* remount — that way the
        two of them glide across rather than starting over.

        `ref` + `useImagesReady` hold the walk-in until all fourteen avatars
        have loaded, so nobody crosses the room as an empty circle. The images
        are in the DOM from the first paint (transparent, via `.seat-arrival`),
        so they are downloading the whole time this is waiting.
      */}
      <div
        key={status.weekNumber}
        ref={scenes}
        className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start"
      >
        <DinnerTable
          assignments={status.assignments}
          swapping={swapping}
          arriving={arriving}
        />
        <Expedition
          assignments={status.assignments}
          swapping={swapping}
          arriving={arriving}
        />
      </div>
    </div>
  );
}
