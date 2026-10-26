# Project Documentation

## Core Principles
- **README as Front Door**: Every project needs a README that answers "what is this, do I need it, how do I start"
- **Co-Located with Code**: Documentation lives in the same repo, reviewed in the same PRs as code changes
- **Living Documents**: Docs are never "done" — update them whenever the code changes or a question goes unanswered

## Key Patterns
- **README Structure**: Badges → Description → Quick Start → API → Scripts → Deployment → Contributing → License
- **CONTRIBUTING.md**: Setup instructions, branch strategy, PR workflow, coding standards, and review checklist
- **Onboarding Guide**: Step-by-step from git clone to first successful feature — include environment setup and common gotchas
- **Code of Conduct**: Adopt Contributor Covenant as baseline — link from README and CONTRIBUTING
- **Wiki vs Repo Docs**: Use in-repo markdown for code-coupled docs, wiki for process and team knowledge

## Best Practices
- Start every README with a one-line description and a screenshot or diagram
- Use `make help` or `npm run` to expose common commands — document them in a scripts table
- Keep a `docs/` directory with ARCHITECTURE.md, DEPLOYMENT.md, and SECURITY.md for deeper topics
- Add a "Prerequisites" section listing exact versions of required tools
- Include a "Project Status" badge (active, maintenance, archived) in the README
- Run docs link checker in CI to prevent dead links
- Add a FAQ section based on real questions from new contributors

## Common Pitfalls
- **README as novel**: Too long — users scan. Keep quick start under 5 steps, move details to sub-docs
- **Missing setup details**: "Just run it" never works — document exact env vars, services, and dependencies
- **No contributing guide**: Without CONTRIBUTING.md, external contributors don't know where to start
- **Stale screenshots**: Version-lock screenshots or use ASCII diagrams that diff well
- **Scattered docs**: Multiple disconnected pages with no navigation — use a single `docs/README.md` index

## Tools & Ecosystem
- **MkDocs / Docusaurus**: Static site generators for project documentation
- **Vale**: Proselint for documentation — enforce style guide in CI
- **markdownlint**: Lint markdown formatting and structure
- **action-yaspeller**: Spell-check docs in CI
- **lychee / broken-link-checker**: Automated link rot detection
