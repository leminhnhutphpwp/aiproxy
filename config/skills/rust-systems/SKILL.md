# Rust Systems Programming

## Core Principles
- **Ownership**: Each value has exactly one owner; move semantics by default
- **Borrowing**: References borrow without taking ownership; mutable XOR immutable
- **Lifetimes**: Compiler tracks how long references are valid — prevents dangling pointers
- **Zero-Cost Abstractions**: High-level ergonomics with no runtime overhead

## Key Patterns
- **Result<T, E>**: Return Result for fallible operations — never panic in library code
- **Builder Pattern**: Use struct builders for complex construction with validation
- **Newtype Pattern**: Wrap primitives in tuple structs for type safety (Email(String))
- **RAII**: Drop trait for deterministic cleanup — file handles, locks, connections
- **Channel-Based Concurrency**: `std::sync::mpsc` and `crossbeam` for message passing
- **Async/Await**: `tokio` or `async-std` for async I/O with work-stealing scheduler

## Best Practices
- Clippy warnings are errors — enforce with `#![deny(clippy::all)]`
- Use `cargo fmt` — there is exactly one correct formatting
- Prefer iterator adapters over explicit loops (`map`, `filter`, `fold`)
- Derive common traits: `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq`, `Hash`
- Use `thiserror` for library error types and `anyhow` for application errors
- Write doctests in /// comments — they compile and run as tests
- Benchmark with `criterion`; profile with `perf` / `flamegraph`

## Common Pitfalls
- **Lifetime over-annotation**: Let the compiler infer — only annotate when necessary
- **RefCell misuse**: Runtime borrow checking panics — prefer `Cell` for Copy types
- **Locking issues**: `Mutex` guards cause deadlocks — keep lock scopes minimal
- **Unsafe assumptions**: Unsafe must be contained and documented with SAFETY comments
- **Clone-heavy code**: Expensive clones destroy cache performance — pass references
- **Async trait limitations**: Traits with async methods need `async-trait` or AFIT (nightly)

## Tools & Ecosystem
- **Cargo**: Build, test, bench, doc, publish — single tool
- **Tokio**: Async runtime (async I/O, timers, networking)
- **Serde**: Serialization/deserialization framework (JSON, YAML, TOML, etc.)
- **Clap**: Command-line argument parsing with derive macro
- **Rocket / Actix-Web**: Web frameworks with compile-time validation
