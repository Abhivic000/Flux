"use client";

import { useEffect, useRef } from "react";
import { studioRuntime } from "@/lib/studioRuntime";
import type { QualityTier } from "@/sketches/types";
import { useStudio } from "@/stores/studio";
import Module from "./Module";

export default function QualityModule() {
  const tier = useStudio((s) => s.tier);
  const tierAuto = useStudio((s) => s.tierAuto);
  const setTier = useStudio((s) => s.setTier);
  const fpsRef = useRef<HTMLOutputElement>(null);

  // FPS readout updated straight into the DOM twice a second (no React renders).
  useEffect(() => {
    const id = window.setInterval(() => {
      if (fpsRef.current)
        fpsRef.current.textContent = `${Math.round(studioRuntime.fps)} fps · ${studioRuntime.drawMs.toFixed(1)} ms`;
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Module title="Quality">
      <div className="flex items-center gap-2 text-label">
        <label htmlFor="tier" className="w-16">
          Tier
        </label>
        <select
          id="tier"
          value={tierAuto ? `auto:${tier}` : tier}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("auto:")) setTier(tier, true);
            else setTier(v as QualityTier, false);
          }}
          className="h-7 flex-1 rounded-[3px] border border-panel-edge bg-[#c6c9c5] px-1 text-label text-engrave"
        >
          <option value={`auto:${tier}`}>Auto ({tier})</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <output
          ref={fpsRef}
          className="tabular w-24 text-right text-engrave-soft"
          aria-live="off"
          title="Frames per second · time spent in draw() per frame"
        >
          — fps
        </output>
      </div>
    </Module>
  );
}
