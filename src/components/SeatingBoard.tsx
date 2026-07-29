"use client";

import { useMemo } from "react";

import { useCurrentDate } from "@/hooks/useCurrentDate";
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
      */}
      <div
        key={status.weekNumber}
        className="grid gap-4 sm:gap-6 lg:grid-cols-2 lg:items-start"
      >
        <DinnerTable assignments={status.assignments} swapping={swapping} />
        <Expedition assignments={status.assignments} swapping={swapping} />
      </div>
    </div>
  );
}
