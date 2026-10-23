import Link from "next/link";
import LandingArt from "@/components/landing/LandingArt";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-stage">
      <LandingArt seed={777} />

      {/* Intro plate: a solid aluminium strip, like a module's label (not a glass card). */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:bottom-8 sm:left-8 sm:right-auto sm:p-0">
        <section className="brushed max-w-xl rounded-[3px] border border-panel-edge px-5 py-5 text-engrave shadow-[0_8px_30px_rgba(0,0,0,0.45)] sm:px-7 sm:py-6">
          <p className="engraved mb-2 flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-bass" />
              <span className="h-1.5 w-1.5 rounded-full bg-mid" />
              <span className="h-1.5 w-1.5 rounded-full bg-treble" />
            </span>
            Flux
          </p>
          <h1 className="text-h2 leading-[1.05] font-semibold tracking-tight sm:text-h1">
            Play generative art like an instrument.
          </h1>
          <p className="mt-3 max-w-md text-small text-engrave-soft">
            Feed it a song or your mic, shape it with the controls, and keep a poster or clip you
            can recreate exactly from its link.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/studio"
              className="inline-flex min-h-11 items-center rounded-[3px] bg-engrave px-5 text-small font-semibold text-panel-hi hover:bg-[#353a42]"
            >
              Open studio
            </Link>
            <Link
              href="/gallery"
              className="inline-flex min-h-11 items-center rounded-[3px] border border-panel-edge bg-panel-hi px-5 text-small font-medium text-engrave hover:bg-white"
            >
              Gallery
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
