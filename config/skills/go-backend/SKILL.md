# Go Backend Patterns

## Core Principles
- **Simplicity**: Favor composition over inheritance; clear > clever
- **Explicit Error Handling**: Errors are values — check them, don't ignore or panic
- **Concurrency Is Built-In**: Goroutines and channels are language primitives
- **Zero-Values**: Use zero-value initialization (nil slices, 0 ints, empty strings) for safe defaults

## Key Patterns
- **Handler → Service → Repository**: Clean layered architecture with dependency injection
- **Middleware Chain**: HTTP middleware for logging, auth, rate limiting, recovery
- **Worker Pool**: Fixed number of goroutines processing jobs from a channel
- **Fan-Out / Fan-In**: Distribute work across goroutines, collect results
- **Context Propagation**: Pass context.Context for cancellation, deadlines, and tracing
- **Graceful Shutdown**: Listen for SIGTERM, drain connections, flush buffers

## Best Practices
- Use `go mod` for dependency management — vendor for production builds
- Define interfaces where they're used (consumer side), not where they're implemented
- Return concrete types, accept interfaces
- Always handle errors — use `fmt.Errorf("context: %w", err)` for wrapping
- Use `sync.Mutex` or `sync.RWMutex` for shared state; prefer channels for communication
- Write table-driven tests with `t.Run()` subtests
- Profile with `pprof` before optimizing — never guess performance bottlenecks
- Use `go vet` and `staticcheck` in CI

## Common Pitfalls
- **Panic in goroutines**: A single panic kills the entire process — use `recover()` in goroutines
- **Goroutine leaks**: Unblocked goroutines that never exit — use context cancellation
- **Shadowing err**: `if err := foo(); err != nil` shadows outer errors — use `=` not `:=`
- **Global state**: Package-level variables make testing impossible — inject dependencies
- **Ignoring `-race`**: Data races are undefined behavior — always test with `-race`

## Tools & Ecosystem
- **Chi / Gin / Echo**: HTTP routers with middleware support
- **sqlx / pgx**: Database drivers with ergonomic query APIs
- **Bubbletea**: Terminal UI framework
- **Cobra + Viper**: CLI apps with config management
- **Testify**: Assertion + mocking toolkit
- **Golangci-lint**: Linter aggregator for CI
