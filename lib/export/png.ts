import type p5 from "p5";
import { renderStill, type ArtState } from "@/lib/render";
import { getSketch } from "@/sketches";
import { exportDimensions, type PngSize } from "./filename";
import { offscreenSupported, renderOffThread } from "./offscreen";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type),
  );
}

/**
 * PNG export, re-rendered from the seed at the target size (sharp, not upscaled), always
 * off-screen so the live canvas keeps running:
 *
 * 1. Preferred: a Web Worker drawing on an OffscreenCanvas (zero main-thread raster).
 * 2. Fallback: an off-screen p5 graphics buffer on the main thread, time-sliced so the
 *    live canvas still gets frames in between.
 */
export async function exportPng(
  p: p5,
  art: ArtState,
  size: PngSize,
  cssWidth: number,
  cssHeight: number,
): Promise<Blob> {
  const { width, height, scale } = exportDimensions(size, cssWidth, cssHeight);
  if (offscreenSupported()) {
    const reply = await renderOffThread({
      kind: "png",
      art,
      width: cssWidth,
      height: cssHeight,
      scale,
    });
    if (reply.ok && reply.png) return reply.png;
    // fall through to the main-thread path if the worker failed
  }
  const g = p.createGraphics(width, height);
  try {
    g.pixelDensity(1);
    const canvas = g.elt;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    await renderStill(getSketch(art.mode), { ctx, width: cssWidth, height: cssHeight }, art);
    return await canvasToBlob(canvas, "image/png");
  } finally {
    g.remove(); // free the buffer's canvas and memory
  }
}
