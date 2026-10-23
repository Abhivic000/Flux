import { describe, expect, it } from "vitest";
import { buildFilename, exportDimensions } from "./filename";

describe("buildFilename", () => {
  it("follows flux-<mode>-<seed>-<size>.png", () => {
    expect(buildFilename("terrain", 48213, "poster", "png")).toBe("flux-terrain-48213-poster.png");
    expect(buildFilename("flow", 7, "2x", ".PNG")).toBe("flux-flow-7-2x.png");
    expect(buildFilename("tree", 12, "", "svg")).toBe("flux-tree-12-export.svg");
  });

  it("strips characters that are unsafe in filenames", () => {
    expect(buildFilename("orbits", 3, "12s/../clip", "webm")).toBe("flux-orbits-3-12sclip.webm");
  });
});

describe("exportDimensions", () => {
  it("scales 1×, 2× and poster (3000px long edge)", () => {
    expect(exportDimensions("1x", 1200, 800)).toEqual({ width: 1200, height: 800, scale: 1 });
    expect(exportDimensions("2x", 1200, 800)).toEqual({ width: 2400, height: 1600, scale: 2 });
    expect(exportDimensions("poster", 1200, 800)).toEqual({
      width: 3000,
      height: 2000,
      scale: 2.5,
    });
    expect(exportDimensions("poster", 390, 600).height).toBe(3000);
  });
});
