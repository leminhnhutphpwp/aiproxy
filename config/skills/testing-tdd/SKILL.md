# Testing & TDD Best Practices

## Test-Driven Development (TDD)
- Follow Red-Green-Refactor cycle: write failing test, make it pass, then refactor
- Write test for ONE behavior at a time — don't test multiple things in one test
- Tests are the specification: name them as statements (`returns 404 when user not found`)
- Never write production code without a failing test first

## Test Structure (AAA)
- **Arrange**: Set up test data and conditions
- **Act**: Perform the action being tested
- **Assert**: Verify the result
- Keep Arrange section minimal — extract shared setup into factories or fixtures

## What to Test
- Public API/interface, not implementation details
- Boundary conditions: empty, null, max values, edge cases
- Error paths: what happens when a dependency fails
- State transitions: loading, empty, error, success for every component
- DO NOT test: internal methods, private functions, framework behavior

## Testing Frameworks

### Jest / Vitest
```ts
describe('UserService', () => {
  it('returns 404 when user is not found', async () => {
    const result = await userService.findById('nonexistent');
    expect(result).toEqual({ error: 'NOT_FOUND', status: 404 });
  });
});
```
- Use `describe` blocks to group related tests
- Use `beforeEach` for fresh state, never share mutable state between tests
- Use `vi.mock()` at the top level, not inside test blocks
- Prefer `toEqual` over `toBe` for objects

### React Testing Library
- Query elements by role, label, or text — never by test ID unless unavoidable
- Use `screen.getByRole('button', { name: /submit/i })` over `screen.getByText('Submit')`
- Test user interactions, not component internals
- `userEvent.click()` over `fireEvent.click()` (simulates real browser events)
- `waitFor` for async assertions, not arbitrary timeouts

### Playwright / Cypress (E2E)
- Test critical user flows, not every UI permutation
- Use `data-testid` attributes only for E2E selectors
- Avoid `page.waitFor(timeout)` — use `waitForSelector` or locator assertions
- Run tests in CI against production-like environment
- Keep tests independent — no shared state between tests

## Mocking
- Mock at the boundary of your system (HTTP, database, filesystem)
- Never mock objects you don't own (third-party libs — wrap them)
- Use dependency injection over mocking global modules
- Assert on calls made to mocks, not on return values of mocks

## Test Code Quality
- Tests are code too: DRY, readable, maintainable
- One assertion per test is ideal; max 3-5 related assertions
- Avoid conditional logic in tests: no if/else, no loops
- Use descriptive variable names, never `data1`, `result2`
