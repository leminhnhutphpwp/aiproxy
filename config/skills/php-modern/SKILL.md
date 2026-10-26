# Modern PHP 8.x Patterns

## PHP 8.3+ Features
- **Enums**: typed, backed, with methods. Prefer enums over class constants for fixed sets
- **Readonly classes**: `readonly class Config { ... }` — all properties are readonly implicitly
- **Fibers**: for cooperative multitasking. Use sparingly — prefer async/await patterns
- **Named arguments**: `new User(name: 'John', email: 'john@x.com')` — skip optional params
- **Match expression**: `match($status) { 'active' => ..., default => ... }` — no break, strict comparison
- **Constructor promotion**: `class User { public function __construct(public string $name) {} }`
- **Property hooks (PHP 8.4+)**: `public string $name { set => strtolower($value); get => ucfirst($this->name); }`

## Types & Strictness
```php
declare(strict_types=1);
function findUser(int $id): ?User { ... }
```
- Always use `declare(strict_types=1)` at the top of every file
- Use union types: `string|int`, `?Type` = `Type|null`
- Use intersection types: `TypeA&TypeB` for mixin-like patterns
- Use `mixed` only when truly anything is possible
- Never use `array` without element type: `array<int, User>`

## Composer & Autoloading
- PSR-4 autoloading is mandatory: `"autoload": { "psr-4": { "App\\": "src/" } }`
- Split dev dependencies: `"require-dev"` for PHPUnit, PHPStan, Rector
- Use `composer.lock` in version control for applications (not libraries)
- Run `composer audit` regularly for security vulnerabilities
- Never commit the `vendor/` directory

## PSR Standards
- **PSR-1**: Basic coding standard (PHP tags, side effects, encoding)
- **PSR-4**: Autoloading (namespace → directory mapping)
- **PSR-7**: HTTP message interfaces (Request, Response)
- **PSR-12**: Extended coding style guide (braces, spacing, imports)
- **PSR-14**: Event dispatcher interface

## Error Handling
- Throw typed exceptions: `class ValidationException extends \RuntimeException`
- Use `try/finally` for cleanup (not `catch` unless you handle it)
- Set error handler for uncaught exceptions in production: `set_exception_handler()`
- Never suppress errors with `@` operator
- Use `throw` expressions inside match/lambda: `$value ?? throw new \InvalidArgumentException()`

## OOP Best Practices
- Favor composition over inheritance
- Use readonly properties for value objects and DTOs
- Declare return types on every method
- Use `final` keyword for classes not designed for inheritance
- Prefer `self` for same-class references, `static` for late static binding

## Common Mistakes
- ❌ Loose comparison `==` instead of strict `===`
- ❌ `var_dump`/`echo` for debugging (use `error_log` or a logger)
- ❌ No type hints on function parameters and return values
- ❌ Using `array_push` instead of `$array[] =`
- ❌ Not validating config/env values before use
