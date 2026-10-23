"use client";

import { useEffect, useRef } from "react";
import { FpsMonitor, guessTier, lowerTier, readDeviceHints } from "@/lib/quality";
import { studioRuntime } from "@/lib/studioRuntime";
import { debounce, decodeState, encodeState } from "@/lib/urlState";
import { MODE_ORDER } from "@/sketches";
import { useStudio } from "@/stores/studio";

/** Read the URL once on mount, then mirror state back into it (debounced, replaceState). */
export function useUrlSync() {
  useEffect(() => {
    const decoded = decodeState(window.location.search);
    useStudio.getState().hydrate(decoded);

    let last = "";
    const write = debounce(() => {
      const s = useStudio.getState();
      const query = encodeState({ mode: s.mode, seed: s.seed, params: s.params[s.mode] });
      if (query === last) return;
      last = query;
      // replaceState, not pushState: dragging a slider shouldn't fill the back button.
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${query}`);
    }, 300);
    const unsubscribe = useStudio.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.seed !== prev.seed || s.params !== prev.params) write();
    });
    write();
    return () => {
      unsubscribe();
      write.cancel();
    };
  }, []);
}

/** Initial tier guess + FPS-driven auto-downgrade. Returns the per-frame callback. */
export function useQuality(): (dt: number) => void {
  const monitor = useRef<FpsMonitor | null>(null);

  useEffect(() => {
    monitor.current = new FpsMonitor();
    const q = new URLSearchParams(window.location.search).get("tier");
    if (q === "high" || q === "medium" || q === "low") {
      useStudio.getState().setTier(q, false);
    } else {
      useStudio.getState().setTier(guessTier(readDeviceHints()), true);
    }
    const unsubscribe = useStudio.subscribe((s, prev) => {
      // Any tier change re-initialises the sketch; don't count those slow frames.
      if (s.tier !== prev.tier) monitor.current?.reset();
    });

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => useStudio.getState().setReducedMotion(mq.matches);
    applyMotion();
    mq.addEventListener("change", applyMotion);
    return () => {
      unsubscribe();
      mq.removeEventListener("change", applyMotion);
    };
  }, []);

  return (dt: number) => {
    const m = monitor.current;
    if (!m) return;
    const downgrade = m.tick(dt);
    studioRuntime.fps = m.fps;
    const s = useStudio.getState();
    if (downgrade && s.tierAuto && s.tier !== "low") s.setTier(lowerTier(s.tier), true);
  };
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface ShortcutHandlers {
  togglePlay?: () => void;
  savePng?: () => void;
}

/**
 * Space play/pause · R randomise · S save PNG · 1–5 mode · H hide UI · ? help.
 * Ignored while typing in a field, and no modifier combos, so screen-reader and browser
 * shortcuts keep working.
 */
export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStudio.getState();
      if (e.key === "Escape") {
        if (s.helpOpen) s.setHelpOpen(false);
        else if (s.uiHidden) s.toggleUI();
        return;
      }
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === " ") {
        // A focused button already handles Space itself.
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        ref.current.togglePlay?.();
      } else if (key === "r") {
        s.randomise();
      } else if (key === "h") {
        s.toggleUI();
      } else if (key === "s") {
        e.preventDefault();
        ref.current.savePng?.();
      } else if (key === "?") {
        s.setHelpOpen(!s.helpOpen);
      } else if (/^[1-9]$/.test(key)) {
        const mode = MODE_ORDER[Number(key) - 1];
        if (mode) s.setMode(mode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
