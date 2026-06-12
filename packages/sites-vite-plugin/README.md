# `@openai/sites-vite-plugin`

Vite plugin for packaging OpenAI Sites deployment metadata.

`sites()` is additive. It copies Sites metadata and optional Drizzle migrations
after the existing Vite build finishes. It does not configure a framework,
select a Cloudflare Worker entrypoint, or add a Worker `fetch` handler. Keep the
framework and Cloudflare plugins that produce the deployable Worker output.

Add `sites()` to the existing `plugins` array. For example, a Vinext site must
preserve its Cloudflare Worker configuration and add `sites()` alongside it:

```ts
import { cloudflare } from '@cloudflare/vite-plugin';
import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';
import vinext from 'vinext';

export default defineConfig({
  plugins: [
    vinext(),
    sites(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      config: {
        main: './worker/index.ts',
        compatibility_flags: ['nodejs_compat'],
        // Keep the site's existing Worker bindings here.
      },
    }),
  ],
});
```

The referenced `worker/index.ts` must remain a Cloudflare module Worker entry,
for example a default export with an async `fetch(request, env, ctx)` method.

During a production build, the plugin copies Sites project files into the
deployment artifact:

- Required: `.openai/hosting.json` to `dist/.openai/hosting.json`
- Optional: `drizzle/**` to `dist/.openai/drizzle/**`

The build fails when `.openai/hosting.json` is missing. The generated
`dist/.openai` directory is replaced on every build. V1 assumes Vite's default
`dist` output directory and does not expose configuration.

## License

This package is licensed under the [MIT License](LICENSE).
