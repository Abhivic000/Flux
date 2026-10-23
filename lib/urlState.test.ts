import { describe, expect, it } from "vitest";
import { MODE_ORDER, getSketch } from "@/sketches";
import { randomiseParams } from "@/stores/studio";
import { DEFAULT_SEED, decodeState, encodeState } from "./urlState";

describe("urlState", () => {
  it("encodes defaults as just mode + seed", () => {
    const params = { ...getSketch("flow").defaults };
    expect(encodeState({ mode: "flow", seed: 42, params })).toBe("mode=flow&seed=42");
  });

  it("only encodes params that differ from defaults", () => {
    const params = { ...getSketch("flow").defaults, density: 0.4, palette: "tide" };
    const q = encodeState({ mode: "flow", seed: 7, params });
    expect(q).toBe("mode=flow&seed=7&p=palette:tide,density:0.4");
  });

  it("round-trips: decode(encode(state)) deep-equals state, for every mode", () => {
    for (const mode of MODE_ORDER) {
      for (let seed = 1; seed <= 25; seed++) {
        const params = randomiseParams(mode, getSketch(mode).defaults, [], seed);
        const state = { mode, seed, params };
        expect(decodeState(encodeState(state))).toEqual(state);
      }
    }
  });

  it("falls back to defaults on bad values instead of crashing", () => {
    const d = getSketch("flow").defaults;
    const s = decodeState(
      "?mode=flow&seed=9&p=density:banana,speed:999,palette:nope,bandColours:maybe",
    );
    expect(s.seed).toBe(9);
    expect(s.params.density).toBe(d.density);
    expect(s.params.speed).toBe(d.speed);
    expect(s.params.palette).toBe(d.palette);
    expect(s.params.bandColours).toBe(d.bandColours);
  });

  it("handles unknown mode, bad seed and junk pairs", () => {
    const s = decodeState("?mode=disco&seed=-3&p=,:x,unknown:1,density");
    expect(s.mode).toBe("flow");
    expect(s.seed).toBe(DEFAULT_SEED);
    expect(s.params).toEqual(getSketch("flow").defaults);
  });

  it("decodes an empty query to defaults", () => {
    expect(decodeState("")).toEqual({
      mode: "flow",
      seed: DEFAULT_SEED,
      params: getSketch("flow").defaults,
    });
  });
});
