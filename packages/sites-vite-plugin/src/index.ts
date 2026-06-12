import { access, cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Package OpenAI Sites metadata and optional Drizzle migrations after a Vite
 * build. This plugin is additive: it does not configure the framework build,
 * select a Cloudflare Worker entrypoint, or add a `fetch` handler.
 */
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: 'sites',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, 'dist', '.openai');
      const hostingConfig = resolve(root, '.openai', 'hosting.json');
      const drizzleSource = resolve(root, 'drizzle');

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      await cp(hostingConfig, resolve(outputDirectory, 'hosting.json'));
      if (await exists(drizzleSource)) {
        await cp(drizzleSource, resolve(outputDirectory, 'drizzle'), {
          recursive: true,
        });
      }
    },
  };
}
