import { describe, expect, it } from "vitest";
import {
  BANDS,
  FeatureExtractor,
  averageBins,
  bandRange,
  binIndex,
  createBeatDetector,
} from "./features";

const SR = 48_000;
const FFT = 2048;

/**
 * Stand-in for AnalyserNode.getByteFrequencyData: Hann-windowed DFT of a sine buffer,
 * converted to dB and mapped from [-100, -30] dB to 0..255 like the browser does.
 */
function byteSpectrum(freqHz: number, amplitude = 0.8): Uint8Array {
  const x = new Float64Array(FFT);
  for (let n = 0; n < FFT; n++) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (FFT - 1)));
    x[n] = amplitude * Math.sin((2 * Math.PI * freqHz * n) / SR) * hann;
  }
  const out = new Uint8Array(FFT / 2);
  for (let k = 0; k < FFT / 2; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < FFT; n++) {
      const a = (2 * Math.PI * k * n) / FFT;
      re += x[n]! * Math.cos(a);
      im -= x[n]! * Math.sin(a);
    }
    const mag = Math.sqrt(re * re + im * im) / FFT;
    const db = 20 * Math.log10(mag + 1e-12);
    out[k] = Math.max(0, Math.min(255, Math.round(((db + 100) / 70) * 255)));
  }
  return out;
}

describe("bins", () => {
  it("maps frequencies to bin indices", () => {
    // bin width = 48000 / 2048 ≈ 23.44 Hz
    expect(binIndex(250, SR, FFT)).toBe(11);
    expect(binIndex(2000, SR, FFT)).toBe(85);
    expect(bandRange(...BANDS.bass, SR, FFT)).toEqual([1, 11]);
  });
});

describe("band extraction on a synthetic sine", () => {
  const bands = (data: Uint8Array) => ({
    bass: averageBins(data, ...bandRange(...BANDS.bass, SR, FFT)),
    mid: averageBins(data, ...bandRange(...BANDS.mid, SR, FFT)),
    treble: averageBins(data, ...bandRange(...BANDS.treble, SR, FFT)),
  });

  it("a 100 Hz sine lights up bass", () => {
    const b = bands(byteSpectrum(100));
    expect(b.bass).toBeGreaterThan(b.mid * 2);
    expect(b.bass).toBeGreaterThan(b.treble * 2);
  });

  it("a 6 kHz sine lights up treble, not bass", () => {
    const b = bands(byteSpectrum(6000));
    expect(b.bass).toBeLessThan(0.05);
    expect(b.treble).toBeGreaterThan(b.bass);
  });

  it("the extractor smooths: one frame of input doesn't jump straight to the target", () => {
    const fx = new FeatureExtractor(SR, FFT);
    const data = byteSpectrum(100);
    const first = fx.update(data, 0, 1 / 60).bass;
    let last = first;
    for (let i = 1; i < 30; i++) last = fx.update(data, i * 16.7, 1 / 60).bass;
    expect(first).toBeLessThan(last);
    expect(fx.update(null, 600, 1 / 60).active).toBe(false);
  });
});

describe("beat detector", () => {
  const run = (energyAt: (frame: number) => number, seconds: number) => {
    const detect = createBeatDetector();
    let beats = 0;
    const perSecond = new Map<number, number>();
    for (let f = 0; f < seconds * 60; f++) {
      const t = (f * 1000) / 60;
      if (detect(energyAt(f), t)) {
        beats++;
        const sec = Math.floor(t / 1000);
        perSecond.set(sec, (perSecond.get(sec) ?? 0) + 1);
      }
    }
    return { beats, maxPerSecond: Math.max(0, ...perSecond.values()) };
  };

  it("finds kicks at 120 bpm (every 30 frames)", () => {
    // 4-frame kick at 0.8 every half second over a 0.2 floor
    const { beats } = run((f) => (f % 30 < 4 ? 0.8 : 0.2), 10);
    expect(beats).toBeGreaterThanOrEqual(18);
    expect(beats).toBeLessThanOrEqual(20);
  });

  it("stays quiet on a constant signal and on silence", () => {
    expect(run(() => 0.5, 5).beats).toBe(0);
    expect(run(() => 0, 5).beats).toBe(0);
  });

  it("never fires more than 3 times per second (photosensitivity)", () => {
    // A spike every 3rd frame = 20 spikes/s
    const { maxPerSecond } = run((f) => (f % 3 === 0 ? 0.9 : 0.15), 5);
    expect(maxPerSecond).toBeLessThanOrEqual(3);
  });
});
