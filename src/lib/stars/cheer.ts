import { CHEER_SOUND } from "@/config/sound-manifest";
import {
  getAudioContext,
  loadSample,
  primeSample,
  resetAudioForTests,
} from "@/lib/audio";

/**
 * Playing the celebration sound.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WEB AUDIO API AND NOT AN <audio> ELEMENT
 * ---------------------------------------------------------------------------
 * An `<audio>` element can only play one thing at a time: finish a chart's
 * column and then the whole day a second later, and the second cheer cuts the
 * first one off mid-clap. A decoded buffer can be started as many times as you
 * like, overlapping, and each start is a few microseconds of work rather than
 * a fresh decode.
 *
 * It also gives a real gain node, which is what lets a card's celebration be
 * quieter than the whole day's without shipping two files.
 *
 * The context, the iOS session workaround and the decoded buffer all live in
 * `lib/audio.ts`, shared with the report's fanfare — see the note at the top
 * of that file for why there is only one context. What is left here is the
 * cheer itself.
 *
 * Every failure is silent, on purpose. The star is already ticked and the
 * confetti is already falling; the sound is the one part of this that is
 * allowed to just not happen.
 */

/**
 * Fetch and decode ahead of time, from inside a user gesture.
 *
 * Called on *every* star tap rather than only on the ones that celebrate: the
 * first tap of a session warms the file long before any column is finished, so
 * the cheer lands on the same frame as the confetti rather than a beat behind
 * it.
 */
export function primeCheer(): void {
  primeSample(CHEER_SOUND);
}

/** Play it. `volume` is 0-1; a card's celebration is quieter than the day's. */
export function playCheer(volume: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  void (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const decoded = await loadSample(ctx, CHEER_SOUND);
      if (!decoded) return;

      const source = ctx.createBufferSource();
      source.buffer = decoded;

      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, volume));

      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      // See the note at the top: a cheer that cannot play is not an error.
    }
  })();
}

/** Test seam: forget the context and the decoded buffer. */
export function resetCheerForTests(): void {
  resetAudioForTests();
}
