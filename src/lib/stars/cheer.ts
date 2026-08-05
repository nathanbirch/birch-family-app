import { CHEER_SOUND } from "@/config/sound-manifest";

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
 * ---------------------------------------------------------------------------
 * EVERY FAILURE HERE IS SILENT, ON PURPOSE
 * ---------------------------------------------------------------------------
 * A browser with no Web Audio, a phone on silent, an autoplay policy that
 * refuses, a file that will not decode — none of these are worth a message on
 * a child's chart. The star is already ticked and the confetti is already
 * falling; the sound is the one part of this that is allowed to just not
 * happen.
 */

let context: AudioContext | null = null;
let buffer: Promise<AudioBuffer | null> | null = null;

type AudioContextConstructor = new () => AudioContext;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor: AudioContextConstructor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;
  if (!Ctor) return null;

  try {
    context ??= new Ctor();
  } catch {
    return null;
  }
  return context;
}

function getBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  buffer ??= fetch(CHEER_SOUND)
    .then((response) => response.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .catch(() => null);
  return buffer;
}

/**
 * Fetch and decode ahead of time, from inside a user gesture.
 *
 * Called on *every* star tap rather than only on the ones that celebrate. Two
 * reasons: the first tap of a session warms the file long before any column is
 * finished, so the cheer lands on the same frame as the confetti rather than a
 * beat behind it — and iOS only lets an AudioContext leave the `suspended`
 * state inside a gesture, so this is also where that happens.
 */
export function primeCheer(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  void getBuffer(ctx);
}

/** Play it. `volume` is 0-1; a card's celebration is quieter than the day's. */
export function playCheer(volume: number): void {
  const ctx = getContext();
  if (!ctx) return;

  void (async () => {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const decoded = await getBuffer(ctx);
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
  context = null;
  buffer = null;
}
