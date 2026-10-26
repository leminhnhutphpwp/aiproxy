# .NET & C# Development

## Core Principles
- **Type Safety**: Strong typing catches bugs at compile time — nullable reference types enabled
- **Async Everywhere**: I/O-bound work uses async/await to free threads
- **Dependency Injection**: Built-in DI container — constructor injection as the default pattern
- **LINQ Everywhere**: Query collections, databases, XML, and JSON with unified syntax

## Key Patterns
- **Controller → Service → Repository**: Clean layered architecture with DI registration
- **Mediator Pattern**: MediatR for request/response pipeline with behavior chains
- **CQRS**: Separate read and write models using MediatR + Dapper for reads
- **Entity Framework Core**: Code-first migrations, Fluent API configuration, navigation properties
- **Minimal APIs**: Lightweight REST endpoints for microservices and small APIs
- **Options Pattern**: Strongly-typed configuration via `IOptions<T>`, `IOptionsSnapshot<T>`

## Best Practices
- Use `record` types for DTOs — immutable, value-based equality, concise syntax
- Enable nullable reference types (`<Nullable>enable</Nullable>`) project-wide
- Use `Primary Constructors` (C# 12) for concise DI in minimal APIs
- Write integration tests with `WebApplicationFactory<T>` — test the full pipeline
- Use `Serilog` for structured logging with destructuring and enrichers
- Leverage `Polly` for resilience (retry, circuit breaker, timeout)
- Prefer `IAsyncEnumerable<T>` for streaming large result sets

## Common Pitfalls
- **Sync-over-async**: `.Result` or `.Wait()` blocks threads and causes deadlocks — await all the way
- **N+1 with EF Core**: Navigation properties loaded lazily — use `.Include()` and `.ThenInclude()`
- **Over-use of AutoMapper**: Explicit mapping is more maintainable for complex transformations
- **Giant DbContext**: Too many entities in one DbContext — split bounded contexts
- **Missing cancellation tokens**: Every async method should accept CancellationToken

## Tools & Ecosystem
- **Visual Studio / Rider**: IDEs with integrated debugging, profiling, and DI tracing
- **EF Core + SQL Server / PostgreSQL**: ORM with migrations and query compilation
- **FluentValidation**: Declarative validation rules with middleware integration
- **BenchmarkDotNet**: Performance benchmarking framework
- **NSwag / Swashbuckle**: OpenAPI generation from controllers/minimal APIs
- **Azure SDK**: First-class Azure service integration
