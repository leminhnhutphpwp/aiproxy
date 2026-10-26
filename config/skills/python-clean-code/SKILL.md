# Python Clean Code

## Code Style (PEP 8)
- 4 spaces per indentation level, no tabs
- Max line length: 88 (Black default) or 79 (PEP 8)
- Use `ruff` for linting + `black` for formatting
- Imports: standard lib → third-party → local (one blank line between groups)
- Sort imports: `isort` or `ruff check --select I`

## Type Hints
- Always annotate function signatures (params + return type)
- Use `list[X]` over `List[X]`, `dict[K, V]` over `Dict[K, V]` (Python 3.9+)
- Use `Optional[X]` or `X | None` (Python 3.10+)
- Prefer `TypedDict` for structured dicts, `dataclass` for data containers
- Use `Protocol` for structural subtyping (duck typing with types)
- Avoid `Any` — use `object` + type narrowing

## Project Structure
```
project/
├── src/
│   └── project_name/
│       ├── __init__.py
│       ├── main.py
│       ├── models/
│       └── services/
├── tests/
│   ├── test_*.py
│   └── conftest.py
├── pyproject.toml
├── README.md
└── .gitignore
```
- Use `src/` layout to prevent import confusion
- One class per file (or closely related classes)
- Keep functions small (< 20 lines), single responsibility

## Error Handling
- Use specific exception types, never bare `except:`
- Create custom exceptions: `class NotFoundError(Exception): pass`
- Use `try/except/else/finally` correctly:
  - `else` — runs if no exception (not in `try` block)
  - `finally` — always runs (cleanup)
- Context managers for resources: `with open(...) as f:`

## Testing (pytest)
- Test files: `test_*.py` or `*_test.py`
- Use `pytest` with simple assert (not unittest.TestCase)
- Parametrize: `@pytest.mark.parametrize('input,expected', [...])`
- Fixtures for shared setup: `@pytest.fixture`
- Mock external services: `pytest-mock` or `unittest.mock`
- Target 80%+ coverage on business logic

## Package Management
- Use `pyproject.toml` (not setup.py or requirements.txt)
- Virtual environments: `uv venv` or `python -m venv .venv`
- Lock dependencies: `uv lock` or `pip freeze > requirements.txt`
- Never commit `.venv/` or `__pycache__/`
