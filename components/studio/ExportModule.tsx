"use client";

import { useState, useSyncExternalStore } from "react";
import { recordLiveClip, savePng, saveSvg, stopRecording } from "@/lib/export/actions";
import type { PngSize } from "@/lib/export/filename";
import { pickRecordingType } from "@/lib/export/record";
import { supportsSvg } from "@/lib/export/svg";
import { useStudio } from "@/stores/studio";
import Module, { Kbd, PanelButton } from "./Module";

const SIZES: { value: PngSize; label: string }[] = [
  { value: "1x", label: "1×" },
  { value: "2x", label: "2×" },
  { value: "poster", label: "Poster" },
];

const noopSubscribe = () => () => {};

export default function ExportModule() {
  const mode = useStudio((s) => s.mode);
  const pngSize = useStudio((s) => s.pngSize);
  const setPngSize = useStudio((s) => s.setPngSize);
  const status = useStudio((s) => s.exportStatus);
  const source = useStudio((s) => s.playback.source);
  const [seconds, setSeconds] = useState(10);
  const busy = status?.busy ?? false;
  const recording = busy && status?.message.startsWith("Recording");
  // Browser capability: read on the client, assume yes during server render (no mismatch).
  const canRecord = useSyncExternalStore(
    noopSubscribe,
    () => pickRecordingType() !== null,
    () => true,
  );
  const vector = supportsSvg({ mode });

  return (
    <Module title="Export">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="PNG size">
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={pngSize === s.value}
            onClick={() => setPngSize(s.value)}
            className="min-h-8 flex-1 rounded-[3px] border border-panel-edge bg-panel-hi px-2 text-label text-engrave aria-checked:bg-panel-lo aria-checked:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]"
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-label text-engrave-soft">
        {pngSize === "poster"
          ? "3000 px on the long edge, re-rendered from the seed."
          : "Re-rendered off-screen from the seed."}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1">
        <PanelButton onClick={() => void savePng()} disabled={busy} aria-keyshortcuts="s">
          Save poster <Kbd>S</Kbd>
        </PanelButton>
        <PanelButton
          onClick={() => void saveSvg()}
          disabled={busy || !vector}
          title={
            vector
              ? "Scalable vector file"
              : "Only terrain, circle packing and tree are vector modes"
          }
        >
          Save SVG
        </PanelButton>
      </div>

      <div className="mt-3 flex items-center gap-2 text-label">
        <label htmlFor="clip-seconds" className="w-16">
          Clip
        </label>
        <input
          id="clip-seconds"
          type="range"
          min={5}
          max={15}
          step={1}
          value={seconds}
          disabled={busy}
          onChange={(e) => setSeconds(Number(e.target.value))}
          className="flex-1 accent-[var(--engrave)]"
        />
        <output htmlFor="clip-seconds" className="tabular w-8 text-right">
          {seconds}s
        </output>
      </div>
      <PanelButton
        className="mt-1 w-full"
        disabled={!canRecord || (busy && !recording)}
        onClick={() => (recording ? stopRecording() : void recordLiveClip(seconds))}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${recording ? "bg-treble" : "bg-engrave-soft"}`}
        />
        {recording ? "Stop recording" : "Record clip"}
      </PanelButton>
      <p className="mt-1 text-label text-engrave-soft">
        {!canRecord
          ? "Clip recording isn't supported in this browser."
          : source === "mic"
            ? "Mic audio is never recorded; the clip will be silent."
            : "WebM with the track's audio."}
      </p>

      <p role="status" aria-live="polite" className="tabular mt-2 min-h-4 text-label text-engrave">
        {status?.message ?? ""}
      </p>
    </Module>
  );
}
