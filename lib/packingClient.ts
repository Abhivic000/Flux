import { packCircles, type PackOptions, type PackResult } from "./packing";

/**
 * Promise wrapper around workers/packing.worker.ts. One long-lived worker; each request
 * carries an id so out-of-order replies (e.g. after a fast Randomise) resolve the right
 * promise. Falls back to the main thread where workers aren't available.
 */

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: PackResult) => void>();

function getWorker(): Worker | null {
  // Already inside a worker (e.g. the poster renderer)? Just compute here.
  if (typeof Worker === "undefined" || typeof window === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("../workers/packing.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (e: MessageEvent<{ id: number; result: PackResult }>) => {
        pending.get(e.data.id)?.(e.data.result);
        pending.delete(e.data.id);
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}

export function packInWorker(opts: PackOptions): Promise<PackResult> {
  const w = getWorker();
  if (!w) return Promise.resolve(packCircles(opts));
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, opts });
  });
}

export interface PackingBenchmark {
  circles: number;
  mainThread: { computeMs: number; blockedMs: number };
  worker: { computeMs: number; roundTripMs: number; blockedMs: number };
}

/**
 * Main thread vs worker, same job. "blocked" = longest gap between animation frames
 * while the job runs, i.e. how long the canvas froze.
 */
export async function benchmarkPacking(opts: PackOptions): Promise<PackingBenchmark> {
  const watchFrames = () => {
    let last = performance.now();
    let worst = 0;
    let raf = 0;
    const tick = (now: number) => {
      worst = Math.max(worst, now - last);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      return Math.max(worst, performance.now() - last);
    };
  };
  const frame = () => new Promise((r) => requestAnimationFrame(r));

  await frame();
  let stop = watchFrames();
  await frame();
  const main = packCircles(opts);
  await frame();
  const mainBlocked = stop();

  await packInWorker({ ...opts, count: 10 }); // warm the worker up (module load)
  await frame();
  stop = watchFrames();
  const t0 = performance.now();
  const viaWorker = await packInWorker(opts);
  const roundTrip = performance.now() - t0;
  await frame();
  const workerBlocked = stop();

  return {
    circles: main.count,
    mainThread: { computeMs: round(main.ms), blockedMs: round(mainBlocked) },
    worker: {
      computeMs: round(viaWorker.ms),
      roundTripMs: round(roundTrip),
      blockedMs: round(workerBlocked),
    },
  };
}

const round = (v: number) => Math.round(v * 10) / 10;
