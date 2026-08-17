import { describe, expect, it } from "vitest";

import { FAMILY, getPerson } from "@/config/family";
import {
  FHE_ANCHOR,
  FHE_CYCLE_LENGTH,
  FHE_LAYOUT,
  FHE_PERSON_ORDER,
  FHE_ROLES,
} from "@/config/fhe";
import { addDays, parseLocalDate, startOfWeekSunday } from "@/lib/dates";
import {
  getFheAnchorSunday,
  getFheAssignments,
  getFheRoleFor,
  getFheStatus,
  getFheSummary,
  getFheWeekOffset,
  isFheRotationDay,
} from "@/lib/fhe";

const ANCHOR = getFheAnchorSunday();

/** The Sunday `weeks` weeks after the anchor, at local noon. */
function sunday(weeks: number): Date {
  return addDays(ANCHOR, weeks * 7);
}

/** Who has what, as a plain `{ roleId: name }` object. */
function jobs(date: Date): Record<string, string> {
  return Object.fromEntries(
    getFheAssignments(date, ANCHOR).map(({ role, personId }) => [
      role.id,
      getPerson(personId).name,
    ]),
  );
}

describe("the Family Home Evening configuration", () => {
  it("anchors on a Sunday", () => {
    const parsed = parseLocalDate(FHE_ANCHOR.sunday);
    expect(parsed, `${FHE_ANCHOR.sunday} should be a valid date`).not.toBeNull();
    expect(parsed!.getDay()).toBe(0);
    // And the anchor Sunday is used as-is, not snapped to another week.
    expect(ANCHOR.getTime()).toBe(startOfWeekSunday(parsed!).getTime());
  });

  it("names the seven jobs, in the order they run down the house", () => {
    expect(FHE_ROLES.map((role) => role.label)).toEqual([
      "Opening Prayer",
      "Song",
      "Scripture",
      "Lesson",
      "Activity",
      "Treat",
      "Closing Prayer",
    ]);
    expect(FHE_CYCLE_LENGTH).toBe(7);
  });

  it("puts the whole family in it, exactly once each", () => {
    expect([...FHE_PERSON_ORDER]).toEqual([
      "nathan",
      "sarah",
      "hannah",
      "emily",
      "clara",
      "william",
      "james",
    ]);
    expect(new Set(FHE_PERSON_ORDER).size).toBe(FAMILY.length);
    for (const member of FAMILY) {
      expect(FHE_PERSON_ORDER, `${member.name} should be in the rotation`).toContain(
        member.id,
      );
    }
  });

  it("has one job per person, so nobody is doubled up or left out", () => {
    expect(FHE_ROLES).toHaveLength(FHE_PERSON_ORDER.length);
    expect(new Set(FHE_ROLES.map((role) => role.id)).size).toBe(FHE_ROLES.length);
  });
});

describe("the anchor week", () => {
  /*
   * The week the rotation started, as the family was told it: Nathan on the
   * Activity, Sarah on the Treat, and everybody else following in roster order.
   * This is the fact the whole rotation is derived from, so it is pinned here
   * rather than recomputed — an edit that moves it fails this test.
   */
  const EXPECTED = {
    "opening-prayer": "Emily",
    song: "Clara",
    scripture: "William",
    lesson: "James",
    activity: "Nathan",
    treat: "Sarah",
    "closing-prayer": "Hannah",
  };

  it("deals the jobs exactly as the family was told", () => {
    expect(jobs(sunday(0))).toEqual(EXPECTED);
  });

  it("holds all week, from Sunday through Saturday", () => {
    for (let day = 0; day < 7; day += 1) {
      expect(jobs(addDays(sunday(0), day)), `day ${day}`).toEqual(EXPECTED);
    }
  });

  it("changes on the Sunday, not on the Monday", () => {
    // Saturday still has the anchor week's jobs; the next day does not.
    expect(jobs(addDays(sunday(0), 6))).toEqual(EXPECTED);
    expect(jobs(sunday(1))).not.toEqual(EXPECTED);
    // ...and the Monday after that changeover changes nothing further.
    expect(jobs(addDays(sunday(1), 1))).toEqual(jobs(sunday(1)));
  });

  it("shows the anchor week's jobs for any date before the rotation began", () => {
    expect(getFheWeekOffset(addDays(ANCHOR, -1), ANCHOR)).toBe(0);
    expect(getFheWeekOffset(addDays(ANCHOR, -70), ANCHOR)).toBe(0);
    expect(jobs(addDays(ANCHOR, -21))).toEqual(EXPECTED);
  });
});

describe("the weekly move", () => {
  it("moves everybody down exactly one room a week", () => {
    for (let week = 0; week < 3 * FHE_CYCLE_LENGTH; week += 1) {
      for (const personId of FHE_PERSON_ORDER) {
        const thisWeek = FHE_ROLES.indexOf(getFheRoleFor(personId, sunday(week), ANCHOR));
        const nextWeek = FHE_ROLES.indexOf(
          getFheRoleFor(personId, sunday(week + 1), ANCHOR),
        );
        expect(nextWeek, `${personId}, week ${week}`).toBe(
          (thisWeek + 1) % FHE_CYCLE_LENGTH,
        );
      }
    }
  });

  it("keeps the family in the same order behind each other, forever", () => {
    for (let week = 0; week < 2 * FHE_CYCLE_LENGTH; week += 1) {
      const order = getFheAssignments(sunday(week), ANCHOR)
        // Read the rooms top to bottom, then start again at the top: the
        // family should read out in `FHE_PERSON_ORDER`, rotated.
        .map(({ personId }) => personId);
      const start = order.indexOf(FHE_PERSON_ORDER[0]);
      const rotated = [...order.slice(start), ...order.slice(0, start)];
      expect(rotated, `week ${week}`).toEqual([...FHE_PERSON_ORDER]);
    }
  });

  it("fills every job with a different person, every week", () => {
    for (let week = 0; week < 2 * FHE_CYCLE_LENGTH; week += 1) {
      const assignments = getFheAssignments(sunday(week), ANCHOR);
      expect(assignments).toHaveLength(FHE_CYCLE_LENGTH);
      expect(new Set(assignments.map((a) => a.personId)).size).toBe(FHE_CYCLE_LENGTH);
      expect(new Set(assignments.map((a) => a.role.id)).size).toBe(FHE_CYCLE_LENGTH);
    }
  });

  it("gives everyone every job exactly once per cycle, then repeats", () => {
    for (const personId of FHE_PERSON_ORDER) {
      const held = Array.from({ length: FHE_CYCLE_LENGTH }, (_, week) =>
        getFheRoleFor(personId, sunday(week), ANCHOR).id,
      );
      expect(new Set(held).size, `${personId} should do all seven`).toBe(
        FHE_CYCLE_LENGTH,
      );
      // Week eight is week one again.
      expect(getFheRoleFor(personId, sunday(FHE_CYCLE_LENGTH), ANCHOR).id).toBe(
        held[0],
      );
    }
  });

  it("never gives anyone the same job two weeks running", () => {
    for (const personId of FHE_PERSON_ORDER) {
      for (let week = 0; week < 2 * FHE_CYCLE_LENGTH; week += 1) {
        expect(getFheRoleFor(personId, sunday(week), ANCHOR).id).not.toBe(
          getFheRoleFor(personId, sunday(week + 1), ANCHOR).id,
        );
      }
    }
  });
});

describe("the status the card reads", () => {
  it("counts the week within the seven-week cycle", () => {
    expect(getFheStatus(sunday(0), ANCHOR).weekNumber).toBe(1);
    expect(getFheStatus(sunday(3), ANCHOR).weekNumber).toBe(4);
    expect(getFheStatus(sunday(6), ANCHOR).weekNumber).toBe(7);
    expect(getFheStatus(sunday(7), ANCHOR).weekNumber).toBe(1);
    expect(getFheStatus(sunday(0), ANCHOR).cycleLength).toBe(FHE_CYCLE_LENGTH);
  });

  it("runs each week Sunday through Saturday", () => {
    const status = getFheStatus(addDays(sunday(2), 3), ANCHOR);
    expect(status.weekStart.getDay()).toBe(0);
    expect(status.weekEnd.getDay()).toBe(6);
    expect(status.weekStart.getTime()).toBe(sunday(2).getTime());
    expect(status.nextRotation.getTime()).toBe(sunday(3).getTime());
  });

  it("counts down to the next Sunday in the family's own words", () => {
    expect(getFheStatus(sunday(1), ANCHOR).countdownLabel).toBe(
      "Next rotation is today",
    );
    expect(getFheStatus(addDays(sunday(1), 6), ANCHOR).countdownLabel).toBe(
      "Next rotation is tomorrow",
    );
    expect(getFheStatus(addDays(sunday(1), 3), ANCHOR).countdownLabel).toBe(
      "Next rotation is in 4 days",
    );
    expect(getFheStatus(addDays(sunday(1), 3), ANCHOR).daysUntilNextRotation).toBe(4);
    // A Sunday's next changeover is a full week away, so the countdown says
    // "today" from the day itself rather than from a zero.
    expect(getFheStatus(sunday(1), ANCHOR).daysUntilNextRotation).toBe(7);
  });

  it("knows which days are changeover days", () => {
    expect(isFheRotationDay(sunday(0))).toBe(true);
    expect(isFheRotationDay(sunday(5))).toBe(true);
    for (let day = 1; day < 7; day += 1) {
      expect(isFheRotationDay(addDays(sunday(0), day)), `day ${day}`).toBe(false);
    }
  });

  it("knows the rotation had not started before the anchor Sunday", () => {
    expect(getFheStatus(addDays(ANCHOR, -1), ANCHOR).hasStarted).toBe(false);
    expect(getFheStatus(ANCHOR, ANCHOR).hasStarted).toBe(true);
    expect(getFheStatus(sunday(4), ANCHOR).hasStarted).toBe(true);
  });

  it("describes the same jobs for screen readers as it draws", () => {
    const status = getFheStatus(sunday(2), ANCHOR);
    const lines = getFheSummary(status.assignments);

    expect(lines).toHaveLength(FHE_CYCLE_LENGTH);
    expect(lines.map((line) => line.id)).toEqual(
      FHE_ROLES.map((role) => `fhe-${role.id}`),
    );
    for (const { role, personId } of status.assignments) {
      expect(lines.map((line) => line.text)).toContain(
        `${getPerson(personId).name} has the ${role.label}.`,
      );
    }
  });
});

describe("a misconfigured rotation", () => {
  it("refuses an anchor date that is not a date at all", () => {
    // Development throws rather than guessing, because a guess would show the
    // family somebody else's week and look perfectly plausible doing it.
    expect(() => getFheAnchorSunday("the sixteenth")).toThrow(/not a valid/);
    expect(() => getFheAnchorSunday("2026-13-40")).toThrow(/config\/fhe\.ts/);
  });

  it("refuses to answer for somebody who is not in the rotation", () => {
    expect(() =>
      // @ts-expect-error — the point of the test is the runtime guard.
      getFheRoleFor("grandma", sunday(0), ANCHOR),
    ).toThrow(/FHE_PERSON_ORDER/);
  });
});

describe("the rooms in the picture", () => {
  /*
   * The same footprint arithmetic `tests/seating.test.ts` uses on the two
   * portrait scenes. Avatar sizes are in `cqh` — a percentage of the frame's
   * height — so converting to a percentage of its width needs the aspect
   * ratio, and once both are in the same units the checks below hold at every
   * screen size, because everything scales together.
   */
  const width = FHE_LAYOUT.avatarSize / FHE_LAYOUT.aspectRatio;
  const height = FHE_LAYOUT.avatarSize;
  const labelHeight = FHE_LAYOUT.fontSize * 1.6 + FHE_LAYOUT.avatarSize * 0.05;

  it("keeps every room inside the frame, name label and all", () => {
    for (const role of FHE_ROLES) {
      expect(role.spot.x - width / 2, role.label).toBeGreaterThan(0);
      expect(role.spot.x + width / 2, role.label).toBeLessThan(100);
      expect(role.spot.y - height / 2, role.label).toBeGreaterThan(0);
      expect(role.spot.y + height / 2 + labelHeight, role.label).toBeLessThan(100);
    }
  });

  it("never lets two avatars overlap", () => {
    for (let i = 0; i < FHE_ROLES.length; i += 1) {
      for (let j = i + 1; j < FHE_ROLES.length; j += 1) {
        const a = FHE_ROLES[i];
        const b = FHE_ROLES[j];
        const overlaps =
          Math.abs(a.spot.x - b.spot.x) < width &&
          Math.abs(a.spot.y - b.spot.y) < height + labelHeight;
        expect(overlaps, `${a.label} overlaps ${b.label}`).toBe(false);
      }
    }
  });

  it("brings everybody in from outside the frame", () => {
    for (const role of FHE_ROLES) {
      const outside =
        role.entry.x < 0 ||
        role.entry.x > 100 ||
        role.entry.y < 0 ||
        role.entry.y > 100;
      expect(outside, `${role.label} enters from inside the house`).toBe(true);
    }
  });

  it("uses the photograph's own shape, so the house is never cropped", () => {
    expect(FHE_LAYOUT.aspect).toBe("1672 / 940");
    expect(FHE_LAYOUT.aspectRatio).toBeCloseTo(1672 / 940, 10);
    // Landscape, unlike the two portrait seating scenes.
    expect(FHE_LAYOUT.aspectRatio).toBeGreaterThan(1);
  });
});
