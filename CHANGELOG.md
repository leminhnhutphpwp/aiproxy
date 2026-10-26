# Changelog

## 1.0.0 — 2026-10-26

First public release.

### Security

- Client auth on `/v1/*` now fails closed. Basic auth is refused with `401` while
  `OPENCODE_USERNAME` or `OPENCODE_PASSWORD` is empty. Before, any Basic credentials were accepted
  in that state. Credentials are compared in constant time.
- Dashboard login is refused with `503` until both `DASHBOARD_USER` and `DASHBOARD_PASS` are set,
  so an empty password can no longer match.

### Fixed

- `npm test` no longer hangs after the last test: the specialized-session cleanup timer no longer
  keeps the process alive.
- The direct-provider routing test no longer depends on provider keys in the environment.

### Added

- GitHub Actions workflow running a syntax check and the test suite on Node 20 and 22.
- Tests for client authentication.
