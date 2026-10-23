import type { ModeId } from "@/sketches/types";

export type PngSize = "1x" | "2x" | "poster";

/** `flux-<mode>-<seed>-<size>.<ext>`, e.g. flux-terrain-48213-poster.png */
export function buildFilename(mode: ModeId, seed: number, size: string, ext: string): string {
  const safeSize = size.replace(/[^a-z0-9]+/gi, "").toLowerCase() || "export";
  const safeExt = ext.replace(/^\./, "").toLowerCase();
  return `flux-${mode}-${Math.floor(Math.abs(seed))}-${safeSize}.${safeExt}`;
}

export const POSTER_LONG_EDGE = 3000;

/**
 * Output pixel size for a PNG export, and the scale applied to the sketch's context.
 * The sketch always works in the live canvas's CSS-pixel coordinates, so a poster is the
 * same composition as the screen, just rendered at higher resolution.
 */
export function exportDimensions(size: PngSize, cssWidth: number, cssHeight: number) {
  const scale =
    size === "1x" ? 1 : size === "2x" ? 2 : POSTER_LONG_EDGE / Math.max(cssWidth, cssHeight);
  return {
    width: Math.round(cssWidth * scale),
    height: Math.round(cssHeight * scale),
    scale,
  };
}
