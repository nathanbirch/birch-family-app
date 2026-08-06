import { FANFARE_SOUND } from "@/config/music-manifest";
import { getAudioContext, loadSample, primeSample } from "@/lib/audio";

/**
 * The music under the award ceremony.
 *
 * One looping source, one gain node, and a good deal of care about starting
 * and stopping — because unlike the cheer, this is *long*, and the ways a
 * long sound goes wrong are different from the ways a short one does.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER STARTS ON ITS OWN
 * ---------------------------------------------------------------------------
 * Every browser refuses to autoplay audio, and quite right too: a page that
 * starts playing brass at somebody who tapped a link is a page they close. So
 * the ceremony has a Start button, the button is the gesture, and this module
 * is never called outside one. That is not a workaround for the autoplay
 * policy — it is how an award ceremony should begin anyway.
 *
 * ---------------------------------------------------------------------------
 * FADES, NOT CUTS
 * ---------------------------------------------------------------------------
 * Stopping a sustained note dead produces a click — the waveform jumps to zero
 * from wherever it happened to be, and that step is audible as a tick. Both
 * ends therefore ramp: 900ms in, so the music arrives under the first slide
 * rather than barging in, and 700ms out so leaving the page sounds like the
 * hall emptying rather than the power being cut.
 *
 * The loop itself needs no fade at all: the piece is written to wrap (see
 * `scripts/generate-fanfare.mjs`), so `loop = true` is the whole of it.
 *
 * Every failure is silent, as everywhere else in this app's audio.
 */

/** Fade lengths, in seconds. */
const FADE_IN = 0.9;
const FADE_OUT = 0.7;

type Playing = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

let playing: Playing | null = null;

/**
 * Bumped by every start and every stop.
 *
 * Starting is asynchronous — the file may still be arriving — so a child who
 * taps Start and immediately leaves the page would otherwise get a source that
 * begins playing *after* the stop that was meant to prevent it, with nothing
 * left holding a reference to stop it a second time. The generation is checked
 * again after the await, which is the only reliable way to say "the request I
 * am completing is still the current one".
 */
let generation = 0;

/** Fetch and decode from inside a gesture, before the Start button is pressed. */
export function primeFanfare(): void {
  primeSample(FANFARE_SOUND);
}

/**
 * Start the music, looping, fading in.
 *
 * `volume` is 0-1 and deliberately below 1 at the call site: this plays under
 * five children's names being read out, and music that competes with the thing
 * it is celebrating is louder, not better.
 *
 * Calling it while it is already playing is a no-op rather than a second
 * overlapping loop — which is what would otherwise happen when a slide changes
 * and the effect re-runs.
 */
export function startFanfare(volume: number): void {
  if (playing) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const mine = (generation += 1);

  void (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const decoded = await loadSample(ctx, FANFARE_SOUND);
      if (!decoded) return;

      // Somebody stopped it, or started it again, while the file was in the
      // air. Whatever they asked for last is what should be happening.
      if (mine !== generation || playing) return;

      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.loop = true;

      const gain = ctx.createGain();
      const target = Math.max(0, Math.min(1, volume));
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      /*
       * Exponential rather than linear: loudness is perceived logarithmically,
       * so a linear ramp is heard as arriving almost instantly and then
       * crawling. It cannot ramp from or to a true zero, hence the 0.0001.
       */
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, target),
        now + FADE_IN,
      );

      source.connect(gain).connect(ctx.destination);
      source.start();

      playing = { source, gain };
    } catch {
      // The ceremony runs in silence. See the note at the top.
    }
  })();
}

/**
 * Fade the music out and stop it.
 *
 * The source is stopped *after* the fade rather than at once, and the
 * reference is dropped immediately, so a start arriving during the fade builds
 * a fresh source instead of racing this one.
 */
export function stopFanfare(): void {
  generation += 1;

  const current = playing;
  playing = null;
  if (!current) return;

  const ctx = getAudioContext();
  try {
    if (ctx) {
      const now = ctx.currentTime;
      const level = Math.max(0.0002, current.gain.gain.value);
      // Cancel first: an interrupted fade-*in* leaves a scheduled ramp that
      // would otherwise fight this one and win.
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setValueAtTime(level, now);
      current.gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT);
      current.source.stop(now + FADE_OUT);
    } else {
      current.source.stop();
    }
  } catch {
    // A source that has already ended throws on `stop()` in some browsers.
  }
}

/** Whether music is currently playing. */
export function isFanfarePlaying(): boolean {
  return playing !== null;
}

/** Test seam: forget the playing source without touching the shared context. */
export function resetFanfareForTests(): void {
  playing = null;
  generation = 0;
}
