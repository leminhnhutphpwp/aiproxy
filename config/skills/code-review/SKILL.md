# Code Review Best Practices

## Review Mindset
- Review for correctness, security, and maintainability — not style (let linters handle that)
- Assume good intent: the author made the best decision with the information they had
- Distinguish between blockers (must fix) and suggestions (nice to have)
- Review at most 400 lines per session — quality drops sharply beyond that
- Review the diff, not just the final files

## What to Check (Priority Order)
1. **Security**: SQL injection, XSS, auth bypass, exposed secrets, mass assignment
2. **Correctness**: Does it handle edge cases? Nulls, empties, duplicates, concurrent access?
3. **Logic errors**: Off-by-one, wrong comparison, missing conditions, incorrect state transitions
4. **Error handling**: Every catch block handled? Error responses consistent? No swallowed errors?
5. **Data integrity**: Transactions where needed? Foreign key constraints? Race condition guards?
6. **Performance**: N+1 queries? Missing indexes? Loading too much data? No caching?
7. **Test coverage**: Tests for the change? Edge case tests? Negative path coverage?

## How to Give Feedback
- Be specific: "This endpoint lacks authentication" not "This needs auth"
- Explain why: "If we don't validate user_id, user A can access user B's data (IDOR)"
- Ask questions: "What happens if the database call fails here?"
- Offer concrete suggestions with code examples
- Use "we" language: "We should handle this case" not "You should..."

## Code Review Response
- Accept each piece of feedback with a clear action: "Fixed", "Good catch", "Let me think about this"
- Push fixes as separate commits, then squash before merge
- Respond within 24 hours to keep PRs moving
- If a change is too large, ask to split it up

## What NOT to Do
- ❌ Nitpick on formatting, variable naming, or style (let autoformatters handle this)
- ❌ Approve without understanding the change
- ❌ Leave vague feedback: "This doesn't look right" without explanation
- ❌ Review while tired, rushed, or distracted
- ❌ Block on personal preferences that aren't project standards

## Automation
- Enforce with CI: linting, type checking, test coverage, security scanning
- Automated checks run first — human review is for what automation can't catch
- Use commitlint or similar to enforce commit message format
- Require linear history (no merge commits) for cleaner rollbacks

## PR Size Guidelines
- Keep PRs under 400 lines changed
- One PR = one logical change (bug fix, feature, refactor)
- Split large changes into stacked PRs: refactor first, then feature
- No PR should touch more than 15 files
- Review your own PR before asking others — catch 50% of issues yourself
