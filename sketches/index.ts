import { circlePacking } from "./circlePacking";
import { flowField } from "./flowField";
import { orbits } from "./orbits";
import { terrain } from "./terrain";
import { tree } from "./tree";
import type { AnySketch, ModeId } from "./types";

/**
 * Mode registry. Each sketch has its own param type; the registry erases it to
 * AnySketch so the studio can treat every mode the same way (strategy pattern).
 */
export const SKETCHES: Record<ModeId, AnySketch> = {
  flow: flowField as unknown as AnySketch,
  packing: circlePacking as unknown as AnySketch,
  terrain: terrain as unknown as AnySketch,
  orbits: orbits as unknown as AnySketch,
  tree: tree as unknown as AnySketch,
};

/** Order = keyboard shortcuts 1–5. */
export const MODE_ORDER: ModeId[] = ["flow", "packing", "terrain", "orbits", "tree"];

export function getSketch(mode: ModeId): AnySketch {
  return SKETCHES[mode];
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === "string" && (MODE_ORDER as string[]).includes(value);
}
