# Flutter & Dart Development

## Core Principles
- **Widget Everything**: UI = widgets — everything from layout to gestures is a widget
- **Declarative UI**: Build UI from composition, not inheritance — `build()` returns widget tree
- **Hot Reload**: Millisecond iteration cycle — edit, save, see instantly
- **Single Codebase**: Same Dart code targets iOS, Android, Web, and Desktop

## Key Patterns
- **StatefulWidget + State**: Local mutable state managed by State object
- **BLoC / Riverpod**: Stream-based state management — logic separated from UI
- **Repository Pattern**: Abstract data sources (REST, local DB, cache) behind repository
- **GoRouter**: Declarative routing with nested navigation, guards, and deep links
- **Provider / InheritedWidget**: Dependency injection and scoped state down the widget tree
- **Freezed**: Immutable data classes with union types and pattern matching

## Best Practices
- Use `const` constructors everywhere — Flutter rebuilds only dirty widgets
- Avoid `BuildContext.use` past async gaps — capture before await
- Use `MediaQuery` and `LayoutBuilder` for responsive layouts
- Keep build methods pure — no side effects, no async calls inside `build()`
- Use `Theme` for consistent styling — never hardcode colors or sizes
- Leverage `Flutter DevTools` for performance profiling (widget rebuilds, memory, network)
- Write widget tests for UI and unit tests for business logic

## Common Pitfalls
- **Rebuild bombs**: Creating widgets inside build without `const` causes unnecessary rebuilds
- **State disposal**: Resources (streams, controllers) must be disposed in `dispose()`
- **Platform differences**: iOS vs Android keyboard handling, navigation, safe areas
- **Hot reload confusion**: Hot reload doesn't run `main()` — only hot restart does
- **Large build methods**: Break widget trees into separate extracted widgets

## Tools & Ecosystem
- **Riverpod / BLoC**: State management (use with freezed + dartz)
- **Dio**: HTTP client with interceptors, retry, and caching
- **Hive / Isar / Drift**: Local storage (SQLite / NoSQL)
- **Firebase**: Auth, Firestore, Cloud Messaging, Analytics
- **FlutterFire**: Official Firebase Flutter plugins
- **CodeMagic / Codemagic**: CI/CD for Flutter apps
