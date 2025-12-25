# ctx

Go-style context discipline for Node.js. Explicit context passing, cooperative cancellation, zero runtime deps.

## Example

```ts
import { background } from "ctx";

async function runJob() {
  const jobCtx = background().withTimeout(2000);

  const step1 = jobCtx.withCancel();
  const step2 = jobCtx.withCancel();

  const work = async (ctx: ReturnType<typeof background>) => {
    await fetch("https://example.com", { signal: ctx.signal() });
    ctx.throwIfCancelled();
  };

  await Promise.all([work(step1), work(step2)]);
}
```

## API

- `background()` creates a root context.
- `ctx.withCancel()` creates a child context.
- `ctx.withTimeout(ms)` creates a child context with a deadline.
- `ctx.withValue(key, value)` creates a child context carrying a value.
- `ctx.cancel()` cancels the context; children observe it.
- `ctx.done()` returns a promise that resolves on cancellation.
- `ctx.cancelled()` returns a boolean cancellation flag.
- `ctx.throwIfCancelled()` throws `ContextCancelledError` if cancelled.
- `ctx.signal()` returns an `AbortSignal` for integrations.
- `ctx.value(key)` walks the parent chain to resolve a value.

## Go comparison

### Background
```go
ctx := context.Background()
```

```ts
const ctx = background();
```

### WithCancel
```go
ctx, cancel := context.WithCancel(parent)
defer cancel()
```

```ts
const ctx = parent.withCancel();
// call ctx.cancel() when you want to stop the tree
```

### WithTimeout
```go
ctx, cancel := context.WithTimeout(parent, 2*time.Second)
defer cancel()
```

```ts
const ctx = parent.withTimeout(2000);
```

### WithValue
```go
ctx := context.WithValue(parent, key, value)
val := ctx.Value(key)
```

```ts
const ctx = parent.withValue(key, value);
const val = ctx.value(key);
```

### Done
```go
<-ctx.Done()
```

```ts
await ctx.done();
```

### Cancelled / Err
```go
if ctx.Err() != nil {
  // context.Canceled or context.DeadlineExceeded
}
```

```ts
if (ctx.cancelled()) {
  // ContextCancelledError semantics
}
```

### ThrowIfCancelled / Err
```go
if err := ctx.Err(); err != nil {
  return err
}
```

```ts
ctx.throwIfCancelled();
```

### Signal (integration escape hatch)
```go
req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
```

```ts
await fetch(url, { signal: ctx.signal() });
```

Notes:
- Go uses `Done() <-chan struct{}` and `Err()`, Node uses `done(): Promise<void>` and `cancelled()/throwIfCancelled()`.
- Go exposes `context.Context` only; this library exposes `Context` with explicit `cancel()`.
- Cancellation is always parent -> child in both Go and this library.
