/**
 * School documents: permission slips, class handouts, lunch menus — anything
 * that comes home from school as a single page worth keeping.
 *
 * Modelled the same way the health lists and mantras are: a plain array
 * compiled into the app, not a database collection. These are added the way
 * a photo is taken — one at a time, by a parent, off a phone — not the way a
 * chore or a coin balance changes on its own. `docs/school.md` has the
 * "how to add one" steps.
 */

import type { ChildId } from "./family";
import { DOCUMENT_SOURCES, type DocumentImageId } from "./document-manifest";

export type SchoolDocument = {
  id: DocumentImageId;
  title: string;
  /** One line, shown on the card before it's opened. */
  description: string;
  /**
   * Which children this applies to. `"all"` means every child, not every
   * family member — a permission slip is never really about the parents.
   */
  childIds: readonly ChildId[] | "all";
};

export const SCHOOL_DOCUMENTS: readonly SchoolDocument[] = [
  {
    id: "first-grade-welcome",
    title: "Welcome to First Grade",
    description:
      "Homework, birthdays, snacks and the weekly schedule for William's class.",
    childIds: ["william"],
  },
  {
    id: "mms-lunch-menu",
    title: "Middle School Lunch Menu",
    description: "The 2026-27 breakfast and lunch menu for grades 5-6.",
    childIds: ["hannah"],
  },
  {
    id: "elementary-lunch-menu",
    title: "Elementary Lunch Menu",
    description: "The 2026-27 breakfast and lunch menu for grades 1-4.",
    childIds: ["emily", "clara", "william"],
  },
] as const;

/** The document's image, in both sizes. */
export function documentImages(doc: SchoolDocument) {
  return DOCUMENT_SOURCES[doc.id];
}

/** Whether `doc` applies to `childId`. */
export function documentAppliesTo(doc: SchoolDocument, childId: ChildId): boolean {
  return doc.childIds === "all" || doc.childIds.includes(childId);
}

/** Every document for one child, in `SCHOOL_DOCUMENTS` order. */
export function documentsForChild(childId: ChildId): SchoolDocument[] {
  return SCHOOL_DOCUMENTS.filter((doc) => documentAppliesTo(doc, childId));
}

/** Look one up by id. Returns undefined so a bad URL can 404 rather than 500. */
export function findSchoolDocument(id: string): SchoolDocument | undefined {
  return SCHOOL_DOCUMENTS.find((doc) => doc.id === id);
}
