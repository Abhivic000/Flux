"use client";

import { useRef, useState } from "react";
import { MIC_EXPLAINER, audioEngine } from "@/lib/audio/engine";
import { useStudio } from "@/stores/studio";
import Module, { PanelButton } from "./Module";

/** "Input" module: file, mic or demo track. Audio starts only from these clicks. */
export default function AudioModule() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [askMic, setAskMic] = useState(false);
  const playback = useStudio((s) => s.playback);
  const setPlayback = useStudio((s) => s.setPlayback);

  return (
    <Module title="Input">
      <div className="grid grid-cols-3 gap-1">
        <PanelButton
          onClick={() => fileRef.current?.click()}
          aria-pressed={playback.source === "file"}
          className="aria-pressed:bg-panel-lo"
        >
          File
        </PanelButton>
        <PanelButton
          onClick={() => setAskMic(true)}
          aria-pressed={playback.source === "mic"}
          aria-expanded={askMic}
          className="aria-pressed:bg-panel-lo"
        >
          Mic
        </PanelButton>
        <PanelButton
          onClick={() => {
            setAskMic(false);
            void audioEngine.loadDemo();
          }}
          aria-pressed={playback.source === "demo"}
          className="aria-pressed:bg-panel-lo"
        >
          Demo
        </PanelButton>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        className="sr-only"
        tabIndex={-1}
        aria-label="Audio file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again
          setAskMic(false);
          if (file) void audioEngine.loadFile(file);
        }}
      />

      {askMic && (
        // Explain first; the browser permission prompt only appears after "Allow mic".
        <div className="mt-2 rounded-[3px] border border-panel-edge bg-panel-hi/70 p-2 text-label">
          <p>{MIC_EXPLAINER}</p>
          <div className="mt-2 flex gap-1">
            <PanelButton
              onClick={() => {
                setAskMic(false);
                void audioEngine.useMic();
              }}
            >
              Allow mic
            </PanelButton>
            <PanelButton onClick={() => setAskMic(false)}>Cancel</PanelButton>
          </div>
        </div>
      )}

      {playback.error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-label text-[#8a2b1d]">
          <span className="flex-1">{playback.error}</span>
          <button
            type="button"
            className="underline"
            onClick={() => setPlayback({ error: null })}
            aria-label="Dismiss message"
          >
            OK
          </button>
        </p>
      )}
      <p className="mt-2 text-label text-engrave-soft">
        {playback.source === "none"
          ? "Pick an input. MP3 or WAV files, your mic, or the demo track."
          : playback.status === "loading"
            ? "Loading…"
            : `Listening to: ${playback.label}`}
      </p>
    </Module>
  );
}
