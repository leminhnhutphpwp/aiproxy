# React Coding Conventions

## Component Design
- One component per file (named export, not default)
- Use functional components with hooks — no class components
- Keep components small and focused on a single responsibility
- Extract reusable logic into custom hooks
- Use composition over inheritance: `{children}`, slots pattern
- Name components: PascalCase, descriptive (`UserProfile`, not `ProfileCardWrapper`)

## Hooks Rules
- Only call hooks at the top level — never inside loops, conditions, or callbacks
- Only call hooks from React functions or custom hooks
- Dependencies array must list ALL variables used inside useEffect/useMemo/useCallback
- Prefix custom hooks with `use` (`useAuth`, `usePagination`)
- Every useEffect should handle cleanup in the return

## State Management
- Local state: useState for simple, useReducer for complex state logic
- Lifting state up only when multiple children need shared state
- Avoid prop drilling — use context judiciously
- Server state: use a library (TanStack Query, SWR) instead of manual fetch+useState
- Derived values: use useMemo, don't store computed state

## Performance
- React.memo for pure components that re-render often with same props
- useMemo for expensive computations, useCallback for stable function references
- Virtualize long lists (react-window, react-virtuoso)
- Code-split lazy-loaded routes: React.lazy + Suspense
- Avoid inline object/function definitions in JSX props (causes re-renders)

## JSX Style
- Self-close tags when no children: `<Component />`
- Multi-line props: one prop per line, closing bracket on its own line
- Conditional rendering: `{condition && <Component />}` or ternary, never && with numbers
- Use Fragment `<> </>` instead of div wrappers
- Spread props: `<Component {...props} />` but be explicit when possible

## Error Handling
- Use Error Boundaries for catching rendering errors
- Implement proper loading and error states for async operations
- Use try/catch in async handlers, update state accordingly
- Always set loading=false in finally block

## Testing
- Test behavior, not implementation
- Use React Testing Library for component tests
- Use `screen.getByRole`, `findByText` over test IDs
- Mock external dependencies, not internal logic
