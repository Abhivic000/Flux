import type { QualityTier } from "@/sketches/types";

/**
 * Quality tiers. A tier scales the expensive things: particle counts, grid resolution
 * and canvas pixel density (a 3× DPR phone renders 9× the pixels of a 1× screen).
 */
export interface TierSettings {
  /** Multiplier on particle / element counts. */
  scale: number;
  /** Upper bound on canvas pixel density. */
  maxPixelDensity: number;
}

export const TIERS: Record<QualityTier, TierSettings> = {
  high: { scale: 1, maxPixelDensity: 2 },
  medium: { scale: 0.6, maxPixelDensity: 1.5 },
  low: { scale: 0.35, maxPixelDensity: 1 },
};

export const TIER_ORDER: QualityTier[] = ["high", "medium", "low"];

export function tierScale(tier: QualityTier): number {
  return TIERS[tier].scale;
}

export function pixelDensityFor(tier: QualityTier, devicePixelRatio: number): number {
  return Math.min(Math.max(1, devicePixelRatio), TIERS[tier].maxPixelDensity);
}

export function lowerTier(tier: QualityTier): QualityTier {
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(tier) + 1, TIER_ORDER.length - 1)] as QualityTier;
}

export interface DeviceHints {
  devicePixelRatio: number;
  hardwareConcurrency: number;
  /** Chrome-only, in GB. */
  deviceMemory?: number;
  coarsePointer: boolean;
}

/** First guess from hardware hints. The FPS monitor then corrects it from real numbers. */
export function guessTier(h: DeviceHints): QualityTier {
  const cores = h.hardwareConcurrency || 4;
  if (cores <= 4 || (h.deviceMemory !== undefined && h.deviceMemory <= 2)) return "low";
  if (h.coarsePointer) return h.devicePixelRatio >= 3 || cores < 8 ? "low" : "medium";
  if (cores >= 8 && (h.deviceMemory === undefined || h.deviceMemory >= 8)) return "high";
  return "medium";
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: nav.hardwareConcurrency || 4,
    deviceMemory: nav.deviceMemory,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

/**
 * Watches frame times and decides when to step down a tier.
 *
 * - Probe: the first 2 s after start; if the average is under the target, downgrade.
 * - Afterwards: downgrade only when FPS stays under the target for 3 s straight.
 * - Hysteresis: after any change, ignore 3 s of frames (the canvas is re-initialising),
 *   and never auto-upgrade. That's what stops it flickering between tiers.
 */
export class FpsMonitor {
  private emaFps = 60;
  private elapsed = 0;
  private lowFor = 0;
  private probeFrames = 0;
  private probeTime = 0;
  private cooldown = 0;
  private probing = true;

  constructor(
    private readonly targetFps = 45,
    private readonly probeSeconds = 2,
    private readonly sustainSeconds = 3,
    private readonly cooldownSeconds = 3,
  ) {}

  /** Smoothed FPS, for display. */
  get fps(): number {
    return this.emaFps;
  }

  /** Call when the tier changes (by the user or by us) so stale frames don't count. */
  reset(): void {
    this.cooldown = this.cooldownSeconds;
    this.lowFor = 0;
    this.probing = false;
  }

  /**
   * Feed one frame. `dt` in seconds. Returns true when the caller should drop a tier.
   */
  tick(dt: number): boolean {
    if (dt <= 0 || dt > 1) return false; // tab was hidden, ignore
    const inst = 1 / dt;
    this.emaFps += (inst - this.emaFps) * Math.min(1, dt * 2);
    this.elapsed += dt;

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return false;
    }

    if (this.probing) {
      this.probeFrames++;
      this.probeTime += dt;
      if (this.probeTime >= this.probeSeconds) {
        this.probing = false;
        const avg = this.probeFrames / this.probeTime;
        if (avg < this.targetFps) {
          this.reset();
          return true;
        }
      }
      return false;
    }

    if (this.emaFps < this.targetFps) {
      this.lowFor += dt;
      if (this.lowFor >= this.sustainSeconds) {
        this.reset();
        return true;
      }
    } else {
      this.lowFor = 0;
    }
    return false;
  }
}
