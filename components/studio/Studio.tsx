"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { audioEngine } from "@/lib/audio/engine";
import { applySensitivity, silentFeatures } from "@/lib/audio/features";
import { savePng } from "@/lib/export/actions";
import type { ArtState } from "@/lib/render";
import { MODE_ORDER, getSketch } from "@/sketches";
import { useStudio, type StudioState } from "@/stores/studio";
import { useQuality, useShortcuts, useUrlSync } from "./hooks";
import { PanelButton } from "./Module";
import AudioModule from "./AudioModule";
import ExportModule from "./ExportModule";
import ModeModule from "./ModeModule";
import QualityModule from "./QualityModule";
import ShortcutsHelp from "./ShortcutsHelp";
import Transport, { Meters, PlayButton } from "./Transport";

// p5 and Tweakpane are only ever loaded on /studio, on the client.
const P5Canvas = dynamic(() => import("./P5Canvas"), { ssr: false });
const Panel = dynamic(() => import("./Panel"), { ssr: false });

function snapshot(s: StudioState): ArtState {
  return {
    mode: s.mode,
    seed: s.seed,
    params: s.params[s.mode],
    tier: s.tier,
    reducedMotion: s.reducedMotion,
  };
}

export default function Studio() {
  useUrlSync();
  const onFrame = useQuality();

  // Frame-speed state: a ref kept current by subscribe(), read by draw() 60×/s.
  // Changing a slider updates this ref without re-rendering the canvas component.
  const artRef = useRef<ArtState>(snapshot(useStudio.getState()));
  useEffect(() => {
    // Sync now too: the URL may have hydrated the store before this effect subscribed.
    artRef.current = snapshot(useStudio.getState());
    return useStudio.subscribe((s) => {
      artRef.current = snapshot(s);
    });
  }, []);

  // Audio: engine events → store (UI speed); features → sketch via getAudio (frame speed).
  useEffect(() => {
    audioEngine.setListener((patch) => useStudio.getState().setPlayback(patch));
    return () => {
      audioEngine.setListener(() => {});
      audioEngine.stopAll();
      useStudio.getState().setPlayback({ source: "none", status: "idle", label: "", duration: 0 });
    };
  }, []);
  const scaled = useRef(silentFeatures());
  const getAudio = (dt: number) => {
    const art = artRef.current;
    return applySensitivity(audioEngine.analyse(dt), art.params, art.reducedMotion, scaled.current);
  };

  useShortcuts({ togglePlay: () => audioEngine.toggle(), savePng: () => void savePng() });

  // /studio?bench=1 exposes the packing benchmark (main thread vs worker) on window.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("bench")) return;
    void import("@/lib/packingClient").then(({ benchmarkPacking }) => {
      (window as unknown as Record<string, unknown>).__fluxBench = (count = 4000) =>
        benchmarkPacking({
          width: window.innerWidth,
          height: window.innerHeight,
          seed: 1,
          count,
          minR: 2,
          maxR: 70,
          padding: 2,
        });
    });
  }, []);

  const mode = useStudio((s) => s.mode);
  const seed = useStudio((s) => s.seed);
  const uiHidden = useStudio((s) => s.uiHidden);
  const toggleUI = useStudio((s) => s.toggleUI);
  const randomise = useStudio((s) => s.randomise);
  const setMode = useStudio((s) => s.setMode);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sketch = getSketch(mode);
  const nextMode = () => {
    const i = MODE_ORDER.indexOf(mode);
    setMode(MODE_ORDER[(i + 1) % MODE_ORDER.length] ?? "flow");
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-stage md:flex-row">
      {/* Stage: the art is the star */}
      <section
        className={`relative flex min-h-0 flex-1 flex-col ${uiHidden ? "" : "pb-11 md:pb-0"}`}
        aria-label="Stage"
      >
        <P5Canvas
          artRef={artRef}
          getAudio={getAudio}
          onFrame={onFrame}
          label={`${sketch.name} artwork, seed ${seed}`}
          className="min-h-0 flex-1"
        />

        {!uiHidden && <Transport />}

        {!uiHidden && (
          // Mobile transport bar: ▶ mode ⟳ ⤓
          <div className="brushed flex h-14 items-center gap-2 border-t border-panel-edge px-3 md:hidden">
            <PlayButton />
            <PanelButton onClick={nextMode} className="min-h-11 flex-1" aria-label="Next mode">
              {sketch.name}
            </PanelButton>
            <PanelButton onClick={randomise} className="min-h-11 min-w-11" aria-label="Randomise">
              ⟳
            </PanelButton>
            <PanelButton
              onClick={() => void savePng()}
              className="min-h-11 min-w-11"
              aria-label="Save poster"
            >
              ⤓
            </PanelButton>
            <Meters compact />
          </div>
        )}

        {uiHidden && (
          <button
            type="button"
            onClick={toggleUI}
            className="absolute top-3 right-3 rounded-[3px] bg-black/30 px-2 py-1 text-label text-panel opacity-40 hover:opacity-100 focus-visible:opacity-100"
          >
            Show controls (H)
          </button>
        )}
      </section>

      {/* Rack: right column on desktop, bottom sheet on mobile */}
      {!uiHidden && (
        <Rack open={sheetOpen} setOpen={setSheetOpen}>
          <ModeModule />
          <AudioModule />
          <Panel />
          <ExportModule />
          <QualityModule />
        </Rack>
      )}
      <ShortcutsHelp />
    </div>
  );
}

function Rack({
  open,
  setOpen,
  children,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { y: e.clientY, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dy) > 30) {
      drag.current.moved = true;
      setOpen(dy < 0);
    }
  };
  const onPointerUp = () => {
    if (drag.current && !drag.current.moved) setOpen(!open);
    drag.current = null;
  };

  return (
    <aside
      aria-label="Controls"
      className={`brushed fixed inset-x-0 bottom-0 z-20 flex h-[72vh] flex-col border-t border-panel-edge shadow-[0_-6px_20px_rgba(0,0,0,0.35)] transition-transform duration-200 md:static md:z-auto md:h-auto md:w-[320px] md:translate-y-0 md:border-t-0 md:border-l md:shadow-none ${open ? "translate-y-0" : "translate-y-[calc(100%-44px)]"}`}
    >
      <button
        type="button"
        className="flex h-11 w-full flex-none touch-none items-center justify-center gap-2 border-b border-panel-edge text-label text-engrave md:hidden"
        aria-expanded={open}
        aria-label={open ? "Close controls" : "Open controls"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
      >
        <span aria-hidden="true" className="h-1 w-10 rounded-full bg-panel-edge" />
        {open ? "Drag down to close" : "Drag up: controls"}
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </aside>
  );
}
