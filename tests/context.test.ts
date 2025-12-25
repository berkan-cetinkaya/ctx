import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { describe, expect, it, vi } from "vitest";
import { ContextCancelledError, background } from "../src/index";

describe("Context", () => {
  it("cancels children when parent cancels", async () => {
    const parent = background();
    const child = parent.withCancel();

    parent.cancel();
    await child.done();

    expect(child.cancelled()).toBe(true);
  });

  it("does not cancel parent when child cancels", async () => {
    const parent = background();
    const child = parent.withCancel();

    child.cancel();
    await child.done();

    expect(child.cancelled()).toBe(true);
    expect(parent.cancelled()).toBe(false);
  });

  it("cascades cancellation across nested services", async () => {
    const root = background();
    const serviceA = root.withCancel();
    const serviceB = serviceA.withTimeout(100);
    const serviceC = serviceB.withValue("key", "value");

    root.cancel();

    await Promise.all([serviceA.done(), serviceB.done(), serviceC.done()]);
    expect(serviceA.cancelled()).toBe(true);
    expect(serviceB.cancelled()).toBe(true);
    expect(serviceC.cancelled()).toBe(true);
    expect(serviceC.value("key")).toBe("value");
  });

  it("supports timeouts", async () => {
    vi.useFakeTimers();
    const ctx = background().withTimeout(50);

    const done = ctx.done();
    await vi.advanceTimersByTimeAsync(50);
    await done;

    expect(ctx.cancelled()).toBe(true);
    vi.useRealTimers();
  });

  it("propagates values through parent chain", () => {
    const key = Symbol("key");
    const ctx = background().withValue(key, "value");
    const child = ctx.withCancel();

    expect(child.value(key)).toBe("value");
  });

  it("throws ContextCancelledError on throwIfCancelled", () => {
    const ctx = background();
    ctx.cancel();

    expect(() => ctx.throwIfCancelled()).toThrow(ContextCancelledError);
  });

  it("integrates with fetch via signal()", async () => {
    const server = createServer(
      (_: IncomingMessage, res: ServerResponse) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
      }, 50);
    }
    );

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : undefined;

    if (!port) {
      server.close();
      throw new Error("failed to acquire test port");
    }

    const ctx = background().withCancel();
    const fetchPromise = fetch(`http://127.0.0.1:${port}`, {
      signal: ctx.signal(),
    });

    ctx.cancel();

    await expect(fetchPromise).rejects.toMatchObject({ name: "ContextCancelledError" });
    server.close();
  });
});
