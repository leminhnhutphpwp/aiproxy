# Architecture Decision Records

## Core Principles
- **Document Why, Not What**: Code shows the implementation — ADRs capture the reasoning, alternatives, and trade-offs
- **Lightweight & Timely**: Write ADRs when the decision is made, not weeks later — a few paragraphs is enough
- **Acceptable to Be Wrong**: ADRs are snapshots of context at the time; superseding one is a sign of healthy evolution

## Key Patterns
- **Y-Statements**: Frame decisions as "In the context of [situation], facing [problem], we decided [option] to achieve [outcome], accepting [trade-off]"
- **Numbered Sequence**: `ADR-001`, `ADR-002` — never renumber; link by ID for history
- **RFC Process**: Use lightweight RFCs for decisions needing wider input before an ADR is finalized
- **Status Lifecycle**: Proposed → Accepted → Deprecated → Superseded by ADR-NNN
- **Template Consistency**: Every ADR has Status, Context, Decision, Consequences, and Options Considered

## Best Practices
- Keep ADRs in the source repo under `docs/adr/` — co-located with the code they affect
- Link decisions to each other: "Supersedes ADR-003" or "Refines ADR-012"
- Write for a future developer who has never seen the codebase before
- Include concrete alternatives with reasons for rejection (not just the chosen option)
- Review ADRs in PRs just like code — they evolve with the system
- Use diagrams (C4, Mermaid) to illustrate architecture context

## Common Pitfalls
- **Too long**: ADRs are not design specs — 200 words is often enough for a clear decision
- **No alternatives**: Listing only the chosen option leaves no trail for future re-evaluation
- **Implementation drift**: Update the ADR status when the code diverges from the original decision
- **Decision paralysis**: Not every choice needs an ADR — reserve them for significant, costly-to-reverse decisions

## Tools & Ecosystem
- **adr-tools**: CLI to create, list, and manage ADRs with templates
- **Log4brains**: ADR explorer with visual graph of decision lineage
- **Mermaid / PlantUML**: Embed architecture diagrams in ADR markdown
- **RFC Template**: Standard proposal template with sections for motivation, design, and alternatives
- **madr**: Maturity-based ADR format with structured front-matter
