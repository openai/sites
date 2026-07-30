# OpenAI Sites (JavaScript/TypeScript)

[![CI](https://github.com/openai/sites/actions/workflows/test.yml/badge.svg)](https://github.com/openai/sites/actions/workflows/test.yml)

OpenAI Sites provides JavaScript/TypeScript tooling for building and packaging
sites hosted by OpenAI.

## Packages

- [`@openai/create-sites`](packages/create-sites): CLI for creating OpenAI Sites
  projects.
- [`@openai/sites-vite-plugin`](packages/sites-vite-plugin): Vite plugin that
  packages OpenAI Sites deployment metadata and Drizzle migrations.

## Get started

### Supported environments

- Node.js 22.13 or later
- Vite 8

### Development

This repository is a [pnpm](https://pnpm.io/) workspace.

```bash
pnpm install
pnpm check
```

The full check formats, lints, type-checks, builds, and tests every workspace
package. Plugin tests run real Vite builds against test fixtures.

Common commands:

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `pnpm build`     | Build every workspace package.           |
| `pnpm test`      | Run every workspace package's tests.     |
| `pnpm typecheck` | Type-check every workspace package.      |
| `pnpm lint`      | Lint the repository.                     |
| `pnpm format`    | Format the repository.                   |
| `pnpm check`     | Run the complete local validation suite. |

## Contributing

Keep changes focused and include contract-level tests for observable behavior.
Run `pnpm check` before opening a pull request.

## Security

To report a security issue, follow the instructions in our
[security policy](SECURITY.md).

## License

This project is licensed under the [MIT License](LICENSE).
