# UI/UX Best Practices

## Layout & Spacing
- Use consistent spacing scale (4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px)
- Implement proper visual hierarchy with size, color, and spacing
- Use CSS Grid for 2D layouts, Flexbox for 1D layouts
- Maintain adequate whitespace — don't crowd elements
- Keep line length 60-80 characters for readability
- Use max-width containers for large screens

## Color
- Define a primary, secondary, and neutral color palette
- Ensure sufficient contrast ratio: 4.5:1 for normal text, 3:1 for large text
- Don't rely on color alone to convey information — add icons or labels
- Use semantic colors: success (green), warning (amber), error (red), info (blue)
- Dark mode must maintain the same contrast ratios

## Typography
- Limit to 2-3 font families maximum
- Use a consistent type scale: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72
- Body text: 16px minimum, line-height 1.5
- Headings: clear hierarchy (h1 > h2 > h3)
- Use system font stack for performance: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

## Responsive Design
- Mobile-first approach — design for small screens first
- Breakpoints: sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
- Use relative units (rem, em, %, vw) over absolute (px)
- Test on actual devices, not just browser resize

## Accessibility (a11y)
- All interactive elements must be keyboard-navigable
- Add proper aria-labels, role attributes, and focus styles
- Images must have alt text (decorative images: alt="")
- Form inputs must have associated labels
- Use semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`
- Support reduced-motion: `@media (prefers-reduced-motion: reduce)`
- Error messages must be announced by screen readers (aria-live="polite")

## Performance
- Lazy load images and heavy components
- Avoid layout shifts — set explicit dimensions on images
- Minimize CSS/JS bundle size — tree-shake unused code
- Use CSS animations instead of JS animations when possible
- Implement loading states (skeleton, spinner)

## Interactions
- Provide visual feedback on hover, focus, active, disabled states
- Use micro-animations (transitions 200-300ms, ease-in-out)
- Implement optimistic UI updates for fast perceived performance
- Show loading indicators for operations > 300ms
- Confirm destructive actions before executing

## Forms
- Single-column layouts are more scannable than multi-column
- Group related fields with fieldset/legend
- Show inline validation after field blur (not on every keystroke)
- Auto-focus the first field, tab through logically
- Mobile-friendly input types: type="email", type="tel", type="number"
