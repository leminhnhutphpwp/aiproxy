# Figma to Code Workflow

## Core Principles
- **Design Tokens as Contract**: Colors, spacing, and typography are defined in Figma first, exported as structured data, and consumed by code
- **Component Parity**: Every Figma component has a corresponding code component — no design-only states, no code-only features
- **Handoff Is a Handshake**: Designers and developers review the spec together before implementation begins — not a throw-over-the-wall PDF

## Key Patterns
- **Auto Layout for Spacing**: Designs use Figma Auto Layout with consistent gap values that map to token spacing scale
- **Component Naming Convention**: Match Figma frame names to code component names for traceability (e.g., `Button/Primary` → `Button.tsx`)
- **Dev Mode Annotations**: Use Figma Dev Mode to add code snippets, measurement notes, and edge case descriptions directly on designs
- **Token Export Pipeline**: Export tokens from Figma Tokens plugin → transform via Style Dictionary → commit generated CSS/JS
- **Version Control for Design**: Use Figma version history + branch-based design reviews for changes tied to specific features

## Best Practices
- Name layers semantically (e.g., `header-title`, not `Frame 3291`)
- Document responsive behavior: how does each component behave at mobile, tablet, desktop?
- Add redlines for margin, padding, border-radius, and font size in Dev Mode before handing off
- Use Figma's "Inspect" panel to verify exported CSS values match design tokens
- Create a "Spacing & Sizing" reference frame with all token values visualized
- Run a weekly design sync to review pending handoffs and answer developer questions
- Export assets at 1x, 2x, and 3x resolution for icons and images

## Common Pitfalls
- **Pixel measuring by hand**: Developers should never measure a pixel value from a PNG — use Dev Mode or token exports
- **Missing states**: Designs that show only the happy path — no loading, empty, error, or disabled states
- **Inconsistent naming**: Figma layer names that don't match component names — causes confusion and rework
- **No breakpoint guidance**: Designs at one screen size without indication of how they should adapt
- **Siloed tools**: Designers in Figma, developers in code, no shared spec — invest in a design token pipeline

## Tools & Ecosystem
- **Figma Dev Mode**: Built-in handoff interface with inspect, code snippets, and annotations
- **Tokens Studio (Figma Tokens)**: Design token plugin with multi-theme support and JSON export
- **Style Dictionary**: Transform Figma design tokens into platform-specific output files
- **Anima / Zeplin / Avocode**: Third-party handoff tools with code generation features
- **Figma REST API**: Automate token extraction, component export, and spec generation
