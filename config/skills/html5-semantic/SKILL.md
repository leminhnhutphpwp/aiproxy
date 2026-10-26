# HTML5 & Semantic Markup

## Document Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title (unique per page)</title>
  <meta name="description" content="Brief page description under 160 chars">
</head>
<body>
  <header>Site header/nav</header>
  <main>
    <article>
      <header>Article header</header>
      <section>Content grouped by theme</section>
      <footer>Article footer</footer>
    </article>
    <aside>Related/contextual content</aside>
  </main>
  <footer>Site footer</footer>
</body>
</html>
```
- `<main>` must be unique per page (one per document)
- `<nav>` wraps primary navigation only (not all link lists)
- `<aside>` for tangentially related content (sidebars, related posts)
- `<section>` groups thematically related content — always has a heading

## Semantic Elements
- `<header>`, `<footer>` — group introductory/closing content (can be per-section)
- `<article>` — self-contained, independently distributable content
- `<figure>` + `<figcaption>` — self-contained media with caption
- `<time datetime="2026-07-01">` — machine-readable dates
- `<address>` — contact info for the nearest `<article>` or `<body>`
- `<details>` + `<summary>` — expand/collapse without JavaScript

## ARIA (Accessible Rich Internet Applications)
```html
<button aria-label="Close dialog" aria-expanded="true">✕</button>
<div role="alert" aria-live="assertive">Error: field is required</div>
<nav aria-label="Main navigation">...</nav>
```
- Use native HTML semantics FIRST — ARIA only when semantics inadequate
- `aria-label` on interactive elements without visible text labels
- `aria-live="polite"` for dynamic updates (chat, notifications)
- `aria-controls`, `aria-expanded` for toggle/accordion patterns
- `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

## Forms
```html
<form action="/submit" method="POST" novalidate>
  <fieldset>
    <legend>Personal Information</legend>
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required autocomplete="name">
    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required autocomplete="email">
  </fieldset>
  <button type="submit">Submit</button>
</form>
```
- Every `<input>` needs a `<label>` (or `aria-label`)
- Use appropriate `type`: email, tel, url, number, date, password
- `autocomplete` enables browser autofill — use correct values
- `novalidate` on the form if using custom JavaScript validation
- `<fieldset>` + `<legend>` groups related inputs

## Meta Tags & SEO
- `<title>`: unique per page, 50-60 chars
- `<meta name="description">`: 150-160 chars, compelling summary
- `<meta name="robots" content="index, follow">`: crawler directives
- Open Graph: `<meta property="og:title">`, `og:description`, `og:image`, `og:url`
- Twitter Card: `<meta name="twitter:card" content="summary_large_image">`
- Canonical: `<link rel="canonical" href="https://example.com/page/">` — prevents duplicate content
- Structured data: `<script type="application/ld+json">` for rich snippets

## Common Mistakes
- ❌ Using `<div>` when semantic elements exist (`<nav>`, `<main>`, `<article>`)
- ❌ Multiple `<main>` elements on one page
- ❌ Forgetting `alt` text on images (required for accessibility)
- ❌ Using `<br>` for spacing — use CSS `margin` or `padding`
- ❌ Nesting interactive elements (`<button>` inside `<a>`)
