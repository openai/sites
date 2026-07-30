# `@openai/create-sites`

Create OpenAI Sites projects.

```bash
npm create @openai/sites@latest my-site

npm create @openai/sites@latest my-site -- --yes --add-ons d1,r2

pnpm create @openai/sites@latest my-site --yes --add-ons d1,r2
```

Use `--yes` for noninteractive generation and `--no-install` to generate the
project without installing dependencies. The `d1` add-on adds a D1 binding and
Drizzle, `r2` adds an R2 binding, and `auth` adds ChatGPT authentication helpers.

```bash
npx --yes @openai/create-sites@latest . \
  --yes --no-install --add-ons d1,r2
```

The generated `.openai/hosting.json` is the source of truth for Sites bindings.
OpenAI Sites manages deployed databases and buckets; the initializer does not
provision resources or initialize a Git repository.

## License

This package is licensed under the [MIT License](LICENSE).
