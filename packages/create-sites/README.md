# `@openai/create-sites`

Create ChatGPT Sites projects.

```bash
npm create @openai/sites@latest my-site

npm create @openai/sites@latest my-site -- --yes --add-ons d1,r2

pnpm create @openai/sites@latest my-site --yes --add-ons d1,r2
```

Use `--yes` for noninteractive generation. Dependencies are not installed by
default; pass `--install` to install them. The `d1` add-on adds a D1 binding and
Drizzle, `r2` adds an R2 binding, and `auth` adds ChatGPT authentication helpers.

```bash
npx --yes @openai/create-sites@latest . \
  --yes --add-ons d1,r2
```

The generated `.openai/hosting.json` is the source of truth for Sites bindings.
ChatGPT Sites manages deployed databases and buckets; the initializer does not
provision resources or initialize a Git repository.

## License

This package is licensed under the [MIT License](LICENSE).
