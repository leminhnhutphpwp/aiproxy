# Swift & iOS Development

## Core Principles
- **Safety First**: Optionals, value types, and ARC prevent common memory bugs
- **Protocol-Oriented**: Protocols with protocol extensions enable polymorphism without inheritance
- **Value Semantics**: Structs and enums are preferred over classes for data
- **Immutability Favor**: `let` by default, `var` only when mutation is needed

## Key Patterns
- **MVVM (SwiftUI)**: View → ViewModel (ObservableObject) → Model — unidirectional data flow
- **Coordinator (UIKit)**: Navigation logic extracted from ViewControllers
- **Repository Pattern**: Abstract data sources behind protocol-based repositories
- **Combine Framework**: Reactive streams with Publishers, Subscribers, Operators
- **Swift Concurrency**: async/await, Task, AsyncSequence for structured concurrency
- **Dependency Injection**: Environment (SwiftUI) or manual DI via init injection

## Best Practices
- Use `Codable` for all JSON serialization/deserialization
- Prefer SwiftUI for new apps; UIKit for complex custom UI that SwiftUI can't handle
- Use `@Published` properties in ObservableObject for reactive UI updates
- Leverage `SwiftLint` for consistent code style
- Write unit tests with XCTest; UI tests with XCUITest
- Profile with Instruments (Time Profiler, Leaks, Core Animation)
- Use `async let` and `TaskGroup` for concurrent work with structured cancellation

## Common Pitfalls
- **Force unwrapping**: `!` crashes on nil — always use `guard let` or `if let`
- **Retain cycles**: Closures capturing `self` strongly — use `[weak self]` + `guard`
- **Main thread blocking**: Network/DB work on main thread freezes UI — use async/await
- **Massive View Controller (UIKit)**: Too much logic in viewDidLoad — extract to ViewModel
- **Missing error handling**: Try-catch ignored — every throwing call needs handling

## Tools & Ecosystem
- **Xcode + SwiftUI Previews**: Design-time previews for instant iteration
- **Alamofire**: HTTP networking (or URLSession with async/await)
- **CoreData / SwiftData**: Persistent local storage
- **Firebase / Supabase**: Backend services for iOS apps
- **Sourcery**: Code generation for protocols, mocks, Codable
- **Fastlane**: Automate build, test, and App Store deployment
