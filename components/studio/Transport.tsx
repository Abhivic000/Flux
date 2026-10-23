"use client";

import { useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audio/engine";
import { useStudio } from "@/stores/studio";

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const METERS = [
  { band: "bass", label: "Bass", color: "var(--bass)" },
  { band: "mid", label: "Mid", color: "var(--mid)" },
  { band: "treble", label: "Treble", color: "var(--treble)" },
] as const;

/** ▶ / ❚❚ button, shared by the desktop transport and the mobile bar. */
export function PlayButton({ className }: { className?: string }) {
  const status = useStudio((s) => s.playback.status);
  const source = useStudio((s) => s.playback.source);
  const playing = status === "playing";
  const disabled = source === "none";
  const label = source === "mic" ? "Stop mic" : playing ? "Pause" : "Play";
  return (
    <button
      type="button"
      onClick={() => audioEngine.toggle()}
      disabled={disabled}
      aria-label={`${label} (Space)`}
      aria-keyshortcuts="Space"
      title={disabled ? "Choose an input first" : `${label} (Space)`}
      className={`inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-panel-edge bg-panel-hi text-engrave shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.25)] hover:bg-white active:translate-y-px disabled:opacity-40 ${className ?? ""}`}
    >
      {playing ? (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          {source === "mic" ? (
            <rect x="2" y="2" width="10" height="10" rx="1" fill="currentColor" />
          ) : (
            <>
              <rect x="2" y="1" width="3.5" height="12" fill="currentColor" />
              <rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" />
            </>
          )}
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

/**
 * Band meters in the three patch-cable colours. Written straight to the DOM from a rAF
 * loop: 60 updates a second must not go through React. With reduced motion they update
 * twice a second instead (static-ish levels, no constant movement).
 */
export function Meters({ compact }: { compact?: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const reducedMotion = useStudio((s) => s.reducedMotion);

  useEffect(() => {
    let raf = 0;
    let lastPaint = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (reducedMotion && now - lastPaint < 500) return;
      lastPaint = now;
      const f = audioEngine.features;
      METERS.forEach((m, i) => {
        const el = bars.current[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.02, f[m.band]).toFixed(3)})`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  return (
    <div className="flex items-end gap-1.5" aria-hidden="true">
      {METERS.map((m, i) => (
        <div key={m.band} className="flex flex-col items-center gap-0.5">
          <div
            className={`relative overflow-hidden rounded-[2px] bg-engrave/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] ${compact ? "h-7 w-2" : "h-9 w-3"}`}
          >
            <span
              ref={(el) => {
                bars.current[i] = el;
              }}
              className="absolute inset-0 origin-bottom"
              style={{ background: m.color, transform: "scaleY(0.02)" }}
            />
          </div>
          {!compact && <span className="text-label leading-none text-engrave-soft">{m.label}</span>}
        </div>
      ))}
    </div>
  );
}

/** Desktop transport strip under the canvas: ▶ ❚❚ scrubber time meters. */
export default function Transport() {
  const source = useStudio((s) => s.playback.source);
  const duration = useStudio((s) => s.playback.duration);
  const label = useStudio((s) => s.playback.label);
  const scrubRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const seekable = (source === "file" || source === "demo") && duration > 0;

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 250) return; // 4×/s is plenty for a time readout
      last = now;
      const t = audioEngine.currentTime;
      if (scrubRef.current && !dragging.current) scrubRef.current.value = String(t);
      if (timeRef.current) timeRef.current.textContent = `${fmt(t)} / ${fmt(audioEngine.duration)}`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="brushed hidden h-16 flex-none items-center gap-3 border-t border-panel-edge px-4 md:flex">
      <PlayButton />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 text-label">
          <span className="truncate font-medium">{label || "No input — pick one in the rack"}</span>
          {source !== "mic" && (
            <span ref={timeRef} className="tabular flex-none text-engrave-soft">
              0:00 / 0:00
            </span>
          )}
        </div>
        <input
          ref={scrubRef}
          type="range"
          aria-label="Position"
          min={0}
          max={duration || 1}
          step={0.1}
          defaultValue={0}
          disabled={!seekable}
          onPointerDown={() => (dragging.current = true)}
          onPointerUp={() => (dragging.current = false)}
          onChange={(e) => audioEngine.seek(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-[var(--engrave)] disabled:cursor-default disabled:opacity-40"
        />
      </div>
      <Meters />
    </div>
  );
}
