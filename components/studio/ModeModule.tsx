"use client";

import { MODE_ORDER, getSketch } from "@/sketches";
import { useStudio } from "@/stores/studio";
import Module, { Kbd, PanelButton } from "./Module";

export default function ModeModule() {
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  const setHelpOpen = useStudio((s) => s.setHelpOpen);
  return (
    <Module
      title="Mode"
      aside={
        <PanelButton onClick={() => setHelpOpen(true)} aria-keyshortcuts="?" aria-haspopup="dialog">
          Keys <Kbd>?</Kbd>
        </PanelButton>
      }
    >
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Visual mode">
        {MODE_ORDER.map((id, i) => {
          const active = id === mode;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              aria-keyshortcuts={String(i + 1)}
              title={`${getSketch(id).name} (${i + 1})`}
              onClick={() => setMode(id)}
              className="group flex min-h-11 flex-col items-center justify-center gap-1 rounded-[3px] border border-panel-edge bg-panel-hi px-1 py-1.5 text-label leading-tight text-engrave shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-white aria-pressed:bg-panel-lo aria-pressed:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]"
            >
              {/* LED: lit on the active module */}
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${active ? "bg-bass shadow-[0_0_4px_var(--bass)]" : "bg-panel-edge"}`}
              />
              <span className="tabular">{i + 1}</span>
              <span className="text-center">{getSketch(id).name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-label text-engrave-soft">{getSketch(mode).blurb}</p>
    </Module>
  );
}
