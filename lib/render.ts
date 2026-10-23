import { getPalette } from "@/lib/palettes";
import { silentFeatures } from "@/lib/audio/features";
import type {
  AnySketch,
  BaseParams,
  ModeId,
  QualityTier,
  SketchContext,
  Surface,
} from "@/sketches/types";

/** Everything needed to reproduce a frame: the "address" of an artwork. */
export interface ArtState {
  mode: ModeId;
  seed: number;
  params: BaseParams;
  tier: QualityTier;
  reducedMotion: boolean;
}

export function buildContext(
  art: ArtState,
  frame: number,
  dt: number,
  time: number,
): SketchContext<BaseParams> {
  return {
    params: art.params,
    seed: art.seed,
    tier: art.tier,
    reducedMotion: art.reducedMotion,
    palette: getPalette(art.mode, String(art.params.palette), art.params.bandColours === true),
    frame,
    dt,
    time,
  };
}

/**
 * Yield so the browser can paint a live frame: wait for the next animation frame, then
 * a macrotask. (Falls back to setTimeout where there's no rAF, e.g. tests.)
 */
const yieldToFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => setTimeout(r, 0))
      : setTimeout(r, 0),
  );

/**
 * Renders a still by running setup + N simulated frames at a fixed 1/60 s step with no
 * audio, so the same seed always gives the same image. Work is time-sliced: it renders
 * for ~`budgetMs`, then yields a frame, so the live canvas keeps animating meanwhile.
 */
export async function renderStill(
  sketch: AnySketch,
  surface: Surface,
  art: ArtState,
  opts: { frames?: number; budgetMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const frames = opts.frames ?? sketch.stillFrames;
  const budget = opts.budgetMs ?? 8;
  const dt = 1 / 60;
  const silent = silentFeatures();
  const state = sketch.setup(surface, buildContext(art, 0, dt, 0));
  if (sketch.whenReady) await sketch.whenReady(state);
  let sliceStart = performance.now();
  for (let f = 0; f < frames; f++) {
    if (opts.signal?.aborted) break;
    sketch.draw(surface, buildContext(art, f, dt, f * dt), silent, state);
    if (performance.now() - sliceStart > budget) {
      await yieldToFrame();
      sliceStart = performance.now();
    }
  }
  return state;
}
