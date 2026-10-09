import { AsyncLocalStorage } from "node:async_hooks";

type WaitUntil = (promise: Promise<unknown>) => void;

type RuntimeContext = {
  waitUntil?: WaitUntil;
};

const requestContexts = new WeakMap<Request, RuntimeContext>();
const runtimeStorage = new AsyncLocalStorage<RuntimeContext>();

/** Promises retained so a returned webhook response cannot drop the chat POST. */
const retained = new Set<Promise<unknown>>();

function asWaitUntil(value: unknown): WaitUntil | undefined {
  return typeof value === "function" ? (value as WaitUntil) : undefined;
}

/**
 * Nitro puts the host `waitUntil` on the Request (Node, Vercel, Cloudflare).
 * The third `fetch` argument is often empty, so the WeakMap used to miss it
 * and background work was frozen until the next incoming request.
 */
function captureRequestRuntime(request: Request, context: unknown): RuntimeContext {
  const ctx =
    context && typeof context === "object"
      ? (context as { waitUntil?: unknown })
      : undefined;
  const ctxFn = asWaitUntil(ctx?.waitUntil);
  if (ctxFn && ctx) return { waitUntil: (promise) => ctxFn.call(ctx, promise) };

  const reqFn = asWaitUntil((request as { waitUntil?: unknown }).waitUntil);
  if (reqFn) return { waitUntil: (promise) => reqFn.call(request, promise) };

  const globalFn = asWaitUntil((globalThis as { __wait_until__?: unknown }).__wait_until__);
  if (globalFn) return { waitUntil: (promise) => globalFn(promise) };

  return {};
}

export function registerRequestContext(request: Request, context: unknown): () => void {
  requestContexts.set(request, captureRequestRuntime(request, context));
  return () => requestContexts.delete(request);
}

/** Runs `fn` with the webhook's waitUntil visible to deferred jobs. */
export function enterRequestRuntime<T>(
  request: Request,
  context: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const runtime = requestContexts.get(request) ?? captureRequestRuntime(request, context);
  return runtimeStorage.run(runtime, run);
}

function resolveWaitUntil(request: Request): WaitUntil | undefined {
  return (
    requestContexts.get(request)?.waitUntil ??
    runtimeStorage.getStore()?.waitUntil ??
    captureRequestRuntime(request, undefined).waitUntil
  );
}

/**
 * Keeps webhook work alive after the HTTP acknowledgement is sent.
 * The promise is already running; this does not delay the response. `waitUntil`
 * stops the host from parking it until the next request, and the module-level
 * set keeps the chat POST referenced after the handler returns.
 */
export function deferRequestWork(request: Request, work: Promise<unknown>): void {
  const tracked = work.catch((error) => {
    console.error("[background-work] failed", error);
  });
  retained.add(tracked);
  void tracked.finally(() => {
    retained.delete(tracked);
  });

  const waitUntil = resolveWaitUntil(request);
  if (!waitUntil) return;
  try {
    waitUntil(tracked);
  } catch (error) {
    console.error("[background-work] waitUntil failed", error);
  }
}
