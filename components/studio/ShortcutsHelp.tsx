"use client";

import { useEffect, useRef } from "react";
import { useStudio } from "@/stores/studio";
import { Kbd, PanelButton } from "./Module";

const KEYS: [string, string][] = [
  ["Space", "Play / pause (or stop the mic)"],
  ["R", "Randomise unlocked params and the seed"],
  ["S", "Save PNG at the selected size"],
  ["1 – 5", "Flow · Circle packing · Terrain · Orbits · Tree"],
  ["H", "Hide / show all controls"],
  ["?", "This list"],
  ["Esc", "Close this list, or bring hidden controls back"],
];

/**
 * Shortcut reference. Single keys with no modifiers, ignored while typing in a field, so
 * they don't clash with screen-reader or browser shortcuts. Every action also has a
 * visible button, so nothing is keyboard-shortcut-only.
 */
export default function ShortcutsHelp() {
  const open = useStudio((s) => s.helpOpen);
  const setOpen = useStudio((s) => s.setHelpOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement;
      closeRef.current?.focus();
    } else if (returnTo.current instanceof HTMLElement) {
      returnTo.current.focus();
    }
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        className="brushed w-full max-w-sm rounded-[3px] border border-panel-edge p-4 text-engrave shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between border-b border-panel-edge pb-2">
          <h2 id="keys-title" className="engraved text-small font-semibold">
            Keyboard
          </h2>
          <PanelButton ref={closeRef} onClick={() => setOpen(false)}>
            Close
          </PanelButton>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-label">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
