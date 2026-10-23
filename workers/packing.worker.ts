import { packCircles, type PackOptions } from "@/lib/packing";

/**
 * Runs circle packing off the main thread. No DOM here, just maths in → numbers out.
 * The result buffer is *transferred* (moved, not copied) back to the page.
 *
 * (Typed through the DOM `Worker` interface: same postMessage/onmessage shape, and it
 * avoids mixing the `webworker` and `dom` type libraries in one project.)
 */
const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<{ id: number; opts: PackOptions }>) => {
  const { id, opts } = e.data;
  const result = packCircles(opts);
  ctx.postMessage({ id, result }, [result.circles.buffer]);
};
