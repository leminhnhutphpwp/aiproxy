# CSS Animations & Transitions

## CSS Transitions
```css
.button {
  background: blue;
  transition: background 0.3s ease, transform 0.2s ease-out;
}
.button:hover {
  background: darkblue;
  transform: scale(1.05);
}
```
- Use transitions for simple state changes: hover, focus, active, disabled
- Always specify `duration` and `timing-function` — never rely on defaults
- `transition: all 0.3s` is convenient but worse performance — be specific
- Trigger transitions via CSS pseudo-classes or JS class toggling

## @keyframes Animations
```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.hero-title {
  animation: fadeInUp 0.6s ease-out forwards;
}
```
- `forwards` fill mode keeps the final state — use this for entrance animations
- `infinite` for looping animations (spinners, pulsing indicators)
- Use percentage keyframes for multi-step animations

## Animation Properties
```css
@keyframes slideIn {
  from { translate: -100% 0; }
  to { translate: 0 0; }
}
.element {
  animation-name: slideIn;
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-delay: 0.2s;
  animation-iteration-count: 1;
  animation-direction: normal;
  animation-fill-mode: backwards;  /* applies starting styles before animation starts */
  animation-composition: replace;  /* how overlapping animations combine */
}
```

## @property for Custom Properties
```css
@property --bg-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
.card {
  background: linear-gradient(var(--bg-angle), #ff6b2b, #ff8c42);
  animation: rotate-bg 3s linear infinite;
}
@keyframes rotate-bg {
  to { --bg-angle: 360deg; }
}
```

## View Transitions API
```css
/* SPA-like page transitions for MPA */
@view-transition { navigation: auto; }
/* Custom animation per element */
::view-transition-old(root) {
  animation: fade-out 0.3s ease-out;
}
::view-transition-new(root) {
  animation: fade-in 0.3s ease-in;
}
/* Different transitions for different elements */
header { view-transition-name: header; }
main { view-transition-name: content; }
```

## Performance
| Property | Cost | Notes |
|----------|------|-------|
| `transform` | Compositor-only | Best: translate, scale, rotate |
| `opacity` | Compositor-only | Best: fade effects |
| `filter` | Compositor-only | Expensive on large areas |
| `clip-path` | Compositor-only | Use `will-change: transform` |
| `width`, `height` | Layout + Paint | Avoid for animation |
| `top`, `left`, `margin` | Layout + Paint | Use `transform: translate()` instead |
| `color`, `background` | Paint only | Avoid for continuous animation |

- Stick to `transform` and `opacity` for smooth 60fps animations
- Use `will-change` as a last resort, not on every animated element
- Animating layout properties causes reflow on every frame

## Accessibility
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
- Always respect `prefers-reduced-motion` — treat as a requirement, not a nicety
- Remove parallax and auto-playing animations for reduced motion
- Use `animation-delay: -0.01ms` hack if `!important` isn't enough

## Common Mistakes
- ❌ Animating `width`/`height` instead of `transform: scale()` (reflow heavy)
- ❌ Forgetting `prefers-reduced-motion` — causes vestibular disorders
- ❌ No `animation-fill-mode` — element jumps to initial state after animation
- ❌ Using `transition: all` — performance penalty and unexpected side effects
- ❌ Long keyframe animations (>5s) without `animation-composition`
