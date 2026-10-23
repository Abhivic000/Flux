import type { RenderReply, RenderRequest } from "@/workers/render.worker";

/** Client for workers/render.worker.ts. */

export function offscreenSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    "convertToBlob" in OffscreenCanvas.prototype
  );
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: RenderReply) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../workers/render.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<RenderReply>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

export function renderOffThread(req: Omit<RenderRequest, "id">): Promise<RenderReply> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ ...req, id } satisfies RenderRequest);
  });
}
