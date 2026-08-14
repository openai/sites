# `@openai/create-sites`

Create ChatGPT Sites projects.

```bash
npm create @openai/sites@latest my-site

npm create @openai/sites@latest my-site -- --yes --add-ons d1,r2

npm create @openai/sites@latest my-site -- --template static-default

pnpm create @openai/sites@latest my-site --yes --add-ons d1,r2
```

The default `fullstack-default` template is the Vinext application starter. Use
`--yes` for noninteractive generation. Dependencies are not installed by
default; pass `--install` to install them. The `d1` add-on adds a D1 binding and
Drizzle, `r2` adds an R2 binding, and `auth` adds ChatGPT authentication helpers.

The `static-default` template creates ordinary files under `public`: HTML, CSS,
JavaScript, and an asset. The generated project has no `package.json`, runtime
dependencies, installation, framework compilation, or Worker entry point.
Static projects do not support add-ons; choose `fullstack-default` when a site
needs authentication, D1, R2, or server-side code.

Use `static-default` conservatively for a new, public, one-route site with
simple content or browser-local interaction. Choose `fullstack-default` for
authentication, secrets or connectors, shared or durable state, uploads,
server APIs, or a required component ecosystem. When the requested capability
is ambiguous, use `fullstack-default`.

```bash
npx --yes @openai/create-sites@latest . \
  --yes --add-ons d1,r2
```

The generated `.openai/hosting.json` is the source of truth for the hosting
runtime and Sites bindings. ChatGPT Sites manages deployed databases and
buckets; the initializer does not provision resources or initialize a Git
repository.

## License

This package is licensed under the [MIT License](LICENSE).
