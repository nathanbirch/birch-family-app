import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOTE_STORAGE_KEY } from "@/config/app";
import {
  SAVE_DEBOUNCE_MS,
  applyNoteStrokes,
  clearNoteStrokes,
  flushNoteSave,
  getNoteSnapshot,
  getServerNoteSnapshot,
  redoNote,
  resetNoteStore,
  setNotePaper,
  subscribeToNote,
  undoNote,
} from "@/lib/note/store";
import type { NoteStroke } from "@/lib/note/strokes";

/*
 * The store is where the pad's promise actually lives: that a note written
 * today is there tomorrow, that Clear can be taken back, and that a device
 * which refuses to save says so instead of pretending.
 */

function stroke(x: number): NoteStroke {
  return {
    tool: "pen",
    ink: "graphite",
    nib: "medium",
    points: [{ x, y: 0.5, p: 0.7 }],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetNoteStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a blank pad", () => {
  it("starts empty, with nothing to undo", () => {
    const state = getNoteSnapshot();
    expect(state.strokes).toEqual([]);
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    expect(state.savedAt).toBeNull();
  });

  it("gives the server the same object every time", () => {
    /*
     * `useSyncExternalStore` compares snapshots by identity. A fresh object
     * per call is an infinite render loop, not a slow one — this is the test
     * that catches it before it reaches a page.
     */
    expect(getServerNoteSnapshot()).toBe(getServerNoteSnapshot());
  });

  it("does not write an empty note just for being opened", () => {
    getNoteSnapshot();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 3);
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).toBeNull();
  });
});

describe("writing on it", () => {
  it("tells whoever is listening", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNote(listener);
    applyNoteStrokes([stroke(0.1)], true);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("stops telling them once they have gone", () => {
    const listener = vi.fn();
    subscribeToNote(listener)();
    applyNoteStrokes([stroke(0.1)], true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("hands out a new snapshot for each change", () => {
    const before = getNoteSnapshot();
    applyNoteStrokes([stroke(0.1)], true);
    expect(getNoteSnapshot()).not.toBe(before);
  });

  it("ignores being handed the note it already has", () => {
    applyNoteStrokes([stroke(0.1)], true);
    const state = getNoteSnapshot();
    applyNoteStrokes(state.strokes, true);
    expect(getNoteSnapshot()).toBe(state);
  });
});

describe("saving", () => {
  it("waits for the writing to stop", () => {
    applyNoteStrokes([stroke(0.1)], true);
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).not.toBeNull();
  });

  it("only writes once for a burst of strokes", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    applyNoteStrokes([stroke(0.1)], true);
    applyNoteStrokes([stroke(0.1), stroke(0.2)], true);
    applyNoteStrokes([stroke(0.1), stroke(0.2), stroke(0.3)], true);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);

    expect(setItem).toHaveBeenCalledTimes(1);
    setItem.mockRestore();
  });

  it("can be made to write immediately when the lid comes down", () => {
    applyNoteStrokes([stroke(0.1)], true);
    flushNoteSave();
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).not.toBeNull();
    expect(getNoteSnapshot().savedAt).not.toBeNull();
  });

  it("does nothing when flushed with nothing owing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    flushNoteSave();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("saves the paper along with the ink", () => {
    applyNoteStrokes([stroke(0.1)], true);
    setNotePaper("grid");
    flushNoteSave();

    resetNoteStore();
    expect(getNoteSnapshot().paper).toBe("grid");
  });

  it("says so when the device refuses", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    applyNoteStrokes([stroke(0.1)], true);
    flushNoteSave();

    // The note is still on screen — it just is not on disk, and the pad says
    // so rather than quietly losing it.
    expect(getNoteSnapshot().storageWorks).toBe(false);
    expect(getNoteSnapshot().strokes).toHaveLength(1);
    setItem.mockRestore();
  });
});

describe("coming back to it", () => {
  it("reads the saved note the first time it is asked", () => {
    applyNoteStrokes([stroke(0.42)], true);
    flushNoteSave();

    resetNoteStore();
    const state = getNoteSnapshot();
    expect(state.strokes).toHaveLength(1);
    expect(state.strokes[0].points[0].x).toBeCloseTo(0.42, 4);
    expect(state.savedAt).not.toBeNull();
  });

  it("opens on a blank pad when what is stored is rubbish", () => {
    window.localStorage.setItem(NOTE_STORAGE_KEY, "not a note");
    resetNoteStore();
    expect(getNoteSnapshot().strokes).toEqual([]);
  });
});

describe("undo", () => {
  it("takes back the last stroke, and puts it back again", () => {
    applyNoteStrokes([stroke(0.1)], true);
    applyNoteStrokes([stroke(0.1), stroke(0.2)], true);

    undoNote();
    expect(getNoteSnapshot().strokes).toHaveLength(1);
    expect(getNoteSnapshot().canRedo).toBe(true);

    redoNote();
    expect(getNoteSnapshot().strokes).toHaveLength(2);
  });

  it("does nothing at the bottom of the stack", () => {
    undoNote();
    redoNote();
    expect(getNoteSnapshot().strokes).toEqual([]);
    expect(getNoteSnapshot().canUndo).toBe(false);
  });

  it("throws away the redo stack once something new is written", () => {
    applyNoteStrokes([stroke(0.1)], true);
    applyNoteStrokes([stroke(0.1), stroke(0.2)], true);
    undoNote();
    expect(getNoteSnapshot().canRedo).toBe(true);

    applyNoteStrokes([stroke(0.1), stroke(0.9)], true);
    expect(getNoteSnapshot().canRedo).toBe(false);
  });

  it("does not record a state for a move it did not make", () => {
    // Undo and redo travel between states that already exist; recording them
    // would mean undo could never reach the beginning.
    applyNoteStrokes([stroke(0.1)], true);
    applyNoteStrokes([stroke(0.1), stroke(0.2)], true);
    undoNote();
    undoNote();
    expect(getNoteSnapshot().strokes).toEqual([]);
    expect(getNoteSnapshot().canUndo).toBe(false);
  });
});

describe("clearing", () => {
  it("takes the note off the pad and out of storage at once", () => {
    applyNoteStrokes([stroke(0.1)], true);
    flushNoteSave();
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).not.toBeNull();

    clearNoteStrokes();
    expect(getNoteSnapshot().strokes).toEqual([]);
    expect(getNoteSnapshot().savedAt).toBeNull();
    // Not on the debounce: "cleared" must not mean "cleared in half a second
    // unless the tab closes first".
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).toBeNull();
  });

  it("can be taken back", () => {
    applyNoteStrokes([stroke(0.1)], true);
    clearNoteStrokes();

    undoNote();
    expect(getNoteSnapshot().strokes).toHaveLength(1);

    // …and the recovered note is written back out.
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS);
    expect(window.localStorage.getItem(NOTE_STORAGE_KEY)).not.toBeNull();
  });
});
