# Design Systems & Tokens

## Core Principles
- **Single Source of Truth**: Design tokens are the bridge between design (Figma) and code (CSS/JS) — never hardcode values
- **Composability Over Monoliths**: Build small, focused components that compose into patterns, then pages
- **Accessibility Built-In**: Every component must meet WCAG 2.2 AA — never ship a component that fails contrast or keyboard nav

## Key Patterns
- **Design Tokens as JSON**: Define colors, spacing, typography, shadows as structured JSON — transform to CSS vars, SCSS, JS
- **CSS Custom Properties**: Expose tokens as `--color-primary` for runtime theming without rebuilds
- **Component API Consistency**: Every component accepts `className`, `style`, `as` (polymorphic), and `data-*` attributes
- **Storybook First**: Develop components in isolation via Storybook stories before integrating into pages
- **Theming via Token Swapping**: Light/dark/high-contrast themes are just different token maps

## Best Practices
- Name tokens semantically (`--color-text-primary`) not literally (`--color-blue-500`)
- Use `style-dictionary` or `token-transformer` to convert Figma tokens to platform-specific formats
- Keep component API surface minimal — props are debt, default behavior is free
- Write stories that cover all states: loading, empty, error, edge cases, and accessibility variants
- Add `data-testid` attributes for testing — never couple tests to CSS class names
- Version components with semantic versioning and publish to an internal npm registry

## Common Pitfalls
- **Token drift**: Design tokens fall out of sync with Figma — automate export via Figma API
- **Prop explosion**: Too many boolean props — prefer composition (wrappers) over configuration
- **Missing a11y states**: Components without focus, hover, active, disabled, and error state styles
- **Framework lock-in**: Design system tied to one framework — abstract tokens and logic from rendering
- **Over-engineering**: Building a design system before you have 3+ consumers — start with a shared component library

## Tools & Ecosystem
- **Style Dictionary**: Transform design tokens into platform-specific output (CSS, JS, Swift, Kotlin)
- **Storybook**: Component development environment with a11y and testing addons
- **Figma Tokens / Tokens Studio**: Design token plugin for Figma with JSON export
- **Radix UI / Headless UI**: Unstyled accessible primitives to build on top of
- **Chromatic**: Visual regression testing for Storybook components
