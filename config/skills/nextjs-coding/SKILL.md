# Next.js App Router Conventions

## File Conventions
- `page.js` — unique route UI (must exist for a route to be accessible)
- `layout.js` — shared UI across children (preserves state, no re-mount)
- `loading.js` — loading UI (uses Suspense automatically)
- `error.js` — error boundary for the segment
- `not-found.js` — 404 UI for the segment
- `route.js` — API route handler
- `template.js` — similar to layout but re-mounts on navigation

## Server Components (Default)
- All components in App Router are Server Components by default
- Server Components: direct DB access, file system access, secrets, no client JS
- 'use client' directive only when you need: useState, useEffect, onClick, browser APIs
- Keep 'use client' boundaries as low as possible — don't make the whole page a client component
- Fetch data in Server Components, pass as props to client children

## Data Fetching
- Fetch in Server Components using `fetch()` with Next.js extensions:
  - `{ cache: 'force-cache' }` (default) — static data
  - `{ cache: 'no-store' }` — dynamic data (revalidate on every request)
  - `{ next: { revalidate: 3600 } }` — ISR (revalidate every hour)
- Use `async component` pattern: `export default async function Page()`
- Parallel data fetching: `const [a, b] = await Promise.all([fetchA(), fetchB()])`
- Sequential data fetching only when data depends on previous fetch

## Routing
- Dynamic segments: `[slug]/page.js` — `params.slug`
- Catch-all segments: `[...slug]/page.js` — `/a/b/c` -> `{ slug: ['a','b','c'] }`
- Optional catch-all: `[[...slug]]/page.js` — matches with or without the segment
- Group routes: `(auth)/login/page.js` — group without affecting URL path
- Parallel routes: `@modal/page.js` — render multiple pages in same layout
- Intercepting routes: `(.)photo/[id]/page.js` — modal from link while keeping URL

## Metadata
```js
export const metadata = {
  title: 'Page Title',
  description: 'Page description',
  openGraph: { title, description, images: [...] },
}
```
- Static metadata: export `metadata` object
- Dynamic metadata: export `generateMetadata({ params })` async function
- Set in layout.js for default, override in page.js

## Forms & Server Actions
- Use Server Actions for form handling: `'use server'` in a function
- Actions handle validation, DB writes, and revalidation
- `revalidatePath('/path')` to refresh cached data
- `redirect('/path')` for navigation after mutation
- Client-side validation + Server-side validation (never trust the client)

## Deployment
- `next build` produces optimized production build
- Node.js server: `next start` or PM2
- Static export: `next export` for static hosting
- Environment variables: `.env.local`, `NEXT_PUBLIC_` prefix for client-side vars
- PM2 ecosystem: use `pm2.config.js` with env block (not .env.local for secrets)
