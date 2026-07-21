import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

interface DemoWorldLike {
  snapshot(): unknown;
  attest(type: string): Promise<void>;
  attestAll(): Promise<void>;
  revokeSubject(): void;
  split(): Promise<unknown>;
}

/**
 * Runs the demo world in the dev server's Node process.
 *
 * The signing and verification code is Node-only (`@sd-jwt/crypto-nodejs`), so
 * the browser here is a pure view layer. A real wallet would hold the key on the
 * worker's device and sign there — see README for why that difference matters.
 */
function demoApi(): Plugin {
  let world: DemoWorldLike | null = null;

  async function getWorld(server: ViteDevServer, fresh = false): Promise<DemoWorldLike> {
    if (world === null || fresh) {
      const module = await server.ssrLoadModule('/src/demo/world.ts');
      world = (await module['createDemoWorld']()) as DemoWorldLike;
    }

    return world;
  }

  return {
    name: 'eas-demo-api',
    configureServer(server) {
      server.middlewares.use(
        '/api',
        (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
          void (async () => {
            try {
              const route = (req.url ?? '/').split('?')[0];
              const instance = await getWorld(server, route === '/reset');

              if (route === '/attest') {
                const body = await readJson(req);
                await instance.attest(String(body['type']));
              } else if (route === '/attest-all') {
                await instance.attestAll();
              } else if (route === '/revoke') {
                instance.revokeSubject();
              } else if (route !== '/state' && route !== '/reset') {
                next();
                return;
              }

              const payload = {
                snapshot: instance.snapshot(),
                split: await instance.split(),
              };

              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(payload));
            } catch (error) {
              res.statusCode = 500;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: String(error) }));
            }
          })();
        },
      );
    },
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return {};

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

export default defineConfig({
  plugins: [react(), demoApi()],
  resolve: {
    alias: {
      '@eas/shared': r('../shared/src/index.ts'),
      '@eas/issuer': r('../issuer/src/index.ts'),
      '@eas/agents': r('../agents/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
