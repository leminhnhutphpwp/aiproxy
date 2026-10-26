# GSAP & Web Animation

## Core Concepts
- GSAP (GreenSock Animation Platform): professional-grade animation library (26k GitHub stars)
- Animates any JavaScript-touchable property: CSS, SVG, canvas, WebGL, objects
- Zero dependencies, 20x faster than jQuery animations
- Works in every major browser, framework-agnostic (React, Vue, Angular, vanilla JS)

## Basic Usage
```js
// Tween: animate one or more targets over duration
gsap.to('.box', { duration: 1, x: 200, rotation: 360, opacity: 0.5, ease: 'power2.out' });
gsap.from('.hero-title', { duration: 0.8, y: 50, opacity: 0 });
gsap.fromTo('.card', { scale: 0 }, { duration: 0.6, scale: 1, stagger: 0.1 });
```
- `gsap.to()` — animate FROM current state TO specified values
- `gsap.from()` — animate FROM specified values TO current state
- `gsap.fromTo()` — explicit start and end values (most control)
- `gsap.set()` — set values immediately (duration: 0)

## Timelines
```js
const tl = gsap.timeline({ defaults: { duration: 0.5, ease: 'power2.out' } });
tl.to('.hero', { opacity: 1 })
  .to('.title', { y: 0, opacity: 1 }, '-=0.3')   // overlap by 0.3s
  .from('.subtitle', { y: 20, opacity: 0 })
  .from('.cta', { scale: 0, rotation: -10 }, '+=0.2');  // delay 0.2s
```
- Timelines orchestrate sequences with precise control
- Position parameter: absolute time (1), relative (`'-=0.3'`), label (`'label+=0.5'`)
- Defaults apply to all child tweens

## Easing
```js
gsap.to('.el', { duration: 1, x: 100, ease: 'power2.inOut' });
// Built-in: power1-4, back, elastic, bounce, steps, none (linear)
// Custom: gsap.parseEase('M0,0 C0.25,0.1 0.25,1 1,1')
// Rough: ease: 'rough({strength:1, points:20})'
```

## ScrollTrigger
```js
gsap.registerPlugin(ScrollTrigger);

// Trigger animation when element scrolls into view
gsap.to('.animate-in', {
  scrollTrigger: { trigger: '.animate-in', start: 'top 80%', end: 'top 20%', toggleActions: 'play none none reverse' },
  y: 0, opacity: 1, duration: 0.8,
});

// Parallax
gsap.to('.parallax-bg', {
  scrollTrigger: { trigger: '.section', start: 'top bottom', end: 'bottom top', scrub: true },
  y: '-30%',
});

// Pin element during scroll
ScrollTrigger.create({ trigger: '.pin-section', start: 'top top', end: '+=500', pin: true });
```
- `start: 'top 80%'` = trigger top when viewport is 80% from top
- `scrub: true` = animation follows scroll position (1:1)
- `toggleActions: 'play reverse none reset'` = controls on enter/leave/enterBack/leaveBack

## SVG Animation
```js
// Morphing
gsap.to('.morph-target', { duration: 1, morphSVG: '.morph-source' });
// Drawing (line animation)
gsap.fromTo('.path', { drawSVG: '0%' }, { duration: 2, drawSVG: '100%', ease: 'none' });
```

## Performance
- Animate `transform` and `opacity` only — these use GPU compositing
- Use `will-change: transform` sparingly — only on actively animated elements
- Batch DOM reads before writes to avoid layout thrashing
- Kill tweens on unmount: `gsap.killTweensOf('.myTarget')`

## React Integration
```jsx
useEffect(() => {
  const ctx = gsap.context(() => {
    gsap.to(ref.current, { opacity: 1, y: 0, duration: 0.5 });
  }, ref);  // scopes all GSAP to this ref
  return () => ctx.revert();  // cleanup on unmount
}, []);
```

## Common Mistakes
- ❌ Animating `top`/`left` instead of `x`/`y` (causes layout reflow)
- ❌ Forgetting `gsap.registerPlugin()` for ScrollTrigger, MorphSVG, etc.
- ❌ Not cleaning up GSAP in React `useEffect` (memory leaks)
- ❌ Using `animate.css` alongside GSAP (conflicting animation controls)
- ❌ Animating too many elements simultaneously (frame drops below 30fps)
