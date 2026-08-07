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
  revokeAgentDelegation(role: 'bank' | 'brand'): void;
  delegationState(): Promise<unknown>;
  split(): Promise<unknown>;
  attackDemo(): unknown;
  integrityDemo(): unknown;
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
              } else if (route === '/revoke-agent') {
                const body = await readJson(req);
                instance.revokeAgentDelegation(body['role'] === 'brand' ? 'brand' : 'bank');
              } else if (route !== '/state' && route !== '/reset') {
                next();
                return;
              }

              const payload = {
                snapshot: instance.snapshot(),
                split: await instance.split(),
                delegation: await instance.delegationState(),
                attack: instance.attackDemo(),
                integrity: instance.integrityDemo(),
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
  // Relative asset paths: the same dist works at github.io/<repo>/ and locally.
  base: './',
  plugins: [react(), demoApi()],
  resolve: {
    // Every workspace package this app imports needs an entry here. Without
    // one, resolution falls through to the symlink npm puts in node_modules,
    // which exists on a developer's machine and in CI but not necessarily on a
    // deployment host that installs from a different root — and the failure
    // arrives as an unresolved import during `vite build`, far from its cause.
    alias: {
      '@eas/shared': r('../shared/src/index.ts'),
      '@eas/issuer': r('../issuer/src/index.ts'),
      '@eas/agents': r('../agents/src/index.ts'),
      '@eas/integrity': r('../integrity/src/index.ts'),
      '@eas/reconciliation': r('../reconciliation/src/index.ts'),
      '@eas/vlei': r('../vlei/src/index.ts'),
      // circomlibjs declares no browser export condition, so a bundler resolves
      // its Node entry — a barrel that also pulls in eddsa, pedersen and evmasm.
      // Those reference Buffer, which does not exist in a browser, and the
      // failure is total rather than partial: the demo world is built at module
      // load, so the rejected import left the whole page on its loading state.
      //
      // Poseidon is the only thing this project uses from that package. Pointing
      // at the one module that provides it fixes the crash and drops ~0.9 MB of
      // unrelated cryptography from the bundle. Node keeps importing the package
      // normally — its exports map blocks this subpath, which is why the alias
      // lives here and not in the shared source.
      circomlibjs: r('../../node_modules/circomlibjs/src/poseidon_wasm.js'),
    },
  },
  server: {
    port: 5173,
  },
});
