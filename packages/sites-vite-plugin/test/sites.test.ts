import {
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
import { build } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

const projects: string[] = [];
const configFile = join(
  import.meta.dirname,
  'fixtures',
  'basic',
  'vite.config.ts',
);

async function createProject(): Promise<string> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'sites-vite-plugin-')),
  );
  projects.push(root);
  await writeFile(join(root, 'index.html'), '<h1>Sites</h1>');
  return root;
}

async function buildProject(root: string): Promise<void> {
  await build({
    root,
    configFile,
    logLevel: 'silent',
  });
}

afterEach(async () => {
  await Promise.all(
    projects.splice(0).map((project) => rm(project, { recursive: true })),
  );
});

describe('sites', () => {
  test('returns a build-only Vite plugin', () => {
    expect(sites()).toMatchObject({ name: 'sites', apply: 'build' });
  });

  test('packages hosting configuration and Drizzle migrations', async () => {
    const root = await createProject();
    await mkdir(join(root, '.openai'));
    await writeFile(
      join(root, '.openai', 'hosting.json'),
      '{"d1":"DATABASE"}\n',
    );
    await mkdir(join(root, 'drizzle', 'meta'), { recursive: true });
    await writeFile(
      join(root, 'drizzle', '0000_initial.sql'),
      'CREATE TABLE example;\n',
    );
    await writeFile(join(root, 'drizzle', 'meta', '_journal.json'), '{}\n');

    await buildProject(root);

    await expect(
      readFile(join(root, 'dist', '.openai', 'hosting.json'), 'utf8'),
    ).resolves.toBe('{"d1":"DATABASE"}\n');
    await expect(
      readFile(
        join(root, 'dist', '.openai', 'drizzle', '0000_initial.sql'),
        'utf8',
      ),
    ).resolves.toBe('CREATE TABLE example;\n');
    await expect(
      readFile(
        join(root, 'dist', '.openai', 'drizzle', 'meta', '_journal.json'),
        'utf8',
      ),
    ).resolves.toBe('{}\n');
  });

  test('removes stale Drizzle sidecars when migrations disappear', async () => {
    const root = await createProject();
    await mkdir(join(root, '.openai'));
    await writeFile(join(root, '.openai', 'hosting.json'), '{}\n');
    await mkdir(join(root, 'drizzle'));
    await writeFile(join(root, 'drizzle', '0000_initial.sql'), 'SELECT 1;\n');
    await buildProject(root);

    await rm(join(root, 'drizzle'), { recursive: true });
    await writeFile(join(root, 'dist', '.openai', 'stale.txt'), 'stale\n');

    await buildProject(root);

    await expect(readdir(join(root, 'dist', '.openai'))).resolves.toEqual([
      'hosting.json',
    ]);
  });

  test('requires hosting configuration', async () => {
    const root = await createProject();

    await expect(buildProject(root)).rejects.toThrow(
      /ENOENT.*\.openai[/\\\\]hosting\.json/,
    );
  });

  test('builds successfully when optional Drizzle migrations are missing', async () => {
    const root = await createProject();
    await mkdir(join(root, '.openai'));
    await writeFile(join(root, '.openai', 'hosting.json'), '{}\n');

    await expect(buildProject(root)).resolves.toBeUndefined();
    await expect(readdir(join(root, 'dist', '.openai'))).resolves.toEqual([
      'hosting.json',
    ]);
  });

  test('does not write metadata when Vite output is disabled', async () => {
    const root = await createProject();
    await mkdir(join(root, '.openai'));
    await writeFile(join(root, '.openai', 'hosting.json'), '{}\n');

    await build({
      root,
      configFile,
      logLevel: 'silent',
      build: { write: false },
    });

    await expect(readdir(join(root, 'dist'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('propagates filesystem errors for inputs that are not missing', async () => {
    const root = await createProject();
    await mkdir(join(root, '.openai', 'hosting.json'), { recursive: true });

    await expect(buildProject(root)).rejects.toThrow();
  });

  test('uses Vite resolved root instead of the current working directory', async () => {
    const root = await createProject();
    await mkdir(join(root, '.openai'));
    await writeFile(join(root, '.openai', 'hosting.json'), '{"r2":"BUCKET"}\n');

    await buildProject(root);

    await expect(
      readFile(join(root, 'dist', '.openai', 'hosting.json'), 'utf8'),
    ).resolves.toBe('{"r2":"BUCKET"}\n');
  });
});
