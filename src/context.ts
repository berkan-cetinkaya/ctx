import { ContextCancelledError } from "./errors.js";

type ValueEntry = {
  key: unknown;
  value: unknown;
};

export class Context {
  private readonly parent?: Context;
  private readonly controller: AbortController;
  private readonly donePromise: Promise<void>;
  private readonly valueEntry?: ValueEntry;
  private doneResolve?: () => void;
  private cancelledFlag = false;

  private constructor(parent?: Context, valueEntry?: ValueEntry) {
    this.parent = parent;
    // AbortController is internal; callers only see AbortSignal via signal().
    this.controller = new AbortController();
    this.valueEntry = valueEntry;
    // Done is a Go-style promise that resolves on cancellation.
    this.donePromise = new Promise<void>((resolve) => {
      this.doneResolve = resolve;
    });

    if (this.parent) {
      if (this.parent.cancelled()) {
        this.cancel();
      } else {
        this.parent.done().then(() => this.cancel());
      }
    }
  }

  static background(): Context {
    return new Context();
  }

  withCancel(): Context {
    return new Context(this);
  }

  withTimeout(ms: number): Context {
    const child = new Context(this);
    const timer = setTimeout(() => child.cancel(), ms);

    // Ensure timeouts do not leak once the context is cancelled.
    child.done().finally(() => clearTimeout(timer));
    return child;
  }

  withValue(key: unknown, value: unknown): Context {
    return new Context(this, { key, value });
  }

  cancel(): void {
    if (this.cancelledFlag) {
      return;
    }

    this.cancelledFlag = true;
    this.controller.abort(new ContextCancelledError());
    this.doneResolve?.();
  }

  done(): Promise<void> {
    return this.donePromise;
  }

  cancelled(): boolean {
    return this.cancelledFlag;
  }

  throwIfCancelled(): void {
    if (this.cancelledFlag) {
      throw new ContextCancelledError();
    }
  }

  signal(): AbortSignal {
    return this.controller.signal;
  }

  value<T = unknown>(key: unknown): T | undefined {
    if (this.valueEntry && this.valueEntry.key === key) {
      return this.valueEntry.value as T;
    }

    // Walk the parent chain without mutating it.
    return this.parent?.value<T>(key);
  }
}

export function background(): Context {
  return Context.background();
}
