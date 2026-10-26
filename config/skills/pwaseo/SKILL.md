# PWA & SEO Best Practices

## Progressive Web Apps

### Service Worker
```javascript
// sw.js — Register in main.js: navigator.serviceWorker.register('/sw.js')
const CACHE_NAME = 'v1';
const STATIC_ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/offline.html'];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();  // Activate immediately
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for dynamic
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // Network-first for API calls
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
```
- Cache static assets on install (pre-cache)
- Cache-first for static files (fast, works offline)
- Network-first for API calls (fresh data, fallback to cache)
- Always provide an offline fallback page

### Web App Manifest
```json
{
  "name": "My PWA App",
  "short_name": "PWA App",
  "description": "A progressive web application",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#FF6B2B",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## SEO Fundamentals

### Meta Tags
```html
<head>
  <title>Product Name - Unique Title Under 60 Chars</title>
  <meta name="description" content="Compelling description under 160 chars with keywords naturally included.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://example.com/product-page">

  <!-- Open Graph -->
  <meta property="og:title" content="Product Name">
  <meta property="og:description" content="Compelling description">
  <meta property="og:image" content="https://example.com/image.jpg">
  <meta property="og:url" content="https://example.com/product-page">
  <meta property="og:type" content="website">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Product Name">
  <meta name="twitter:description" content="Compelling description">
  <meta name="twitter:image" content="https://example.com/image.jpg">

  <!-- Icons -->
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
</head>
```

### Structured Data (JSON-LD)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Wireless Mouse",
  "description": "Ergonomic wireless mouse with 2.4GHz connection",
  "image": "https://example.com/images/mouse.jpg",
  "brand": { "@type": "Brand", "name": "TechBrand" },
  "offers": {
    "@type": "Offer",
    "price": "29.99",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "url": "https://example.com/product/mouse"
  }
}
</script>
```

### Sitemap.xml
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-07-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/products</loc>
    <lastmod>2026-07-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
```

### Core Web Vitals (SEO Ranking Factor)
| Metric | Good | Needs Work | Poor |
|--------|------|-----------|------|
| LCP (Largest Contentful Paint) | <2.5s | 2.5-4.0s | >4.0s |
| INP (Interaction to Next Paint) | <200ms | 200-500ms | >500ms |
| CLS (Cumulative Layout Shift) | <0.1 | 0.1-0.25 | >0.25 |
| TTFB (Time to First Byte) | <800ms | 800-1800ms | >1800ms |

### Robots.txt
```txt
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Sitemap: https://example.com/sitemap.xml
```

## Common Mistakes
- ❌ No meta description or duplicate titles (every page needs unique)
- ❌ Missing canonical URL (duplicate content penalty)
- ❌ Not generating sitemap or not submitting to Google Search Console
- ❌ Service worker registering but not caching (no offline benefit)
- ❌ Not testing with Lighthouse (misses CLS, LCP, accessibility issues)
