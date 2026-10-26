# Docker & Containerization

## Dockerfile Best Practices
- Use specific base image tags (`node:20-alpine` not `node:latest`)
- Prefer Alpine-based images for smaller surface area
- Multi-stage builds: separate build deps from runtime deps
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]
```
- Combine RUN commands to minimize layers: `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*`
- Add HEALTHCHECK instruction for production containers
- Use `.dockerignore` to exclude node_modules, .git, .env

## docker-compose Patterns
- Define services, networks, and volumes explicitly
- Use named volumes for persistent data (not bind mounts in production)
- Set `restart: unless-stopped` for production services
- Use `depends_on` with `condition: service_healthy` for startup ordering
- Healthcheck every service that others depend on
```yaml
services:
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
```

## Networking
- Use user-defined networks for service isolation
- Internal networks for backend services (no external access)
- Expose only necessary ports in production
- Use DNS-based service discovery (`http://api:3000` not localhost)

## Security
- Never run as root: use `USER node` or create a dedicated user
- Never store secrets in images — use Docker secrets or env vars at runtime
- Scan images for vulnerabilities: `docker scout` or Trivy
- Set read-only root filesystem when possible: `read_only: true`
- Avoid `--privileged` mode

## Performance
- Leverage layer caching: copy dependency files first, then source
- Use `npm ci` over `npm install` for reproducible builds
- Keep images small: <200MB for Node apps, <50MB for Go
- Use `DOCKER_BUILDKIT=1` for faster builds

## Common Anti-Patterns
- ❌ Installing dev dependencies in production image
- ❌ Using `:latest` tag (non-reproducible)
- ❌ Storing secrets in environment variables in the Dockerfile
- ❌ Single giant Dockerfile — split into stages
- ❌ No healthcheck on dependent services
