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
    },
    {
      name: 'a D1 project',
      addOns: 'd1',
      hosting: { d1: 'DB', r2: null },
      hasDatabase: true,
      hasAuthentication: false,
    },
    {
      name: 'an R2 project',
      addOns: 'r2',
      hosting: { d1: null, r2: 'FILES' },
      hasDatabase: false,
      hasAuthentication: false,
    },
    {
      name: 'a project with D1 and R2',
      addOns: 'd1,r2',
      hosting: { d1: 'DB', r2: 'FILES' },
      hasDatabase: true,
      hasAuthentication: false,
    },
    {
      name: 'an authentication project',
      addOns: 'auth',
      hosting: { d1: null, r2: null },
      hasDatabase: false,
      hasAuthentication: true,
    },
    {
      name: 'a project with D1, R2, and authentication',
      addOns: 'd1,r2,auth',
      hosting: { d1: 'DB', r2: 'FILES' },
      hasDatabase: true,
      hasAuthentication: true,
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
    expect(
      projectPackage.devDependencies?.['@cloudflare/workers-types'],
    ).toEqual(expect.any(String));

    const pluginVersion =
      projectPackage.dependencies?.['@openai/sites-vite-plugin'] ??
      projectPackage.devDependencies?.['@openai/sites-vite-plugin'];
    expect(pluginVersion).toEqual(expect.any(String));
    expect(pluginVersion).not.toMatch(/^(?:workspace|file|link):/);

    const viteConfig = await readFile(join(project, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/from\s+['"]@openai\/sites-vite-plugin['"]/);
    expect(viteConfig).toContain("main: 'vinext/server/app-router-entry'");
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

    const [page, layout] = await Promise.all([
      readFile(join(project, 'app', 'page.tsx'), 'utf8'),
      readFile(join(project, 'app', 'layout.tsx'), 'utf8'),
    ]);
    expect(page).toContain('Building your site');
    expect(page).toContain('Your site is taking shape');
    expect(page).toContain('role="status"');
    expect(page).not.toContain('react-loading-skeleton');
    expect(layout).toContain("title: 'Create Sites App'");
    expect(layout).toContain("description: 'Generated by create-sites'");
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
      'd1,r2,auth',
    ]);
    const second = runCli(secondWorkspace, [
      'example-site',
      '--yes',
      '--add-ons',
      'auth,r2,d1',
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
        ]);
      } else {
        expect(result.stdout).toContain('d1');
        expect(result.stdout).toContain('r2');
        expect(result.stdout).toContain('auth');
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
