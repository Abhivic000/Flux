"use client";

import { useEffect, useRef, useState } from "react";
import { offscreenSupported, renderOffThread } from "@/lib/export/offscreen";
import { presetParams, type Preset } from "@/lib/presets";
import { renderStill, type ArtState } from "@/lib/render";
import { getSketch } from "@/sketches";

// Composition size the thumbnail is designed at; rendered at half scale.
const W = 800;
const H = 500;
const SCALE = 0.5;

/** Thumbnails render one at a time, so a dozen of them don't fight for the CPU. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

async function renderThumb(art: ArtState): Promise<Blob> {
  if (offscreenSupported()) {
    const reply = await renderOffThread({ kind: "png", art, width: W, height: H, scale: SCALE });
    if (reply.ok && reply.png) return reply.png;
  }
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  await renderStill(getSketch(art.mode), { ctx, width: W, height: H }, art);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"),
  );
}

/** Generated thumbnail: rendered from the preset's seed when it scrolls into view. */
export default function Thumbnail({ preset }: { preset: Preset }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let url: string | null = null;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const art: ArtState = {
          mode: preset.mode,
          seed: preset.seed,
          params: presetParams(preset),
          tier: "medium",
          reducedMotion: false,
        };
        void enqueue(() => renderThumb(art)).then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setSrc(url);
        });
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [preset]);

  return (
    <div ref={ref} className="relative aspect-[8/5] w-full overflow-hidden bg-[#1d2024]">
      {src ? (
        // A generated blob URL, so next/image optimisation doesn't apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-label text-panel-edge">
          Rendering…
        </div>
      )}
    </div>
  );
}
