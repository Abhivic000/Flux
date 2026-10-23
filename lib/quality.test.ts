import { describe, expect, it } from "vitest";
import { FpsMonitor, guessTier, lowerTier, pixelDensityFor } from "./quality";

const feed = (m: FpsMonitor, fps: number, seconds: number) => {
  let downgrades = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (m.tick(1 / fps)) downgrades++;
  return downgrades;
};

describe("FpsMonitor", () => {
  it("does nothing at a healthy frame rate", () => {
    expect(feed(new FpsMonitor(), 60, 20)).toBe(0);
  });

  it("downgrades once after the 2 s probe if the device is slow", () => {
    const m = new FpsMonitor();
    expect(feed(m, 30, 2.2)).toBe(1);
  });

  it("needs 3 s of sustained low FPS after the probe, not a single hitch", () => {
    const m = new FpsMonitor();
    feed(m, 60, 3); // probe passes
    expect(feed(m, 30, 1.5)).toBe(0); // short dip
    expect(feed(m, 60, 2)).toBe(0); // recovers → timer resets
    expect(feed(m, 30, 4.5)).toBe(1); // sustained → one downgrade
  });

  it("waits out a cooldown between downgrades (hysteresis)", () => {
    const m = new FpsMonitor();
    feed(m, 60, 3);
    // 30 fps forever: one downgrade per (cooldown 3 s + sustain 3 s) window, never per frame.
    expect(feed(m, 30, 12.5)).toBeLessThanOrEqual(2);
  });

  it("ignores huge frame gaps from a hidden tab", () => {
    const m = new FpsMonitor();
    expect(m.tick(5)).toBe(false);
  });
});

describe("tier helpers", () => {
  it("guesses from hardware hints", () => {
    expect(guessTier({ devicePixelRatio: 1, hardwareConcurrency: 12, coarsePointer: false })).toBe(
      "high",
    );
    expect(guessTier({ devicePixelRatio: 3, hardwareConcurrency: 8, coarsePointer: true })).toBe(
      "low",
    );
    expect(guessTier({ devicePixelRatio: 2, hardwareConcurrency: 4, coarsePointer: false })).toBe(
      "low",
    );
  });

  it("caps pixel density per tier and steps down", () => {
    expect(pixelDensityFor("high", 3)).toBe(2);
    expect(pixelDensityFor("low", 3)).toBe(1);
    expect(lowerTier("high")).toBe("medium");
    expect(lowerTier("low")).toBe("low");
  });
});
