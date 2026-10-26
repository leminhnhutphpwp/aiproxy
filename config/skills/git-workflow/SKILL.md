# Git Workflow Conventions

## Branching Strategy (Git Flow)
- `main` — production-ready code, protected
- `develop` — integration branch for features
- `feature/xxx` — branched from develop, merged back via PR
- `fix/xxx` — bug fixes
- `release/x.x.x` — release preparation
- `hotfix/xxx` — urgent production fix, branched from main

## Commit Messages (Conventional Commits)
```
type(scope): description

body (optional)

footer (optional)
```
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `perf`, `ci`
- Scope: the module or component (optional but helpful)
- Description: imperative, lowercase, no period at end
- Body: additional context, motivation, why this change
- Footer: breaking changes (`BREAKING CHANGE:`), issue references (`Closes #123`)
- Keep commits atomic: one logical change per commit

## Pull Request Workflow
- PR title same convention as commits: `feat(scope): description`
- Description: what, why, how, testing notes, screenshots (if UI)
- Keep PRs small (< 300 lines) — large PRs don't get thorough reviews
- Link to issue/ticket in PR description

## Code Review Guidelines
### Reviewer
- Focus on correctness, security, performance, readability
- Ask questions, don't demand changes without explanation
- Approve only when satisfied with the changes
- Use blocking vs non-blocking comments clearly

### Author
- Respond to all comments
- Make requested changes or explain why not
- Merge only after approval and CI passes

## Versioning (SemVer)
- `MAJOR.MINOR.PATCH` — `1.4.2`
- MAJOR: breaking changes
- MINOR: new features (backward compatible)
- PATCH: bug fixes (backward compatible)
- Pre-release: `1.0.0-alpha.1`, `1.0.0-beta.2`

## Best Practices
- Rebase before merge: `git rebase develop` to keep linear history
- Squash commits in feature branches before merging to main/develop
- Never force-push to shared branches (main, develop)
- Use `.gitignore` for generated files, dependencies, secrets
- Sign commits with GPG for verified identity
- Use `git stash` for temporary work-in-progress, not commits
