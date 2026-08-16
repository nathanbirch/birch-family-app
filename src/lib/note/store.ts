/**
 * The note, as an external store.
 *
 * Modelled on `sound-store` and `theme-store`, and for the same reason: the
 * note genuinely lives outside React, in `localStorage`. Reading it in an
 * effect and pushing it into `useState` would mean the pad renders blank,
 * paints, and *then* fills in — a visible flash of an empty page on every
 * visit, on the one page whose entire job is to be already written on.
 *
 * It also owns saving, including the debounce. That is a deliberate choice
 * over doing it in the component: a save is triggered by a change to the note,
 * the store is the only thing that knows when the note changes, and putting
 * the timer here means there is exactly one place that can be wrong about when
 * the note is written to disk.
 *
 * ---------------------------------------------------------------------------
 * WHY THE UNDO STACK IS IN HERE TOO
 * ---------------------------------------------------------------------------
 * Because it is the same state. `past` and `future` are lists of notes, and a
 * store that owned the note but not its history would let the two drift apart
 * the moment anything but the pad mutated a stroke. Keeping them together also
 * means undo survives the component unmounting, which matters more than it
 * sounds: tapping Home and coming back is one gesture on a tab bar, and losing
 * the ability to undo because of it would feel like a bug.
 */

import { DEFAULT_PAPER, type NotePaper } from "@/config/note";

import { clearNote, readNote, writeNote } from "./storage";
import { MAX_HISTORY, hasRoom, type NoteStroke } from "./strokes";

export type NoteState = {
  strokes: readonly NoteStroke[];
  paper: NotePaper;
  /** When it was last written to storage, or `null` for an unsaved blank pad. */
  savedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** `false` once a save has been refused — quota, or storage switched off. */
  storageWorks: boolean;
  /** `false` once the note has as many points as it is allowed. */
  hasRoom: boolean;
};

/** How long after the last mark the note is written to storage. */
export const SAVE_DEBOUNCE_MS = 500;

/**
 * What the server renders, and what the client renders while hydrating.
 *
 * A blank pad. It has to be a single frozen object rather than a fresh one per
 * call — `useSyncExternalStore` compares snapshots by identity, and a new
 * object every time is an infinite render loop.
 */
const EMPTY: NoteState = Object.freeze({
  strokes: Object.freeze([]) as readonly NoteStroke[],
  paper: DEFAULT_PAPER,
  savedAt: null,
  canUndo: false,
  canRedo: false,
  storageWorks: true,
  hasRoom: true,
});

const listeners = new Set<() => void>();

let current: NoteState | null = null;
let past: readonly (readonly NoteStroke[])[] = [];
let future: readonly (readonly NoteStroke[])[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function set(next: Partial<NoteState>): void {
  current = { ...getNoteSnapshot(), ...next };
  emit();
}

/** The note as it stands. Reads storage the first time it is asked. */
export function getNoteSnapshot(): NoteState {
  if (current === null) {
    const stored = readNote();
    current = stored
      ? {
          ...EMPTY,
          strokes: stored.strokes,
          paper: stored.paper,
          savedAt: stored.savedAt,
          hasRoom: hasRoom(stored.strokes),
        }
      : EMPTY;
  }
  return current;
}

/** The server has no storage, so it renders a blank pad. */
export function getServerNoteSnapshot(): NoteState {
  return EMPTY;
}

export function subscribeToNote(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/*
 * Deliberately no `storage` listener, unlike `sound-store`.
 *
 * That store syncs a *preference* between tabs, which is unambiguously right.
 * This one holds a document being edited, and the second tab's copy is not
 * stale — it is a different draft. Adopting another tab's save would wipe out
 * whatever is on the pad in front of you, mid-sentence, with no undo that
 * makes sense. Last writer wins, and the writer is whoever is actually
 * writing.
 */

/**
 * Replace the note.
 *
 * `record` pushes the current state onto the undo stack; it is `false` for
 * undo and redo, which move between states that already exist.
 */
export function applyNoteStrokes(
  next: readonly NoteStroke[],
  record: boolean,
): void {
  const state = getNoteSnapshot();
  if (next === state.strokes) return;

  if (record) {
    past = [...past, state.strokes].slice(-MAX_HISTORY);
    future = [];
  }

  set({
    strokes: next,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    hasRoom: hasRoom(next),
  });
  scheduleSave();
}

export function undoNote(): void {
  const previous = past[past.length - 1];
  if (!previous) return;
  const state = getNoteSnapshot();
  past = past.slice(0, -1);
  future = [...future, state.strokes];
  applyNoteStrokes(previous, false);
}

export function redoNote(): void {
  const next = future[future.length - 1];
  if (!next) return;
  const state = getNoteSnapshot();
  future = future.slice(0, -1);
  past = [...past, state.strokes];
  applyNoteStrokes(next, false);
}

export function setNotePaper(paper: NotePaper): void {
  if (getNoteSnapshot().paper === paper) return;
  set({ paper });
  scheduleSave();
}

/**
 * Tear the page off the pad.
 *
 * The stored copy goes at once rather than on the debounce, because Clear has
 * just been confirmed twice and "cleared" should not mean "cleared in half a
 * second unless you close the tab". The undo entry is still recorded, so the
 * next tap of Undo brings it back and re-saves it.
 */
export function clearNoteStrokes(): void {
  applyNoteStrokes([], true);
  cancelSave();
  clearNote();
  set({ savedAt: null, storageWorks: true });
}

/* ---------------------------------------------------------------------- */
/* Saving                                                                  */
/* ---------------------------------------------------------------------- */

function scheduleSave(): void {
  cancelSave();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNoteNow();
  }, SAVE_DEBOUNCE_MS);
}

function cancelSave(): void {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
}

/**
 * Write the note now, if one is owed.
 *
 * Called by the debounce, and directly by the pad when the iPad's cover comes
 * down or the page is navigated away from — see the `visibilitychange` and
 * unmount handlers there. Without those, the last half-second of writing is
 * lost every time, which on this device is *every* time: nobody closes a note
 * app, they close the lid.
 */
export function flushNoteSave(): void {
  if (saveTimer === null) return;
  cancelSave();
  saveNoteNow();
}

function saveNoteNow(): void {
  const state = getNoteSnapshot();

  // An empty pad that has never been saved has nothing to write. An empty pad
  // that *has* been is handled by `clearNoteStrokes`, which removes the key.
  if (state.strokes.length === 0 && state.savedAt === null) return;

  const savedAt = new Date().toISOString();
  const ok = writeNote({
    strokes: state.strokes,
    paper: state.paper,
    savedAt,
  });

  set({
    storageWorks: ok,
    savedAt: ok ? (state.strokes.length > 0 ? savedAt : null) : state.savedAt,
  });
}

/** Test-only: forget everything, including the cached read. */
export function resetNoteStore(): void {
  cancelSave();
  current = null;
  past = [];
  future = [];
}
