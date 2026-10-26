# TypeScript Best Practices

## Configuration
- Enable strict mode: `"strict": true` in tsconfig.json
- Enable `noUncheckedIndexedAccess` for safe object access
- Use `"moduleResolution": "bundler"` for modern projects
- Set `"target": "ES2022"` or later
- Use `"verbatimModuleSyntax": true` for explicit imports

## Types vs Interfaces
- Prefer `interface` for public API contracts (extends, implements)
- Prefer `type` for unions, intersections, mapped types, tuples
- Use `interface` when you want declaration merging
- Use `type` for everything else — be consistent within a project

## Strict Patterns
- Avoid `any` — use `unknown` and narrow with type guards
- Use `as const` for literal types and readonly arrays
- Function return types: always annotate for clarity
- Use discriminated unions for state machines
```ts
type Result<T> = { status: 'success'; data: T } | { status: 'error'; error: Error }
```

## Generics
- Name generic parameters descriptively: `TData`, `TResponse`, not just `T`
- Constrain generics: `<T extends HasId>` instead of `<T>`
- Use `infer` in conditional types for type extraction
- Prefer generic functions over `as` casts

## Utility Types
- `Partial<T>`, `Required<T>`, `Readonly<T>` — property modifiers
- `Pick<T, K>`, `Omit<T, K>` — property selection
- `Record<K, V>` — dictionary types
- `ReturnType<typeof fn>` — extract return type
- `Awaited<T>` — unwrap promises
- `NonNullable<T>` — remove null/undefined

## Error Handling
- Use typed errors: `class AppError extends Error { code: string }`
- Never catch `any` — use `catch (e: unknown)` then narrow
- Use `Result` type for expected failures instead of try/catch everywhere

## Project Structure
- `/types` for shared type definitions
- Co-locate types with their module, export from barrel files
- Avoid `index.ts` re-exports that create circular dependencies
- Use path aliases: `"@/components/*"` instead of relative imports

## Null Safety
- No unhandled `| undefined` or `| null` — handle all cases
- Use optional chaining: `user?.address?.street`
- Use nullish coalescing: `value ?? defaultValue` (not `||`)
- Use assertion functions for runtime validation
