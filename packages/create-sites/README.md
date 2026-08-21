# `@openai/create-sites`

Create ChatGPT Sites projects.

```bash
npm create @openai/sites@latest my-site

npm create @openai/sites@latest my-site -- --yes --add-ons d1,r2,shadcn

pnpm create @openai/sites@latest my-site --yes --add-ons d1,r2,shadcn
```

Use `--yes` for noninteractive generation. Dependencies are not installed by
default; pass `--install` to install them. The `d1` add-on adds a D1 binding and
Drizzle, `r2` adds an R2 binding, `auth` adds ChatGPT authentication helpers,
and `shadcn` adds shadcn/ui with its complete component set.

The `shadcn` add-on uses the Base UI Nova preset with neutral colors, Geist,
Lucide icons, and CSS variables. It includes all 61 entries available through
`shadcn add --all`: 60 component source files plus the fileless `form`
compatibility entry.

```bash
npx --yes @openai/create-sites@latest . \
  --yes --add-ons d1,r2,shadcn
```

The generated `.openai/hosting.json` is the source of truth for Sites bindings.
ChatGPT Sites manages deployed databases and buckets; the initializer does not
provision resources or initialize a Git repository.

## License

This package is licensed under the [MIT License](LICENSE).
