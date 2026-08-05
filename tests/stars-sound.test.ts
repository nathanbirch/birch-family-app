import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SOUND_STORAGE_KEY } from "@/config/app";
import { readSoundOn, writeSoundOn } from "@/lib/sound-storage";
import {
  getServerSoundOnSnapshot,
  getSoundOnSnapshot,
  resetSoundCache,
  setSoundOn,
  subscribeToSoundOn,
} from "@/lib/sound-store";
import { playCheer, primeCheer, resetCheerForTests } from "@/lib/stars/cheer";

/**
 * The celebration sound: the preference that silences it, and the playback
 * itself.
 *
 * Everything about playback is allowed to fail silently — no Web Audio, a
 * phone on silent, an autoplay policy that refuses — so these tests are mostly
 * about proving that "fails" really does mean "silently" and not "throws in
 * the middle of a child ticking a star".
 */

/* ------------------------------------------------------------------ */
/* A fake Web Audio stack                                              */
/* ------------------------------------------------------------------ */

class FakeGainNode {
  gain = { value: 1 };
  connect = vi.fn(() => ({}) as AudioNode);
}

class FakeSourceNode {
  buffer: unknown = null;
  start = vi.fn();
  connect = vi.fn((next: unknown) => next);
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: "running" | "suspended" = "running";
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  decodeAudioData = vi.fn(async () => ({ duration: 1.6 }) as unknown as AudioBuffer);
  createGain = vi.fn(() => new FakeGainNode());
  createBufferSource = vi.fn(() => new FakeSourceNode());

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  get lastSource(): FakeSourceNode {
    const results = this.createBufferSource.mock.results;
    return results[results.length - 1]?.value as FakeSourceNode;
  }

  get lastGain(): FakeGainNode {
    const results = this.createGain.mock.results;
    return results[results.length - 1]?.value as FakeGainNode;
  }
}

function installAudio(): typeof FakeAudioContext {
  FakeAudioContext.instances = [];
  (window as unknown as { AudioContext: unknown }).AudioContext =
    FakeAudioContext;
  return FakeAudioContext;
}

/**
 * Wait for the fire-and-forget promise chain inside `playCheer` to settle.
 *
 * `playCheer` deliberately returns `void` — nothing on the page waits for a
 * sound — so there is no promise to await. The chain is fetch → arrayBuffer →
 * decode → play, each an async hop, so this drains a macrotask as well as the
 * microtask queue rather than guessing at a tick count.
 */
async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  resetCheerForTests();
  resetSoundCache();
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  delete (window as unknown as { webkitAudioContext?: unknown })
    .webkitAudioContext;
  resetCheerForTests();
});

/* ------------------------------------------------------------------ */

describe("the sound preference", () => {
  it("starts on, because a chart that celebrates in silence is a worse first impression", () => {
    expect(readSoundOn()).toBe(true);
    expect(getSoundOnSnapshot()).toBe(true);
    expect(getServerSoundOnSnapshot()).toBe(true);
  });

  it("only the exact string 'off' silences it", () => {
    window.localStorage.setItem(SOUND_STORAGE_KEY, "off");
    expect(readSoundOn()).toBe(false);

    // A half-written or corrupted value errs towards the default rather than
    // towards silence, which is the failure nobody would report as a bug.
    for (const value of ["", "OFF", "false", "0", "of", "nonsense"]) {
      window.localStorage.setItem(SOUND_STORAGE_KEY, value);
      expect(readSoundOn()).toBe(true);
    }
  });

  it("round-trips both ways", () => {
    writeSoundOn(false);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("off");
    expect(readSoundOn()).toBe(false);

    writeSoundOn(true);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("on");
    expect(readSoundOn()).toBe(true);
  });

  it("survives storage being unavailable, as it is in Safari private mode", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(readSoundOn()).toBe(true);
    expect(() => writeSoundOn(false)).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("caches the value, and forgets it on demand", () => {
    expect(getSoundOnSnapshot()).toBe(true);
    // Written behind the store's back: the cached answer stands until it is
    // told otherwise, which is what makes the snapshot stable across renders.
    window.localStorage.setItem(SOUND_STORAGE_KEY, "off");
    expect(getSoundOnSnapshot()).toBe(true);

    resetSoundCache();
    expect(getSoundOnSnapshot()).toBe(false);
  });

  it("tells every subscriber when it changes", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeToSoundOn(first);
    const unsubscribeSecond = subscribeToSoundOn(second);

    setSoundOn(false);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(getSoundOnSnapshot()).toBe(false);
    expect(window.localStorage.getItem(SOUND_STORAGE_KEY)).toBe("off");

    unsubscribeFirst();
    setSoundOn(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
    setSoundOn(false);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("picks up a change made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSoundOn(listener);

    window.localStorage.setItem(SOUND_STORAGE_KEY, "off");
    window.dispatchEvent(new StorageEvent("storage", { key: SOUND_STORAGE_KEY }));

    expect(listener).toHaveBeenCalled();
    expect(getSoundOnSnapshot()).toBe(false);

    unsubscribe();
    // …and stops listening once nobody is subscribed.
    window.localStorage.setItem(SOUND_STORAGE_KEY, "on");
    window.dispatchEvent(new StorageEvent("storage", { key: SOUND_STORAGE_KEY }));
    expect(getSoundOnSnapshot()).toBe(false);
  });
});

describe("playing the cheer", () => {
  it("does nothing at all when the browser has no Web Audio", async () => {
    expect(() => primeCheer()).not.toThrow();
    expect(() => playCheer(1)).not.toThrow();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the prefixed constructor older Safari shipped", async () => {
    (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext =
      FakeAudioContext;
    FakeAudioContext.instances = [];

    playCheer(1);
    await settle();

    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("fetches and decodes once, however often it plays", async () => {
    const Audio = installAudio();

    playCheer(1);
    await settle();
    playCheer(0.6);
    await settle();
    playCheer(1);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Audio.instances).toHaveLength(1);
    expect(Audio.instances[0].decodeAudioData).toHaveBeenCalledTimes(1);
    // …but a fresh source each time, which is what lets two celebrations
    // overlap instead of one cutting the other off.
    expect(Audio.instances[0].createBufferSource).toHaveBeenCalledTimes(3);
  });

  it("starts the sound at the volume it was given", async () => {
    const Audio = installAudio();

    playCheer(0.6);
    await settle();

    const context = Audio.instances[0];
    expect(context.lastGain.gain.value).toBe(0.6);
    expect(context.lastSource.start).toHaveBeenCalled();
  });

  it("clamps a nonsense volume rather than blasting or inverting", async () => {
    const Audio = installAudio();

    playCheer(9);
    await settle();
    expect(Audio.instances[0].lastGain.gain.value).toBe(1);

    playCheer(-3);
    await settle();
    expect(Audio.instances[0].lastGain.gain.value).toBe(0);
  });

  it("resumes a context iOS has suspended", async () => {
    const Audio = installAudio();
    playCheer(1);
    await settle();

    const context = Audio.instances[0];
    context.state = "suspended";

    playCheer(1);
    await settle();
    expect(context.resume).toHaveBeenCalled();
  });

  it("primes without playing, which is why it is safe on every tap", async () => {
    const Audio = installAudio();

    primeCheer();
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Audio.instances[0].createBufferSource).not.toHaveBeenCalled();
  });

  it("plays without re-fetching after priming", async () => {
    const Audio = installAudio();

    primeCheer();
    await settle();
    playCheer(1);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Audio.instances[0].lastSource.start).toHaveBeenCalled();
  });

  it("stays silent when the file cannot be fetched", async () => {
    const Audio = installAudio();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    playCheer(1);
    await settle();

    expect(Audio.instances[0].createBufferSource).not.toHaveBeenCalled();
  });

  it("stays silent when the file cannot be decoded", async () => {
    // A subclass rather than a patched prototype: the fake declares
    // `decodeAudioData` as an instance field, so a prototype assignment is
    // shadowed and would quietly test nothing.
    class UndecodableAudioContext extends FakeAudioContext {
      decodeAudioData = vi.fn(async () => {
        throw new Error("unsupported format");
      }) as unknown as FakeAudioContext["decodeAudioData"];
    }
    FakeAudioContext.instances = [];
    (window as unknown as { AudioContext: unknown }).AudioContext =
      UndecodableAudioContext;

    playCheer(1);
    await settle();

    const context = FakeAudioContext.instances[0];
    expect(context.decodeAudioData).toHaveBeenCalled();
    expect(context.createBufferSource).not.toHaveBeenCalled();
  });

  it("stays silent when constructing the context throws", async () => {
    (window as unknown as { AudioContext: unknown }).AudioContext =
      function Broken() {
        throw new Error("no audio device");
      };

    expect(() => playCheer(1)).not.toThrow();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays silent when resume is refused by the autoplay policy", async () => {
    const Audio = installAudio();
    playCheer(1);
    await settle();

    const context = Audio.instances[0];
    context.state = "suspended";
    context.resume.mockRejectedValueOnce(new Error("NotAllowedError"));

    expect(() => playCheer(1)).not.toThrow();
    await settle();
    // One source from the first play, none from the refused one.
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  });
});
