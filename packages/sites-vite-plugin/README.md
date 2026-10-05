# `@openai/sites-vite-plugin`

Vite plugin for packaging OpenAI Sites deployment metadata.

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

The build fails when `.openai/hosting.json` is missing. The generated `.openai`
directory is replaced on every build. These paths use Vite's default `dist`
output directory; when `build.outDir` is configured, metadata is placed under
that directory instead. Relative output directories are resolved against the
Vite project root, and absolute output directories are supported.

## Local sign-in

During `vite dev`, the same `sites()` plugin provides a simulated Sign in with
ChatGPT user so authenticated Site pages can be developed locally.

- Navigate to `/signin-with-chatgpt?return_to=/` to sign in.
- Use `oai-authenticated-user-id` (`local_seedy`) as the stable user ID.
- The simulated email and display name are `seedy@sites.test` and `Seedy`.
- Navigate to `/signout-with-chatgpt?return_to=/` to sign out.
- The mock identity is stable across local sessions and dev-server restarts.
- Production builds do not include simulated users or local sessions.

## License

This package is licensed under the [MIT License](LICENSE).
