// Execute the real Edge entrypoints with a captured Deno.serve handler.
import assert from 'node:assert/strict';

const pages = 'https://wass-psti.github.io';
const preview = 'https://apsyntracrm-preview.alexsenaganwatchdog.workers.dev';
const watchdogPreview = 'https://apsyntracrm-preview.watchdog-521.workers.dev';
const foreign = [
  'https://untrusted.invalid',
  'https://apsyntracrm-preview.watchdog-521.workers.dev.evil.invalid',
  'https://apsyntracrm.watchdog-521.workers.dev',
  'https://apsyntracrm-preview.alexsenaganwatchdog.workers.dev.evil.invalid',
  'https://apsyntracrm.alexsenaganwatchdog.workers.dev',
  'http://apsyntracrm-preview.alexsenaganwatchdog.workers.dev',
  'null',
];
type Handler = (request: Request) => Response | Promise<Response>;
async function capture(load: () => Promise<unknown>): Promise<Handler> {
  const original = Deno.serve;
  let handler: Handler | undefined;
  try {
    Deno.serve = ((fn: Handler) => { handler = fn; }) as unknown as typeof Deno.serve;
    await load();
  } finally {
    Deno.serve = original;
  }
  assert.ok(handler, 'Edge entrypoint must register an actual handler');
  return handler;
}
function request(method: string, origin: string | null, headers: Record<string, string> = {}) {
  return new Request('https://fixture.invalid/functions/v1/test', {
    method, headers: { ...(origin === null ? {} : { origin }), ...headers },
  });
}
function cors(response: Response, origin: string) {
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
  assert.match(response.headers.get('access-control-allow-headers') || '', /authorization/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
}
const routes = [
  ['native', () => import('../../supabase/functions/apsyntra-native-issues/index.ts')],
  ['invite', () => import('../../supabase/functions/ws02d-invite/index.ts')],
  ['accept', () => import('../../supabase/functions/ws02d-accept/index.ts')],
  ['manage', () => import('../../supabase/functions/ws02d-manage/index.ts')],
] as const;
for (const [name, load] of routes) {
  Deno.test(name + ': actual handler supports exact approved origins and preserves rejection', async () => {
    const original = Deno.env.get('APSYNTRA_ALLOWED_ORIGIN');
    Deno.env.delete('APSYNTRA_ALLOWED_ORIGIN');
    try {
      const handler = await capture(load);
      for (const origin of [pages, preview, watchdogPreview]) {
        const preflight = await handler(request('OPTIONS', origin, {
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,apikey,content-type',
        }));
        assert.equal(preflight.status, 204);
        cors(preflight, origin);
        const wrongMethod = await handler(request('GET', origin));
        assert.equal(wrongMethod.status, 405);
        cors(wrongMethod, origin);
        // Never invoke an actual signed mutation, DB or mail provider.
        const rejected = await handler(request('POST', origin));
        assert.equal(rejected.status, name === 'native' ? 401 : 415);
        cors(rejected, origin);
      }
      for (const origin of foreign) {
        for (const method of ['OPTIONS', 'POST']) {
          const response = await handler(request(method, origin));
          assert.equal(response.status, 403);
          assert.equal(response.headers.get('access-control-allow-origin'), null);
        }
      }
      const noOrigin = await handler(request('OPTIONS', null));
      assert.equal(noOrigin.status, 204);
      assert.equal(noOrigin.headers.get('access-control-allow-origin'), null);
      if (name !== 'native') {
        // Preserve existing operator override semantics; add only preview.
        const existing = 'https://configured.example.invalid';
        Deno.env.set('APSYNTRA_ALLOWED_ORIGIN', existing);
        for (const origin of [existing, preview, watchdogPreview]) {
          const res = await handler(request('OPTIONS', origin));
          assert.equal(res.status, 204);
          cors(res, origin);
        }
        assert.equal((await handler(request('OPTIONS', pages))).status, 403);
      }
    } finally {
      if (original === undefined) Deno.env.delete('APSYNTRA_ALLOWED_ORIGIN');
      else Deno.env.set('APSYNTRA_ALLOWED_ORIGIN', original);
    }
  });
}
