/**
 * A random song from the family's playlist, under the award ceremony.
 *
 * Everything YouTube-shaped in the app lives here. The ceremony asks for music
 * and is told whether it got any; if it did not, it plays the fanfare it has
 * always played. That one boolean is the whole interface, and it is what keeps
 * a third-party embed from being able to leave a Sunday afternoon in silence.
 *
 * ---------------------------------------------------------------------------
 * NO API KEY, NO QUOTA
 * ---------------------------------------------------------------------------
 * Picking a song at random needs to know how many songs there are, and the
 * obvious way to find out is the YouTube Data API — which needs a key, a
 * project, and a quota that runs out. None of that is here. The IFrame player
 * loads the playlist itself and `getPlaylist()` hands back the video ids once
 * it is ready, so the count comes from the thing that is already loading it.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER STARTS ON ITS OWN
 * ---------------------------------------------------------------------------
 * The same rule the fanfare follows, for the same reason: the ceremony has a
 * Start button and the button is the gesture. `prime` builds the player early
 * so it is ready and cued by the time somebody presses it — a player created
 * *inside* the click would still be fetching a script when the gesture expired,
 * which on Safari is the difference between music and no music.
 *
 * ---------------------------------------------------------------------------
 * OFF-SCREEN, NOT `display: none`
 * ---------------------------------------------------------------------------
 * A hidden player is `position: fixed` a long way off the left edge, at a real
 * 200x200. `display: none` is the obvious way to hide it and it does not work
 * — a player in an undisplayed iframe may never initialise at all, and the
 * failure is silent and browser-dependent. See `config/ceremony-music.ts` for
 * the policy note that goes with hiding it.
 */

import {
  CEREMONY_PLAYLIST_ID,
  PLAYLIST_TIMEOUT_MS,
  hasCeremonyPlaylist,
  isEmbeddablePlaylistId,
} from "@/config/ceremony-music";

/** Where YouTube's script is fetched from. The only URL in this file. */
const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/** How long the volume takes to ramp, and in how many steps. */
const FADE_MS = 700;
const FADE_STEPS = 14;

/* ------------------------------------------------------------------ */
/* The pure part                                                       */
/* ------------------------------------------------------------------ */

/**
 * Which track to play, given how many there are and a number from
 * `Math.random()`.
 *
 * Pure, and takes the randomness as an argument for the same reason the finger
 * picker's draw does: a choice that cannot be tested is a choice nobody can
 * check is even. Returns -1 for an empty playlist, which the caller treats as
 * "no music here" rather than as an index.
 */
export function pickTrackIndex(count: number, random: number): number {
  if (count <= 0) return -1;
  const index = Math.floor(random * count);
  // `Math.random()` is documented as below 1, but a caller could hand us
  // exactly 1 and an off-the-end index would ask YouTube for a song that is
  // not there.
  return Math.min(count - 1, Math.max(0, index));
}

/** YouTube's volume is 0-100; every other volume in this app is 0-1. */
export function toPlayerVolume(volume: number): number {
  return Math.round(Math.min(1, Math.max(0, volume)) * 100);
}

/* ------------------------------------------------------------------ */
/* The player                                                          */
/* ------------------------------------------------------------------ */

/** Only what this module actually calls. YouTube's player has far more. */
type YouTubePlayer = {
  playVideoAt(index: number): void;
  nextVideo(): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  getPlaylist(): string[] | null;
  destroy(): void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let container: HTMLElement | null = null;
let player: YouTubePlayer | null = null;
/** Resolves when the player is cued and its playlist is readable. */
let ready: Promise<YouTubePlayer | null> | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
/**
 * Bumped by every start and every stop.
 *
 * Starting waits on a script and a player, so a ceremony that is left before
 * either arrives would otherwise begin playing *after* the stop meant to
 * prevent it — with nothing holding a reference to stop it again. The
 * generation is re-checked after every await, which is the only reliable way
 * to ask "is the request I am finishing still the current one?".
 */
let generation = 0;

/** Fetch YouTube's script, once, and resolve when its API object exists. */
function loadApi(): Promise<YouTubeApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve) => {
    const settle = () => resolve(window.YT?.Player ? window.YT : null);

    // YouTube calls exactly one global when it is ready, so an existing
    // handler is chained rather than replaced — this module must not be the
    // reason something else's player never starts.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      settle();
    };

    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      // Offline, blocked, or an ad-blocker: settle as "no API" so the caller
      // falls back rather than waiting out the timeout.
      script.onerror = () => resolve(null);
      document.head.append(script);
    }

    setTimeout(settle, PLAYLIST_TIMEOUT_MS);
  });
}

/**
 * Build the player and wait until its playlist can be read.
 *
 * The playlist is not readable the instant `onReady` fires — the player is
 * ready before the list it was given has been fetched — so this settles on
 * whichever comes first: a `getPlaylist()` that returns something, an error
 * from YouTube, or the timeout.
 */
function createPlayer(api: YouTubeApi): Promise<YouTubePlayer | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: YouTubePlayer | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    container = document.createElement("div");
    /*
     * Off-screen at a real size, never `display: none` — see the note at the
     * top. `aria-hidden` and `pointer-events` because it is furniture nobody
     * should reach, by tab or by touch.
     */
    Object.assign(container.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "200px",
      height: "200px",
      pointerEvents: "none",
    });
    container.setAttribute("aria-hidden", "true");
    document.body.append(container);

    const instance = new api.Player(container, {
      height: "200",
      width: "200",
      playerVars: {
        listType: "playlist",
        list: CEREMONY_PLAYLIST_ID,
        controls: 0,
        disablekb: 1,
        // Without this, iOS Safari takes any playback full-screen — over the
        // ceremony, which is the one thing that must not happen.
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          const poll = setInterval(() => {
            if (settled) return clearInterval(poll);
            if ((instance.getPlaylist()?.length ?? 0) > 0) {
              clearInterval(poll);
              settle(instance);
            }
          }, 120);
        },
        onError: (event: { data?: number }) => {
          /*
           * 101 and 150 both mean "this video's uploader disabled embedding".
           * That is one song, not the playlist, so it is skipped — a single
           * un-embeddable track should not cost the ceremony its music.
           * Anything else (a private playlist, a bad id) is fatal.
           */
          if (event?.data === 101 || event?.data === 150) {
            instance.nextVideo();
            return;
          }
          settle(null);
        },
      },
    });

    setTimeout(() => settle(null), PLAYLIST_TIMEOUT_MS);
  });
}

/**
 * Start fetching YouTube and building the player.
 *
 * Called from the ceremony's own mount, well before anybody presses Start, so
 * that pressing Start is a `playVideoAt` and not a network request. Safe to
 * call repeatedly; there is only ever one player.
 */
export function primeCeremonyPlaylist(): void {
  if (typeof window === "undefined") return;
  if (!hasCeremonyPlaylist() || !isEmbeddablePlaylistId(CEREMONY_PLAYLIST_ID)) {
    return;
  }
  if (ready) return;

  ready = loadApi().then((api) => (api ? createPlayer(api) : null));
  // A rejection here would be an unhandled one, and the caller already treats
  // "no player" as "play the fanfare".
  ready.catch(() => null);
}

/**
 * Play a song from the playlist, chosen at random.
 *
 * Resolves `true` when it has taken responsibility for the music, and `false`
 * for every way that can fail to happen — no playlist configured, no network,
 * a private playlist, a blocked script, or simply taking too long. The caller
 * plays the fanfare on `false`, which is why none of those cases needs to be
 * distinguished here.
 */
export async function startCeremonyPlaylist(volume: number): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!hasCeremonyPlaylist() || !isEmbeddablePlaylistId(CEREMONY_PLAYLIST_ID)) {
    return false;
  }

  const mine = (generation += 1);
  primeCeremonyPlaylist();

  let instance: YouTubePlayer | null = null;
  try {
    instance = (await ready) ?? null;
  } catch {
    instance = null;
  }

  // Stopped, or started again, while YouTube was still arriving.
  if (!instance || mine !== generation) return false;

  const tracks = instance.getPlaylist() ?? [];
  const index = pickTrackIndex(tracks.length, Math.random());
  if (index < 0) return false;

  player = instance;
  instance.setVolume(0);
  instance.playVideoAt(index);
  fadeTo(instance, toPlayerVolume(volume));
  return true;
}

/** Fade out and stop. Safe to call when nothing is playing. */
export function stopCeremonyPlaylist(): void {
  generation += 1;
  const instance = player;
  player = null;
  if (!instance) return;

  fadeTo(instance, 0, () => {
    // Guarded: the ceremony may have started another song during the fade, and
    // stopping *that* one is precisely what this must not do.
    if (player === null) instance.stopVideo();
  });
}

/**
 * Ramp the volume, because YouTube's player has no equivalent of the Web Audio
 * ramp the fanfare uses and a song that starts at full is a song that makes
 * everybody jump.
 */
function fadeTo(instance: YouTubePlayer, target: number, done?: () => void) {
  if (fadeTimer) clearInterval(fadeTimer);

  let step = 0;
  // Read back rather than assumed: a fade that interrupts another fade has to
  // start from wherever that one had got to.
  const from = target === 0 ? currentVolume : 0;
  currentVolume = from;

  fadeTimer = setInterval(() => {
    step += 1;
    const next = Math.round(from + ((target - from) * step) / FADE_STEPS);
    currentVolume = next;
    instance.setVolume(next);

    if (step >= FADE_STEPS) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      done?.();
    }
  }, FADE_MS / FADE_STEPS);
}

/** The last volume this module set, so a fade can start from it. */
let currentVolume = 0;

/** Test-only: forget the player, the script promise and the volume. */
export function resetCeremonyPlaylist(): void {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  generation += 1;
  player = null;
  ready = null;
  currentVolume = 0;
  container?.remove();
  container = null;
}
