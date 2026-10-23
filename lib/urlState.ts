import { MODE_ORDER, getSketch, isModeId } from "@/sketches";
import { stepDecimals } from "@/sketches/params";
import type { BaseParams, ModeId, ParamValue } from "@/sketches/types";

/**
 * Studio state ⇄ URL.
 *
 *   /studio?mode=flow&seed=48213&p=density:0.4,palette:tide
 *
 * Only params that differ from the mode's defaults go into `p`, so links stay short.
 * Decoding runs through the mode's zod schema: every field has `.catch(default)`, so a
 * hand-edited or stale link (density=banana, an old param name) never breaks the studio.
 */

export interface UrlState {
  mode: ModeId;
  seed: number;
  params: BaseParams;
}

export const DEFAULT_SEED = 1234;
const MAX_URL_SEED = 2 ** 32 - 1;

function formatValue(value: ParamValue, step: number | undefined): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    const decimals = step === undefined ? 4 : stepDecimals(step);
    return String(Number(value.toFixed(decimals)));
  }
  return value;
}

export function encodeState({ mode, seed, params }: UrlState): string {
  const sketch = getSketch(mode);
  const pairs: string[] = [];
  for (const key of Object.keys(sketch.defaults)) {
    const value = params[key];
    if (value === undefined) continue;
    const spec = sketch.controls[key];
    const step = spec?.kind === "number" ? spec.step : undefined;
    const encoded = formatValue(value, step);
    if (encoded === formatValue(sketch.defaults[key] as ParamValue, step)) continue;
    pairs.push(`${key}:${encodeURIComponent(encoded)}`);
  }
  // Built by hand rather than URLSearchParams so ":" and "," stay readable.
  let query = `mode=${mode}&seed=${seed}`;
  if (pairs.length) query += `&p=${pairs.join(",")}`;
  return query;
}

function parseValue(raw: string, like: ParamValue): unknown {
  if (typeof like === "number") return raw.trim() === "" ? NaN : Number(raw);
  if (typeof like === "boolean") {
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return raw; // not a boolean → the schema's .catch() restores the default
  }
  return raw;
}

export function decodeState(search: string): UrlState {
  const q = new URLSearchParams(search);
  const modeRaw = q.get("mode");
  const mode: ModeId = isModeId(modeRaw) ? modeRaw : (MODE_ORDER[0] as ModeId);

  const seedNum = Number(q.get("seed"));
  const seed =
    q.has("seed") && Number.isInteger(seedNum) && seedNum >= 0 && seedNum <= MAX_URL_SEED
      ? seedNum
      : DEFAULT_SEED;

  const sketch = getSketch(mode);
  const candidate: Record<string, unknown> = { ...sketch.defaults };
  const p = q.get("p");
  if (p) {
    for (const pair of p.split(",")) {
      const idx = pair.indexOf(":");
      if (idx <= 0) continue;
      const key = pair.slice(0, idx);
      if (!(key in sketch.defaults)) continue; // unknown / removed param: ignore
      const like = sketch.defaults[key] as ParamValue;
      candidate[key] = parseValue(decodeURIComponent(pair.slice(idx + 1)), like);
    }
  }
  return { mode, seed, params: sketch.schema.parse(candidate) };
}

/** Debounce: run `fn` once input has been quiet for `ms`. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
}
