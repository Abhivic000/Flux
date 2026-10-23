"use client";

import { useEffect, useRef } from "react";
import { PALETTES } from "@/lib/palettes";
import { getSketch } from "@/sketches";
import type { BaseParams } from "@/sketches/types";
import { useStudio } from "@/stores/studio";
import Module, { Kbd, PanelButton } from "./Module";

const LOCK_SVG = `<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

const BAND_VAR = { bass: "var(--bass)", mid: "var(--mid)", treble: "var(--treble)" } as const;

/**
 * Params module. Tweakpane manages its own DOM (like p5), so it's created in an effect,
 * bound to a plain object, and disposed on cleanup. Changes flow:
 *
 *   Tweakpane "change" ─► store.setParam ─► (subscribe) ─► art ref ─► sketch
 *   store changed elsewhere (Randomise, URL) ─► copy into bound object ─► pane.refresh()
 */
export default function Panel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mode = useStudio((s) => s.mode);
  const seed = useStudio((s) => s.seed);
  const randomise = useStudio((s) => s.randomise);
  const resetParams = useStudio((s) => s.resetParams);
  const setSeed = useStudio((s) => s.setSeed);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose = () => {};

    void import("tweakpane").then(({ Pane }) => {
      if (cancelled) return;
      const sketch = getSketch(mode);
      const store = useStudio.getState();
      const bound: BaseParams = { ...store.params[mode] };
      const pane = new Pane({ container: host });
      pane.element.classList.add("flux-pane");
      let syncing = false;
      const lockButtons = new Map<string, HTMLButtonElement>();

      for (const [key, spec] of Object.entries(sketch.controls)) {
        let binding;
        switch (spec.kind) {
          case "number":
            binding = pane.addBinding(bound, key, {
              label: spec.label,
              min: spec.min,
              max: spec.max,
              step: spec.step,
            });
            break;
          case "boolean":
            binding = pane.addBinding(bound, key, { label: spec.label });
            break;
          case "palette":
            binding = pane.addBinding(bound, key, {
              label: spec.label,
              options: Object.fromEntries(PALETTES[mode].map((p) => [p.name, p.id])),
            });
            break;
          case "select":
            binding = pane.addBinding(bound, key, {
              label: spec.label,
              options: Object.fromEntries(spec.options.map((o) => [o.label, o.value])),
            });
            break;
        }
        binding.on("change", (ev) => {
          if (!syncing) useStudio.getState().setParam(key, ev.value as BaseParams[string]);
        });

        // Tweakpane's inputs have no accessible name of their own; give them the label.
        binding.element.querySelectorAll("input, select").forEach((el) => {
          el.setAttribute("aria-label", spec.label);
        });

        // Patch-cable colour stripe on band-mapped controls.
        if (spec.kind === "number" && spec.band) {
          binding.element.style.boxShadow = `inset 3px 0 0 ${BAND_VAR[spec.band]}`;
        }

        // Lock toggle, injected into the row label.
        if (!spec.noRandom) {
          const labelEl = binding.element.querySelector(".tp-lblv_l");
          if (labelEl instanceof HTMLElement) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "flux-lock";
            btn.innerHTML = LOCK_SVG;
            btn.setAttribute("aria-label", `Lock ${spec.label}`);
            btn.title = "Lock: keep this value on Randomise";
            btn.addEventListener("click", () => useStudio.getState().toggleLock(key));
            labelEl.style.display = "flex";
            labelEl.style.alignItems = "center";
            labelEl.prepend(btn);
            lockButtons.set(key, btn);
          }
        }
      }

      const syncFromStore = (s: ReturnType<typeof useStudio.getState>) => {
        const params = s.params[mode];
        let changed = false;
        for (const key of Object.keys(bound)) {
          if (bound[key] !== params[key]) {
            bound[key] = params[key] as BaseParams[string];
            changed = true;
          }
        }
        if (changed) {
          syncing = true;
          pane.refresh();
          syncing = false;
        }
        const locked = s.locks[mode];
        for (const [key, btn] of lockButtons) {
          btn.setAttribute("aria-pressed", String(locked.includes(key)));
        }
      };
      syncFromStore(store);
      const unsubscribe = useStudio.subscribe(syncFromStore);

      dispose = () => {
        unsubscribe();
        pane.dispose();
      };
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [mode]);

  return (
    <Module
      title="Params"
      aside={
        <>
          <PanelButton onClick={randomise} aria-keyshortcuts="r" title="Randomise (R)">
            Randomise <Kbd>R</Kbd>
          </PanelButton>
          <PanelButton onClick={resetParams} title="Reset this mode to defaults">
            Reset
          </PanelButton>
        </>
      }
    >
      <label className="mb-2 flex items-center gap-2 text-label">
        <span className="w-16">Seed</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={seed}
          onChange={(e) => {
            const v = Math.floor(Number(e.target.value));
            if (Number.isFinite(v) && v >= 0) setSeed(v);
          }}
          className="tabular h-7 w-28 rounded-[3px] border border-panel-edge bg-[#c6c9c5] px-2 text-label text-engrave"
        />
      </label>
      <div ref={hostRef} className="-mx-1" />
      <p className="mt-2 text-label text-engrave-soft">
        Locked values are kept when you randomise.
      </p>
    </Module>
  );
}
