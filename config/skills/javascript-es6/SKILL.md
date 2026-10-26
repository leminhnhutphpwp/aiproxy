# Modern JavaScript ES6+

## Variables & Scoping
- `const` by default, `let` only when reassignment needed — never `var`
- Block scoping with `{ }` for temporary variables
- Destructuring: `const { name, email } = user` and `const [first, ...rest] = items`
- Optional chaining: `user?.address?.street ?? 'N/A'`
- Nullish coalescing: `value ?? defaultValue` (not `||` which catches falsy)

## Functions & Arrow Functions
```js
// Arrow — no `this` binding, no `arguments`
const multiply = (a, b) => a * b;
// Default parameters
function createUser(name = 'Anonymous', role = 'user') { ... }
// Rest parameters
function logAll(...args) { args.forEach(console.log); }
```
- Arrow functions for callbacks and array methods
- Regular functions when you need `this` context or `arguments`
- Default parameters over manual `||` checks
- Use `rest` + `spread` operators over `arguments` object

## Async Patterns
```js
// Async/await — prefer over raw promises
async function fetchUser(id) {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw error;
  }
}
// Parallel execution
const [user, posts] = await Promise.all([fetchUser(id), fetchPosts(id)]);
```
- Always handle errors with try/catch in async functions
- Use `Promise.allSettled` when you need all results even if some fail
- Use `AbortController` for cancellable fetch requests
- Avoid `await` in loops — use `Promise.all` for independent promises

## Modules
```js
// Named exports
export const API_URL = 'https://api.example.com';
export function formatDate(date) { ... }
// Default export (one per module)
export default class UserService { ... }
// Import
import { API_URL, formatDate } from './utils.js';
import UserService from './services/user.js';
```
- Named exports over default exports (better refactoring, explicit dependencies)
- Import only what you need — tree-shaking removes unused exports
- Use `import()` for dynamic/lazy loading: `const module = await import('./heavy.js')`

## Modern Data Structures
- `Map`: key-value with any type as key (not just strings)
- `Set`: unique values — `new Set(array)` for dedup
- `WeakMap`/`WeakSet`: garbage-collectable keys — use for private data
- `TypedArray`: binary data — `Uint8Array`, `Float64Array`, etc.
- StructuredClone: `structuredClone(deepObject)` for safe deep cloning

## Symbols & Iterators
```js
const ID = Symbol('id');  // Unique, never collides
const iterable = { *[Symbol.iterator]() { yield 1; yield 2; } };
```

## Temporal API (ES2024+)
```js
// Modern date/time handling (replaces Date)
const now = Temporal.Now.plainDateTimeISO();
const due = Temporal.PlainDate.from('2026-07-15');
const diff = due.since(Temporal.Now.plainDateISO());
console.log(diff.days);  // 14
```

## Common Mistakes
- ❌ `==` instead of `===` (type coercion causes bugs)
- ❌ Mutating state directly instead of using spread/immutable patterns
- ❌ Forgetting `await` in async functions (returns Promise, not value)
- ❌ Blocking the main thread with synchronous loops (use Web Workers)
- ❌ Not handling promise rejections (unhandled rejection crashes Node)
