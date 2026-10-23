/**
 * Marching squares: find where a height field crosses a level, cell by cell.
 *
 * Each grid cell has 4 corners; mark each corner as above (1) or below (0) the level.
 * Those 4 bits give 16 cases, and each case says which cell edges the contour crosses:
 *
 *   tl ── top ── tr        case = tl·8 + tr·4 + br·2 + bl·1
 *   │             │
 *  left         right      e.g. case 3 (bl, br above) → one segment left → right
 *   │             │
 *   bl ─ bottom ─ br       cases 5 and 10 are saddles → two segments
 *
 * The crossing point on an edge is linearly interpolated between its two corner heights.
 *
 * Performance: rather than one full pass per level (levels × cells), we make ONE pass
 * over the cells and only test the levels between each cell's min and max corner height —
 * usually 0–2 of them. With 14 levels that's ~10× less work.
 */

// Edge ids: 0 top, 1 right, 2 bottom, 3 left. Pairs of edges joined per case.
const TABLE: readonly (readonly [number, number])[][] = [
  [],
  [[3, 2]],
  [[2, 1]],
  [[3, 1]],
  [[0, 1]],
  [
    [3, 0],
    [2, 1],
  ],
  [[0, 2]],
  [[3, 0]],
  [[3, 0]],
  [[0, 2]],
  [
    [0, 1],
    [3, 2],
  ],
  [[0, 1]],
  [[3, 1]],
  [[2, 1]],
  [[3, 2]],
  [],
];

export type LevelSink = (level: number, x1: number, y1: number, x2: number, y2: number) => void;
export type SegmentSink = (x1: number, y1: number, x2: number, y2: number) => void;

const px = new Float32Array(4);
const py = new Float32Array(4);

/**
 * Contours for evenly spaced levels k / (count + 1), k = 1…count, in one pass.
 * `emit` receives the level index k (1-based).
 */
export function marchingSquaresLevels(
  field: Float32Array,
  cols: number,
  rows: number,
  cell: number,
  count: number,
  emit: LevelSink,
): void {
  const step = 1 / (count + 1);
  for (let j = 0; j < rows - 1; j++) {
    const y = j * cell;
    for (let i = 0; i < cols - 1; i++) {
      const tl = field[j * cols + i]!;
      const tr = field[j * cols + i + 1]!;
      const br = field[(j + 1) * cols + i + 1]!;
      const bl = field[(j + 1) * cols + i]!;
      const lo = Math.min(tl, tr, br, bl);
      const hi = Math.max(tl, tr, br, bl);
      // Only the levels this cell actually spans.
      const k0 = Math.max(1, Math.ceil(lo / step));
      const k1 = Math.min(count, Math.floor(hi / step));
      if (k0 > k1) continue;
      const x = i * cell;
      for (let k = k0; k <= k1; k++) {
        const level = k * step;
        const idx =
          (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        px[0] = x + (cell * (level - tl)) / (tr - tl);
        py[0] = y;
        px[1] = x + cell;
        py[1] = y + (cell * (level - tr)) / (br - tr);
        px[2] = x + (cell * (level - bl)) / (br - bl);
        py[2] = y + cell;
        px[3] = x;
        py[3] = y + (cell * (level - tl)) / (bl - tl);
        for (const [a, b] of TABLE[idx]!) emit(k, px[a]!, py[a]!, px[b]!, py[b]!);
      }
    }
  }
}

/** Contours for a single arbitrary level (used by tests and simple callers). */
export function marchingSquares(
  field: Float32Array,
  cols: number,
  rows: number,
  cell: number,
  level: number,
  emit: SegmentSink,
): void {
  for (let j = 0; j < rows - 1; j++) {
    const y = j * cell;
    for (let i = 0; i < cols - 1; i++) {
      const tl = field[j * cols + i]!;
      const tr = field[j * cols + i + 1]!;
      const br = field[(j + 1) * cols + i + 1]!;
      const bl = field[(j + 1) * cols + i]!;
      const idx =
        (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = i * cell;
      px[0] = x + (cell * (level - tl)) / (tr - tl);
      py[0] = y;
      px[1] = x + cell;
      py[1] = y + (cell * (level - tr)) / (br - tr);
      px[2] = x + (cell * (level - bl)) / (br - bl);
      py[2] = y + cell;
      px[3] = x;
      py[3] = y + (cell * (level - tl)) / (bl - tl);
      for (const [a, b] of TABLE[idx]!) emit(px[a]!, py[a]!, px[b]!, py[b]!);
    }
  }
}
