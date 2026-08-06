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

/**
 * What a real `fetch` for the sound resolves to.
 *
 * `ok` is here rather than left off because the code now checks it, and a mock
 * without it would make every test pass through the failure branch — which is
 * the sort of green suite that proves nothing.
 */
function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response;
}

/** Safari's Audio Session API, which no test environment has. */
function installAudioSession(): { type: string } {
  const session = { type: "auto" };
  (navigator as unknown as { audioSession: unknown }).audioSession = session;
  return session;
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
  vi.stubGlobal("fetch", vi.fn(async () => okResponse()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  delete (window as unknown as { webkitAudioContext?: unknown })
    .webkitAudioContext;
  delete (navigator as unknown as { audioSession?: unknown }).audioSession;
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

  it("stays silent when the server answers with something that is not the file", async () => {
    // The failure this guards: `arrayBuffer()` on a 404 page resolves quite
    // happily, so without the `ok` check the bytes of an HTML error reach the
    // decoder.
    const Audio = installAudio();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(512),
      })),
    );

    playCheer(1);
    await settle();

    expect(Audio.instances[0].decodeAudioData).not.toHaveBeenCalled();
    expect(Audio.instances[0].createBufferSource).not.toHaveBeenCalled();
  });

  it("tries again after a failure, so one bad moment is not the whole session", async () => {
    const Audio = installAudio();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);

    playCheer(1);
    await settle();
    expect(Audio.instances[0].createBufferSource).not.toHaveBeenCalled();

    // The next celebration, on a phone that has found the network again.
    playCheer(1);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Audio.instances[0].lastSource.start).toHaveBeenCalled();
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

/* ------------------------------------------------------------------ */
/* The iPhone silent switch                                            */
/* ------------------------------------------------------------------ */

describe("the audio session", () => {
  /*
   * The whole reason the cheer appeared not to work. iOS puts Web Audio on the
   * `ambient` session by default, and `ambient` is the category the hardware
   * ring/silent switch mutes — so every line below ran correctly and made no
   * sound. See the note in `lib/stars/cheer.ts`.
   */
  it("claims playback, which is the category the silent switch does not mute", () => {
    const session = installAudioSession();
    installAudio();

    primeCheer();

    expect(session.type).toBe("playback");
  });

  it("claims it before the context is built, not after", () => {
    const session = installAudioSession();
    const seen: string[] = [];
    class RecordingAudioContext extends FakeAudioContext {
      constructor() {
        super();
        seen.push(session.type);
      }
    }
    FakeAudioContext.instances = [];
    (window as unknown as { AudioContext: unknown }).AudioContext =
      RecordingAudioContext;

    primeCheer();

    expect(seen).toEqual(["playback"]);
  });

  it("plays anyway in a browser with no audio session at all", async () => {
    // Every browser but Safari, including the one the tests run in.
    const Audio = installAudio();

    expect(() => playCheer(1)).not.toThrow();
    await settle();

    expect(Audio.instances[0].lastSource.start).toHaveBeenCalled();
  });

  it("plays anyway when setting the type is refused", async () => {
    // A draft spec is allowed to reject a value this file thinks is valid.
    Object.defineProperty(navigator, "audioSession", {
      configurable: true,
      get: () => ({
        set type(_value: string) {
          throw new TypeError("unsupported session type");
        },
      }),
    });
    const Audio = installAudio();

    expect(() => playCheer(1)).not.toThrow();
    await settle();

    expect(Audio.instances[0].lastSource.start).toHaveBeenCalled();
  });
});
