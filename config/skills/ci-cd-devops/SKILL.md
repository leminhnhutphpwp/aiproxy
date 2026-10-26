# CI/CD & DevOps Pipelines

## Pipeline Design Principles
- One pipeline per deployable artifact (microservice, frontend, library)
- Fail fast: lint and type check first, then test, then build, then deploy
- Stages should be independent and cacheable
- Every merge to main should be deployable — trunk-based development
- Pipeline time target: lint+typecheck <2min, test suite <5min, build <3min, deploy <1min

## GitHub Actions Structure
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage

  deploy:
    needs: [quality]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: ./deploy.sh
```
- Cache dependencies: `actions/setup-node` with `cache: 'npm'`
- Use matrix builds for multi-version or multi-platform testing
- Never commit secrets to workflow files — use GitHub Secrets

## Testing in CI
- Run unit tests and integration tests in PR CI
- Run E2E tests separately (slower, flakier) — nightly or on demand
- Parallelize test execution: `jest --maxWorkers=4`, `vitest --pool=forks`
- Use service containers for database-dependent tests
- Publish code coverage reports and fail if coverage drops below threshold

## Deployment Strategies
- **Blue-Green**: Two identical environments, switch traffic atomically
- **Canary**: Route 5% traffic to new version, monitor, ramp up gradually
- **Rolling update**: Replace instances one by one with zero downtime
- **Feature flags**: Deploy code disabled behind flag, enable incrementally

## Environment Management
- Dev/staging/prod: use separate environments, never share databases
- Infrastructure as Code (Terraform, Pulumi) — never manual server config
- Environment variables for config: 12-factor app methodology
- Secrets: use vault/Secrets Manager, inject at deploy time
- Ephemeral preview environments for each PR

## Artifact & Version Management
- Semantic versioning for libraries: `major.minor.patch`
- Git tags for releases: `v1.2.3`
- Docker image tags: `registry.example.com/app:1.2.3` (specific), `registry.example.com/app:latest` (promoted after verification)
- Store build artifacts: Docker registry, npm registry, S3/Blob storage

## Monitoring & Rollback
- Health check endpoint: `/health` with dependency status
- Smoke tests after deploy: validate critical endpoints respond correctly
- Rollback on: 5xx spike >5%, latency increase >50%, error rate >1%
- Automatic rollback: if smoke tests fail, revert to previous version
- Monitor: application metrics (Prometheus), logs (structured JSON), traces (OpenTelemetry)

## Anti-Patterns
- ❌ Deploying on Friday afternoon
- ❌ Manual deployment steps (documented in README)
- ❌ Building artifacts in CD pipeline instead of CI
- ❌ Different build processes across environments
- ❌ Deploying without health checks or smoke tests
