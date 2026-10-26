# Monorepo Patterns

## Monorepo Benefits & Trade-offs
- Shared code: types, utilities, configs across packages without publishing
- Atomic commits: changes spanning multiple packages in one commit
- Consistent tooling: one linter, one formatter, one test runner
- Trade-off: more complex CI, larger git history, trickier dependency management
- Use monorepo when you have 2-10 related packages; for >10, consider multi-repo with shared libs

## Tool Selection
| Tool | Best For | Key Features |
|------|----------|-------------|
| pnpm workspaces | Most projects | Strict dependency isolation, disk-efficient |
| Turborepo | Build orchestration | Parallel builds, remote caching, task pipelines |
| Nx | Large enterprise monorepos | Code generation, dependency graphs, affected commands |
| Lerna | Legacy monorepos | Versioning and publishing (mostly superseded by nx) |

## Workspace Structure (pnpm + Turborepo)
```
my-monorepo/
  packages/
    shared/          # types, utilities, constants
    ui/              # shared UI components
    config-eslint/   # shared ESLint config
    config-ts/       # shared tsconfig
  apps/
    web/             # Next.js frontend
    api/             # Express/Fastify backend
    docs/            # documentation site
  pnpm-workspace.yaml
  turbo.json
  package.json
```

## pnpm Workspace Configuration
```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```
- Always use `pnpm` (not npm or yarn) for monorepos — strict dependency isolation prevents phantom dependencies
- Use `pnpm exec` for workspace commands, not `npx`
- Use `pnpm -r` for recursive commands across all packages

## Turborepo Pipeline
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```
- `^build` means: wait for dependency builds to finish before building
- Use remote caching (Vercel, custom server) for team-wide cache hits
- Turborepo skips unchanged packages automatically

## Dependency Management
- Internal packages: use workspace protocol `"@myorg/ui": "workspace:*"`
- Shared devDependencies: hoist to root package.json (typescript, eslint, prettier)
- Isolated devDependencies: keep in each package for version flexibility
- Run `pnpm update -r` to update all packages consistently
- Use `pnpm` overrides for forcing consistent dependency versions

## TypeScript Configuration
- Root tsconfig with strict base settings
- Each package extends root and adds package-specific settings
- Use project references for fast incremental builds
```json
// packages/shared/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## CI Optimization
- Use Turborepo affected commands: only build/test changed packages and their dependents
- Cache `node_modules` and build outputs between CI runs
- Parallelize independent packages: Turborepo handles this automatically
- Use `--filter` for targeted operations: `pnpm --filter @myorg/api run test`

## Common Pitfalls
- ❌ Hoisting everything to root — packages become tightly coupled
- ❌ Circular dependencies between packages
- ❌ Different package versions of the same library across packages
- ❌ Building all packages every time — use affected commands
- ❌ Not using workspace protocol for internal dependencies
