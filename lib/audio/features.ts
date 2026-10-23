import type { AudioFeatures, BaseParams } from "@/sketches/types";

/**
 * Audio feature extraction: FFT bins → bass / mid / treble / volume / beat.
 *
 * FFT in one line: the analyser splits the last `fftSize` samples into
 * `fftSize / 2` frequency bins, evenly spaced from 0 Hz to sampleRate / 2.
 *
 *   bin width = sampleRate / fftSize          (48 000 / 2048 ≈ 23.4 Hz)
 *   bin index = round(frequency / binWidth)
 *
 *   0 Hz      250 Hz         2 kHz                          16 kHz     24 kHz
 *   |─ bass ──|──── mid ──────|────────── treble ─────────────|─ unused ─|
 *   bins 1–11   11–85           85–683                          (at 48 kHz)
 */

export const SPECTRUM_BANDS = 32;

export const BANDS = {
  bass: [20, 250],
  mid: [250, 2000],
  treble: [2000, 16000],
} as const;

export function silentFeatures(): AudioFeatures {
  return {
    active: false,
    bass: 0,
    mid: 0,
    treble: 0,
    volume: 0,
    beat: false,
    beatPulse: 0,
    spectrum: new Float32Array(SPECTRUM_BANDS),
  };
}

export function binIndex(freq: number, sampleRate: number, fftSize: number): number {
  const binWidth = sampleRate / fftSize;
  return Math.min(fftSize / 2 - 1, Math.max(0, Math.round(freq / binWidth)));
}

/** Inclusive [start, end] bin range for a frequency band. Never empty. */
export function bandRange(
  lo: number,
  hi: number,
  sampleRate: number,
  fftSize: number,
): [number, number] {
  const start = Math.max(1, binIndex(lo, sampleRate, fftSize)); // skip bin 0 (DC offset)
  const end = Math.max(start, binIndex(hi, sampleRate, fftSize));
  return [start, end];
}

/** Mean of byte magnitudes (0–255) over [start, end], normalised to 0..1. */
export function averageBins(data: ArrayLike<number>, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i <= end; i++) sum += data[i] ?? 0;
  return sum / ((end - start + 1) * 255);
}

export interface BeatOptions {
  /** Samples in the rolling average (~1 s at 60 fps). */
  window?: number;
  /** A beat = energy above average × threshold. */
  threshold?: number;
  /** Minimum gap between beats. 350 ms also caps beats below 3/s (photosensitivity). */
  cooldownMs?: number;
  /** Ignore near-silence so noise floor wiggles don't count. */
  minEnergy?: number;
}

/**
 * Simple onset detector: compares current bass energy with its rolling average.
 *
 *   energy ─┐      ┌─ beat if energy > avg × threshold
 *           ├─► avg │       and energy > minEnergy
 *   history ┘      └─       and now − lastBeat ≥ cooldown
 *
 * The cooldown matters: one kick drum lasts several frames, and without it a single
 * hit would fire on every one of them.
 */
export function createBeatDetector(opts: BeatOptions = {}) {
  const { window = 60, threshold = 1.4, cooldownMs = 350, minEnergy = 0.1 } = opts;
  const history = new Float32Array(window);
  let filled = 0;
  let head = 0;
  let sum = 0;
  let lastBeat = -Infinity;

  return function detect(energy: number, timeMs: number): boolean {
    const avg = filled > 0 ? sum / filled : 0;
    const isBeat =
      filled >= window / 4 && // need some history first
      energy > minEnergy &&
      energy > avg * threshold &&
      timeMs - lastBeat >= cooldownMs;
    if (isBeat) lastBeat = timeMs;

    // Push into the ring buffer, keeping a running sum (O(1) per frame).
    sum -= history[head] ?? 0;
    history[head] = energy;
    sum += energy;
    head = (head + 1) % window;
    if (filled < window) filled++;
    return isBeat;
  };
}

/**
 * Frame-rate-independent exponential smoothing. Fast attack, slower release: visuals
 * jump with a hit and ease back down, instead of flickering with every frame.
 */
export function smooth(prev: number, target: number, dt: number, attack = 0.03, release = 0.2) {
  const tau = target > prev ? attack : release;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

// Treble bins are naturally much quieter than bass; these gains bring the bands to a
// similar range for typical music.
const GAIN = { bass: 1.15, mid: 1.6, treble: 3 };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class FeatureExtractor {
  readonly features = silentFeatures();
  private readonly detectBeat = createBeatDetector();
  private ranges: { bass: [number, number]; mid: [number, number]; treble: [number, number] };
  private spectrumRanges: [number, number][];

  constructor(
    private readonly sampleRate: number,
    private readonly fftSize: number,
  ) {
    this.ranges = {
      bass: bandRange(...BANDS.bass, sampleRate, fftSize),
      mid: bandRange(...BANDS.mid, sampleRate, fftSize),
      treble: bandRange(...BANDS.treble, sampleRate, fftSize),
    };
    // Log-spaced bands from 30 Hz to 16 kHz: equal steps in pitch, like a piano keyboard.
    this.spectrumRanges = [];
    const lo = Math.log(30);
    const hi = Math.log(16000);
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const f0 = Math.exp(lo + ((hi - lo) * i) / SPECTRUM_BANDS);
      const f1 = Math.exp(lo + ((hi - lo) * (i + 1)) / SPECTRUM_BANDS);
      this.spectrumRanges.push(bandRange(f0, f1, sampleRate, fftSize));
    }
  }

  /** Call once per frame with the analyser's byte frequency data. */
  update(freq: Uint8Array | null, timeMs: number, dt: number): AudioFeatures {
    const f = this.features;
    const active = freq !== null;
    const raw = (band: keyof typeof GAIN) =>
      active ? clamp01(averageBins(freq, ...this.ranges[band]) * GAIN[band]) : 0;
    const bass = raw("bass");
    const mid = raw("mid");
    const treble = raw("treble");

    f.active = active;
    f.bass = smooth(f.bass, bass, dt);
    f.mid = smooth(f.mid, mid, dt);
    f.treble = smooth(f.treble, treble, dt);
    f.volume = smooth(f.volume, clamp01((bass + mid + treble) / 2.2), dt);
    f.beat = active && this.detectBeat(bass, timeMs);
    f.beatPulse = f.beat ? 1 : f.beatPulse * Math.exp(-dt / 0.18);
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const target = active ? clamp01(averageBins(freq, ...this.spectrumRanges[i]!) * 1.4) : 0;
      f.spectrum[i] = smooth(f.spectrum[i] ?? 0, target, dt, 0.05, 0.3);
    }
    return f;
  }
}

/**
 * Per-band sensitivity from the panel, applied after extraction. With reduced motion,
 * beats are suppressed entirely (no beat-driven pulses at all).
 */
export function applySensitivity(
  src: AudioFeatures,
  params: BaseParams,
  reducedMotion: boolean,
  out: AudioFeatures,
): AudioFeatures {
  const s = (v: unknown) => (typeof v === "number" ? v : 1);
  out.active = src.active;
  out.bass = clamp01(src.bass * s(params.sensBass));
  out.mid = clamp01(src.mid * s(params.sensMid));
  out.treble = clamp01(src.treble * s(params.sensTreble));
  out.volume = src.volume;
  out.beat = reducedMotion ? false : src.beat;
  out.beatPulse = reducedMotion ? 0 : src.beatPulse;
  out.spectrum = src.spectrum;
  return out;
}
