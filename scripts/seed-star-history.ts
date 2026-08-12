/**
 * Back-fills two finished weeks of star charts, transcribed off photographs.
 *
 *   npm run db:seed-history
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR, AND WHY IT IS NOT `db:seed`
 * ---------------------------------------------------------------------------
 * `db:seed` sets up a database: indexes, the login account, the rotations. It
 * is run after a clone and again whenever a collection is added, and it never
 * overwrites anything a person has since changed.
 *
 * This is the opposite kind of script. It is a *one-off transcription* of two
 * particular weeks off two sets of photographs of the fridge, and re-running it
 * replaces those two weeks with what is written below. It is committed rather
 * than run once and thrown away for one reason: the table below is the only
 * record of what those photographs said, and a table in the repository can be
 * corrected by whoever spots the mistake. A bare `updateOne` typed into a shell
 * cannot.
 *
 * ---------------------------------------------------------------------------
 * THE TWO WEEKS
 * ---------------------------------------------------------------------------
 * The database's earliest week was 3 August 2026, so these are the two before
 * it: the weeks of 20 and 27 July. The photographs are of the laminated charts
 * partway through a week — most rows show one or two days coloured in, which is
 * what a chart photographed on a Tuesday looks like, and the transcription says
 * so rather than tidying it into a full week.
 *
 * **Which set of photographs is which week is a guess.** Both are of the same
 * three laminated sheets and neither has a date written in the "WEEK OF" box.
 * The two sets are assigned in the order they were taken. If they are the wrong
 * way round, swap the two `weekStart` values below and re-run — nothing else
 * needs to change.
 *
 * ---------------------------------------------------------------------------
 * THE CHORE ROTATION ONCE DISAGREED WITH THESE PHOTOGRAPHS
 * ---------------------------------------------------------------------------
 * Read this before wondering why the transcription is stubbornly literal.
 *
 * The printed chart has each child's chores printed *on* it, so the photographs
 * show the same assignment in July that they show in August: the living room is
 * Clara's, the dishwasher is Emily's, the kitchen island is Hannah's. The app
 * used to extrapolate a *different* July deal backwards from its anchor — the
 * living room was Hannah's, the dishwasher was Clara's, and so on.
 *
 * The marks below are transcribed **as photographed**, because that is what
 * actually happened, and for a while it cost fourteen stars: `buildWeekReport`
 * counts only the tasks the rotation says were that child's, so those stars sat
 * in the database uncounted rather than being awarded to somebody who had not
 * done the job.
 *
 * The rotation no longer runs backwards past its anchor — every earlier week
 * uses the anchor's own deal, which is exactly what the laminate shows — so all
 * fourteen count. Keep the transcription literal: it is the photographs that
 * are the evidence, and the rotation that has to fit them.
 */

import { MongoClient } from "mongodb";

import { COLLECTIONS, DB_NAME } from "../src/config/db";
import { CHILD_IDS, type ChildId } from "../src/config/family";
import { STAR_DAY_COUNT, getStarTask } from "../src/config/stars";

/* -------------------------------------------------------------------------- */
/* The transcription                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One week off the fridge.
 *
 * Days are written as a five-character string, Monday first: `#` is a star
 * coloured in, `.` is one left empty. It is deliberately not an array of
 * booleans — `"##..."` can be checked against a photograph at a glance, and
 * `[true, true, false, false, false]` cannot.
 *
 * A row nobody coloured in at all is simply left out. A task with no key is
 * indistinguishable from a task with five empty days, both here and in
 * `marks.ts`, and leaving them out keeps the table down to what the photographs
 * actually show.
 */
type Week = {
  weekStart: string;
  /** What the photographs were of, for whoever reads this next. */
  note: string;
  children: Partial<Record<ChildId, Record<string, string>>>;
};

const WEEKS: readonly Week[] = [
  {
    weekStart: "2026-07-20",
    note: "First set of photographs: learning, hygiene, chores.",
    children: {
      hannah: {
        "tidy-room": "##.##",
        "kitchen-island": "#....",
        "bath-trash": "##...",
        "laundry-upstairs": "#...#",
        piano: "##...",
        "wash-hands-bathroom": "#####",
        // The row is crossed out on the laminate and "Shower" written under
        // it. Transcribed against the printed row it replaces, because that is
        // the row the app has; if the shower is meant to be a task of its own
        // it needs an id in `config/stars.ts` first.
        "wash-hands-dinner": "#.#..",
        "brush-morning": "##...",
        "brush-floss-bed": ".#...",
      },
      emily: {
        "wash-hands-bathroom": "#....",
        "wash-hands-dinner": "#....",
      },
      clara: {
        "tidy-room": "#....",
        "pick-up-living-room": ".#...",
        piano: "#....",
        "wash-hands-bathroom": "#....",
        "brush-morning": "#....",
      },
      // The two youngest have nothing coloured in on any of the three charts
      // in this set. Their documents are still written, so the week is a week
      // they were on rather than a week they are missing from.
      william: {},
      james: {},
    },
  },
  {
    weekStart: "2026-07-27",
    note: "Second set of photographs: learning, hygiene, chores.",
    children: {
      hannah: {
        "tidy-room": "##...",
        "kitchen-island": "#....",
        "bath-trash": "##...",
        "laundry-upstairs": "#....",
        "ixl-math": "#....",
        "ixl-language-arts": "#....",
        "reading-40": "##...",
        piano: "##...",
        "wash-hands-bathroom": "##...",
        "wash-hands-dinner": "#....",
        "brush-morning": ".#...",
      },
      emily: {
        "tidy-room": "##...",
        dishwasher: "#....",
        "yard-pickup": ".#...",
        "laundry-upstairs": "#....",
        "wash-hands-bathroom": "##...",
      },
      clara: {
        "tidy-room": "##...",
        "pick-up-living-room": "##...",
        "vacuum-living-room": "##...",
        "laundry-upstairs": "##...",
      },
      william: {
        "tidy-room": ".#...",
        piano: "#....",
      },
      james: {
        "tidy-room": "##...",
        "feed-bella": "#....",
        "pick-up-toys": ".#...",
      },
    },
  },
] as const;

/* -------------------------------------------------------------------------- */

/** `"##..."` -> `[true, true, false, false, false]`. */
function parseRow(taskId: string, row: string): boolean[] {
  if (row.length !== STAR_DAY_COUNT) {
    fail(
      `"${taskId}" has ${row.length} days ("${row}"), and a week is ` +
        `${STAR_DAY_COUNT}. One character per day, Monday first.`,
    );
  }
  return Array.from(row, (character, day) => {
    if (character !== "#" && character !== ".") {
      fail(
        `"${taskId}" has "${character}" at day ${day} ("${row}"). ` +
          `Only "#" (coloured in) and "." (empty) mean anything here.`,
      );
    }
    return character === "#";
  });
}

/**
 * Everything that must be true of the table above before it is written.
 *
 * Checked up front, in full, rather than as each document goes in: a typo in
 * the last row should not leave the first week written and the second not.
 */
function build(week: Week) {
  const documents = [];

  for (const [childId, rows] of Object.entries(week.children)) {
    if (!(CHILD_IDS as readonly string[]).includes(childId)) {
      fail(`"${childId}" is not one of the children. Check config/family.ts.`);
    }

    const marks: Record<string, boolean[]> = {};
    for (const [taskId, row] of Object.entries(rows ?? {})) {
      // The same check the Server Action makes, and for a sharper reason here:
      // a task id becomes a *field name* in the document, so a mistyped one
      // would be written and then silently dropped on every read for ever.
      if (!getStarTask(taskId)) {
        fail(
          `"${taskId}" (${childId}, week of ${week.weekStart}) is not a task ` +
            `in config/stars.ts. Retired rows cannot be back-filled — the ` +
            `chart no longer has them.`,
        );
      }
      marks[taskId] = parseRow(taskId, row);
    }

    documents.push({ childId, weekStart: week.weekStart, marks });
  }

  return documents;
}

function stars(marks: Record<string, boolean[]>): number {
  return Object.values(marks).flat().filter(Boolean).length;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    fail(
      "MONGODB_URI is not set.\n" +
        "  This script reads .env via `tsx --env-file`. See .env.example.",
    );
  }

  // Every week validated before a single one is written.
  const planned = WEEKS.map((week) => ({ week, documents: build(week) }));

  console.log(`Connecting to cluster…`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  console.log(`Connected. Using database "${DB_NAME}".\n`);

  try {
    const starWeeks = client.db(DB_NAME).collection(COLLECTIONS.starWeeks);

    for (const { week, documents } of planned) {
      console.log(`${week.weekStart} — ${week.note}`);

      for (const document of documents) {
        /*
         * `$set` on the whole `marks` object, keyed on the pair the unique
         * index covers. This *replaces* the week rather than merging into it,
         * which is what makes re-running the script after a correction give
         * the table below rather than the union of every version of it.
         */
        await starWeeks.updateOne(
          { childId: document.childId, weekStart: document.weekStart },
          { $set: { marks: document.marks, updatedAt: new Date() } },
          { upsert: true },
        );

        const count = stars(document.marks);
        console.log(
          `  ✓ ${document.childId.padEnd(8)} ${String(count).padStart(2)} ` +
            `star${count === 1 ? "" : "s"}`,
        );
      }
      console.log();
    }

    console.log(
      "Done. Both weeks are finished weeks, so each has a ceremony at\n" +
        "  /ceremonies/<week>\n\n" +
        "Both fall before the chore rotation's anchor, so they are counted\n" +
        "against the deal printed on the laminate — see the note at the top of\n" +
        "this file.",
    );
  } finally {
    await client.close();
  }
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
