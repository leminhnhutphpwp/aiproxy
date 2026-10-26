# Performance Optimization

## Core Web Vitals
- **LCP (Largest Contentful Paint)**: <2.5s — optimize the largest image/text element
  - Preload hero images: `<link rel="preload" as="image" href="hero.webp">`
  - Use responsive images with srcSet and sizes
  - Avoid lazy-loading above-the-fold images
- **FID/INP (Interaction to Next Paint)**: <200ms
  - Minimize main thread blocking with code splitting and deferring non-critical JS
  - Use `requestAnimationFrame` for visual updates
  - Avoid long tasks >50ms — break them up with `yield` or `setTimeout`
- **CLS (Cumulative Layout Shift)**: <0.1
  - Always set width/height on images and embeds
  - Use `aspect-ratio` CSS property for dynamic containers
  - Reserve space for late-loading content (skeletons, placeholders)

## Frontend Optimization
- Lazy load below-the-fold components: `React.lazy()` or dynamic imports
- Code split by route: each page loads only its own JavaScript
- Bundle analysis: use `vite analyse` or `webpack-bundle-analyzer` to find bloat
- Tree-shake unused imports — avoid `import * as` patterns
- Compress images: WebP/AVIF, serve at correct dimensions, use CDN
- Minimize CSS: purge unused styles (Tailwind does this automatically)
- Defer non-critical scripts: `async` for independent, `defer` for ordered

## Backend Optimization
- Database query optimization: `EXPLAIN ANALYZE` slow queries, add indexes
- N+1 query detection: use eager loading or batch loading (DataLoader pattern)
- Connection pooling: reuse database connections, not open/close per request
- Caching strategy:
  - Browser: `Cache-Control: public, max-age=31536000` for static assets
  - CDN: edge caching for API responses that change infrequently
  - App: in-memory cache for hot data, Redis for distributed cache
  - Database: query cache for read-heavy workloads
- Use streaming for large responses instead of buffering everything in memory
- Implement request coalescing: batch concurrent requests to the same resource

## Network Optimization
- HTTP/2 (or HTTP/3) for multiplexing and header compression
- Enable gzip/brotli compression at the reverse proxy level
- Minimize HTTP requests: bundle JS, inline critical CSS, sprite icons
- Use CDN for static assets — geo-distributed, cached at edge
- Preconnect to third-party origins: `<link rel="preconnect" href="https://api.example.com">`
- Stale-while-revalidate caching strategy for non-critical data

## Rendering Optimization
- Server-side rendering for initial paint performance
- Streaming SSR for progressive rendering (React 18 Suspense)
- Static generation where possible (SSG/ISR)
- Virtualize long lists: `react-window`, `@tanstack/virtual`
- Debounce expensive operations: search inputs, resize handlers, scroll events
- Use `will-change` CSS hint sparingly — only for known animated elements

## Profiling & Measurement
- Always measure before optimizing: Lighthouse, WebPageTest, Chrome DevTools
- Profile with: React DevTools profiler, Chrome CPU profiler, Node's `--prof`
- Set performance budgets: 200kB JS budget, 300ms TTFB, 90+ Lighthouse score
- Monitor in production: RUM (Real User Monitoring) with Web Vitals API
- Fix the 20% that gives 80% improvement — avoid premature micro-optimization
