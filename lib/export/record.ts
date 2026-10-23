/**
 * Clip recording:
 *
 *   canvas.captureStream(60) ─► video track ─┐
 *                                            ├─► MediaStream ─► MediaRecorder ─► WebM blob
 *   AudioContext ─► MediaStreamDestination ──┘ (audio track)
 *
 * Safari's MediaRecorder doesn't do WebM everywhere; we pick the first supported type
 * and fall back to MP4 there, or report that recording isn't available.
 */

const CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function pickRecordingType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function extensionFor(mimeType: string): string {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  audio: MediaStream | null;
  seconds: number;
  onProgress?: (elapsedSeconds: number) => void;
  signal?: AbortSignal;
}

export function recordClip(opts: RecordOptions): Promise<{ blob: Blob; mimeType: string }> {
  const mimeType = pickRecordingType();
  if (!mimeType || typeof opts.canvas.captureStream !== "function") {
    return Promise.reject(new Error("Clip recording isn't supported in this browser."));
  }
  const stream = opts.canvas.captureStream(60);
  opts.audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    const started = performance.now();
    let timer = 0;
    const finish = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      window.clearInterval(timer);
      // Stop only the canvas video track; the audio track belongs to the live graph.
      stream.getVideoTracks().forEach((t) => t.stop());
      resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
    };
    recorder.onerror = () => {
      window.clearInterval(timer);
      reject(new Error("Recording failed."));
    };
    opts.signal?.addEventListener("abort", finish, { once: true });
    timer = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      opts.onProgress?.(Math.min(elapsed, opts.seconds));
      if (elapsed >= opts.seconds) finish();
    }, 100);
    recorder.start(250);
  });
}
