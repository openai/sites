# `@openai/sites-vite-plugin`

Private Vite plugin for packaging OpenAI Sites deployment metadata.

```ts
import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sites()],
});
```

During a production build, the plugin copies Sites project files into the
deployment artifact:

- Required: `.openai/hosting.json` to `dist/.openai/hosting.json`
- Optional: `drizzle/**` to `dist/.openai/drizzle/**`

The build fails when `.openai/hosting.json` is missing. The generated
`dist/.openai` directory is replaced on every build. V1 assumes Vite's default
`dist` output directory and does not expose configuration.
