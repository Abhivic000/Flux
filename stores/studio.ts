import { create } from "zustand";
import type { PngSize } from "@/lib/export/filename";
import { paletteIds } from "@/lib/palettes";
import { createRng, newSeed } from "@/lib/random";
import { MODE_ORDER, getSketch } from "@/sketches";
import { stepDecimals } from "@/sketches/params";
import type { BaseParams, ModeId, ParamValue, QualityTier } from "@/sketches/types";

export type AudioSource = "none" | "file" | "demo" | "mic";
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused";

export interface Playback {
  source: AudioSource;
  status: PlaybackStatus;
  /** File/demo duration in seconds (0 for mic). */
  duration: number;
  label: string;
  error: string | null;
}

export interface StudioState {
  mode: ModeId;
  seed: number;
  /** Params are kept per mode, so switching modes and back keeps your tweaks. */
  params: Record<ModeId, BaseParams>;
  /** Locked param keys per mode: kept as-is by Randomise. */
  locks: Record<ModeId, string[]>;
  tier: QualityTier;
  /** When true, the FPS monitor may step the tier down. Picking a tier by hand turns it off. */
  tierAuto: boolean;
  reducedMotion: boolean;
  uiHidden: boolean;
  helpOpen: boolean;
  playback: Playback;
  pngSize: PngSize;
  /** Busy / result message for exports; null when idle. */
  exportStatus: { busy: boolean; message: string } | null;

  setMode(mode: ModeId): void;
  setSeed(seed: number): void;
  setParam(key: string, value: ParamValue): void;
  randomise(): void;
  toggleLock(key: string): void;
  resetParams(): void;
  setTier(tier: QualityTier, auto?: boolean): void;
  setReducedMotion(on: boolean): void;
  toggleUI(): void;
  setHelpOpen(open: boolean): void;
  setPlayback(patch: Partial<Playback>): void;
  hydrate(state: { mode: ModeId; seed: number; params: BaseParams }): void;
  setPngSize(size: PngSize): void;
  setExportStatus(status: StudioState["exportStatus"]): void;
}

function allDefaults(): Record<ModeId, BaseParams> {
  return Object.fromEntries(MODE_ORDER.map((m) => [m, { ...getSketch(m).defaults }])) as Record<
    ModeId,
    BaseParams
  >;
}

function emptyLocks(): Record<ModeId, string[]> {
  return Object.fromEntries(MODE_ORDER.map((m) => [m, []])) as unknown as Record<ModeId, string[]>;
}

const round = (v: number, step: number) => {
  const snapped = Math.round(v / step) * step;
  return Number(snapped.toFixed(stepDecimals(step)));
};

/**
 * Randomise: new seed, and new values for every param that isn't locked. The values are
 * drawn from an RNG seeded by the new seed, so even randomising is reproducible.
 */
export function randomiseParams(
  mode: ModeId,
  current: BaseParams,
  locked: readonly string[],
  seed: number,
): BaseParams {
  const sketch = getSketch(mode);
  const rng = createRng(seed ^ 0x5eed);
  const next: BaseParams = { ...current };
  for (const [key, spec] of Object.entries(sketch.controls)) {
    if (locked.includes(key) || spec.noRandom) continue;
    switch (spec.kind) {
      case "number": {
        const [lo, hi] = spec.random ?? [spec.min, spec.max];
        next[key] = round(rng.range(lo, hi), spec.step);
        break;
      }
      case "boolean":
        next[key] = rng.chance(0.5);
        break;
      case "palette":
        next[key] = rng.pick(paletteIds(mode));
        break;
      case "select":
        next[key] = rng.pick(spec.options).value;
        break;
    }
  }
  return next;
}

export const useStudio = create<StudioState>()((set, get) => ({
  mode: "flow",
  seed: 1234,
  params: allDefaults(),
  locks: emptyLocks(),
  tier: "high",
  tierAuto: true,
  reducedMotion: false,
  uiHidden: false,
  helpOpen: false,
  playback: { source: "none", status: "idle", duration: 0, label: "", error: null },
  pngSize: "1x",
  exportStatus: null,

  setMode: (mode) => set({ mode }),
  setSeed: (seed) => set({ seed }),
  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [s.mode]: { ...s.params[s.mode], [key]: value } } })),
  randomise: () => {
    const { mode, params, locks } = get();
    const seed = newSeed();
    set({
      seed,
      params: { ...params, [mode]: randomiseParams(mode, params[mode], locks[mode], seed) },
    });
  },
  toggleLock: (key) =>
    set((s) => {
      const current = s.locks[s.mode];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { locks: { ...s.locks, [s.mode]: next } };
    }),
  resetParams: () =>
    set((s) => ({ params: { ...s.params, [s.mode]: { ...getSketch(s.mode).defaults } } })),
  setTier: (tier, auto = false) => set({ tier, tierAuto: auto }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  toggleUI: () => set((s) => ({ uiHidden: !s.uiHidden })),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setPlayback: (patch) => set((s) => ({ playback: { ...s.playback, ...patch } })),
  hydrate: ({ mode, seed, params }) =>
    set((s) => ({ mode, seed, params: { ...s.params, [mode]: params } })),
  setPngSize: (pngSize) => set({ pngSize }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
}));
