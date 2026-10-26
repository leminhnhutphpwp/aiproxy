# FastAPI Patterns

## Core Principles
- **Type-Driven**: Request/response models define the API contract — validation and docs auto-generated
- **Async by Design**: Endpoints can be sync or async — FastAPI handles thread pool or event loop
- **OpenAPI First**: Every endpoint automatically produces OpenAPI 3.1 spec + Swagger UI
- **Dependency Injection**: Clean separation of concerns with `Depends()`

## Key Patterns
- **Pydantic Models**: Define request/response schemas with validation (Field, validator, ConfigDict)
- **Router Modules**: Group endpoints by domain (users, items, auth) with APIRouter
- **Dependency Providers**: Extract common logic (DB session, auth user, pagination) into dependencies
- **Repository Pattern**: Abstract database access behind repository classes injected via Depends
- **Background Tasks**: Use BackgroundTasks for non-blocking post-response work (email, logging)
- **Lifespan Handlers**: Startup/shutdown events via async context manager pattern

## Best Practices
- Use `response_model=` on routes for response filtering and documentation
- Raise HTTPException with consistent error detail format
- Keep path operation functions thin — logic lives in services layer
- Use `Annotated` type alias for reusable dependencies (e.g., `DbSession = Annotated[Session, Depends(get_db)]`)
- Configure CORS, middleware, and exception handlers at app creation
- Use `httpx.AsyncClient` for outgoing HTTP calls in async endpoints
- Enable `uvicorn --reload` in dev; use `gunicorn + uvicorn.workers` in prod

## Common Pitfalls
- **Blocking sync calls in async endpoints**: Blocks the entire event loop — use `run_in_executor` or `httpx`
- **Over-fetching**: Returning full ORM objects instead of Pydantic responses — use `response_model`
- **Missing validation on path/query params**: Every parameter should have a type annotation
- **Circular imports**: Models depending on routers depending on models — use separate modules
- **Forgetting Pydantic v2 changes**: v2 uses model_validator, not @validator; ConfigDict not Config

## Tools & Ecosystem
- **SQLModel / SQLAlchemy**: ORM with Pydantic integration
- **Alembic**: Database migrations
- **Pytest + httpx**: Async testing with TestClient
- **Celery / Arq**: Background task queues for CPU-bound or scheduled work
- **Logfire / Sentry**: Observability and error tracking
