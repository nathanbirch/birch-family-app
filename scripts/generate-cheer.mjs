/**
 * Makes the celebration sound: a room of children clapping and shouting "yay".
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
 * HOW THE SOUND IS BUILT
 * ---------------------------------------------------------------------------
 * Two layers, because a cheer is two unrelated things happening at once:
 *
 *   **Applause** — ninety-odd claps, each a few milliseconds of noise through
 *   a bandpass and a steep decay. Real applause is dense at the start and
 *   thins out, so the clap times are drawn from a falling density rather than
 *   spread evenly, and each clap gets its own filter centre so no two are the
 *   same hand.
 *
 *   **Voices** — six children shouting "yay", built by formant synthesis: a
 *   buzzy glottal pulse train through three resonators whose centres move the
 *   way a mouth does through /j/-/eɪ/. Children's voices sit high, so the
 *   fundamentals are 300-460Hz, and each voice gets its own pitch contour,
 *   vibrato and onset so it reads as several children rather than a chord.
 *
 * Then a handful of delay taps for the room, a soft clip to keep the peaks
 * civil, and fades so nothing starts or stops with a click.
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

/** One pair of hands. A few milliseconds of noise, shaped and coloured. */
function clap(startSeconds, gain) {
  // 18ms of noise is plenty: past that a clap starts to sound like a hiss.
  const length = Math.round(SAMPLE_RATE * between(0.012, 0.02));
  const piece = new Float32Array(length);

  // Decay constant, in samples. Short and steep — this is a transient.
  const tau = SAMPLE_RATE * between(0.002, 0.006);
  for (let i = 0; i < length; i += 1) {
    piece[i] = (random() * 2 - 1) * Math.exp(-i / tau);
  }

  // Every pair of hands has its own resonance; 900Hz-3.2kHz is where a clap
  // lives, and spreading the centres is what stops ninety claps sounding like
  // one clap played ninety times.
  bandpass(piece, between(1100, 4200), between(0.7, 1.6));

  return { piece, offset: Math.round(startSeconds * SAMPLE_RATE), gain };
}

/**
 * One child shouting "yay".
 *
 * The vowel is the interesting part. /eɪ/ moves the first formant down and the
 * second up as the mouth closes towards the /ɪ/, which is what makes it a
 * diphthong rather than a held "eh" — so F1 and F2 are interpolated across the
 * shout rather than fixed.
 */
function voice(startSeconds, f0, lengthSeconds, gain) {
  const length = Math.round(SAMPLE_RATE * lengthSeconds);
  const excitation = new Float32Array(length);

  const vibratoHz = between(4.5, 6.5);
  const vibratoDepth = between(0.01, 0.028);

  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const progress = i / length;

    /*
     * The pitch of a shout: up quickly, hold, then fall away at the end. A
     * flat pitch is the single thing that makes synthesised voices sound
     * synthesised, so this and the vibrato matter more than they look.
     */
    const contour =
      1 + 0.16 * Math.sin(Math.PI * Math.min(1, progress * 1.4)) - 0.1 * progress ** 2;
    const vibrato = 1 + vibratoDepth * Math.sin(2 * Math.PI * vibratoHz * t);
    const frequency = f0 * contour * vibrato;

    phase += frequency / SAMPLE_RATE;
    if (phase >= 1) phase -= 1;

    /*
     * Glottal excitation. A sawtooth is the standard cheap stand-in: it has
     * every harmonic, which is what the formant filters need something to bite
     * on. Adding a touch of breath noise stops it sounding like an organ.
     */
    excitation[i] = (2 * phase - 1) * 0.8 + (random() * 2 - 1) * 0.12;
  }

  /*
   * Three formants, each filtered from the same excitation and summed. F1 and
   * F2 sweep; F3 is fixed and quiet and mostly just adds presence.
   *
   * The sweep is done in four short segments rather than per-sample, because a
   * biquad whose coefficients change every sample is not a stable filter — it
   * chirps. Four is enough to hear the vowel move.
   */
  const SEGMENTS = 4;
  const out = new Float32Array(length);
  const segmentLength = Math.ceil(length / SEGMENTS);

  // /j/ -> /e/ -> /ɪ/: F1 falls, F2 climbs. Children's formants sit higher
  // than an adult's, which is already accounted for in these numbers.
  const F1 = [520, 760, 620, 470];
  const F2 = [2350, 2050, 2250, 2600];
  const F3 = 3200;

  for (let s = 0; s < SEGMENTS; s += 1) {
    const from = s * segmentLength;
    const to = Math.min(length, from + segmentLength);
    if (to <= from) break;

    const slice = excitation.slice(from, to);

    const first = bandpass(Float32Array.from(slice), F1[s], 9);
    const second = bandpass(Float32Array.from(slice), F2[s], 11);
    const third = bandpass(Float32Array.from(slice), F3, 13);

    for (let i = from; i < to; i += 1) {
      const j = i - from;
      out[i] = first[j] * 1 + second[j] * 0.55 + third[j] * 0.22;
    }
  }

  /*
   * The shout's envelope. A fast attack because it is a shout and not a note,
   * a plateau, and a long release so it sounds like a room rather than a
   * button being pressed.
   */
  const attack = Math.round(SAMPLE_RATE * 0.035);
  const release = Math.round(SAMPLE_RATE * 0.28);
  for (let i = 0; i < length; i += 1) {
    let envelope = 1;
    if (i < attack) envelope = i / attack;
    else if (i > length - release) envelope = (length - i) / release;
    out[i] *= envelope * envelope * gain;
  }

  return { piece: out, offset: Math.round(startSeconds * SAMPLE_RATE), gain: 1 };
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

  /* --- Applause -------------------------------------------------------- */

  /*
   * Clap times are drawn from a falling density: a burst as everyone starts
   * together, then thinning out. Evenly spaced claps sound like a machine, and
   * clustered ones sound like a room.
   */
  const CLAPS = 132;
  for (let i = 0; i < CLAPS; i += 1) {
    const progress = i / CLAPS;
    // Squaring pushes the times towards the start without ever exceeding 1.3s.
    const at = Math.min(1.3, progress ** 0.62 * 1.3 + between(-0.03, 0.03));
    // Later claps are quieter, as if the room is settling.
    const gain = between(0.35, 1) * (1 - 0.45 * progress);
    add(clap(Math.max(0, at), gain * 0.95));
  }

  /* --- Voices ---------------------------------------------------------- */

  /*
   * Six children. Fundamentals spread across a fifth or so, because six voices
   * on the same note is a chord, and a chord is a choir rather than a cheer.
   * The two lowest start a little late — the youngest always joins in after
   * everyone else.
   */
  const VOICES = [
    { start: 0.02, f0: 396, length: 0.86, gain: 0.34 },
    { start: 0.05, f0: 342, length: 0.8, gain: 0.3 },
    { start: 0.09, f0: 448, length: 0.72, gain: 0.26 },
    { start: 0.13, f0: 308, length: 0.9, gain: 0.28 },
    { start: 0.18, f0: 366, length: 0.68, gain: 0.24 },
    { start: 0.26, f0: 424, length: 0.62, gain: 0.22 },
  ];
  for (const { start, f0, length, gain } of VOICES) {
    add(voice(start, f0, length, gain));
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

  // Normalise first, so the soft clip below is doing the same job every run
  // regardless of how the seeded crowd happened to land.
  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) {
    const scale = 0.9 / peak;
    for (let i = 0; i < LENGTH; i += 1) mix[i] *= scale;
  }

  // `tanh` rather than a hard limit: it rounds the transients off instead of
  // squaring them, which is the difference between "loud" and "distorted".
  /*
   * Drive of 1.9 is doing double duty: it saturates the clap transients, which
   * is what a room full of hands actually sounds like, and it lifts the
   * *average* level. Applause is nearly all transient, so a mix normalised on
   * peak alone comes out quiet — this is the difference between a celebration
   * and a polite noise from a phone speaker across a kitchen.
   */
  for (let i = 0; i < LENGTH; i += 1) mix[i] = Math.tanh(mix[i] * 1.9) * 0.92;

  // Fades. 4ms in is inaudible but removes the click; 140ms out lets the last
  // claps land rather than being guillotined.
  const fadeIn = Math.round(SAMPLE_RATE * 0.004);
  const fadeOut = Math.round(SAMPLE_RATE * 0.14);
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
