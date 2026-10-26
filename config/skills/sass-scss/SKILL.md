# SASS/SCSS Patterns

## Architecture (7-1 Pattern)
```
sass/
  abstracts/   — variables, functions, mixins, placeholders
  vendors/     — third-party CSS
  base/        — reset, typography, base styles
  layout/      — grid, header, footer, sidebar, forms
  components/  — buttons, cards, nav, modals
  pages/       — page-specific styles
  themes/      — theme variations
  main.scss    — imports everything
```
- One file per component, imported into `main.scss`
- Keep nesting 3 levels max — deeper creates over-specific selectors
- `@use` over `@import` (module system, no global pollution)

## Variables & Maps
```scss
// Variables for design tokens
$color-primary: #FF6B2B;
$font-sizes: ('sm': 0.875rem, 'md': 1rem, 'lg': 1.25rem);
$breakpoints: ('sm': 640px, 'md': 768px, 'lg': 1024px, 'xl': 1280px);
// Maps for lookup
$font-weight: ('regular': 400, 'medium': 500, 'bold': 700);
.heading { font-weight: map-get($font-weight, 'bold'); }
```

## Mixins
```scss
// Responsive mixin
@mixin respond($bp) {
  @media (min-width: map-get($breakpoints, $bp)) { @content; }
}
.card {
  display: grid;
  @include respond('md') { grid-template-columns: 1fr 1fr; }
}

// Utility mixin
@mixin truncate($lines: 1) {
  @if $lines == 1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @else { display: -webkit-box; -webkit-line-clamp: $lines; -webkit-box-orient: vertical; overflow: hidden; }
}
```
- Mixins for parameterized patterns — use `@extend` for static shared styles
- Always name mixins as verbs or actions: `respond()`, `truncate()`

## @extend vs @include
```scss
// @extend for static utility classes (shares selector group)
%visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; }
.sr-only { @extend %visually-hidden; }

// @include for parameterized patterns
@mixin button($bg) { background: $bg; padding: 0.5em 1em; border-radius: 4px; }
.btn-primary { @include button($color-primary); }
```

## BEM Naming
```scss
/* Block: standalone component */
.card { ... }
  /* Element: part of a block */
  &__header { ... }
  &__body { ... }
  /* Modifier: variation */
  &--featured { ... }
```
- BEM keeps specificity flat and predictable
- Never nest blocks inside blocks — use class names directly
- Modifiers should only change what differs from base

## Functions
```scss
@function spacing($multiplier: 1) {
  @return $multiplier * 0.5rem;  // spacing(3) = 1.5rem
}
@function rem($px) {
  @return $px / 16 * 1rem;  // rem(24) = 1.5rem
}
```

## Color Functions
```scss
.button {
  background: $color-primary;
  &:hover { background: darken($color-primary, 10%); }
  &.light { background: lighten($color-primary, 20%); }
  &.muted { background: rgba($color-primary, 0.5); }
}
```

## Module System (@use)
```scss
// _variables.scss
$primary: blue !default;
// main.scss
@use 'variables' as v;
.button { color: v.$primary; }
// With renamed namespace
@use 'variables' as *;
// Now accessible without prefix
```

## Common Mistakes
- ❌ Nesting deeper than 3 levels (over-specific, slow compilation)
- ❌ `@import` instead of `@use` (deprecated, pollutes global scope)
- ❌ Overusing `@extend` for non-placeholders (creates unexpected selector groups)
- ❌ Writing CSS that wouldn't need SCSS (no variables, mixins, or nesting used)
- ❌ Not organizing into partials (single 2000-line file defeats purpose)
