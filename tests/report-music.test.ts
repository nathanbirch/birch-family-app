import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAudioForTests } from "@/lib/audio";
import {
  isFanfarePlaying,
  primeFanfare,
  resetFanfareForTests,
  startFanfare,
  stopFanfare,
} from "@/lib/stars/fanfare";

/**
 * The ceremony music.
 *
 * Unlike the cheer, this is *long*, and the ways a long sound goes wrong are
 * different: it has to loop without a seam, it must not stack up a second
 * copy of itself when a slide turns, and it must stop when the page is left —
 * a fanfare still playing over the star charts is the one bug here a family
 * would actually be annoyed by.
 */

/* ------------------------------------------------------------------ */
/* A fake Web Audio stack                                              */
/* ------------------------------------------------------------------ */

class FakeParam {
  value = 1;
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn((value: number) => {
    this.target = value;
    return this;
  });
  cancelScheduledValues = vi.fn();
  /** The last value a ramp was heading for. */
  target = 0;
}

class FakeGainNode {
  gain = new FakeParam();
  connect = vi.fn(() => ({}) as AudioNode);
}

class FakeSourceNode {
  buffer: unknown = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn((next: unknown) => next);
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: "running" | "suspended" = "running";
  currentTime = 10;
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  decodeAudioData = vi.fn(async () => ({ duration: 22.5 }) as unknown as AudioBuffer);
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
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  return FakeAudioContext;
}

/** Drain the fire-and-forget chain inside `startFanfare`. */
async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  resetAudioForTests();
  resetFanfareForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  resetAudioForTests();
  resetFanfareForTests();
});

describe("starting it", () => {
  it("loops, because a ceremony runs as long as it runs", async () => {
    const Audio = installAudio();

    startFanfare(0.42);
    await settle();

    expect(Audio.instances[0].lastSource.loop).toBe(true);
    expect(Audio.instances[0].lastSource.start).toHaveBeenCalled();
    expect(isFanfarePlaying()).toBe(true);
  });

  it("fades in rather than arriving at full volume", async () => {
    const Audio = installAudio();

    startFanfare(0.42);
    await settle();

    const gain = Audio.instances[0].lastGain.gain;
    // From all but silent, up to what was asked for.
    expect(gain.setValueAtTime).toHaveBeenCalled();
    expect(gain.target).toBeCloseTo(0.42);
  });

  it("does not stack a second copy on top of itself", async () => {
    const Audio = installAudio();

    startFanfare(0.42);
    await settle();
    // Every slide change re-runs the effect that starts it.
    startFanfare(0.42);
    startFanfare(0.42);
    await settle();

    expect(Audio.instances[0].createBufferSource).toHaveBeenCalledTimes(1);
  });

  it("fetches the file once, however often it is started and stopped", async () => {
    installAudio();

    primeFanfare();
    await settle();
    startFanfare(0.42);
    await settle();
    stopFanfare();
    startFanfare(0.42);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all in a browser with no Web Audio", async () => {
    expect(() => startFanfare(0.42)).not.toThrow();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(isFanfarePlaying()).toBe(false);
  });

  it("stays silent when the file cannot be fetched", async () => {
    const Audio = installAudio();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    startFanfare(0.42);
    await settle();

    expect(Audio.instances[0].createBufferSource).not.toHaveBeenCalled();
    expect(isFanfarePlaying()).toBe(false);
  });
});

describe("stopping it", () => {
  it("fades out and then stops the source", async () => {
    const Audio = installAudio();
    startFanfare(0.42);
    await settle();

    const source = Audio.instances[0].lastSource;
    const gain = Audio.instances[0].lastGain.gain;
    stopFanfare();

    // Cancel first: an interrupted fade-in leaves a scheduled ramp that would
    // otherwise fight this one and win.
    expect(gain.cancelScheduledValues).toHaveBeenCalled();
    expect(gain.target).toBeLessThan(0.01);
    // Stopped in the future, when the fade has finished, not immediately —
    // cutting a sustained note dead is an audible click.
    expect(source.stop).toHaveBeenCalledWith(expect.any(Number));
    expect(source.stop.mock.calls[0][0]).toBeGreaterThan(
      Audio.instances[0].currentTime,
    );
    expect(isFanfarePlaying()).toBe(false);
  });

  it("is harmless when nothing is playing", () => {
    installAudio();
    expect(() => stopFanfare()).not.toThrow();
  });

  it("does not start after a stop that overtook it", async () => {
    const Audio = installAudio();

    // The child taps Start and leaves the page before the file has arrived.
    startFanfare(0.42);
    stopFanfare();
    await settle();

    // Without the generation check this would begin playing into a page
    // nobody is on, with nothing left holding a reference to stop it.
    expect(Audio.instances[0].createBufferSource).not.toHaveBeenCalled();
    expect(isFanfarePlaying()).toBe(false);
  });

  it("can be started again afterwards", async () => {
    const Audio = installAudio();

    startFanfare(0.42);
    await settle();
    stopFanfare();
    startFanfare(0.42);
    await settle();

    expect(Audio.instances[0].createBufferSource).toHaveBeenCalledTimes(2);
    expect(isFanfarePlaying()).toBe(true);
  });
});

describe("the shared context", () => {
  it("resumes one that iOS has suspended", async () => {
    const Audio = installAudio();

    primeFanfare();
    // iOS suspends the context the moment the page goes to the background,
    // which on this page is any time somebody answers a message mid-ceremony.
    Audio.instances[0].state = "suspended";
    Audio.instances[0].resume.mockClear();

    startFanfare(0.42);
    await settle();

    expect(Audio.instances[0].resume).toHaveBeenCalled();
  });

  it("is the same context the cheer uses", async () => {
    const Audio = installAudio();
    const { playCheer } = await import("@/lib/stars/cheer");

    startFanfare(0.42);
    playCheer(1);
    await settle();

    // One AudioContext for the whole app: iOS caps how many a page may have,
    // and each one has to be unlocked from inside its own gesture.
    expect(Audio.instances).toHaveLength(1);
  });
});
