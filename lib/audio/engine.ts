import type { AudioFeatures } from "@/sketches/types";
import type { AudioSource, Playback } from "@/stores/studio";
import { FeatureExtractor } from "./features";

/**
 * The audio graph:
 *
 *   <audio> ─► MediaElementSource ─┬─► AnalyserNode   (read-only tap, drives visuals)
 *                                  ├─► destination    (speakers)
 *                                  └─► recordDest     (MediaStream for clip recording)
 *
 *   mic ─► MediaStreamSource ──────┴─► AnalyserNode   (NOT to speakers: feedback loop)
 *
 * One AudioContext, created on the first user gesture (autoplay policy). Nothing here
 * runs, and the mic is never requested, until the user clicks something.
 */

export const DEMO_TRACK_URL = "/audio/demo.mp3";
export const UNSUPPORTED_FILE = "This file type isn't supported. Try an MP3 or WAV.";
export const MIC_EXPLAINER =
  "Flux listens to your mic to drive the visuals. Nothing is recorded or sent anywhere.";

const FFT_SIZE = 2048;
const SUPPORTED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
];

export function isSupportedAudioFile(file: { name: string; type: string }): boolean {
  if (SUPPORTED_TYPES.includes(file.type)) return true;
  return /\.(mp3|wav)$/i.test(file.name) && (file.type === "" || file.type.startsWith("audio/"));
}

export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Mic access was blocked. You can allow it from the address bar, or use a file or the demo track instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found. Plug one in, or use a file or the demo track.";
  if (name === "NotReadableError")
    return "The mic is busy in another app. Close it there and try again.";
  return "Couldn't start the mic. Try a file or the demo track instead.";
}

type Listener = (patch: Partial<Playback>) => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private el: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private extractor: FeatureExtractor | null = null;
  private idle = new FeatureExtractor(48000, FFT_SIZE);
  private source: AudioSource = "none";
  private listener: Listener = () => {};

  setListener(fn: Listener) {
    this.listener = fn;
  }

  get currentTime(): number {
    return this.el?.currentTime ?? 0;
  }

  get duration(): number {
    const d = this.el?.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  get playing(): boolean {
    if (this.source === "mic") return this.micStream !== null;
    return !!this.el && !this.el.paused;
  }

  /** Must be called from a user gesture handler the first time. */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5; // the analyser's own smoothing over time, 0–1
      this.ctx = ctx;
      this.analyser = analyser;
      this.recordDest = ctx.createMediaStreamDestination();
      this.freq = new Uint8Array(analyser.frequencyBinCount);
      this.extractor = new FeatureExtractor(ctx.sampleRate, FFT_SIZE);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private ensureElement(): HTMLAudioElement {
    if (this.el) return this.el;
    const ctx = this.ensureContext();
    const el = new Audio();
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    // A media element can only ever have ONE MediaElementSource, so build it once and reuse.
    const src = ctx.createMediaElementSource(el);
    src.connect(this.analyser!);
    src.connect(ctx.destination);
    src.connect(this.recordDest!);
    el.addEventListener("play", () => this.listener({ status: "playing" }));
    el.addEventListener("pause", () => this.listener({ status: "paused" }));
    el.addEventListener("ended", () => this.listener({ status: "paused" }));
    el.addEventListener("loadedmetadata", () => this.listener({ duration: this.duration }));
    el.addEventListener("error", () => {
      const message =
        this.source === "demo"
          ? "The demo track is missing. Add a CC0 MP3 at public/audio/demo.mp3."
          : UNSUPPORTED_FILE;
      this.source = "none";
      this.listener({ status: "idle", source: "none", error: message, label: "" });
    });
    this.el = el;
    return el;
  }

  private stopMic() {
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micSource = null;
    this.micStream = null;
  }

  private async playUrl(url: string, source: AudioSource, label: string) {
    this.stopMic();
    const el = this.ensureElement();
    el.pause();
    if (this.objectUrl && this.objectUrl !== url) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.source = source;
    this.listener({ source, label, status: "loading", error: null, duration: 0 });
    el.src = url;
    try {
      await el.play();
    } catch (err) {
      // play() also rejects when a newer load interrupts it; the element's error event
      // reports real decode failures, so only surface autoplay-type errors here.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        this.listener({ status: "paused" });
      }
    }
  }

  async loadFile(file: File): Promise<void> {
    if (!isSupportedAudioFile(file)) {
      this.listener({ error: UNSUPPORTED_FILE });
      return;
    }
    const url = URL.createObjectURL(file);
    this.objectUrl = url;
    await this.playUrl(url, "file", file.name);
  }

  async loadDemo(): Promise<void> {
    await this.playUrl(DEMO_TRACK_URL, "demo", "Demo track");
  }

  async useMic(): Promise<void> {
    const ctx = this.ensureContext();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.listener({ error: "Mic needs a secure (https) connection in this browser." });
      return;
    }
    this.el?.pause();
    this.listener({ status: "loading", error: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Raw signal: the browser's voice processing would flatten music.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.stopMic();
      this.micStream = stream;
      this.micSource = ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.analyser!); // analyser only, never the speakers
      this.source = "mic";
      this.listener({ source: "mic", status: "playing", label: "Microphone", duration: 0 });
    } catch (err) {
      this.listener({
        status: this.source === "none" ? "idle" : "paused",
        error: micErrorMessage(err),
      });
    }
  }

  toggle() {
    if (this.source === "mic") {
      this.stopMic();
      this.source = "none";
      this.listener({ source: "none", status: "idle", label: "" });
      return;
    }
    if (!this.el || this.source === "none") return;
    this.ensureContext();
    if (this.el.paused) void this.el.play();
    else this.el.pause();
  }

  pause() {
    this.el?.pause();
  }

  seek(seconds: number) {
    if (this.el && this.duration > 0)
      this.el.currentTime = Math.max(0, Math.min(seconds, this.duration));
  }

  /** Audio to mix into a recorded clip (file / demo only; the mic is never recorded). */
  recordStream(): MediaStream | null {
    return this.recordDest?.stream ?? null;
  }

  /** Once per frame, before the sketch draws. */
  analyse(dt: number): AudioFeatures {
    const now = performance.now();
    if (!this.analyser || !this.freq || !this.extractor || !this.playing) {
      // Ease levels back to zero rather than snapping when playback stops.
      return (this.extractor ?? this.idle).update(null, now, dt);
    }
    this.analyser.getByteFrequencyData(this.freq);
    return this.extractor.update(this.freq, now, dt);
  }

  /** Last computed features, for the meters (no extra analysis). */
  get features(): AudioFeatures {
    return (this.extractor ?? this.idle).features;
  }

  stopAll() {
    this.stopMic();
    this.el?.pause();
  }
}

export const audioEngine = new AudioEngine();
