import { audioEngine } from "@/lib/audio/engine";
import type { ArtState } from "@/lib/render";
import { studioRuntime } from "@/lib/studioRuntime";
import { useStudio } from "@/stores/studio";
import { buildFilename, type PngSize } from "./filename";
import { downloadBlob, exportPng } from "./png";
import { extensionFor, recordClip } from "./record";
import { exportSvg } from "./svg";

/** Exports always render at full quality and normal motion, whatever the live tier is. */
function exportArt(): ArtState {
  const s = useStudio.getState();
  return {
    mode: s.mode,
    seed: s.seed,
    params: s.params[s.mode],
    tier: "high",
    reducedMotion: false,
  };
}

function liveSize() {
  const p = studioRuntime.p;
  return p ? { width: p.width, height: p.height } : null;
}

async function run(label: string, job: () => Promise<string>) {
  const { exportStatus, setExportStatus } = useStudio.getState();
  if (exportStatus?.busy) return;
  setExportStatus({ busy: true, message: label });
  try {
    const done = await job();
    setExportStatus({ busy: false, message: done });
  } catch (err) {
    setExportStatus({
      busy: false,
      message: err instanceof Error ? err.message : "Export failed.",
    });
  }
}

export function savePng(size: PngSize = useStudio.getState().pngSize) {
  const p = studioRuntime.p;
  const dims = liveSize();
  if (!p || !dims) return Promise.resolve();
  const art = exportArt();
  return run(size === "poster" ? "Rendering poster…" : "Rendering PNG…", async () => {
    const blob = await exportPng(p, art, size, dims.width, dims.height);
    const name = buildFilename(art.mode, art.seed, size, "png");
    downloadBlob(blob, name);
    return `Saved ${name}`;
  });
}

export function saveSvg() {
  const dims = liveSize();
  if (!dims) return Promise.resolve();
  const art = exportArt();
  return run("Building SVG…", async () => {
    const blob = await exportSvg(art, dims.width, dims.height);
    const name = buildFilename(art.mode, art.seed, "vector", "svg");
    downloadBlob(blob, name);
    return `Saved ${name}`;
  });
}

let recording: AbortController | null = null;

export function isRecording() {
  return recording !== null;
}

export function stopRecording() {
  recording?.abort();
}

export function recordLiveClip(seconds: number) {
  const canvas = studioRuntime.canvas;
  if (!canvas || recording) return Promise.resolve();
  const { mode, seed, setExportStatus } = useStudio.getState();
  recording = new AbortController();
  const signal = recording.signal;
  return run(`Recording 0 / ${seconds}s`, async () => {
    try {
      const { blob, mimeType } = await recordClip({
        canvas,
        // File / demo audio only. The mic is never recorded (see the mic explainer).
        audio: useStudio.getState().playback.source === "mic" ? null : audioEngine.recordStream(),
        seconds,
        signal,
        onProgress: (t) =>
          setExportStatus({ busy: true, message: `Recording ${Math.floor(t)} / ${seconds}s` }),
      });
      const name = buildFilename(mode, seed, `${seconds}s`, extensionFor(mimeType));
      downloadBlob(blob, name);
      return `Saved ${name}`;
    } finally {
      recording = null;
    }
  });
}
