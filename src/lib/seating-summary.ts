/**
 * Plain-language descriptions of a week's seating, for screen readers.
 *
 * These strings are the accessible equivalent of the two illustrations, so
 * they must stay accurate — they are derived from the same assignments the
 * graphics use, never written by hand.
 */

import { getPerson } from "@/config/family";
import {
  TABLE_CHILD_SEATS,
  TABLE_PARENT_SEATS,
  VEHICLE_CHILD_SEATS,
  VEHICLE_PARENT_SEATS,
} from "@/config/seating";
import type { WeeklyAssignments } from "./rotation";

export type SeatingSummaryLine = { id: string; text: string };

export function getTableSummary(
  assignments: WeeklyAssignments,
): SeatingSummaryLine[] {
  const lines: SeatingSummaryLine[] = [];

  TABLE_PARENT_SEATS.forEach((seat) => {
    const personId = assignments.tableParents[seat.key];
    const number = seat.key === "parent1" ? 1 : 2;
    lines.push({
      id: `table-${seat.key}`,
      text: `${getPerson(personId).name} is in Parent Seat ${number}, on the ${seat.label}.`,
    });
  });

  TABLE_CHILD_SEATS.forEach((seat) => {
    const childId = assignments.children[seat.position - 1].childId;
    lines.push({
      id: `table-child-${seat.position}`,
      text: `${getPerson(childId).name} is in Child Seat ${seat.position}, on the ${seat.label}.`,
    });
  });

  return lines;
}

export function getVehicleSummary(
  assignments: WeeklyAssignments,
): SeatingSummaryLine[] {
  const lines: SeatingSummaryLine[] = [];

  VEHICLE_PARENT_SEATS.forEach((seat) => {
    const personId = assignments.vehicleParents[seat.key];
    lines.push({
      id: `vehicle-${seat.key}`,
      text: `${getPerson(personId).name} is in the ${seat.label}.`,
    });
  });

  VEHICLE_CHILD_SEATS.forEach((seat) => {
    const childId = assignments.children[seat.position - 1].childId;
    lines.push({
      id: `vehicle-child-${seat.position}`,
      text: `${getPerson(childId).name} is in Child Seat ${seat.position}, in the ${seat.label}.`,
    });
  });

  return lines;
}
