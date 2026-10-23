import type { Metadata } from "next";
import Link from "next/link";
import Thumbnail from "@/components/gallery/Thumbnail";
import { PRESETS, presetHref } from "@/lib/presets";
import { getSketch } from "@/sketches";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Curated Flux seeds. Each one opens in the studio, exactly as shown.",
};

export default function GalleryPage() {
  return (
    <main className="min-h-screen bg-stage px-4 pt-6 pb-16 text-panel sm:px-8">
      <header className="mx-auto mb-6 flex max-w-6xl flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-small text-panel-edge hover:text-panel">
            Flux
          </Link>
          <h1 className="text-h2 leading-tight font-semibold tracking-tight">Gallery</h1>
          <p className="mt-1 max-w-prose text-small text-panel-edge">
            Every piece here is a seed and a few settings. Open one and the studio loads that exact
            seed and those settings, ready to play with.
          </p>
        </div>
        <Link
          href="/studio"
          className="brushed rounded-[3px] px-4 py-2.5 text-small font-medium text-engrave"
        >
          Open studio
        </Link>
      </header>

      <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <Link
              href={presetHref(p)}
              className="group block overflow-hidden rounded-[3px] border border-[#2a2d32] hover:border-panel-edge"
            >
              <Thumbnail preset={p} />
              <div className="brushed flex items-baseline justify-between gap-2 px-3 py-2 text-engrave">
                <span className="text-small font-semibold">{p.title}</span>
                <span className="tabular text-label text-engrave-soft">
                  {getSketch(p.mode).name} · {p.seed}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
