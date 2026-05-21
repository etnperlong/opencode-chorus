# Contributing

Thank you for your interest in contributing to opencode-chorus.

## Prerequisites

- [Bun](https://bun.sh) >= 1.1.0
- Node.js >= 22 (for CI parity)

## Getting Started

```bash
git clone https://github.com/etnperlong/opencode-chorus.git
cd opencode-chorus
bun install
```

## Development Workflow

### Available Scripts

| Script | Description |
|---|---|
| `bun run typecheck` | Typecheck `src/` and `test/` without emitting |
| `bun run test` | Run all tests with Bun's test runner |
| `bun run build` | Compile `src/` to `dist/` via `tsconfig.build.json` |
| `bun run clean` | Remove `dist/` |
| `bun run pack:check` | Dry-run `npm pack` to verify package contents |

### Running a Single Test File

```bash
bun test test/unit/config-loader.test.ts
```

### CI Verification Order

CI runs these checks in order. Please ensure all pass before submitting a PR:

1. `bun run typecheck`
2. `bun run test`
3. `bun run build`

## Code Conventions

### TypeScript

- The package is ESM (`"type": "module"`).
- Strict mode is enabled. `noUncheckedIndexedAccess` and `noImplicitOverride` are also on.
- Module resolution is `bundler`. Keep local imports extensionless in source code.
- `tsconfig.json` typechecks both `src/**/*.ts` and `test/**/*.ts` (no emit).
- `tsconfig.build.json` builds only `src/**/*.ts` with declarations.

### Imports

- Use `node:` prefix for Node.js built-in modules (e.g., `import { readFile } from "node:fs/promises"`).
- Keep local source imports extensionless (e.g., `import { loadChorusConfig } from "./config/config-loader"`).

### No Linter or Formatter

This repository does not have a linter or formatter configured. Do not add one as part of a contribution. Follow the existing code style by example.

## Writing Tests

- Tests use Bun's built-in test runner (`bun:test`).
- Tests live in `test/unit/` and `test/integration/`. Some test files are colocated next to their source in `src/` (e.g., `src/hooks/tool-execute-after-hook.test.ts`).
- Tests use temp directories and mocks; a live Chorus server is not required.
- Clean up temp resources in `finally` blocks.

### Contract Tests

Certain test files guard package-level contracts:

- `test/unit/skill-metadata.test.ts` — asserts bundled skill names, frontmatter, metadata, and sentinel content. Update this when changing skills.
- `test/unit/package-manifest.test.ts` — asserts package exports, files, scripts, engines, and build output. Update this when changing `package.json` or build config.

## Project Structure

```
src/
  index.ts              # Plugin entrypoint (createPlugin, ChorusPlugin)
  config/               # Config loading, schema, defaults
  state/                # StateStore, paths, migrations
  hooks/                # OpenCode lifecycle and tool execution hooks
  lifecycle/            # Session, reviewer, worker, and planning lifecycle
  notifications/        # SSE listener, notification routing and dispatch
  reviewers/            # Review agents, parsers, output formatting
  tools/                # Lazy bridge tools, workspace context tool
  planning/             # Planning rules and tool hooks
  openspec/             # OpenSpec detection and CLI helpers
  util/                 # Logger, error utils, package resource paths
  chorus/               # MCP client, types, tool scope
test/
  unit/                 # Unit tests
  integration/          # Integration tests
skills/                 # Bundled workflow skills (shipped in npm package)
prompts/                # Reviewer agent prompts (shipped in npm package)
docs/                   # Documentation
```

## Reviewer Verdicts

Reviewer agents produce verdicts in a strict format. If you change reviewer logic, ensure the output still contains one of these exact lines:

```
VERDICT: PASS
VERDICT: PASS WITH NOTES
VERDICT: FAIL
```

Reviewer comments must include `Review-Job-ID: <sessionId>`.

## Submitting Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes following the conventions above.
3. Ensure `bun run typecheck`, `bun run test`, and `bun run build` all pass.
4. Open a pull request with a clear description of what changed and why.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](./LICENSE).
