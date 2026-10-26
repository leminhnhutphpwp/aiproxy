# Vercel & Edge Deployment

## Core Principles
- **Frontend Cloud**: Vercel is purpose-built for frontend frameworks (Next.js, SvelteKit, Nuxt)
- **Edge Everywhere**: Serverless functions run at edge regions (30+ locations) for low latency
- **Git-Triggered Deployments**: Every push creates a preview deployment with unique URL
- **Framework Auto-Detection**: Vercel detects framework and configures build/optimize automatically

## Key Patterns
- **ISR (Incremental Static Regeneration)**: Static pages with on-demand revalidation
- **Edge Functions**: Lightweight functions (V8 isolates) at edge regions for personalization, A/B testing
- **Serverless Functions**: Node.js, Python, Go, Ruby runtimes — auto-scaled per region
- **Preview Deployments**: Every branch/PR gets a staging URL with environment variables
- **Edge Config**: Low-latency (single-digit ms) global config store for feature flags, redirects
- **Image Optimization**: `next/image` with Vercel's built-in image CDN

## Best Practices
- Use `@vercel/analytics` for real-time user analytics (no cookie banner needed)
- Configure `vercel.json` for rewrites, redirects, headers, and cron jobs
- Leverage Edge Config for feature flags — instant propagation, no deployment needed
- Use Vercel KV (Redis) for scalable caching and session storage
- Enable Vercel Blob Storage for user uploads (S3-compatible, edge-optimized)
- Set up custom domains with automatic SSL (Let's Encrypt, auto-renew)
- Configure team deployment protection (password, IP allowlist, SAML SSO)

## Common Pitfalls
- **Serverless function timeout**: 10s on Hobby (60s on Pro) — long work needs background functions
- **Cold starts**: Edge Functions start faster than Serverless — use edge for critical paths
- **Cost at scale**: Serverless function invocation costs add up — consider ISR for static content
- **Lock-in**: Vercel-specific features (Edge Config, KV, Blob) are not portable — abstract behind interfaces
- **Large images blocking**: Unoptimized images cause Core Web Vitals failures — always use next/image

## Tools & Ecosystem
- **Vercel CLI**: Local development, deployment, and environment management
- **Vercel Dashboard**: Analytics, logs, metrics, team management
- **Turborepo**: Monorepo with Vercel-native caching and pipeline orchestration
- **Next.js + SvelteKit + Nuxt**: Framework integrations with automatic optimization
- **@vercel/speed-insights**: Real user monitoring (RUM) for Core Web Vitals
