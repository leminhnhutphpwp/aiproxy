# Responsive Design Patterns

## Mobile-First Approach
```css
/* Base: mobile styles (no media query) */
.card { display: block; padding: 1rem; }

/* Tablet */
@media (min-width: 768px) {
  .card { display: flex; gap: 1.5rem; }
}

/* Desktop */
@media (min-width: 1024px) {
  .card { max-width: 1200px; margin: 0 auto; }
}
```
- Write mobile styles first (no query), then layer on larger screens with `min-width`
- Avoid `max-width` queries — they encourage a desktop-first mindset
- Use logical breakpoints based on content, not device sizes

## Fluid Typography
```css
/* clamp(min, preferred, max) */
h1 { font-size: clamp(1.75rem, 4vw + 1rem, 3.5rem); }
p { font-size: clamp(0.875rem, 0.5vw + 0.8rem, 1.125rem); }
```
- `clamp()` for fluid type that scales between bounds without breakpoints
- Use viewport units in `clamp()` for gradual scaling
- `text-wrap: balance` for heading line-break optimization
- `text-wrap: pretty` for paragraph orphans prevention

## Fluid Spacing
```css
:root {
  --space-xs: clamp(0.25rem, 0.5vw, 0.5rem);
  --space-sm: clamp(0.5rem, 1vw, 1rem);
  --space-md: clamp(1rem, 2vw, 1.5rem);
  --space-lg: clamp(1.5rem, 3vw, 3rem);
  --space-xl: clamp(2rem, 5vw, 5rem);
}
```

## Container Queries
```css
/* Parent sets containment */
.card-grid { container-type: inline-size; container-name: card-grid; }

/* Child queries parent size, not viewport */
@container card-grid (min-width: 500px) {
  .card { display: grid; grid-template-columns: 200px 1fr; }
}
@container card-grid (min-width: 800px) {
  .card { grid-template-columns: 300px 2fr 1fr; }
}
```
- Use container queries for reusable components that appear in multiple contexts
- Combine with `cqw`, `cqi` units: `font-size: clamp(1rem, 3cqi, 2rem)`

## Responsive Grid Layouts
```css
/* Auto-fill responsive grid — no media queries */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
}
/* Sidebar + content adaptive layout */
.page {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}
@container page (min-width: 800px) {
  .page { grid-template-columns: 280px 1fr; }
}
```

## Responsive Images
```html
<img src="hero-800.jpg"
     srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
     sizes="(max-width: 600px) 100vw, (max-width: 1200px) 80vw, 1200px"
     alt="Hero image"
     loading="lazy"
     decoding="async">
```
- Always use `srcset` + `sizes` for responsive images
- Provide WebP/AVIF via `<picture>` element with JPEG/PNG fallback
- `loading="lazy"` for below-the-fold images
- Always set explicit `width` and `height` to prevent layout shift

## Responsive Navigation Patterns
- Mobile: hamburger menu (sheet or dropdown)
- Tablet: collapsible nav with visible top-level items
- Desktop: full horizontal nav bar
- Use `<nav>` with `aria-label` and `aria-expanded` for accessibility

## Testing Breakpoints
- Test at: 320px, 480px, 640px, 768px, 1024px, 1280px, 1440px
- Test with: keyboard navigation, screen readers, zoom (200%), dark mode
- Use browser DevTools responsive mode for quick iteration
- Test on real devices if possible — emulators don't catch touch issues

## Common Mistakes
- ❌ Fixed-width layouts using `px` — use `%`, `vw`, `clamp()`, or `fr`
- ❌ Hiding content on mobile instead of restructuring it
- ❌ Touch targets smaller than 44x44px on mobile
- ❌ `overflow: hidden` on body (breaks sticky/fixed positioning)
- ❌ Not testing horizontal scroll — always check with overflow overlay
