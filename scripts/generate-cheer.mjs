/**
 * Makes the celebration sound: a room breaking into applause, and a chime.
 *
 *   npm run sound:generate
 *
 * Output: `public/sounds/cheer-<hash>.mp3` plus `src/config/sound-manifest.ts`,
 * the same content-addressed pattern the avatars and pet photos use.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SYNTHESISED RATHER THAN DOWNLOADED
 * ---------------------------------------------------------------------------
 * The obvious move is to grab a cheer off a stock library. Three reasons not
 * to, in order of how much they matter:
 *
 * 1. **Licensing.** Every free source has terms, most want attribution, and
 *    "a family app nobody outside the family can reach" is not a licence. A
 *    file generated here is unambiguously ours.
 * 2. **Size and offline.** This comes out around 20KB, small enough to
 *    precache in the service worker so the celebration still fires on a phone
 *    with no signal. Stock clips are seconds long and ten times the size.
 * 3. **Reproducibility.** Everything below is seeded, so re-running this
 *    produces a byte-identical file and therefore the same content hash. A
 *    downloaded asset is a binary nobody can regenerate or adjust.
 *
 * It is a *stylised* cheer — synthesis, not a recording, and it does not
 * pretend to be one. If you want the real thing, record the actual children
 * (see `docs/stars.md`); dropping a real file in is a one-line change and it
 * will be better than anything in here.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE FIRST ONE
 * ---------------------------------------------------------------------------
 * The version this replaces was harsh, and it is worth writing down why,
 * because every cause was a decision that looked sensible on paper:
 *
 * 1. **132 claps in 1.3 seconds.** That is a clap every ten milliseconds. Past
 *    about forty per second the ear stops hearing hands and starts hearing
 *    *noise* — the individual transients fuse into a hiss.
 * 2. **Instant attacks.** Each clap began at full amplitude on its first
 *    sample. A real clap has a millisecond or two of rise; a step function
 *    does not, and a step function is a click.
 * 3. **`tanh(x * 1.9)`.** Applause is almost entirely transient, so a mix
 *    normalised on peak comes out quiet, and the drive was there to lift the
 *    average. It did — by squashing the peaks into distortion. The extra
 *    loudness was the sound of clipping.
 * 4. **Six synthesised "yay"s.** A sawtooth through three biquads is an
 *    intelligible vowel and it is not a child. It read as a kazoo, and it sat
 *    right in the 2-3kHz band the ear is most sensitive to.
 *
 * ---------------------------------------------------------------------------
 * HOW THE SOUND IS BUILT NOW
 * ---------------------------------------------------------------------------
 * Three layers, quiet to loud:
 *
 *   **A bed** — filtered noise, swelling and falling. It is barely audible on
 *   its own, and it is what stops the claps sounding like they were recorded
 *   in an anechoic chamber.
 *
 *   **Applause** — around fifty pairs of hands rather than a hundred and
 *   thirty, each with a real (if very short) attack, a body resonance low
 *   enough to have some weight to it, and a decay measured in tens of
 *   milliseconds rather than units. Times are drawn from a falling density, so
 *   the room starts together and thins out.
 *
 *   **A chime** — three notes of a major triad, rising, made of a few sine
 *   partials each. This is what replaced the voices. It is unmistakably
 *   "something good just happened", it costs about fifteen lines, and unlike a
 *   synthesised shout it cannot sound like a bad imitation of a child, because
 *   it is not imitating one.
 *
 * Then delay taps for the room, a gentle lowpass to take the glare off the top
 * end, a *mild* soft clip, and fades so nothing starts or stops with a click.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "sounds");
const MANIFEST = join(ROOT, "src", "config", "sound-manifest.ts");

const SAMPLE_RATE = 44_100;
/**
 * 1.6 seconds: the 1.5 the celebration wants, plus 100ms of tail so the room
 * has somewhere to die away instead of being cut off.
 */
const DURATION_SECONDS = 1.6;
const LENGTH = Math.round(SAMPLE_RATE * DURATION_SECONDS);

/** Mono. Nobody is listening to this in stereo, and it halves the file. */
const CHANNELS = 1;

/* -------------------------------------------------------------------------- */
/* Determinism                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A seeded PRNG (mulberry32), used for every random choice below.
 *
 * `Math.random()` would make this script produce a different file every run,
 * which would churn the content hash, the service-worker cache and the git
 * history for no reason at all. Change the seed to draw a different crowd.
 */
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const random = createRandom(20_260_805);

/** Uniform in [min, max). */
function between(min, max) {
  return min + random() * (max - min);
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A two-pole resonant bandpass, applied in place.
 *
 * Hand-rolled rather than pulled in: it is six lines, and the whole point of
 * this script is that it has no dependencies to install before a sound can be
 * regenerated in five years' time.
 */
function bandpass(samples, centreHz, q) {
  const w0 = (2 * Math.PI * centreHz) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i];
    const y0 = (b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
  return samples;
}

/**
 * A one-pole lowpass, applied in place.
 *
 * The final mix goes through this and so does every clap. Six lines, same
 * reasoning as `bandpass` — no dependency should stand between somebody and
 * regenerating this file.
 */
function lowpass(samples, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = 1 / SAMPLE_RATE / (rc + 1 / SAMPLE_RATE);
  let previous = 0;
  for (let i = 0; i < samples.length; i += 1) {
    previous += alpha * (samples[i] - previous);
    samples[i] = previous;
  }
  return samples;
}

/**
 * One pair of hands.
 *
 * Three details separate this from the version that sounded like static, and
 * all three are about the *envelope* rather than the spectrum:
 *
 *  - **A real attack.** 1.5-3ms of rise. Inaudible as a ramp, and the
 *    difference between a clap and a click.
 *  - **A decay in tens of milliseconds**, not units, so the hands have some
 *    ring rather than being a single spike.
 *  - **Two bands, not one.** A bandpass around 1-2kHz for the slap, plus a
 *    lower, quieter body around 400-700Hz. Cupped hands have a resonant cavity
 *    in them; a clap with no low end at all is a snare rim.
 */
function clap(startSeconds, gain) {
  const length = Math.round(SAMPLE_RATE * between(0.05, 0.09));
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i += 1) noise[i] = random() * 2 - 1;

  const slap = bandpass(
    Float32Array.from(noise),
    between(900, 2100),
    between(0.8, 1.4),
  );
  const body = bandpass(
    Float32Array.from(noise),
    between(380, 700),
    between(1.2, 2.2),
  );

  const attack = Math.max(1, Math.round(SAMPLE_RATE * between(0.0015, 0.003)));
  const tau = SAMPLE_RATE * between(0.012, 0.028);

  const piece = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const rise = i < attack ? i / attack : 1;
    piece[i] = (slap[i] + body[i] * 0.5) * rise * Math.exp(-i / tau);
  }

  // The top end of a clap is where the harshness lives, and a phone speaker
  // exaggerates it. Rolling it off here rather than only on the mix means the
  // room's delay taps are not re-adding it a moment later.
  lowpass(piece, 7000);

  return { piece, offset: Math.round(startSeconds * SAMPLE_RATE), gain };
}

/**
 * One note of the chime, as a struck bell rather than a beep.
 *
 * A bare sine is a test tone. What makes this a *note* is three things it has
 * on top of one: a couple of quiet inharmonic partials, a short burst of
 * brightness at the start that dies away faster than the fundamental does
 * (which is what "struck" sounds like), and a decay long enough to still be
 * ringing under the next note.
 */
function bell(startSeconds, frequency, lengthSeconds, gain) {
  const length = Math.round(SAMPLE_RATE * lengthSeconds);
  const piece = new Float32Array(length);

  // Ratios rather than integers: a real bell's partials are not harmonics, and
  // the slight detuning is most of what stops this sounding like an organ.
  const PARTIALS = [
    { ratio: 1, gain: 1, decay: 0.42 },
    { ratio: 2.01, gain: 0.36, decay: 0.24 },
    { ratio: 3.02, gain: 0.14, decay: 0.13 },
    { ratio: 5.4, gain: 0.05, decay: 0.07 },
  ];

  for (const { ratio, gain: level, decay } of PARTIALS) {
    const omega = (2 * Math.PI * frequency * ratio) / SAMPLE_RATE;
    const tau = SAMPLE_RATE * decay;
    for (let i = 0; i < length; i += 1) {
      piece[i] += Math.sin(omega * i) * level * Math.exp(-i / tau);
    }
  }

  // 3ms of rise. Shorter and the note starts with a click of its own; longer
  // and it fades in rather than being struck.
  const attack = Math.round(SAMPLE_RATE * 0.003);
  for (let i = 0; i < attack; i += 1) piece[i] *= i / attack;
  for (let i = 0; i < length; i += 1) piece[i] *= gain;

  return { piece, offset: Math.round(startSeconds * SAMPLE_RATE), gain: 1 };
}

/**
 * The room behind the hands: filtered noise that swells and falls away.
 *
 * Almost inaudible by itself, and the whole mix sounds thin without it. Fifty
 * claps in a silent field is a sound effect; fifty claps over a bed is a room
 * with people in it.
 */
function crowdBed(lengthSeconds, gain) {
  const length = Math.round(SAMPLE_RATE * lengthSeconds);
  const piece = new Float32Array(length);
  for (let i = 0; i < length; i += 1) piece[i] = random() * 2 - 1;

  bandpass(piece, 900, 0.5);
  lowpass(piece, 3500);

  // Up fast, down slowly — the same shape as the applause it sits under.
  for (let i = 0; i < length; i += 1) {
    const progress = i / length;
    const envelope =
      Math.min(1, progress * 12) * Math.exp(-Math.max(0, progress - 0.1) * 3.2);
    piece[i] *= envelope * gain;
  }

  return { piece, offset: 0, gain: 1 };
}
/* -------------------------------------------------------------------------- */
/* The mix                                                                     */
/* -------------------------------------------------------------------------- */

function build() {
  const mix = new Float32Array(LENGTH);
  const add = ({ piece, offset, gain }) => {
    for (let i = 0; i < piece.length; i += 1) {
      const at = offset + i;
      if (at >= 0 && at < LENGTH) mix[at] += piece[i] * gain;
    }
  };

  /* --- The bed --------------------------------------------------------- */

  // Under everything, and quiet enough that you would only notice it if it
  // were missing.
  add(crowdBed(1.45, 0.1));

  /* --- Applause -------------------------------------------------------- */

  /*
   * Clap times are drawn from a falling density: a burst as everyone starts
   * together, then thinning out. Evenly spaced claps sound like a machine, and
   * clustered ones sound like a room.
   *
   * Fifty-two rather than the old hundred and thirty-two. That is roughly a
   * clap every twenty-five milliseconds at the peak, which is about as dense
   * as applause can be before the transients fuse and the whole thing turns
   * into hiss — the single biggest cause of the harshness this replaced.
   */
  const CLAPS = 52;
  for (let i = 0; i < CLAPS; i += 1) {
    const progress = i / CLAPS;
    // Squaring pushes the times towards the start without ever exceeding 1.2s.
    const at = Math.min(1.2, progress ** 0.6 * 1.2 + between(-0.035, 0.035));
    // Later claps are quieter, as if the room is settling.
    const gain = between(0.4, 1) * (1 - 0.5 * progress);
    add(clap(Math.max(0, at), gain * 0.55));
  }

  /* --- The chime ------------------------------------------------------- */

  /*
   * A major triad, rising: C6, E6, G6, with the octave on top to finish. High
   * enough to sit above the applause rather than fight it, spaced so each note
   * is still ringing when the next arrives, and quiet — this is the thing that
   * makes the noise read as a celebration, not the thing you are meant to
   * listen to.
   */
  const CHIME = [
    { start: 0.0, hz: 1046.5, length: 0.7, gain: 0.2 },
    { start: 0.1, hz: 1318.5, length: 0.7, gain: 0.19 },
    { start: 0.2, hz: 1568.0, length: 0.8, gain: 0.18 },
    { start: 0.34, hz: 2093.0, length: 1.0, gain: 0.15 },
  ];
  for (const { start, hz, length, gain } of CHIME) {
    add(bell(start, hz, length, gain));
  }

  /* --- The room -------------------------------------------------------- */

  /*
   * Six delay taps rather than a real convolution reverb. A proper impulse
   * response would be 600 million multiplies and a file to keep somewhere;
   * this is close enough to stop the mix sounding like it was recorded inside
   * a cupboard, and it costs nothing.
   */
  const TAPS = [
    { ms: 17, gain: 0.24 },
    { ms: 29, gain: 0.19 },
    { ms: 43, gain: 0.15 },
    { ms: 67, gain: 0.11 },
    { ms: 97, gain: 0.08 },
    { ms: 139, gain: 0.05 },
  ];
  const dry = Float32Array.from(mix);
  for (const { ms, gain } of TAPS) {
    const delay = Math.round((ms / 1000) * SAMPLE_RATE);
    for (let i = delay; i < LENGTH; i += 1) mix[i] += dry[i - delay] * gain;
  }

  /* --- Levels ---------------------------------------------------------- */

  /*
   * One gentle lowpass across the whole mix. The delay taps above re-add the
   * top end that each clap had already had rolled off, and 8kHz is where a
   * phone speaker stops reproducing anything useful and starts just sounding
   * thin and glassy.
   */
  lowpass(mix, 8000);

  // Normalise first, so the soft clip below is doing the same job every run
  // regardless of how the seeded crowd happened to land.
  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) {
    const scale = 0.92 / peak;
    for (let i = 0; i < LENGTH; i += 1) mix[i] *= scale;
  }

  /*
   * `tanh` rather than a hard limit: it rounds the transients off instead of
   * squaring them, which is the difference between "loud" and "distorted".
   *
   * Drive of 1.3 rather than the 1.9 this used to use. The old figure was
   * chosen to lift the average level of a mix that is nearly all transient,
   * and it did — by flattening every clap into the same square-ish shape. What
   * fixed the loudness properly was giving the claps a longer decay and adding
   * a bed underneath them, both of which raise the average *without* touching
   * the peaks. This is now only catching the handful of moments where several
   * hands happen to land on the same sample.
   */
  for (let i = 0; i < LENGTH; i += 1) mix[i] = Math.tanh(mix[i] * 1.3) * 0.95;

  // Fades. 4ms in is inaudible but removes the click; 200ms out lets the last
  // claps land and the chime ring away rather than being guillotined.
  const fadeIn = Math.round(SAMPLE_RATE * 0.004);
  const fadeOut = Math.round(SAMPLE_RATE * 0.2);
  for (let i = 0; i < fadeIn; i += 1) mix[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i += 1) {
    mix[LENGTH - 1 - i] *= i / fadeOut;
  }

  return mix;
}

/* -------------------------------------------------------------------------- */
/* Encoding                                                                    */
/* -------------------------------------------------------------------------- */

/** 16-bit PCM WAV. The intermediate ffmpeg reads; never committed. */
function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM header length
  buffer.writeUInt16LE(1, 20); // format: PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28); // byte rate
  buffer.writeUInt16LE(CHANNELS * 2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32_767), 44 + i * 2);
  }
  return buffer;
}

function main() {
  console.log("Synthesising the cheer…");
  const wav = encodeWav(build());

  const temp = join(tmpdir(), `birch-cheer-${process.pid}.wav`);
  writeFileSync(temp, wav);

  /*
   * MP3 rather than AAC or Opus, and this is the one place a worse codec is
   * the right answer: MP3 is the only lossy format every browser this app
   * might meet decodes without a fallback file, and at 96kbps mono the
   * difference on a phone speaker playing applause is nothing at all.
   */
  const mp3Temp = join(tmpdir(), `birch-cheer-${process.pid}.mp3`);
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", temp, "-ac", "1", "-b:a", "96k", mp3Temp],
      { stdio: "inherit" },
    );
  } catch (error) {
    unlinkSync(temp);
    console.error(
      "\nffmpeg failed. It is the only thing this script needs that is not " +
        "in the repo:\n  brew install ffmpeg\n",
    );
    throw error;
  }

  const mp3 = readFileSync(mp3Temp);
  unlinkSync(temp);
  unlinkSync(mp3Temp);

  const hash = createHash("sha256").update(mp3).digest("hex").slice(0, 10);
  const filename = `cheer-${hash}.mp3`;

  mkdirSync(OUT_DIR, { recursive: true });
  // Old hashes are removed rather than left to pile up: nothing can reference
  // them, because the manifest below is the only thing that names the file.
  for (const existing of readdirSync(OUT_DIR)) {
    if (existing.startsWith("cheer-") && existing !== filename) {
      rmSync(join(OUT_DIR, existing));
    }
  }
  writeFileSync(join(OUT_DIR, filename), mp3);

  writeFileSync(
    MANIFEST,
    `/**
 * Generated by \`npm run sound:generate\` — do not edit by hand.
 *
 * The celebration sound, content-hashed exactly as the avatars and pet photos
 * are, so \`next.config.ts\` can serve it \`immutable\` for a year and the
 * service worker can precache it and never revalidate.
 *
 * See \`scripts/generate-cheer.mjs\` for how it is made and how to replace it
 * with a recording of the real children.
 */

export const CHEER_SOUND = "/sounds/${filename}" as const;

/** Seconds. Used to size the celebration, not to schedule anything. */
export const CHEER_DURATION_SECONDS = ${DURATION_SECONDS};
`,
  );

  console.log(`  ✓ public/sounds/${filename}  (${(mp3.length / 1024).toFixed(1)}KB)`);
  console.log(`  ✓ src/config/sound-manifest.ts`);
}

main();
