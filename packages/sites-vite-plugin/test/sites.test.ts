import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { sites } from '@openai/sites-vite-plugin';

const projects: string[] = [];
const servers: ViteDevServer[] = [];
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

async function startSite(port = 0) {
  const root = await createProject();
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port },
    plugins: [
      sites(),
      {
        name: 'local-identity-fixture',
        configureServer(viteServer) {
          viteServer.middlewares.use('/identity', (request, response) => {
            response.setHeader('Content-Type', 'application/json');
            response.end(
              JSON.stringify({
                userId: request.headers['oai-authenticated-user-id'],
                email: request.headers['oai-authenticated-user-email'],
                fullName: request.headers['oai-authenticated-user-full-name'],
                encoding:
                  request.headers['oai-authenticated-user-full-name-encoding'],
                cookie: request.headers.cookie,
              }),
            );
          });
        },
      },
    ],
  });
  servers.push(server);
  await server.listen();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('The Sites development server has no local address');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    port: address.port,
    close: () => server.close(),
    request(path: string, options: RequestInit = {}) {
      return fetch(`${origin}${path}`, { ...options, redirect: 'manual' });
    },
  };
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Local sign-in did not return a session cookie');
  return cookie.split(';', 1)[0];
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    projects.splice(0).map((project) => rm(project, { recursive: true })),
  );
});

describe('sites', () => {
  test('uses one plugin for local sign-in and production builds', () => {
    expect(sites()).toMatchObject({
      name: 'sites',
      configureServer: expect.any(Function),
      closeBundle: expect.any(Function),
    });
  });

  test('simulates an isolated sign-in and sign-out on real Vite servers', async () => {
    const first = await startSite();
    const second = await startSite();

    const anonymous = await first.request('/identity', {
      headers: {
        cookie: 'theme=dark',
        'oai-authenticated-user-id': 'spoofed',
        'oai-authenticated-user-email': 'spoofed@example.com',
      },
    });
    expect(await anonymous.json()).toEqual({ cookie: 'theme=dark' });

    const prefetch = await first.request('/signin-with-chatgpt', {
      headers: { 'next-router-prefetch': '1' },
    });
    expect(prefetch.status).toBe(204);
    expect(prefetch.headers.get('set-cookie')).toBeNull();

    const signIn = await first.request(
      '/signin-with-chatgpt?return_to=%2Fidentity%3Ffrom%3Dsignin',
    );
    expect(signIn.status).toBe(302);
    expect(signIn.headers.get('location')).toBe('/identity?from=signin');
    const setCookie = signIn.headers.get('set-cookie');
    expect(setCookie).toMatch(
      /^__sites_local_auth_[a-f0-9]{12}=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    expect(setCookie).not.toContain('seedy@sites.test');
    const cookie = sessionCookie(signIn);

    const signedIn = await first.request('/identity', {
      headers: {
        cookie: `${cookie}; theme=dark`,
        'oai-authenticated-user-email': 'spoofed@example.com',
      },
    });
    const identity = await signedIn.json();
    expect(identity).toEqual({
      userId: expect.stringMatching(/^local_[a-f0-9]{64}$/),
      email: 'seedy@sites.test',
      fullName: 'Seedy',
      encoding: 'percent-encoded-utf-8',
      cookie: 'theme=dark',
    });

    const secondSignIn = await second.request('/signin-with-chatgpt');
    const secondCookie = sessionCookie(secondSignIn);
    expect(secondCookie.split('=', 1)[0]).not.toBe(cookie.split('=', 1)[0]);
    expect(
      await (await second.request('/identity', { headers: { cookie } })).json(),
    ).toEqual({});
    const secondIdentity = await (
      await second.request('/identity', { headers: { cookie: secondCookie } })
    ).json();
    expect(secondIdentity.email).toBe('seedy@sites.test');
    expect(secondIdentity.userId).not.toBe(identity.userId);

    const crossSite = await first.request('/signin-with-chatgpt', {
      headers: { origin: 'https://example.com' },
    });
    expect(crossSite.status).toBe(403);
    const forgedHost = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        `${first.origin}/signin-with-chatgpt`,
        { headers: { host: 'example.com' } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(forgedHost).toBe(403);
    expect((await first.request('/callback')).status).toBe(501);
    expect(
      (
        await first.request('/signin-with-chatgpt', {
          method: 'POST',
        })
      ).status,
    ).toBe(405);

    const unsafeReturn = await first.request(
      '/signin-with-chatgpt?return_to=https%3A%2F%2Fexample.com',
    );
    expect(unsafeReturn.headers.get('location')).toBe('/');

    const signOut = await first.request('/signout-with-chatgpt', {
      method: 'POST',
      headers: { cookie },
    });
    expect(signOut.status).toBe(303);
    expect(signOut.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(
      await (await first.request('/identity', { headers: { cookie } })).json(),
    ).toEqual({});

    const preRestartCookie = sessionCookie(
      await first.request('/signin-with-chatgpt'),
    );
    await first.close();
    const restarted = await startSite(first.port);
    expect(
      await (
        await restarted.request('/identity', {
          headers: { cookie: preRestartCookie },
        })
      ).json(),
    ).toEqual({});
    const restartedCookie = sessionCookie(
      await restarted.request('/signin-with-chatgpt'),
    );
    expect(
      (
        await (
          await restarted.request('/identity', {
            headers: { cookie: restartedCookie },
          })
        ).json()
      ).userId,
    ).toBe(identity.userId);
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
      readFile(join(root, 'dist', 'index.html'), 'utf8'),
    ).resolves.not.toMatch(
      /seedy@sites\.test|__sites_local_auth_|signin-with-chatgpt/,
    );
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
