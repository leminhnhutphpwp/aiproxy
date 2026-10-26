# Systematic Debugging & Root Cause Analysis

## Debugging Workflow
1. **Reproduce** — Get a reliable, minimal reproduction of the bug
2. **Isolate** — Narrow down to the specific module, function, or line
3. **Understand** — Trace the code path and data flow to understand what should happen
4. **Hypothesize** — Form a specific, testable theory about the root cause
5. **Verify** — Prove or disprove your hypothesis with evidence
6. **Fix** — Apply the minimal change that addresses the root cause (not symptoms)
7. **Verify the fix** — Confirm the fix works and doesn't break existing tests

## Reproduction
- If the bug is random/flaky, the reproduction is your first priority
- Capture exact inputs, state, environment, and timing
- Write a failing test that reproduces the bug — this is your specification
- Simplify the reproduction: remove unrelated code until only the essential path remains
- In production, add logging around the suspect area to capture state

## Isolation Techniques
- **Binary search**: Comment out half the code, test, narrow down
- **Delta debugging**: Systematically remove/simplify parts until the bug disappears
- **Process of elimination**: Test each component in isolation
- **Rubber duck**: Explain the problem out loud to someone (or something)
- **Blame git**: `git bisect` to find which commit introduced the bug

## Reading Stack Traces
- Start at the top: the immediate failure location
- Trace downward to find where the error was thrown, not caught
- Look at YOUR code, not library/framework internals
- Pay attention to line numbers, column numbers, and error codes
- Check the full trace, not just the first line

## Common Root Causes
| Symptom | Likely Root Cause |
|---------|------------------|
| Null/undefined error | Missing null check, uninitialized variable |
| Wrong data displayed | Stale cache, wrong state update, race condition |
| Slow page load | N+1 query, missing index, large bundle |
| Random failure | Race condition, unhandled async, timing dependency |
| Works in dev, fails in prod | Environment difference, missing env var, minification issue |

## Tools & Techniques
- Logging: structured logs with requestId for correlation
- Debugger: step through, inspect variables, set conditional breakpoints
- Network tab: inspect request/response payloads, headers, timing
- Database: enable query logging, use EXPLAIN ANALYZE
- Memory: heap snapshots for leaks, GC logs
- Performance: profiler for CPU, flame graphs for call stacks

## Fixing Without Breaking
- Fix the root cause, not the symptom
- One fix at a time — verify each change before making the next
- Write a regression test that would catch this bug if reintroduced
- Run the full test suite before pushing the fix
- Consider: could this fix introduce a different bug?

## When You're Stuck
- Walk away for 15 minutes — fresh perspective often solves it
- Write down everything you know: inputs, expected, actual, code path
- Pair with someone — they'll ask questions you haven't thought of
- Check recent changes: maybe the bug is in a different layer entirely
- Check issue trackers: someone may have already fixed this

## Debugging Anti-Patterns
- ❌ Randomly changing code hoping it fixes something
- ❌ Adding console.log everywhere instead of using breakpoints
- ❌ Fixing the symptom but not the root cause (bug will reappear)
- ❌ Not writing a regression test after the fix
- ❌ Assuming the bug is in the wrong layer (e.g., blaming the database when it's the query)
