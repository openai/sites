import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const executable = join(import.meta.dirname, '..', 'dist', 'index.js');
const workspaces: string[] = [];

type GeneratedPackage = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

async function createWorkspace(): Promise<string> {
  const workspace = await realpath(
    await mkdtemp(join(tmpdir(), 'create-sites-')),
  );
  workspaces.push(workspace);
  return workspace;
}

function runCli(workspace: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 20_000,
  });

  if (result.error) throw result.error;
  return result;
}

async function readPackage(project: string): Promise<GeneratedPackage> {
  const contents: GeneratedPackage = JSON.parse(
    await readFile(join(project, 'package.json'), 'utf8'),
  );
  return contents;
}

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((workspace) => rm(workspace, { recursive: true, force: true })),
  );
});

describe('create-sites', () => {
  test.each([
    {
      name: 'the base project',
      addOns: undefined,
      hosting: { d1: null, r2: null },
      hasDatabase: false,
      hasAuthentication: false,
      hasShadcn: false,
    },
    {
      name: 'a D1 project',
      addOns: 'd1',
      hosting: { d1: 'DB', r2: null },
      hasDatabase: true,
      hasAuthentication: false,
      hasShadcn: false,
    },
    {
      name: 'an R2 project',
      addOns: 'r2',
      hosting: { d1: null, r2: 'FILES' },
      hasDatabase: false,
      hasAuthentication: false,
      hasShadcn: false,
    },
    {
      name: 'a project with D1 and R2',
      addOns: 'd1,r2',
      hosting: { d1: 'DB', r2: 'FILES' },
      hasDatabase: true,
      hasAuthentication: false,
      hasShadcn: false,
    },
    {
      name: 'an authentication project',
      addOns: 'auth',
      hosting: { d1: null, r2: null },
      hasDatabase: false,
      hasAuthentication: true,
      hasShadcn: false,
    },
    {
      name: 'a shadcn project',
      addOns: 'shadcn',
      hosting: { d1: null, r2: null },
      hasDatabase: false,
      hasAuthentication: false,
      hasShadcn: true,
    },
    {
      name: 'a project with every add-on',
      addOns: 'd1,r2,auth,shadcn',
      hosting: { d1: 'DB', r2: 'FILES' },
      hasDatabase: true,
      hasAuthentication: true,
      hasShadcn: true,
    },
  ])('creates $name without installing dependencies', async (scenario) => {
    const workspace = await createWorkspace();
    const args = ['example-site', '--yes'];
    if (scenario.addOns) args.push('--add-ons', scenario.addOns);

    const result = runCli(workspace, args);
    expect(result.status, result.stderr).toBe(0);

    const project = join(workspace, 'example-site');
    const hosting: unknown = JSON.parse(
      await readFile(join(project, '.openai', 'hosting.json'), 'utf8'),
    );
    expect(hosting).toEqual(scenario.hosting);

    const projectPackage = await readPackage(project);
    expect(projectPackage.name).toBe('sites-project');
    expect(projectPackage.scripts?.start).toBe(
      'wrangler dev --config dist/server/wrangler.json',
    );
    expect(projectPackage.dependencies?.next).toBeUndefined();
    expect(
      projectPackage.devDependencies?.['@cloudflare/workers-types'],
    ).toEqual(expect.any(String));
    expect(projectPackage.dependencies?.vinext).toEqual(expect.any(String));
    expect(projectPackage.dependencies?.['react-server-dom-webpack']).toEqual(
      expect.any(String),
    );
    expect(projectPackage.devDependencies?.vinext).toBeUndefined();
    expect(
      projectPackage.devDependencies?.['react-server-dom-webpack'],
    ).toBeUndefined();

    const pluginVersion =
      projectPackage.dependencies?.['@openai/sites-vite-plugin'] ??
      projectPackage.devDependencies?.['@openai/sites-vite-plugin'];
    expect(pluginVersion).toEqual(expect.any(String));
    expect(pluginVersion).toMatch(
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    );

    const tsconfig = await readFile(join(project, 'tsconfig.json'), 'utf8');
    expect(tsconfig).toContain('"vinext/types"');
    expect(tsconfig).not.toContain('"name": "next"');

    const viteConfig = await readFile(join(project, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/from\s+['"]@openai\/sites-vite-plugin['"]/);
    expect(viteConfig).toContain("main: 'vinext/server/fetch-handler'");
    await expect(
      access(join(project, 'worker', 'index.ts')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      access(join(project, 'sites-vite-plugin')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(join(project, 'node_modules'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const authentication = access(join(project, 'app', 'chatgpt-auth.ts'));
    if (scenario.hasAuthentication) {
      await expect(authentication).resolves.toBeUndefined();
    } else {
      await expect(authentication).rejects.toMatchObject({ code: 'ENOENT' });
    }

    const objectStorageTypes = access(join(project, 'env.d.ts'));
    if (scenario.hosting.r2) {
      await expect(objectStorageTypes).resolves.toBeUndefined();
    } else {
      await expect(objectStorageTypes).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }

    if (scenario.hasDatabase) {
      expect(projectPackage.dependencies?.['drizzle-orm']).toEqual(
        expect.any(String),
      );
      expect(projectPackage.devDependencies?.['drizzle-kit']).toEqual(
        expect.any(String),
      );
      expect(projectPackage.scripts?.['db:generate']).toEqual(
        expect.any(String),
      );

      await expect(
        access(join(project, 'db', 'index.ts')),
      ).resolves.toBeUndefined();
      await expect(
        access(join(project, 'db', 'schema.ts')),
      ).resolves.toBeUndefined();
      await expect(
        access(join(project, 'drizzle.config.ts')),
      ).resolves.toBeUndefined();
    } else {
      expect(projectPackage.dependencies?.['drizzle-orm']).toBeUndefined();
      expect(projectPackage.devDependencies?.['drizzle-kit']).toBeUndefined();
      expect(projectPackage.scripts?.['db:generate']).toBeUndefined();

      await expect(access(join(project, 'db'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        access(join(project, 'drizzle.config.ts')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    }

    const shadcnDependencies = [
      '@base-ui/react',
      '@shadcn/react',
      'class-variance-authority',
      'clsx',
      'cmdk',
      'date-fns',
      'embla-carousel-react',
      'input-otp',
      'lucide-react',
      'react-day-picker',
      'react-resizable-panels',
      'recharts',
      'shadcn',
      'tailwind-merge',
      'tw-animate-css',
    ];
    const shadcnComponents = [
      'accordion',
      'alert',
      'alert-dialog',
      'aspect-ratio',
      'attachment',
      'avatar',
      'badge',
      'breadcrumb',
      'bubble',
      'button',
      'button-group',
      'calendar',
      'card',
      'carousel',
      'chart',
      'checkbox',
      'collapsible',
      'combobox',
      'command',
      'context-menu',
      'dialog',
      'direction',
      'drawer',
      'dropdown-menu',
      'empty',
      'field',
      'hover-card',
      'input',
      'input-group',
      'input-otp',
      'item',
      'kbd',
      'label',
      'marker',
      'menubar',
      'message',
      'message-scroller',
      'native-select',
      'navigation-menu',
      'pagination',
      'popover',
      'progress',
      'radio-group',
      'resizable',
      'scroll-area',
      'select',
      'separator',
      'sheet',
      'sidebar',
      'skeleton',
      'slider',
      'spinner',
      'switch',
      'table',
      'tabs',
      'textarea',
      'toast',
      'toggle',
      'toggle-group',
      'tooltip',
    ];
    // The complete shadcn registry has 61 entries. `form` is a compatibility
    // entry without a source file, leaving 60 files in components/ui.
    expect(shadcnComponents).toHaveLength(60);
    const globals = await readFile(join(project, 'app', 'globals.css'), 'utf8');

    if (scenario.hasShadcn) {
      for (const dependency of shadcnDependencies) {
        expect(projectPackage.dependencies?.[dependency]).toEqual(
          expect.any(String),
        );
      }
      expect(projectPackage.scripts?.['ui:add']).toBeUndefined();
      await expect(
        access(join(project, 'components.json')),
      ).resolves.toBeUndefined();
      await expect(
        access(join(project, 'lib', 'utils.ts')),
      ).resolves.toBeUndefined();
      await expect(
        access(join(project, 'hooks', 'use-mobile.ts')),
      ).resolves.toBeUndefined();
      for (const component of shadcnComponents) {
        await expect(
          access(join(project, 'components', 'ui', `${component}.tsx`)),
        ).resolves.toBeUndefined();
      }
      const generatedComponents = (
        await readdir(join(project, 'components', 'ui'))
      )
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => file.slice(0, -'.tsx'.length))
        .sort();
      expect(generatedComponents).toEqual([...shadcnComponents].sort());
      expect(globals).toContain("@import 'shadcn/tailwind.css'");
      expect(globals).toContain('--color-primary: var(--primary)');
    } else {
      for (const dependency of shadcnDependencies) {
        expect(projectPackage.dependencies?.[dependency]).toBeUndefined();
      }
      expect(projectPackage.scripts?.['ui:add']).toBeUndefined();
      await expect(
        access(join(project, 'components.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(access(join(project, 'components'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(globals).not.toContain('shadcn/tailwind.css');
    }
  });

  test('creates a minimal starter without bundled previews or tests', async () => {
    const workspace = await createWorkspace();
    const result = runCli(workspace, ['example-site', '--yes']);

    expect(result.status, result.stderr).toBe(0);

    const project = join(workspace, 'example-site');
    const projectPackage = await readPackage(project);
    expect(
      projectPackage.dependencies?.['react-loading-skeleton'],
    ).toBeUndefined();
    expect(projectPackage.scripts?.test).toBeUndefined();
    expect(projectPackage.scripts).toMatchObject({
      lint: 'oxlint',
      format: 'oxfmt',
    });
    expect(projectPackage.scripts?.['format:check']).toBeUndefined();
    expect(projectPackage.devDependencies).toMatchObject({
      oxfmt: expect.any(String),
      oxlint: expect.any(String),
      'oxlint-tsgolint': expect.any(String),
    });
    expect(projectPackage.devDependencies?.eslint).toBeUndefined();
    expect(
      projectPackage.devDependencies?.['eslint-config-next'],
    ).toBeUndefined();

    const oxlintConfig = await readFile(
      join(project, '.oxlintrc.json'),
      'utf8',
    );
    expect(oxlintConfig).toContain('"nextjs"');
    expect(oxlintConfig).toContain('"typeAware": true');
    expect(oxlintConfig).toContain('"typeCheck": true');
    await expect(
      access(join(project, '.oxfmtrc.json')),
    ).resolves.toBeUndefined();
    await expect(
      access(join(project, 'eslint.config.mjs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const [page, layout] = await Promise.all([
      readFile(join(project, 'app', 'page.tsx'), 'utf8'),
      readFile(join(project, 'app', 'layout.tsx'), 'utf8'),
    ]);
    expect(page).toContain('Building your site');
    expect(page).toContain('Your site is taking shape');
    expect(page).toContain('<output');
    expect(page).not.toContain('react-loading-skeleton');
    expect(layout).toContain("title: 'Untitled site'");
    expect(layout).not.toContain('Generated by create-sites');
    expect(page).not.toContain('codex-preview');

    for (const path of ['app/_sites-preview', 'tests', 'postcss.config.mjs']) {
      await expect(access(join(project, path))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  });

  test('generates identical output for either add-on order', async () => {
    const firstWorkspace = await createWorkspace();
    const secondWorkspace = await createWorkspace();

    const first = runCli(firstWorkspace, [
      'example-site',
      '--yes',
      '--add-ons',
      'd1,r2,auth,shadcn',
    ]);
    const second = runCli(secondWorkspace, [
      'example-site',
      '--yes',
      '--add-ons',
      'shadcn,auth,r2,d1',
    ]);

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);

    for (const relativePath of [
      'package.json',
      '.openai/hosting.json',
      'vite.config.ts',
      'db/index.ts',
      'db/schema.ts',
      'drizzle.config.ts',
      'app/chatgpt-auth.ts',
      'components.json',
      'app/globals.css',
      'lib/utils.ts',
      'components/ui/button.tsx',
      'components/ui/dialog.tsx',
    ]) {
      expect(
        await readFile(join(firstWorkspace, 'example-site', relativePath)),
      ).toEqual(
        await readFile(join(secondWorkspace, 'example-site', relativePath)),
      );
    }
  });

  test.each(['npm', 'pnpm', 'yarn', 'bun'])(
    'supports selecting %s explicitly',
    async (manager) => {
      const workspace = await createWorkspace();
      const result = runCli(workspace, [
        'example-site',
        '--yes',
        '--no-install',
        '--package-manager',
        manager,
      ]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`${manager} install`);
      expect(result.stdout).toContain(`${manager} run dev`);
    },
  );

  test.each(['npm', 'pnpm', 'yarn', 'bun'])(
    'detects %s from its package-manager user agent',
    async (manager) => {
      const workspace = await createWorkspace();
      const result = runCli(workspace, ['example-site', '--yes'], {
        npm_config_user_agent: `${manager}/1.0.0`,
        NPM_CONFIG_USER_AGENT: `${manager}/1.0.0`,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`${manager} install`);
      expect(result.stdout).toContain(`${manager} run dev`);
    },
  );

  test.skipIf(process.platform === 'win32')(
    'rejects a package installation terminated by a signal',
    async () => {
      const workspace = await createWorkspace();
      const executables = join(workspace, 'node_modules', '.bin');
      await mkdir(executables, { recursive: true });
      await writeFile(join(executables, 'npm'), '#!/bin/sh\nkill -TERM $$\n', {
        mode: 0o755,
      });

      const result = runCli(workspace, [
        'example-site',
        '--yes',
        '--install',
        '--package-manager',
        'npm',
      ]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('npm install was interrupted.');
      expect(result.stdout).not.toContain('Created Sites project');
    },
  );

  test('prints the supported command-line options without creating files', async () => {
    const workspace = await createWorkspace();
    const result = runCli(workspace, ['--help']);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Usage: create-sites');
    expect(result.stdout).toContain('--add-ons');
    expect(result.stdout).toContain('Comma-separated add-ons');
    expect(result.stdout).not.toContain('d1,r2,auth');
    expect(result.stdout).toContain('--yes');
    expect(result.stdout).toContain('--package-manager');
    expect(result.stdout).toContain('--list-add-ons');
    expect(result.stdout).toContain('--json');
    expect(await readdir(workspace)).toEqual([]);
  });

  test.each([
    { name: 'text', args: ['--list-add-ons'], json: false },
    { name: 'JSON', args: ['--list-add-ons', '--json'], json: true },
  ])(
    'lists available add-ons as $name without creating files',
    async (format) => {
      const workspace = await createWorkspace();
      const result = runCli(workspace, format.args);

      expect(result.status, result.stderr).toBe(0);
      if (format.json) {
        expect(JSON.parse(result.stdout)).toEqual([
          {
            name: 'd1',
            description: 'Add a Cloudflare D1 database and Drizzle.',
          },
          {
            name: 'r2',
            description: 'Add a Cloudflare R2 object storage binding.',
          },
          { name: 'auth', description: 'Add ChatGPT authentication helpers.' },
          {
            name: 'shadcn',
            description: 'Add shadcn/ui with its complete component set.',
          },
        ]);
      } else {
        expect(result.stdout).toContain('d1');
        expect(result.stdout).toContain('r2');
        expect(result.stdout).toContain('auth');
        expect(result.stdout).toContain('shadcn');
      }
      expect(await readdir(workspace)).toEqual([]);
    },
  );

  test.each([
    {
      name: 'an unknown command-line option',
      args: ['example-site', '--yes', '--unsupported-option'],
    },
    {
      name: 'an unsupported package manager',
      args: ['example-site', '--yes', '--package-manager', 'unsupported'],
    },
    {
      name: 'JSON output without an add-on list',
      args: ['--json'],
    },
  ])('rejects $name before creating files', async ({ args }) => {
    const workspace = await createWorkspace();
    const result = runCli(workspace, args);

    expect(result.status).not.toBe(0);
    expect(await readdir(workspace)).toEqual([]);
  });

  test('rejects unknown add-ons before creating any project files', async () => {
    const workspace = await createWorkspace();
    const result = runCli(workspace, [
      'example-site',
      '--yes',
      '--add-ons',
      'd1,unknown,r2',
    ]);

    expect(result.status).not.toBe(0);
    expect(await readdir(workspace)).toEqual([]);
  });

  test.each([
    { entry: 'existing.txt', contents: 'keep this file\n' },
    { entry: 'package.json', contents: '{"name":"existing"}\n' },
  ])(
    'rejects an existing $entry without changing it',
    async ({ entry, contents }) => {
      const workspace = await createWorkspace();
      const project = join(workspace, 'example-site');
      await mkdir(project);
      await writeFile(join(project, entry), contents);

      const result = runCli(workspace, ['example-site', '--yes']);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(entry);
      expect(await readdir(project)).toEqual([entry]);
      await expect(readFile(join(project, entry), 'utf8')).resolves.toBe(
        contents,
      );
    },
  );

  test('limits existing filenames in errors', async () => {
    const workspace = await createWorkspace();
    const project = join(workspace, 'example-site');
    await mkdir(project);

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        writeFile(join(project, `file-${index}`), ''),
      ),
    );

    const result = runCli(workspace, ['example-site', '--yes']);

    expect(result.status).not.toBe(0);
    expect(result.stderr.trim().split('\n')).toHaveLength(1);
    expect(result.stderr).toMatch(/"file-\d"/);
    expect(result.stderr).toContain('and 2 more');
  });

  test.skipIf(process.platform === 'win32')(
    'escapes existing filenames containing control characters',
    async () => {
      const workspace = await createWorkspace();
      const project = join(workspace, 'example-site');
      await mkdir(project);
      await writeFile(join(project, 'file\nINJECTED'), '');

      const result = runCli(workspace, ['example-site', '--yes']);

      expect(result.status).not.toBe(0);
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).toContain('"file\\nINJECTED"');
    },
  );

  test('shell-quotes suggested project directories', async () => {
    const workspace = await createWorkspace();
    const directory = "site'$(touch COMPROMISED)";
    const result = runCli(workspace, [directory, '--yes']);

    expect(result.status, result.stderr).toBe(0);
    const expectedCommand =
      process.platform === 'win32'
        ? `cd "${directory}"`
        : "cd 'site'\\''$(touch COMPROMISED)'";
    expect(result.stdout).toContain(expectedCommand);
    await expect(access(join(workspace, 'COMPROMISED'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('preserves existing Git and system metadata', async () => {
    const workspace = await createWorkspace();
    const project = join(workspace, 'example-site');

    await mkdir(join(project, '.git'), { recursive: true });
    await writeFile(join(project, '.git', 'config'), 'existing git config\n');
    await writeFile(join(project, '.DS_Store'), 'existing system metadata\n');

    const result = runCli(workspace, ['example-site', '--yes']);

    expect(result.status, result.stderr).toBe(0);
    await expect(
      readFile(join(project, '.git', 'config'), 'utf8'),
    ).resolves.toBe('existing git config\n');
    await expect(readFile(join(project, '.DS_Store'), 'utf8')).resolves.toBe(
      'existing system metadata\n',
    );
    expect(await readPackage(project)).toMatchObject({ name: 'sites-project' });
  });

  test.each(['work', 'outputs'])(
    'rejects an existing %s directory without changing its contents',
    async (entry) => {
      const workspace = await createWorkspace();
      const project = join(workspace, 'example-site');
      await mkdir(join(project, entry), { recursive: true });
      await writeFile(join(project, entry, 'keep.txt'), 'keep this file\n');

      const result = runCli(workspace, ['example-site', '--yes']);

      expect(result.status).not.toBe(0);
      expect(await readdir(project)).toEqual([entry]);
      await expect(
        readFile(join(project, entry, 'keep.txt'), 'utf8'),
      ).resolves.toBe('keep this file\n');
    },
  );

  test('renames the packaged gitignore template', async () => {
    const workspace = await createWorkspace();
    const result = runCli(workspace, ['example-site', '--yes']);

    expect(result.status, result.stderr).toBe(0);

    const project = join(workspace, 'example-site');
    await expect(
      readFile(join(project, '.gitignore'), 'utf8'),
    ).resolves.toMatch(/\S/);
    await expect(access(join(project, '_gitignore'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test.each([
    { name: 'an explicit current directory', args: ['.', '--yes'] },
    { name: 'the default current directory', args: ['--yes'] },
  ])('uses $name without rewriting the package name', async ({ args }) => {
    const workspace = await createWorkspace();
    const result = runCli(workspace, args);

    expect(result.status, result.stderr).toBe(0);
    expect(await readPackage(workspace)).toMatchObject({
      name: 'sites-project',
    });

    const hosting: unknown = JSON.parse(
      await readFile(join(workspace, '.openai', 'hosting.json'), 'utf8'),
    );
    expect(hosting).toEqual({ d1: null, r2: null });
  });
});
