import { z, type ZodType } from "zod";
import { paletteIds } from "@/lib/palettes";
import type { BaseParams, ControlSpec, ModeId } from "./types";

/** Audio sensitivity per band + band colours. Every mode spreads these in. */
export const audioDefaults = {
  sensBass: 1,
  sensMid: 1,
  sensTreble: 1,
  bandColours: false,
};

export const audioControls = {
  sensBass: {
    kind: "number",
    label: "Bass sensitivity",
    min: 0,
    max: 2,
    step: 0.05,
    band: "bass",
    noRandom: true,
  },
  sensMid: {
    kind: "number",
    label: "Mid sensitivity",
    min: 0,
    max: 2,
    step: 0.05,
    band: "mid",
    noRandom: true,
  },
  sensTreble: {
    kind: "number",
    label: "Treble sensitivity",
    min: 0,
    max: 2,
    step: 0.05,
    band: "treble",
    noRandom: true,
  },
  bandColours: { kind: "boolean", label: "Band colours", noRandom: true },
} as const satisfies Record<keyof typeof audioDefaults, ControlSpec>;

/**
 * Builds the zod schema for a mode from its defaults + control specs, so there is one
 * source of truth for ranges. Each field has `.catch(default)`: a hand-edited URL such as
 * `density=banana` decodes to the default instead of throwing.
 */
export function buildSchema<P extends BaseParams>(
  mode: ModeId,
  defaults: P,
  controls: { [K in keyof P]: ControlSpec },
): ZodType<P> {
  const shape: Record<string, ZodType> = {};
  for (const key of Object.keys(defaults) as (keyof P & string)[]) {
    const spec = controls[key];
    const def = defaults[key];
    switch (spec.kind) {
      case "number":
        shape[key] = z
          .number()
          .min(spec.min)
          .max(spec.max)
          .catch(def as number);
        break;
      case "boolean":
        shape[key] = z.boolean().catch(def as boolean);
        break;
      case "palette":
        shape[key] = z.enum(paletteIds(mode) as [string, ...string[]]).catch(def as string);
        break;
      case "select":
        shape[key] = z
          .enum(spec.options.map((o) => o.value) as [string, ...string[]])
          .catch(def as string);
        break;
    }
  }
  return z.object(shape).catch(() => ({ ...defaults })) as unknown as ZodType<P>;
}

/** Decimal places implied by a slider step (0.05 → 2). Used to keep URLs short. */
export function stepDecimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}
