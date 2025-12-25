package ctx_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestContext(t *testing.T) {
	t.Run("cancels children when parent cancels", func(t *testing.T) {
		parent, cancel := context.WithCancel(context.Background())
		child, _ := context.WithCancel(parent)

		cancel()

		select {
		case <-child.Done():
		case <-time.After(100 * time.Millisecond):
			t.Fatal("child did not cancel after parent")
		}
	})

	t.Run("does not cancel parent when child cancels", func(t *testing.T) {
		parent, _ := context.WithCancel(context.Background())
		child, cancelChild := context.WithCancel(parent)

		cancelChild()

		select {
		case <-child.Done():
		case <-time.After(100 * time.Millisecond):
			t.Fatal("child did not cancel")
		}

		if parent.Err() != nil {
			t.Fatal("parent should not be cancelled by child")
		}
	})

	t.Run("cascades cancellation across nested services", func(t *testing.T) {
		root, cancel := context.WithCancel(context.Background())
		serviceA, _ := context.WithCancel(root)
		serviceB, _ := context.WithTimeout(serviceA, 100*time.Millisecond)
		serviceC := context.WithValue(serviceB, "key", "value")

		cancel()

		select {
		case <-serviceA.Done():
		case <-time.After(100 * time.Millisecond):
			t.Fatal("serviceA did not cancel")
		}
		select {
		case <-serviceB.Done():
		case <-time.After(100 * time.Millisecond):
			t.Fatal("serviceB did not cancel")
		}
		select {
		case <-serviceC.Done():
		case <-time.After(100 * time.Millisecond):
			t.Fatal("serviceC did not cancel")
		}

		if v := serviceC.Value("key"); v != "value" {
			t.Fatalf("expected value to be propagated, got %v", v)
		}
	})

	t.Run("propagates values through parent chain", func(t *testing.T) {
		parent := context.WithValue(context.Background(), "key", "value")
		child, _ := context.WithCancel(parent)

		if v := child.Value("key"); v != "value" {
			t.Fatalf("expected value to be propagated, got %v", v)
		}
	})

	t.Run("times out and sets deadline exceeded", func(t *testing.T) {
		ctx, _ := context.WithTimeout(context.Background(), 50*time.Millisecond)

		select {
		case <-ctx.Done():
		case <-time.After(200 * time.Millisecond):
			t.Fatal("context did not timeout")
		}

		if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
			t.Fatalf("expected deadline exceeded, got %v", ctx.Err())
		}
	})

	t.Run("err is context.Canceled after cancel", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		if !errors.Is(ctx.Err(), context.Canceled) {
			t.Fatalf("expected context canceled, got %v", ctx.Err())
		}
	})

	t.Run("http request fails when context is cancelled", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			time.Sleep(50 * time.Millisecond)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
		}))
		defer server.Close()

		ctx, cancel := context.WithCancel(context.Background())
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
		if err != nil {
			t.Fatalf("failed to create request: %v", err)
		}

		cancel()

		_, err = http.DefaultClient.Do(req)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context canceled, got %v", err)
		}
	})
}
