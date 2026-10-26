# Tailwind CSS Patterns

## Organization
- Use Tailwind with a component framework (React, Vue) — extract repeated patterns into components
- Keep utility classes under 5-6 lines; extract to component beyond that
- Use `@apply` ONLY in component files, never in global CSS
- Use `cn()` or `clsx()` utility for conditional class merging

## Responsive Design
- Mobile-first: base classes for mobile, breakpoint prefixes for larger
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```
- Breakpoints: `sm:` (640), `md:` (768), `lg:` (1024), `xl:` (1280), `2xl:` (1536)
- Use `max-*` prefix for mobile-only overrides: `max-md:hidden`

## Custom Theme
- Extend in `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: { primary: { 50: '...', 500: '...' } },
    fontFamily: { sans: ['Inter', ...defaultTheme.fontFamily.sans] },
  }
}
```
- Use design tokens from theme instead of arbitrary values `[#123456]`
- Dark mode: `dark:bg-gray-800` (use class strategy)

## Common Patterns
- Container: `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`
- Card: `rounded-lg border bg-card text-card-foreground shadow-sm`
- Button: `inline-flex items-center justify-center rounded-md px-4 py-2 font-medium transition-colors`
- Form input: `flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm`
- Flex center: `flex items-center justify-center`
- Grid auto-fill: `grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6`

## Performance
- PurgeCSS removes unused classes in production automatically
- Avoid dynamic class construction: `` className={`text-${color}`} `` — use full class names
- Use `safelist` in config for dynamic classes that must be preserved
- Prefer Tailwind plugins (`@tailwindcss/forms`, `@tailwindcss/typography`) over custom CSS

## Animations
- Built-in: `animate-spin`, `animate-ping`, `animate-pulse`, `animate-bounce`
- Custom in config: `animation: { 'fade-in': 'fadeIn 0.3s ease-in-out' }`
- Use `transition-all`, `transition-colors`, `transition-transform` for hover states
- Duration: `duration-200` (default), `ease-in-out` (default)

## Best Practices
- Don't mix `@apply` classes with tailwind classes on same element
- Use `group` and `group-hover:` for parent-child hover effects
- Use `peer` and `peer-*` for sibling state styling
- Use `*:` variant for styling all children: `divide-y-2 *:py-4`
- Extract reusable class combinations as React components, not CSS classes
