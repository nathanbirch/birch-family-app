/**
 * Reading and writing the note.
 *
 * Same shape as `last-page-storage` and `theme-storage`: every access is
 * wrapped, because Safari's private mode and locked-down browsers throw on
 * `localStorage`, and a pad that cannot save is still a pad you can write on.
 *
 * The one difference from the others is that this one can fail for a reason
 * that is not the browser's fault — a note long enough to blow the quota — and
 * the caller is told about it so it can say so on screen. See `MAX_POINTS`.
 */

import { NOTE_STORAGE_KEY } from "@/config/app";

import {
  parseStoredNote,
  serialiseNote,
  type NoteDocument,
} from "./strokes";

/** The saved note, or `null` if there is nothing usable to show. */
export function readNote(): NoteDocument | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredNote(window.localStorage.getItem(NOTE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Save the note. `false` means it is on screen but not on disk. */
export function writeNote(document: NoteDocument): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(NOTE_STORAGE_KEY, serialiseNote(document));
    return true;
  } catch {
    // Quota, or storage disabled entirely. Either way the note survives in
    // memory for as long as the page is open, which is the honest outcome.
    return false;
  }
}

/** Tear the page off the pad. */
export function clearNote(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(NOTE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
