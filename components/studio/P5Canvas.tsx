"use client";

import type p5 from "p5";
import { useEffect, useRef, type RefObject } from "react";
import { silentFeatures } from "@/lib/audio/features";
import { pixelDensityFor } from "@/lib/quality";
import { buildContext, type ArtState } from "@/lib/render";
import { studioRuntime } from "@/lib/studioRuntime";
import { getSketch } from "@/sketches";
import type { AnySketch, AudioFeatures, Surface } from "@/sketches/types";

interface P5CanvasProps {
  /** Read every frame. Updated by the parent without re-rendering this component. */
  artRef: RefObject<ArtState>;
  /** Called once per frame, before draw, to pull this frame's audio features. */
  getAudio?: (dt: number) => AudioFeatures;
  /** Called once per frame after draw with the frame time (for the FPS monitor). */
  onFrame?: (dt: number) => void;
  label: string;
  className?: string;
}

const CROSSFADE_MS = 400;

/** Params that need a fresh setup → part of the reset key; the rest apply live. */
function resetKey(sketch: AnySketch, art: ArtState, w: number, h: number): string {
  const parts = sketch.resetOn.map((k) => String(art.params[k]));
  return `${art.mode}|${art.seed}|${art.tier}|${w}x${h}|${parts.join(",")}`;
}

/**
 * p5 in INSTANCE mode inside React.
 *
 * Global mode would put setup/draw/ellipse on `window`: two sketches (or React mounting
 * an effect twice in StrictMode) would fight over the same globals. Instance mode scopes
 * everything to `p`, and the effect cleanup calls `p.remove()`, which stops the rAF loop
 * and deletes the canvas. Without it, navigating away and back leaves two canvases and
 * two loops running.
 */
export default function P5Canvas({ artRef, getAudio, onFrame, label, className }: P5CanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLCanvasElement>(null);
  const getAudioRef = useRef(getAudio);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    getAudioRef.current = getAudio;
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let instance: p5 | null = null;
    let sketch: AnySketch | null = null;
    let state: unknown = null;
    let key = "";
    let frame = 0;
    let time = 0;
    let last = 0;
    let resizeAt = 0;
    const silent = silentFeatures();

    const hostSize = () => ({
      w: Math.max(1, Math.floor(host.clientWidth)),
      h: Math.max(1, Math.floor(host.clientHeight)),
    });

    // Cross-fade: copy the outgoing frame onto an overlay, then fade the overlay out.
    const crossfade = (source: HTMLCanvasElement) => {
      const fade = fadeRef.current;
      if (!fade) return;
      fade.width = source.width;
      fade.height = source.height;
      fade.getContext("2d")?.drawImage(source, 0, 0);
      fade.style.transition = "none";
      fade.style.opacity = "1";
      requestAnimationFrame(() => {
        fade.style.transition = `opacity ${CROSSFADE_MS}ms ease`;
        fade.style.opacity = "0";
      });
    };

    void import("p5").then(({ default: P5 }) => {
      // StrictMode runs effect → cleanup → effect. If cleanup already ran while p5 was
      // still downloading, don't create an orphan instance.
      if (cancelled) return;

      instance = new P5((p: p5) => {
        const surface = (): Surface => ({
          ctx: p.drawingContext as CanvasRenderingContext2D,
          width: p.width,
          height: p.height,
        });

        const init = () => {
          const art = artRef.current;
          if (sketch && state !== null) sketch.dispose?.(state);
          sketch = getSketch(art.mode);
          const density = pixelDensityFor(art.tier, window.devicePixelRatio);
          if (p.pixelDensity() !== density) p.pixelDensity(density);
          // Keep p5's own RNG in step with ours, in case anything ever uses it.
          p.randomSeed(art.seed);
          p.noiseSeed(art.seed);
          frame = 0;
          time = 0;
          key = resetKey(sketch, art, p.width, p.height);
          state = sketch.setup(surface(), buildContext(art, 0, 1 / 60, 0));
        };

        p.setup = () => {
          const { w, h } = hostSize();
          const renderer = p.createCanvas(w, h);
          const canvas = (renderer as unknown as { elt: HTMLCanvasElement }).elt;
          canvas.setAttribute("aria-hidden", "true");
          studioRuntime.p = p;
          studioRuntime.canvas = canvas;
          last = performance.now();
          init();
        };

        p.draw = () => {
          const now = performance.now();
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          const art = artRef.current;

          // Debounced resize: wait until the container stops changing for 150 ms.
          if (resizeAt && now - resizeAt > 150) {
            resizeAt = 0;
            const { w, h } = hostSize();
            if (w !== p.width || h !== p.height) p.resizeCanvas(w, h, true);
          }

          if (!sketch || resetKey(sketch, art, p.width, p.height) !== key) {
            if (sketch && sketch.id !== art.mode && studioRuntime.canvas) {
              crossfade(studioRuntime.canvas);
            }
            init();
          }

          frame++;
          time += dt;
          const audio = getAudioRef.current?.(dt) ?? silent;
          const t0 = performance.now();
          sketch!.draw(surface(), buildContext(art, frame, dt, time), audio, state);
          // JS time of draw() only; the GPU rasterises asynchronously after this.
          studioRuntime.drawMs += (performance.now() - t0 - studioRuntime.drawMs) * 0.05;
          onFrameRef.current?.(dt);
        };
      }, host);
    });

    const ro = new ResizeObserver(() => {
      resizeAt = performance.now();
    });
    ro.observe(host);

    return () => {
      cancelled = true;
      ro.disconnect();
      if (sketch && state !== null) sketch.dispose?.(state);
      instance?.remove();
      instance = null;
      studioRuntime.p = null;
      studioRuntime.canvas = null;
    };
  }, [artRef]);

  return (
    <div role="img" aria-label={label} className={`relative overflow-hidden ${className ?? ""}`}>
      <div ref={hostRef} className="absolute inset-0 [&>canvas]:block" />
      <canvas
        ref={fadeRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}
