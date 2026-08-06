/**
 * The app's one AudioContext, and the samples decoded into it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SHARED RATHER THAN ONE PER SOUND
 * ---------------------------------------------------------------------------
 * There are two sounds now — the cheer on the star charts and the fanfare
 * under the weekly report — and a third would have made this inevitable, so it
 * is here at two. An AudioContext is not a lightweight object: it holds a
 * hardware output stream, iOS caps how many a page may have, and each one has
 * to be separately unlocked from inside a user gesture. Sharing one means the
 * gesture that starts the ceremony has already unlocked the context the cheer
 * will use, and vice versa.
 *
 * A decoded buffer belongs to the context that decoded it, so the sample cache
 * lives here too, keyed by URL. The URLs are content-hashed, which is what
 * makes caching them forever safe.
 *
 * ---------------------------------------------------------------------------
 * EVERY FAILURE HERE IS SILENT, ON PURPOSE
 * ---------------------------------------------------------------------------
 * A browser with no Web Audio, an autoplay policy that refuses, a file that
 * will not decode — none of these are worth a message in front of a child. The
 * star is still ticked, the confetti still falls and the ceremony still runs;
 * sound is the part that is allowed to just not happen.
 */

let context: AudioContext | null = null;

/** URL -> the decode in flight or completed. Failures are not kept; see below. */
const samples = new Map<string, Promise<AudioBuffer | null>>();

type AudioContextConstructor = new () => AudioContext;

/**
 * Safari's Audio Session API. Only Safari implements it, and the spec is still
 * an editor's draft, so it is not in `lib.dom` and has to be declared here.
 */
type AudioSessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record";

/**
 * Play through the iPhone's ring/silent switch.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS FIXES
 * ---------------------------------------------------------------------------
 * On iOS, Web Audio defaults to the `ambient` session, and `ambient` is
 * *exactly* the category the hardware silent switch mutes. A phone that has
 * been on silent since the last time it was in a meeting — which is most of
 * them, most of the time — therefore ran every line of this file correctly,
 * decoded the buffer, started the source, and made no sound at all. Nothing
 * threw, nothing logged, and the confetti still fell, so it looked for all the
 * world like the code was not running.
 *
 * `playback` is the category native apps use for audio the user asked for, and
 * it is not silenced by the switch.
 *
 * ---------------------------------------------------------------------------
 * WHY `playback` AND NOT `transient`
 * ---------------------------------------------------------------------------
 * `transient` is the better description of a cheer — a notification sound that
 * should play on top of whatever else is going on, and unlike `playback` it
 * does not pause other audio. The cost of `playback` is real: a phone playing
 * music in the kitchen will stop when a child finishes a column, and iOS will
 * not start it again.
 *
 * `playback` is used anyway because it is the one value with a track record of
 * actually clearing the silent switch. `transient` may well do the same, but
 * "may well" is what an earlier version of this assumed. If the music stopping
 * turns out to be the bigger annoyance, this is a one-word change — try
 * `transient`, and check on a phone with the switch flicked to silent.
 *
 * (The fanfare is a different case and points the same way: two minutes of
 * ceremony music genuinely *is* playback, and should duck whatever else the
 * phone was doing.)
 *
 * Wrapped and feature-detected because the API exists only in Safari, and the
 * shape of a draft spec is allowed to move under us.
 */
function claimAudioSession(): void {
  try {
    const session = (
      navigator as Navigator & { audioSession?: { type: AudioSessionType } }
    ).audioSession;
    if (session) session.type = "playback";
  } catch {
    // A browser that does not have it loses nothing it had before.
  }
}

/** The shared context, or `null` where there is no Web Audio at all. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor: AudioContextConstructor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;
  if (!Ctor) return null;

  try {
    // Before the context exists, so the first sound it ever plays is already
    // on the right session rather than being moved onto it afterwards.
    claimAudioSession();
    context ??= new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * Fetch and decode a sample once, and keep the result.
 *
 * A *failure* is deliberately not kept. The memoised promise used to hold the
 * `null` from a fetch that lost the network for a second, which meant one bad
 * moment — a phone waking up on a weak signal, a tap during a deploy — bought
 * silence for the rest of the session, with nothing to do about it but reload
 * the page. Clearing it costs a retry on the next play, which is a few per
 * week at worst.
 *
 * The `ok` check matters for the same reason: `arrayBuffer()` is perfectly
 * happy to hand back the bytes of a 404 page, and those bytes fail to decode a
 * good deal less obviously than a rejected fetch.
 */
export function loadSample(
  ctx: AudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  const existing = samples.get(url);
  if (existing) return existing;

  const decoding = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`audio: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => ctx.decodeAudioData(bytes))
    .catch(() => {
      samples.delete(url);
      return null;
    });

  samples.set(url, decoding);
  return decoding;
}

/**
 * Wake the context and start fetching a sample, from inside a user gesture.
 *
 * iOS only lets an AudioContext leave the `suspended` state inside a gesture,
 * so this is where that happens — and warming the file at the same time is
 * what makes the sound land on the same frame as the thing it is celebrating
 * rather than a beat behind it.
 */
export function primeSample(url: string): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  void loadSample(ctx, url);
}

/** Test seam: forget the context and every decoded sample. */
export function resetAudioForTests(): void {
  context = null;
  samples.clear();
}
