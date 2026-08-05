import "server-only";

import { cache } from "react";
import type { Collection, ObjectId } from "mongodb";

import { COLLECTIONS } from "@/config/db";
import { CHILD_IDS, type ChildId } from "@/config/family";
import { STAR_DAY_COUNT, isStarTaskId } from "@/config/stars";
import { getCollection } from "@/lib/db";

import type { StarMarks, WeekMarks } from "./counting";

/**
 * The `starWeeks` collection — every star anybody has ever coloured in.
 *
 * ---------------------------------------------------------------------------
 * ONE DOCUMENT PER CHILD PER WEEK
 * ---------------------------------------------------------------------------
 *   { childId: "clara", weekStart: "2026-08-03",
 *     marks: { "tidy-room": [true, true, false, false, false], ... } }
 *
 * The week is the unit because the paper chart is: a row of five is what earns
 * the weekly reward, and "did Clara fill a row" is then a property of one
 * document rather than a query across five. Rendering the page is five small
 * documents, and the weekly report is the same five for an older Monday.
 *
 * A document per *mark* would be 25-140 rows a week and a group-by every time
 * anybody opened the page. A document per child would grow without limit and
 * would have to be trimmed by hand.
 *
 * A task the child has never ticked simply has no key, so adding, renaming or
 * retiring a chore never needs a migration — which is the other reason task
 * ids in `config/stars.ts` must never be reused for something else.
 */

export type StarWeekDocument = {
  _id: ObjectId;
  childId: string;
  /** The Monday of the week, `YYYY-MM-DD`, from `startOfWeekMonday()`. */
  weekStart: string;
  marks: Record<string, unknown>;
  updatedAt: Date;
};

async function starWeeks(): Promise<Collection<StarWeekDocument>> {
  return getCollection<StarWeekDocument>(COLLECTIONS.starWeeks);
}

/** Every child's marks for the week beginning `weekStart` (`YYYY-MM-DD`). */
export const getWeekMarks = cache(
  async (weekStart: string): Promise<WeekMarks> => {
    const empty = blankWeek();

    let documents: StarWeekDocument[];
    try {
      const collection = await starWeeks();
      documents = await collection.find({ weekStart }).toArray();
    } catch (error) {
      // An unreachable database must not blank the page — the chart still
      // renders, with nothing ticked, and the tick itself will report its own
      // failure when somebody tries.
      console.warn(
        `[stars] Could not read marks for the week of ${weekStart}: ` +
          `${describe(error)}. Showing an empty chart.`,
      );
      return empty;
    }

    for (const document of documents) {
      if (!isChildId(document.childId)) continue;
      empty[document.childId] = normaliseMarks(document.marks);
    }
    return empty;
  },
);

/**
 * Tick or untick one star.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A PIPELINE UPDATE
 * ---------------------------------------------------------------------------
 * The obvious `$set: { "marks.tidy-room.2": true }` has a trap in it: when
 * `marks.tidy-room` does not exist yet, MongoDB creates it as the *object*
 * `{ "2": true }` rather than as an array, because a dotted path cannot tell
 * the two apart. The very first star of the week would therefore be stored in
 * a shape nothing else can read.
 *
 * The aggregation pipeline below rebuilds the whole row instead — five
 * elements, each either the new value or whatever was there before — so the
 * row is an array of exactly five booleans whether the document, the task, or
 * neither, existed a moment ago. It is still a single atomic update, so two
 * children ticking different stars at once cannot clobber each other.
 */
export async function setStarMark(
  childId: ChildId,
  weekStart: string,
  taskId: string,
  dayIndex: number,
  value: boolean,
): Promise<void> {
  // Both of these are load-bearing, not belt-and-braces: `taskId` becomes a
  // *field name* below, so an unchecked one could write anywhere in the
  // document, and an out-of-range day would silently lengthen the row.
  if (!isStarTaskId(taskId)) {
    throw new Error(`Unknown star task: "${taskId}".`);
  }
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= STAR_DAY_COUNT) {
    throw new Error(
      `Day ${dayIndex} is outside the ${STAR_DAY_COUNT}-day week.`,
    );
  }

  const collection = await starWeeks();
  const existing = `$marks.${taskId}`;

  await collection.updateOne(
    { childId, weekStart },
    [
      {
        $set: {
          marks: {
            $mergeObjects: [
              { $ifNull: ["$marks", {}] },
              {
                [taskId]: {
                  $map: {
                    input: { $range: [0, STAR_DAY_COUNT] },
                    as: "day",
                    in: {
                      $cond: [
                        { $eq: ["$$day", dayIndex] },
                        value,
                        {
                          $eq: [
                            true,
                            {
                              $arrayElemAt: [
                                { $ifNull: [existing, []] },
                                "$$day",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  },
                },
              },
            ],
          },
          updatedAt: "$$NOW",
        },
      },
    ],
    { upsert: true },
  );
}

/* ------------------------------------------------------------------ */
/* Reading is forgiving                                                */
/* ------------------------------------------------------------------ */

/**
 * Coerce whatever is in the document into rows of exactly five booleans.
 *
 * Unknown task ids are dropped rather than kept: a chore that has been retired
 * from `config/stars.ts` should not come back onto a chart because somebody
 * ticked it in March.
 */
function normaliseMarks(raw: Record<string, unknown>): StarMarks {
  const marks: StarMarks = {};
  if (!raw || typeof raw !== "object") return marks;

  for (const [taskId, row] of Object.entries(raw)) {
    if (!isStarTaskId(taskId)) continue;
    const source = Array.isArray(row) ? row : [];
    marks[taskId] = Array.from(
      { length: STAR_DAY_COUNT },
      (_, day) => source[day] === true,
    );
  }
  return marks;
}

function blankWeek(): WeekMarks {
  return Object.fromEntries(CHILD_IDS.map((id) => [id, {}])) as WeekMarks;
}

function isChildId(value: string): value is ChildId {
  return (CHILD_IDS as readonly string[]).includes(value);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
