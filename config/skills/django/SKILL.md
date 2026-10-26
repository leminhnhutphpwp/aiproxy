# Django Web Framework

## Core Principles
- **Batteries Included**: Admin, ORM, auth, migrations, forms, sessions — all built-in
- **DRY (Don't Repeat Yourself)**: Single source of truth for models, forms, URLs, and templates
- **Reusable Apps**: Django projects are composed of pluggable apps
- **Security by Default**: CSRF, XSS, SQL injection, clickjacking protection built-in

## Key Patterns
- **Fat Models, Thin Views**: Business logic in model methods, views are thin coordinators
- **Form + ModelForm**: Server-side validation with built-in rendering
- **Class-Based Views (CBVs)**: Reusable view hierarchies (ListView, DetailView, FormView)
- **Signals**: Decoupled communication between apps (post_save, pre_delete)
- **DRF ViewSets**: ModelViewSet + Serializer for consistent CRUD API
- **Middleware Pipeline**: Request/response processing for auth, logging, rate limiting

## Best Practices
- Use `select_related` / `prefetch_related` to avoid N+1 queries
- Always use `@transaction.atomic` for multi-step database operations
- Use `F()` expressions for atomic field updates (avoid race conditions)
- Keep settings in a package (settings/base.py, local.py, production.py)
- Write model tests with factory_boy + pytest — test queries, not just responses
- Use `django-debug-toolbar` in development for query profiling
- Use `django-storages` for S3/GCS file storage in production

## Common Pitfalls
- **N+1 queries**: Related fields fetched lazily — always prefetch in querysets
- **Fat views**: Too much logic in views makes testing impossible — extract to services
- **Over-using signals**: Debugging signal chains is painful — prefer explicit method calls
- **Helpless migrations**: Large tables need careful migration planning (--elide, --squash)
- **Ignoring security**: Never trust user input — strip HTML, validate, use Django forms

## Tools & Ecosystem
- **Django REST Framework (DRF)**: Browsable API, serializers, ViewSets
- **Django Ninja**: Alternative Pydantic-based API framework (faster, modern)
- **Celery + Redis**: Async task queue for background processing
- **Django Channels**: WebSocket support for real-time features
- **Wagtail**: CMS built on Django for content management
- **django-allauth**: Social auth, email verification, account management
