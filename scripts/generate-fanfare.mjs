/**
 * Makes the award-ceremony music: a triumphant brass fanfare that loops.
 *
 *   npm run music:generate
 *
 * Output: `public/sounds/fanfare-<hash>.mp3` plus `src/config/music-manifest.ts`,
 * the same content-addressed pattern the cheer, the avatars and the pet photos
 * use.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SYNTHESISED RATHER THAN DOWNLOADED
 * ---------------------------------------------------------------------------
 * The same three reasons as `generate-cheer.mjs`, and one more that only
 * applies to music:
 *
 * 1. **Licensing.** Production music is the most aggressively licensed audio
 *    there is. Even "royalty-free" libraries want a per-project licence, and
 *    "a family app nobody outside the family can reach" is not one. This file
 *    is unambiguously ours.
 * 2. **Size.** Twenty-two seconds at 96kbps mono is about 260KB. A stock
 *    orchestral cue is 3-4MB, which is a real cost on a phone in a driveway.
 * 3. **Reproducibility.** Everything below is deterministic, so re-running
 *    produces a byte-identical file and therefore the same content hash.
 * 4. **It has to loop.** The ceremony runs as long as it runs — six slides, or
 *    a child who sits on one of them — so the music cannot be a clip with an
 *    ending. Written here, the loop point is a property of the composition:
 *    the piece is exactly twelve bars long and every tail wraps around into
 *    the start (see `add()`), so bar 12 runs into bar 1 with no seam at all.
 *
 * It is a *stylised* fanfare and does not pretend to be an orchestra. If
 * somebody in the family plays this on a real instrument, record it: point
 * `FANFARE_SOUND` at the new file and nothing else changes.
 *
 * ---------------------------------------------------------------------------
 * HOW THE MUSIC IS BUILT
 * ---------------------------------------------------------------------------
 * D major, 128bpm, twelve bars — I · IV · V · vi, twice round with the melody
 * climbing an octave the second time. It is written as a score (`MELODY`,
 * `BARS`) rather than as code that makes noises, so it can be *changed like
 * music*: move a note, not a formula.
 *
 * Five voices, each an ordinary bit of synthesis:
 *
 *   **Brass** — additive. Harmonics 1..16 at 1/n, each with its own attack, so
 *   the note opens up as it sounds; that late brightness is most of what makes
 *   a sawtooth read as a horn rather than as a buzzer. Octave-doubled and
 *   slightly detuned for the melody, which is what a section sounds like next
 *   to one player.
 *   **Pad** — the same generator with the top harmonics gone and a slow
 *   attack, holding the chord under everything.
 *   **Bass** — the root, two octaves down, mostly fundamental.
 *   **Timpani** — a sine whose pitch falls a fourth in the first 80ms over a
 *   noise transient. That falling pitch is the whole trick.
 *   **Cymbal and bells** — bandpassed noise for the crash, and four inharmonic
 *   partials (1 : 2.76 : 5.4 : 8.9) for the glockenspiel sparkle.
 *
 * Then delay taps for the hall, gentle saturation, and no fades — a fade would
 * put a hole in the loop.
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
const MANIFEST = join(ROOT, "src", "config", "music-manifest.ts");

const SAMPLE_RATE = 44_100;

/** Mono, like the cheer. Nobody listens to a phone speaker in stereo. */
const CHANNELS = 1;

const BPM = 128;
const BEATS_PER_BAR = 4;
const BARS = 12;
const SECONDS_PER_BEAT = 60 / BPM;
const DURATION_SECONDS = BARS * BEATS_PER_BAR * SECONDS_PER_BEAT; // 22.5
const LENGTH = Math.round(SAMPLE_RATE * DURATION_SECONDS);

/* -------------------------------------------------------------------------- */
/* Determinism                                                                 */
/* -------------------------------------------------------------------------- */

/** Seeded PRNG (mulberry32) — see the note in `generate-cheer.mjs`. */
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

const random = createRandom(20_260_806);

/* -------------------------------------------------------------------------- */
/* The score                                                                   */
/* -------------------------------------------------------------------------- */

/** MIDI note number to hertz. 69 is the A above middle C, at 440Hz. */
function hz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Beats from the top of the piece, given a bar and a beat within it. */
function at(bar, beat) {
  return (bar * BEATS_PER_BAR + beat) * SECONDS_PER_BEAT;
}

/**
 * The four chords, voiced rather than merely spelled.
 *
 * Each is a bass note and the notes the horns hold. The voicings move by as
 * little as possible between chords — D to G keeps D and moves two notes —
 * which is what stops a four-chord loop sounding like four unrelated stabs.
 */
const CHORDS = {
  D: { bass: 38, notes: [50, 62, 66, 69] }, //  I   D2 · D3 D4 F#4 A4
  G: { bass: 43, notes: [50, 62, 67, 71] }, //  IV  G2 · D4 G4 B4
  A: { bass: 45, notes: [49, 61, 64, 69] }, //  V   A2 · C#4 E4 A4
  Bm: { bass: 47, notes: [50, 59, 66, 71] }, // vi  B2 · B3 D4 F#4
};

/** One chord per bar. Twelve bars: the four-chord turn, three times over. */
const PROGRESSION = [
  "D", "D", "G", "A",
  "Bm", "G", "D", "A",
  "D", "G", "A", "D",
];

/**
 * The tune, as `[bar, beat, beats, midi]`.
 *
 * Bars 0-3 state it, 4-7 answer it, 8-11 restate it a step higher and hold the
 * last note across the loop point. The dotted-quaver openings are the fanfare
 * gesture — a fanfare is a rhythm at least as much as it is a set of notes.
 */
const MELODY = [
  // Bars 0-3: the statement.
  [0, 0, 0.75, 74], [0, 0.75, 0.25, 76], [0, 1, 1, 78],
  [0, 2, 0.75, 81], [0, 2.75, 0.25, 78], [0, 3, 1, 76],
  [1, 0, 1.5, 78], [1, 1.5, 0.5, 74], [1, 2, 2, 69],
  [2, 0, 0.75, 79], [2, 0.75, 0.25, 81], [2, 1, 1, 83],
  [2, 2, 0.75, 86], [2, 2.75, 0.25, 83], [2, 3, 1, 81],
  [3, 0, 1.5, 83], [3, 1.5, 0.5, 81], [3, 2, 2, 76],

  // Bars 4-7: the answer, higher and busier.
  [4, 0, 1, 83], [4, 1, 1, 78], [4, 2, 1, 83], [4, 3, 1, 86],
  [5, 0, 1, 83], [5, 1, 1, 86], [5, 2, 2, 79],
  [6, 0, 0.75, 74], [6, 0.75, 0.25, 78], [6, 1, 1, 81], [6, 2, 2, 86],
  [7, 0, 1, 85], [7, 1, 1, 81], [7, 2, 2, 76],

  // Bars 8-11: the restatement, and the note that carries the loop round.
  [8, 0, 1, 86], [8, 1, 0.5, 83], [8, 1.5, 0.5, 81], [8, 2, 2, 78],
  [9, 0, 1, 83], [9, 1, 1, 86], [9, 2, 1, 88], [9, 3, 1, 86],
  [10, 0, 1.5, 85], [10, 1.5, 0.5, 83], [10, 2, 2, 81],
  [11, 0, 4, 86],
];

/** Bars that get a crash: the top, both halves, and the last one. */
const CRASH_BARS = [0, 4, 8, 11];

/* -------------------------------------------------------------------------- */
/* Voices                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A brass note, built from harmonics.
 *
 * `bright` decides how many harmonics there are and how late they arrive. At
 * 1 it is a horn; at 0.35 with a slow attack it is the pad holding the chord
 * underneath. The staggered harmonic attacks are the important part: a note
 * whose harmonics all start together sounds like an organ, and one whose upper
 * harmonics swell in over the first 150ms sounds like somebody blowing.
 */
function brass(freq, seconds, gain, options = {}) {
  const {
    bright = 1,
    attack = 0.035,
    release = 0.16,
    vibratoHz = 5.2,
    vibratoDepth = 0.004,
    detune = 0,
  } = options;

  const length = Math.round(SAMPLE_RATE * (seconds + release));
  const out = new Float32Array(length);

  const nyquist = SAMPLE_RATE / 2;
  const harmonics = Math.max(
    1,
    Math.min(Math.round(16 * bright), Math.floor((nyquist * 0.9) / freq)),
  );

  const attackSamples = Math.max(1, Math.round(SAMPLE_RATE * attack));
  const releaseSamples = Math.max(1, Math.round(SAMPLE_RATE * release));
  const sustainStart = length - releaseSamples;

  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;

    // A touch of vibrato, and a slight upward scoop over the first 40ms —
    // brass players arrive at the pitch rather than starting on it.
    const scoop = 1 - 0.012 * Math.exp(-t / 0.02);
    const vibrato = 1 + vibratoDepth * Math.sin(2 * Math.PI * vibratoHz * t);
    phase += ((freq + detune) * scoop * vibrato) / SAMPLE_RATE;
    if (phase >= 1) phase -= 1;

    let sample = 0;
    for (let n = 1; n <= harmonics; n += 1) {
      /*
       * Harmonic n is fully present only after n * 9ms. Cheap, and it is the
       * difference between a horn and a buzzer.
       */
      const opening = Math.min(1, t / (0.009 * n + 0.01));
      sample += (Math.sin(2 * Math.PI * n * phase) / n ** 1.05) * opening;
    }

    // Amplitude envelope: quick in, a small dip off the initial accent, then
    // a linear release.
    let envelope;
    if (i < attackSamples) envelope = i / attackSamples;
    else if (i < sustainStart) envelope = 0.86 + 0.14 * Math.exp(-(t - attack) / 0.35);
    else envelope = Math.max(0, (length - i) / releaseSamples) * 0.86;

    out[i] = sample * envelope * gain;
  }
  return out;
}

/**
 * The timpani.
 *
 * Two things and no more: a sine whose pitch falls a fourth over the first
 * 80ms — that fall is what a struck drumhead does, and leaving it out gives
 * you a beep — over 12ms of noise for the stick.
 */
function timpani(freq, gain) {
  const seconds = 1.4;
  const length = Math.round(SAMPLE_RATE * seconds);
  const out = new Float32Array(length);

  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const bend = 1 + 0.33 * Math.exp(-t / 0.03);
    phase += (freq * bend) / SAMPLE_RATE;
    if (phase >= 1) phase -= 1;

    const body = Math.sin(2 * Math.PI * phase) * Math.exp(-t / 0.42);
    // The stick, and a little second harmonic so it is not a pure tone.
    const stick = t < 0.012 ? (random() * 2 - 1) * (1 - t / 0.012) * 0.6 : 0;
    const upper = Math.sin(4 * Math.PI * phase) * Math.exp(-t / 0.08) * 0.18;

    out[i] = (body + stick + upper) * gain;
  }
  return out;
}

/** A two-pole resonant bandpass, applied in place. Same one the cheer uses. */
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
 * A cymbal crash: bright noise with a fast attack and a long, uneven decay.
 *
 * Three bandpasses summed rather than one, because a cymbal is not a single
 * resonance — one pass sounds like escaping air.
 */
function crash(gain) {
  const seconds = 2.2;
  const length = Math.round(SAMPLE_RATE * seconds);
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i += 1) noise[i] = random() * 2 - 1;

  const out = new Float32Array(length);
  for (const [centre, q, level] of [
    [5200, 0.7, 1],
    [8600, 0.9, 0.75],
    [12_500, 1.1, 0.45],
  ]) {
    const band = bandpass(Float32Array.from(noise), centre, q);
    for (let i = 0; i < length; i += 1) out[i] += band[i] * level;
  }

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.004);
    out[i] *= attack * Math.exp(-t / 0.55) * gain;
  }
  return out;
}

/**
 * A glockenspiel note — the sparkle over the last four bars.
 *
 * Struck metal is inharmonic: the partials sit at 1 : 2.76 : 5.4 : 8.9 rather
 * than at whole multiples, which is exactly why it rings like a bell and not
 * like a flute.
 */
function bell(freq, gain) {
  const seconds = 1.6;
  const length = Math.round(SAMPLE_RATE * seconds);
  const out = new Float32Array(length);

  const partials = [
    [1, 1, 0.9],
    [2.76, 0.5, 0.55],
    [5.4, 0.28, 0.35],
    [8.93, 0.14, 0.22],
  ];

  for (const [ratio, level, decay] of partials) {
    const partialFreq = freq * ratio;
    if (partialFreq > SAMPLE_RATE * 0.45) continue;
    for (let i = 0; i < length; i += 1) {
      const t = i / SAMPLE_RATE;
      out[i] +=
        Math.sin(2 * Math.PI * partialFreq * t) * level * Math.exp(-t / decay);
    }
  }

  for (let i = 0; i < length; i += 1) out[i] *= gain;
  return out;
}

/* -------------------------------------------------------------------------- */
/* The mix                                                                     */
/* -------------------------------------------------------------------------- */

function build() {
  const mix = new Float32Array(LENGTH);

  /**
   * Add a voice at `seconds`, **wrapping past the end back to the beginning**.
   *
   * This is what makes the loop seamless. The last bar's cymbal and the held
   * top D ring for a couple of seconds past bar twelve; wrapped, they are
   * already sounding when bar one comes round again, which is precisely what
   * they would be doing if the piece simply carried on. Cut them off instead
   * and every repeat starts with an audible hole.
   */
  const add = (piece, seconds, gain = 1) => {
    const offset = Math.round(seconds * SAMPLE_RATE);
    for (let i = 0; i < piece.length; i += 1) {
      mix[(offset + i) % LENGTH] += piece[i] * gain;
    }
  };

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = CHORDS[PROGRESSION[bar]];
    const barSeconds = at(bar, 0);

    /* --- Bass ---------------------------------------------------------- */

    // Root on 1 and 3. Two octaves under the horns, almost pure fundamental,
    // so it is felt through a phone speaker rather than heard.
    for (const beat of [0, 2]) {
      add(
        brass(hz(chord.bass), SECONDS_PER_BEAT * 1.7, 0.5, {
          bright: 0.25,
          attack: 0.02,
          release: 0.1,
          vibratoDepth: 0,
        }),
        at(bar, beat),
      );
    }

    /* --- Chords -------------------------------------------------------- */

    // A pad across the whole bar, plus a short stab on 1 and 3. The pad is the
    // harmony; the stabs are the rhythm.
    for (const note of chord.notes) {
      add(
        brass(hz(note), SECONDS_PER_BEAT * BEATS_PER_BAR, 0.1, {
          bright: 0.4,
          attack: 0.12,
          release: 0.3,
          vibratoDepth: 0.002,
        }),
        barSeconds,
      );
      for (const beat of [0, 2]) {
        add(
          brass(hz(note), SECONDS_PER_BEAT * 0.55, 0.11, {
            bright: 0.85,
            attack: 0.012,
            release: 0.09,
          }),
          at(bar, beat),
        );
      }
    }

    /* --- Timpani ------------------------------------------------------- */

    add(timpani(hz(chord.bass - 12), 0.5), barSeconds);
    // The half-bar hit only in the bars that are going somewhere — every bar
    // and it stops being an accent.
    if (bar % 4 === 3) add(timpani(hz(chord.bass - 12), 0.34), at(bar, 2));

    /* --- Cymbal -------------------------------------------------------- */

    if (CRASH_BARS.includes(bar)) add(crash(0.12), barSeconds);
  }

  /* --- The tune -------------------------------------------------------- */

  for (const [bar, beat, beats, midi] of MELODY) {
    const seconds = SECONDS_PER_BEAT * beats;
    const start = at(bar, beat);
    const frequency = hz(midi);

    // Two players a hair apart, plus the same line an octave down. That is
    // what turns one horn into a section.
    add(brass(frequency, seconds, 0.3, { bright: 1 }), start);
    add(brass(frequency, seconds, 0.22, { bright: 1, detune: 0.7 }), start);
    add(
      brass(hz(midi - 12), seconds, 0.16, { bright: 0.7, vibratoDepth: 0.003 }),
      start,
    );

    // Bells double the restatement only. Sparkle everywhere is not sparkle.
    if (bar >= 8) add(bell(hz(midi + 12), 0.09), start);
  }

  /* --- The hall -------------------------------------------------------- */

  /*
   * Delay taps rather than a convolution reverb, exactly as in the cheer — and
   * longer here, because this is meant to sound like a hall with a ceremony in
   * it rather than a room with children in it. They wrap too, for the same
   * reason `add()` does.
   */
  const TAPS = [
    { ms: 41, gain: 0.2 },
    { ms: 73, gain: 0.16 },
    { ms: 113, gain: 0.13 },
    { ms: 179, gain: 0.1 },
    { ms: 257, gain: 0.07 },
    { ms: 389, gain: 0.05 },
  ];
  const dry = Float32Array.from(mix);
  for (const { ms, gain } of TAPS) {
    const delay = Math.round((ms / 1000) * SAMPLE_RATE);
    for (let i = 0; i < LENGTH; i += 1) {
      mix[(i + delay) % LENGTH] += dry[i] * gain;
    }
  }

  /* --- Levels ---------------------------------------------------------- */

  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) {
    const scale = 0.86 / peak;
    for (let i = 0; i < LENGTH; i += 1) mix[i] *= scale;
  }

  /*
   * Much gentler saturation than the cheer's 1.9. That one is nearly all
   * transient and wants the loudness; this plays *under* five children's names
   * being read out, so it needs to keep its dynamics and stay out of the way.
   *
   * And no fades, in or out. A fade would be a hole in the loop.
   */
  for (let i = 0; i < LENGTH; i += 1) mix[i] = Math.tanh(mix[i] * 1.15) * 0.93;

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
  console.log("Scoring the fanfare…");
  const wav = encodeWav(build());

  const temp = join(tmpdir(), `birch-fanfare-${process.pid}.wav`);
  writeFileSync(temp, wav);

  /*
   * MP3 for the same reason the cheer is MP3: it is the only lossy format
   * every browser this app might meet decodes without a fallback file.
   *
   * 112kbps rather than the cheer's 96: applause hides its artefacts and
   * sustained brass does not, and the extra 40KB is worth not hearing the
   * encoder work on a held note.
   */
  const mp3Temp = join(tmpdir(), `birch-fanfare-${process.pid}.mp3`);
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", temp, "-ac", "1", "-b:a", "112k", mp3Temp],
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
  const filename = `fanfare-${hash}.mp3`;

  mkdirSync(OUT_DIR, { recursive: true });
  // Old hashes are removed rather than left to pile up: nothing can reference
  // them, because the manifest below is the only thing that names the file.
  for (const existing of readdirSync(OUT_DIR)) {
    if (existing.startsWith("fanfare-") && existing !== filename) {
      rmSync(join(OUT_DIR, existing));
    }
  }
  writeFileSync(join(OUT_DIR, filename), mp3);

  writeFileSync(
    MANIFEST,
    `/**
 * Generated by \`npm run music:generate\` — do not edit by hand.
 *
 * The award-ceremony music, content-hashed exactly as the cheer and the
 * photographs are, so \`next.config.ts\` can serve it \`immutable\` for a year.
 *
 * See \`scripts/generate-fanfare.mjs\` for the score and how it is made.
 */

export const FANFARE_SOUND = "/sounds/${filename}" as const;

/**
 * Seconds. The piece is written to loop *exactly* here — every tail wraps
 * around into the start — so playback sets \`loop = true\` and leaves the loop
 * points alone.
 */
export const FANFARE_DURATION_SECONDS = ${DURATION_SECONDS};
`,
  );

  console.log(
    `  ✓ public/sounds/${filename}  (${(mp3.length / 1024).toFixed(1)}KB, ` +
      `${DURATION_SECONDS.toFixed(2)}s)`,
  );
  console.log(`  ✓ src/config/music-manifest.ts`);
}

main();
