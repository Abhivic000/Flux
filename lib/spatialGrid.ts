/**
 * Uniform spatial grid (spatial hash) for circles.
 *
 * The canvas is cut into square cells about one max-diameter wide. Each circle is filed
 * under the cell holding its centre. To find what might touch a circle at (x, y, r) we
 * only scan the cells within reach — for r ≤ maxR that's the 3×3 block around it —
 * instead of every circle on the canvas.
 *
 *   ┌───┬───┬───┐
 *   │ · │ · │ · │   query(x, y, r) looks here only
 *   ├───┼───┼───┤
 *   │ · │ ◉ │ · │   naive:  O(n) per query → O(n²) for a full packing
 *   ├───┼───┼───┤   grid:   O(k) per query, k = circles in 9 cells → ~O(n) overall
 *   │ · │ · │ · │
 *   └───┴───┴───┘
 *
 * Storage is a linked list per cell in flat typed arrays (no per-circle objects), which
 * keeps it fast and makes the data cheap to copy out of a Web Worker.
 */
export class SpatialGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  private readonly head: Int32Array;
  private next: Int32Array;
  xs: Float32Array;
  ys: Float32Array;
  rs: Float32Array;
  count = 0;
  /** Largest radius inserted so far; bounds how far a query must look. */
  maxRadius = 0;

  constructor(width: number, height: number, cellSize: number, capacity = 1024) {
    this.cellSize = Math.max(1, cellSize);
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(capacity);
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.rs = new Float32Array(capacity);
  }

  private cellOf(v: number, max: number): number {
    const c = Math.floor(v / this.cellSize);
    return c < 0 ? 0 : c >= max ? max - 1 : c;
  }

  private grow() {
    const cap = this.xs.length * 2;
    const copy = <T extends Float32Array | Int32Array>(a: T, make: (n: number) => T) => {
      const b = make(cap);
      b.set(a);
      return b;
    };
    this.xs = copy(this.xs, (n) => new Float32Array(n));
    this.ys = copy(this.ys, (n) => new Float32Array(n));
    this.rs = copy(this.rs, (n) => new Float32Array(n));
    this.next = copy(this.next, (n) => new Int32Array(n));
  }

  insert(x: number, y: number, r: number): number {
    if (this.count === this.xs.length) this.grow();
    const id = this.count++;
    this.xs[id] = x;
    this.ys[id] = y;
    this.rs[id] = r;
    const cell = this.cellOf(y, this.rows) * this.cols + this.cellOf(x, this.cols);
    this.next[id] = this.head[cell]!;
    this.head[cell] = id;
    if (r > this.maxRadius) this.maxRadius = r;
    return id;
  }

  /**
   * Ids of circles that overlap the circle (x, y, r), i.e. centre distance < r + rᵢ.
   * Results are written into `out` (reused to avoid allocating per call).
   */
  query(x: number, y: number, r: number, out: number[] = []): number[] {
    out.length = 0;
    const reach = r + this.maxRadius;
    const c0 = this.cellOf(x - reach, this.cols);
    const c1 = this.cellOf(x + reach, this.cols);
    const r0 = this.cellOf(y - reach, this.rows);
    const r1 = this.cellOf(y + reach, this.rows);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        for (let id = this.head[row * this.cols + col]!; id !== -1; id = this.next[id]!) {
          const dx = this.xs[id]! - x;
          const dy = this.ys[id]! - y;
          const rr = r + this.rs[id]!;
          if (dx * dx + dy * dy < rr * rr) out.push(id);
        }
      }
    }
    return out;
  }

  /**
   * Largest radius a circle at (x, y) can have without overlapping anything, capped at
   * `cap`. Returns ≤ 0 if (x, y) is inside an existing circle.
   */
  freeRadius(x: number, y: number, cap: number, padding = 0): number {
    let best = cap;
    const reach = cap + this.maxRadius + padding;
    const c0 = this.cellOf(x - reach, this.cols);
    const c1 = this.cellOf(x + reach, this.cols);
    const r0 = this.cellOf(y - reach, this.rows);
    const r1 = this.cellOf(y + reach, this.rows);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        for (let id = this.head[row * this.cols + col]!; id !== -1; id = this.next[id]!) {
          const dx = this.xs[id]! - x;
          const dy = this.ys[id]! - y;
          const gap = Math.sqrt(dx * dx + dy * dy) - this.rs[id]! - padding;
          if (gap < best) {
            best = gap;
            if (best <= 0) return best;
          }
        }
      }
    }
    return best;
  }
}
