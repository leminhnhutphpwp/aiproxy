# Advanced CSS & Layout

## Flexbox
```css
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
}
.item { flex: 1 1 300px; }  /* grow-shrink-basis */
```
- Use `gap` for spacing (not `margin` on children)
- `flex: 1` instead of `flex-grow: 1` (shorthand + reset of other properties)
- `flex-wrap: wrap` for responsive layouts without media queries
- `align-self` on individual items overrides `align-items`

## CSS Grid
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}
.hero { grid-column: 1 / -1; }  /* span full width */
.sidebar { grid-column: span 2; }
```
- `auto-fill` vs `auto-fit`: `auto-fill` preserves track space, `auto-fit` collapses empty tracks
- `grid-template-areas` for semantic layout: `"header header" "sidebar main" "footer footer"`
- `subgrid`: passes grid tracks to children — use for aligned card layouts
- `minmax()` for responsive grids without media queries

## Container Queries
```css
@container (min-width: 600px) {
  .card { display: grid; grid-template-columns: 1fr 2fr; }
}
```
- Container queries respond to parent container size, not viewport
- Set containment on the parent: `container-type: inline-size`
- Use for reusable components that appear in different layouts
- Combine with `cqw` units: `font-size: min(3cqw, 1.5rem)`

## Custom Properties
```css
:root {
  --color-primary: #FF6B2B;
  --spacing-unit: 0.5rem;
  --max-width: 1200px;
}
.card { background: var(--color-primary); padding: calc(var(--spacing-unit) * 2); }
```
- Define at `:root` for global scope, override on elements for local scope
- `@property` for typed properties with animation support:
```css
@property --gradient-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
```

## :has() Selector
```css
/* Style parent based on child state */
.card:has(> .featured) { border-color: var(--color-primary); }
/* Style sibling based on input state */
.form:has(input:invalid) .submit-btn { opacity: 0.5; pointer-events: none; }
```

## View Transitions
```css
@view-transition { navigation: auto; }
::view-transition-old(root) { animation: fade-out 0.3s; }
::view-transition-new(root) { animation: fade-in 0.3s; }
```

## @layer Cascade
```css
@layer reset, base, components, utilities;
@layer base { body { font-family: sans-serif; } }
@layer utilities { .mt-4 { margin-top: 1rem; } }
```
- Layers control cascade order without specificity hacks
- Unlayered styles win over layered styles
- Explicit layer ordering is more maintainable than `!important`

## Common Mistakes
- ❌ Over-nesting selectors in preprocessors (creates tight coupling)
- ❌ Using `!important` instead of fixing specificity
- ❌ Not using logical properties (`margin-inline`, `padding-block`) for RTL
- ❌ Forgetting `container-type` when using container queries
- ❌ Negative z-index values (confusing stacking context)
