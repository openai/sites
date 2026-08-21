#!/usr/bin/env node

import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { cancel, group, multiselect, text } from '@clack/prompts';
import { Command, InvalidArgumentError, Option } from 'commander';
import { xSync } from 'tinyexec';

type AddOn = 'd1' | 'r2' | 'auth' | 'shadcn';
type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

const addOns: { name: AddOn; description: string }[] = [
  { name: 'd1', description: 'Add a Cloudflare D1 database and Drizzle.' },
  { name: 'r2', description: 'Add a Cloudflare R2 object storage binding.' },
  { name: 'auth', description: 'Add ChatGPT authentication helpers.' },
  {
    name: 'shadcn',
    description: 'Add shadcn/ui with its complete component set.',
  },
];
const packageManagers: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];
const allowedExistingEntries = new Set(['.git', '.DS_Store']);

type PackageJson = {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type CliOptions = {
  addOns?: AddOn[];
  yes?: boolean;
  install: boolean;
  packageManager?: PackageManager;
  listAddOns?: boolean;
  json?: boolean;
};

function parseAddOns(value: string | undefined): AddOn[] {
  if (!value?.trim()) return [];
  const requested = value.split(',').map((name) => name.trim());
  for (const name of requested) {
    if (!addOns.some((addOn) => addOn.name === name)) {
      throw new InvalidArgumentError(
        `Unknown add-on ${JSON.stringify(name)}. Available add-ons: ${addOns.map((addOn) => addOn.name).join(', ')}.`,
      );
    }
  }
  return addOns
    .filter((addOn) => requested.includes(addOn.name))
    .map((addOn) => addOn.name);
}

async function writeJson(path: string, value: object): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createSite(
  directory: string | undefined,
  options: CliOptions,
): Promise<void> {
  if (options.listAddOns) {
    const output = options.json
      ? JSON.stringify(addOns, null, 2)
      : addOns
          .map(({ name, description }) => `${name}  ${description}`)
          .join('\n');
    process.stdout.write(`${output}\n`);
    return;
  }

  if (options.json) {
    throw new Error('--json requires --list-add-ons.');
  }

  let selected = options.addOns ?? [];
  if (!options.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const answers = await group(
      {
        directory: () =>
          directory === undefined
            ? text({
                message: 'Where should we create your site?',
                placeholder: 'site',
                defaultValue: 'site',
              })
            : undefined,
        addOns: () =>
          options.addOns === undefined
            ? multiselect<AddOn>({
                message: 'Which add-ons should be included?',
                options: addOns.map(({ name, description }) => ({
                  value: name,
                  label: name,
                  hint: description,
                })),
                required: false,
              })
            : undefined,
      },
      {
        onCancel: () => {
          cancel('Site creation cancelled.');
          process.exit(1);
        },
      },
    );
    directory = answers.directory ?? directory;
    selected = answers.addOns ?? selected;
  }

  const manager: PackageManager =
    options.packageManager ??
    packageManagers.find((name) =>
      process.env.npm_config_user_agent?.startsWith(`${name}/`),
    ) ??
    'npm';
  const destination = resolve(process.cwd(), directory ?? '.');
  try {
    const entries = await readdir(destination);
    const existing = entries.filter(
      (entry) => !allowedExistingEntries.has(entry),
    );
    if (existing.length > 0) {
      const names = existing
        .slice(0, 3)
        .map((entry) => JSON.stringify(entry))
        .join(', ');
      const remaining = existing.length - 3;
      throw new Error(
        `Target contains existing files: ${names}${remaining > 0 ? ` and ${remaining} more` : ''}.`,
      );
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error)) throw error;
    if (error.code === 'ENOTDIR') {
      throw new Error(`Target is not a directory: ${destination}`);
    }
    if (error.code !== 'ENOENT') throw error;
  }

  const templates = join(import.meta.dirname, '..', 'templates');
  const base = join(templates, 'vinext');
  const manifest: PackageJson = JSON.parse(
    await readFile(join(base, 'package.json'), 'utf8'),
  );
  const hosting: { d1: string | null; r2: string | null } = JSON.parse(
    await readFile(join(base, '.openai', 'hosting.json'), 'utf8'),
  );

  hosting.d1 = selected.includes('d1') ? 'DB' : null;
  hosting.r2 = selected.includes('r2') ? 'FILES' : null;

  if (selected.includes('d1')) {
    manifest.dependencies = {
      ...manifest.dependencies,
      'drizzle-orm': '0.45.2',
    };
    manifest.devDependencies = {
      ...manifest.devDependencies,
      'drizzle-kit': '0.31.10',
    };
    manifest.scripts = {
      ...manifest.scripts,
      'db:generate': 'drizzle-kit generate',
    };
  }

  if (selected.includes('shadcn')) {
    manifest.dependencies = {
      ...manifest.dependencies,
      '@base-ui/react': '1.7.0',
      '@shadcn/react': '0.3.0',
      'class-variance-authority': '0.7.1',
      clsx: '2.1.1',
      cmdk: '1.1.1',
      'date-fns': '4.1.0',
      'embla-carousel-react': '8.5.2',
      'input-otp': '1.4.2',
      'lucide-react': '1.31.0',
      'react-day-picker': '9.8.1',
      'react-resizable-panels': '4.5.8',
      recharts: '3.8.0',
      shadcn: '4.18.0',
      'tailwind-merge': '3.6.0',
      'tw-animate-css': '1.4.0',
    };
  }

  await mkdir(destination, { recursive: true });
  await cp(base, destination, { recursive: true, force: false });
  await rename(
    join(destination, '_gitignore'),
    join(destination, '.gitignore'),
  );

  for (const addOn of selected) {
    await cp(join(templates, 'addons', addOn), destination, {
      recursive: true,
      // The shadcn add-on intentionally replaces the base global stylesheet
      // with its theme variables and Tailwind imports.
      force: addOn === 'shadcn',
    });
  }

  await Promise.all([
    writeJson(join(destination, 'package.json'), manifest),
    writeJson(join(destination, '.openai', 'hosting.json'), hosting),
  ]);

  if (options.install) {
    const installation = xSync(manager, ['install'], {
      nodeOptions: { cwd: destination, stdio: 'inherit' },
      throwOnError: true,
    });
    if (installation.killed) {
      throw new Error(`${manager} install was interrupted.`);
    }
  }

  const displayPath = relative(process.cwd(), destination) || '.';
  process.stdout.write(`Created Sites project in ${displayPath}.\n`);
  process.stdout.write(
    `Add-ons: ${selected.length ? selected.join(', ') : 'none'}.\n`,
  );

  if (!options.install) {
    process.stdout.write('\nNext steps:\n');
    if (displayPath !== '.') {
      const escapedPath =
        process.platform === 'win32'
          ? `"${displayPath}"`
          : `'${displayPath.replaceAll("'", "'\\''")}'`;
      process.stdout.write(`  cd ${escapedPath}\n`);
    }
    process.stdout.write(`  ${manager} install\n  ${manager} run dev\n`);
  }
}

async function main(): Promise<void> {
  const manifest: PackageJson = JSON.parse(
    await readFile(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
  );
  if (!manifest.version) throw new Error('Package version is unavailable.');

  await new Command()
    .name('create-sites')
    .description('Create a ChatGPT Sites project.')
    .version(manifest.version, '-v, --version', 'Show the package version')
    .argument('[directory]', 'Project directory')
    .option('--add-ons <list>', 'Comma-separated add-ons', parseAddOns)
    .option('-y, --yes', 'Use defaults without prompting')
    .option('--install', 'Install project dependencies', false)
    .option('--no-install', 'Generate without installing dependencies')
    .option('--list-add-ons', 'List available add-ons')
    .option('--json', 'Print the add-on list as JSON')
    .addOption(
      new Option('--package-manager <name>', 'Package manager').choices(
        packageManagers,
      ),
    )
    .action(createSite)
    .parseAsync();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
