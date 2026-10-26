# Laravel Best Practices

## Project Structure
- Feature-based organization: group by domain, not by type
- Keep controllers thin — business logic belongs in services/actions
- Models: use `Model::query()` scopes, avoid global scopes unless necessary
- Repository pattern is over-engineering for most apps — use Eloquent directly

## Eloquent ORM
```php
// Scopes for reusable constraints
public function scopeActive(Builder $query): Builder { return $query->where('active', true); }
User::active()->get();

// Eager load to prevent N+1
$posts = Post::with(['author', 'comments.user'])->get();

// Use cursor() or chunk() for large datasets
User::cursor()->each(fn($user) => ...);
```
- Always eager-load relationships to prevent N+1
- Use `{{}}` in Blade, `?` for raw DB queries — never string interpolation
- Use `CursorPaginator` for large datasets over `LengthAwarePaginator`
- Avoid lazy loading in production (detect with strict mode)

## Validation
- Use Form Requests for complex validation: `php artisan make:request StoreUserRequest`
- Rule objects for reusable validation: `new UniqueEmailRule($ignoreId)`
- Always validate on the server — never trust client-side only
- Use `Validator::sometimes()` for conditional rules

## Queues & Jobs
- Use queues for: email sending, notifications, report generation, API calls
- Jobs should be small and focused — one responsibility per job
- Chain jobs: `Bus::chain([new ProcessOrder($order), new SendReceipt($order)])->dispatch()`
- Always handle failures: `$job->fail($e)` for manual failures, retry with backoff
- Use `ShouldBeUnique` for duplicate prevention

## Service Providers
- Register bindings and singletons in `register()`, boot dependencies in `boot()`
- Keep providers focused — one concern per provider
- Use deferrable providers for performance when possible

## Artisan Commands
- Use `make:command` for all CLI commands
- Always specify `$signature` with arguments and options
- Use `$this->ask()`, `$this->confirm()`, `$this->choice()` for interactive input
- Return exit codes: `return Command::SUCCESS` or `Command::FAILURE`

## Error Handling
```php
// Exception handler report() method logs the exception
// render() method returns a custom response
class Handler extends ExceptionHandler {
  public function register(): void {
    $this->reportable(fn(\App\Exceptions\PaymentFailed $e) => ...);
    $this->renderable(fn(\App\Exceptions\PaymentFailed $e, $request) => response(...));
  }
}
```

## Testing
- Use Pest or PHPUnit — Pest is preferred for Laravel
- `DatabaseMigrations` for fresh DB per test (or `RefreshDatabase` for speed)
- Factory states for test variants: `User::factory()->unverified()->create()`
- HTTP tests: `$this->get('/api/users')` then `->assertStatus(200)->assertJson(...)`

## Common Mistakes
- ❌ Putting business logic in controllers or Blade templates
- ❌ Not using `env()` outside of config files
- ❌ Making too many DB queries in Blade loops
- ❌ Over-using Observers when model events suffice
- ❌ Not caching config in production: `php artisan config:cache`
