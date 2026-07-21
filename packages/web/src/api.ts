import type { DemoSnapshot, SplitView } from './demo/world.js';

export interface DemoPayload {
  readonly snapshot: DemoSnapshot;
  readonly split: SplitView;
}

async function call(path: string, body?: unknown): Promise<DemoPayload> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`demo api ${path} failed with ${response.status}`);
  }

  return (await response.json()) as DemoPayload;
}

export const api = {
  state: () => call('/state'),
  attest: (type: string) => call('/attest', { type }),
  attestAll: () => call('/attest-all', {}),
  revoke: () => call('/revoke', {}),
  reset: () => call('/reset', {}),
};
