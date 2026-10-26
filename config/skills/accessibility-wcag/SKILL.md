# Web Accessibility (WCAG)

## Core Principles
- **POUR Framework**: Content must be Perceivable, Operable, Understandable, and Robust — every decision maps to one of these
- **Progressive Enhancement**: Start with semantic HTML, layer ARIA only when native semantics are insufficient
- **Inclusion Over Compliance**: Accessibility is not a checklist — test with real assistive technology and real users

## Key Patterns
- **Semantic HTML First**: Use `<nav>`, `<main>`, `<aside>`, `<button>`, `<form>` — ARIA is a polyfill for HTML, not a replacement
- **Skip Links**: First focusable element on every page — allows keyboard users to bypass repetitive navigation
- **ARIA Landmarks**: `role="banner"`, `role="navigation"`, `role="main"`, `role="contentinfo"` on every page
- **Focus Management**: Ensure logical tab order, visible focus indicators (3:1 contrast), and programmatic focus for dynamic content
- **Live Regions**: Use `aria-live="polite"` for dynamic updates (notifications, errors) and `aria-live="assertive"` for urgent messages

## Best Practices
- Target WCAG 2.2 AA as minimum — AAA for government/enterprise when feasible
- Maintain 4.5:1 contrast for normal text, 3:1 for large text (18px+ bold or 24px+ regular)
- Support full keyboard navigation: Tab, Shift+Tab, Enter, Escape, Arrow keys for all interactive elements
- Never override `:focus-visible` — only customize its appearance, never remove it
- Provide captions for video, transcripts for audio, and alt text for images (empty alt for decorative)
- Test with voice control (Dragon, built-in OS voice) — a surprising number of users navigate by voice

## Common Pitfalls
- **ARIA overuse**: Adding `role="button"` to a `<div>` without keyboard handling — just use `<button>` instead
- **Color-only communication**: Never rely on color alone (red text for errors) — add icons or text labels
- **Invisible focus styles**: `outline: none` without replacement — users navigating by keyboard cannot see where they are
- **Dynamic content without announcements**: Loading spinners, toast messages, or DOM updates that screen readers never hear about
- **Poor motion sensitivity**: Auto-playing carousels, parallax, or animations without `prefers-reduced-motion` support

## Tools & Ecosystem
- **axe-core / axe DevTools**: Automated accessibility testing in browser and CI
- **WAVE**: Visual overlay showing accessibility issues on any page
- **Lighthouse Accessibility Audit**: Built-in Chrome audit for common a11y issues
- **NVDA / VoiceOver / JAWS**: Screen reader testing on Windows, macOS, and mobile
- **Accessibility Insights**: Microsoft's comprehensive testing tool with fast-pass and assessment modes
