# API Documentation

## Core Principles
- **Consumer-First**: Write docs from the API consumer's perspective — what they need to integrate, not what your code does
- **Single Source of Truth**: Generate docs from spec (OpenAPI/Typedoc) rather than maintaining separate files
- **Versioned with Code**: API docs live in the same repo, same branch, and change in lockstep with the implementation

## Key Patterns
- **OpenAPI 3.1 Spec**: Define all endpoints, schemas, parameters, and responses in a single YAML/JSON file
- **JSDoc/Typedoc**: Annotate TypeScript interfaces and endpoints for auto-generated reference docs
- **Request/Response Examples**: Every endpoint needs at least one working example with real data shapes
- **Changelog-Driven Versioning**: Maintain a changelog that maps API versions to release dates and breaking changes
- **Error Reference**: Document every error code, status, shape, and recovery step

## Best Practices
- Use `$ref` for reusable schemas — avoid duplicating types across endpoints
- Document all parameters: path, query, header, body — include types, formats, and optionality
- Provide cURL, JavaScript, and Python examples for each endpoint
- Keep OpenAPI spec files linted with `spectral` or `redocly-cli`
- Tag endpoints by domain (auth, users, billing) for navigation
- Include rate limit headers and pagination details in every list response
- Mark deprecated endpoints with `deprecated: true` and a `sunset` header

## Common Pitfalls
- **Stale docs**: Auto-generate from code or spec — never hand-rewrite after changes
- **Abstract examples**: Use concrete values (real IDs, real emails) so consumers can test interactively
- **Missing error schemas**: Without documented error shapes every integration becomes guesswork
- **Ignoring auth docs**: Authentication is the #1 consumer question — document flows and token expiry clearly

## Tools & Ecosystem
- **Swagger/OpenAPI**: Spec-first design with Swagger Editor or Stoplight
- **Redocly**: Lint, bundle, and preview OpenAPI specs
- **TypeDoc / JSDoc**: Generate API reference from TypeScript/JSDoc annotations
- **Scalar / RapiDoc**: Interactive API documentation viewers
- **Spectral**: OpenAPI linting with custom rulesets
