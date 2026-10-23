import type { ModeId, Palette } from "@/sketches/types";

/**
 * Curated art palettes per mode. These are separate from the UI colours on purpose:
 * the art never inherits the panel colours unless "band colours" is switched on.
 */
export const PALETTES: Record<ModeId, Palette[]> = {
  flow: [
    {
      id: "ink",
      name: "Ink",
      background: "#F1ECE2",
      colors: ["#1B1B1E", "#373F51", "#A9A9A9", "#D8A47F"],
    },
    {
      id: "ember",
      name: "Ember",
      background: "#120C0A",
      colors: ["#F2A541", "#F08A4B", "#D45113", "#F9DC5C", "#FFF3E0"],
    },
    {
      id: "tide",
      name: "Tide",
      background: "#0B1D26",
      colors: ["#7FD1B9", "#DDF2EB", "#4A90A4", "#2E5E6E", "#F2E8CF"],
    },
    {
      id: "moss",
      name: "Moss",
      background: "#E9E5D6",
      colors: ["#3D5A40", "#7C9A6D", "#B6C197", "#2B2D2A", "#C9A66B"],
    },
    {
      id: "neonoir",
      name: "Night bus",
      background: "#0E0F14",
      colors: ["#E8D5B7", "#F4A259", "#5B8E7D", "#BC4B51", "#8CB369"],
    },
    {
      id: "risograph",
      name: "Riso",
      background: "#F6F1E7",
      colors: ["#FF4F5E", "#0078BF", "#FFB511", "#00A95C"],
    },
  ],
  packing: [
    {
      id: "bauhaus",
      name: "Bauhaus",
      background: "#F2EEE3",
      colors: ["#D7263D", "#1B998B", "#2E294E", "#F46036", "#E2C044"],
    },
    {
      id: "pebble",
      name: "Pebble",
      background: "#2B2A28",
      colors: ["#E4DED5", "#BFB6A8", "#8C857B", "#D9C5A0", "#6E675F"],
    },
    {
      id: "citrus",
      name: "Citrus",
      background: "#FFF8EC",
      colors: ["#FF9F1C", "#FFBF69", "#2EC4B6", "#CBF3F0", "#E71D36"],
    },
    {
      id: "deepsea",
      name: "Deep sea",
      background: "#06141B",
      colors: ["#11212D", "#253745", "#4A5C6A", "#9BA8AB", "#CCD0CF"],
    },
    {
      id: "candy",
      name: "Candy",
      background: "#FDF6F0",
      colors: ["#F7A8B8", "#A0CED9", "#FFD6A5", "#CDB4DB", "#B5E48C"],
    },
  ],
  terrain: [
    {
      id: "survey",
      name: "Survey map",
      background: "#F3EEDF",
      colors: ["#9C6644", "#7F5539", "#B08968", "#3A5A40", "#344E41"],
    },
    {
      id: "blueprint",
      name: "Blueprint",
      background: "#0F3057",
      colors: ["#E7F2F8", "#A8D0E6", "#5D9CEC"],
    },
    {
      id: "lava",
      name: "Lava",
      background: "#0D0907",
      colors: ["#FFE8A3", "#FFB347", "#FF6F3C", "#C1272D", "#5C1A1B"],
    },
    {
      id: "glacier",
      name: "Glacier",
      background: "#EEF4F7",
      colors: ["#1D3557", "#457B9D", "#A8DADC", "#6C8EAD"],
    },
    {
      id: "graphite",
      name: "Graphite",
      background: "#1A1A1A",
      colors: ["#F5F5F5", "#BDBDBD", "#8D8D8D", "#5E5E5E"],
    },
  ],
  orbits: [
    {
      id: "aurora",
      name: "Aurora",
      background: "#05070D",
      colors: ["#7CFFCB", "#4CC9F0", "#B5179E", "#F72585", "#FEE440"],
    },
    {
      id: "brass",
      name: "Brass",
      background: "#14110F",
      colors: ["#E0C097", "#B85C38", "#5C3D2E", "#F3E9DC"],
    },
    {
      id: "paper",
      name: "Paper",
      background: "#F5F1E8",
      colors: ["#2B2B2B", "#C1121F", "#003049", "#669BBC"],
    },
    {
      id: "dusk",
      name: "Dusk",
      background: "#1B1029",
      colors: ["#FFB4A2", "#E5989B", "#B5838D", "#6D6875", "#FFCDB2"],
    },
    {
      id: "signal",
      name: "Signal",
      background: "#0A0A0A",
      colors: ["#F5F5F5", "#FF3B30", "#FFCC00"],
    },
  ],
  tree: [
    {
      id: "spring",
      name: "Spring",
      background: "#F4F1E8",
      colors: ["#3E2C23", "#6B4F3A", "#7FB069", "#E6AACE", "#F7D6E0"],
    },
    {
      id: "autumn",
      name: "Autumn",
      background: "#1E1611",
      colors: ["#E9D8C4", "#C97C5D", "#E0A458", "#B23A48", "#F2C57C"],
    },
    {
      id: "winter",
      name: "Winter",
      background: "#DCE3E8",
      colors: ["#2F3E46", "#52796F", "#84A98C", "#FFFFFF"],
    },
    {
      id: "bonsai",
      name: "Bonsai",
      background: "#EDE6D6",
      colors: ["#2D2A26", "#4F4A41", "#6A994E", "#A7C957", "#BC4749"],
    },
    {
      id: "nightgarden",
      name: "Night garden",
      background: "#0B1320",
      colors: ["#C9D6DF", "#52616B", "#9AD1D4", "#F7B267", "#F4845F"],
    },
  ],
};

/** Patch-cable colours (the UI band colours). Index 0/1/2 = bass/mid/treble. */
export const BAND_PALETTE: Palette = {
  id: "bands",
  name: "Band colours",
  background: "#15171A",
  colors: ["#E8743B", "#3BA7C9", "#C63D8E"],
};

export function getPalette(mode: ModeId, id: string, bandColours: boolean): Palette {
  if (bandColours) return BAND_PALETTE;
  const list = PALETTES[mode];
  return list.find((p) => p.id === id) ?? (list[0] as Palette);
}

export function paletteIds(mode: ModeId): string[] {
  return PALETTES[mode].map((p) => p.id);
}

/** "#RRGGBB" + alpha 0..1 → "rgba(...)". Cached because sketches call it per frame. */
const rgbaCache = new Map<string, string>();
export function rgba(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  const key = hex + a;
  let out = rgbaCache.get(key);
  if (!out) {
    const n = parseInt(hex.slice(1), 16);
    out = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    if (rgbaCache.size > 4096) rgbaCache.clear();
    rgbaCache.set(key, out);
  }
  return out;
}

/** Relative luminance, used to pick a contrasting stroke on light vs dark backgrounds. */
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}
