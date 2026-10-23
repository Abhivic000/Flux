"use client";

import { useEffect, useRef } from "react";
import { silentFeatures } from "@/lib/audio/features";
import { guessTier, readDeviceHints } from "@/lib/quality";
import { buildContext, renderStill, type ArtState } from "@/lib/render";
import { flowField } from "@/sketches/flowField";
import type { AnySketch } from "@/sketches/types";

const sketch = flowField as unknown as AnySketch;

/**
 * Landing background: a slow flow field drawn on a plain <canvas> with its own rAF loop.
 * No p5 and no Tweakpane here — the sketch only needs a 2D context, which keeps the
 * landing bundle small. With reduced motion it renders one still frame and stops.
 */
export default function LandingArt({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tier = guessTier(readDeviceHints());
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const art: ArtState = {
      mode: "flow",
      seed,
      // Calm and sparse: this sits behind text.
      params: {
        ...sketch.defaults,
        palette: "ember",
        density: 0.5,
        speed: 0.7,
        evolve: 0.15,
        trail: 0.8,
        weight: 1.3,
      },
      tier,
      reducedMotion: reduced,
    };
    const surface = { ctx, width, height };
    let raf = 0;
    let cancelled = false;

    if (reduced) {
      // Static poster: simulate the frames once, then leave the still image.
      void renderStill(sketch, surface, art);
      return () => {
        cancelled = true;
      };
    }

    const silent = silentFeatures();
    const state = sketch.setup(surface, buildContext(art, 0, 1 / 60, 0));
    let frame = 0;
    let time = 0;
    let last = performance.now();
    const loop = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      frame++;
      time += dt;
      sketch.draw(surface, buildContext(art, frame, dt, time), silent, state);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [seed]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />;
}
