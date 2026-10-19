import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../../server/index.mjs';

async function withServer(fn, options = {}) {
  const server = createServer({ ready: async () => true, run: async () => ({ status: 'success', stdout: '42\n' }), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.stopRuns(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const headers = { 'Content-Type': 'application/json', 'X-Java-Runner': '1' };
test('blocks web origins and missing extension request headers', async () => withServer(async base => {
  const body = JSON.stringify({ code: 'System.out.println(42);' });
  for (const origin of ['https://evil.example', 'null', 'chrome-extension://invalid']) {
    const response = await fetch(`${base}/run`, { method: 'POST', headers: { ...headers, Origin: origin }, body });
    assert.equal(response.status, 403);
  }
  assert.equal((await fetch(`${base}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
}));
test('allows extension preflight and an authorized JSON request', async () => withServer(async base => {
  const Origin = `chrome-extension://${'a'.repeat(32)}`;
  const preflight = await fetch(`${base}/run`, { method: 'OPTIONS', headers: { Origin } });
  assert.equal(preflight.headers.get('access-control-allow-origin'), Origin);
  assert.equal(preflight.status, 204);
  const response = await fetch(`${base}/run`, { method: 'POST', headers: { ...headers, Origin }, body: JSON.stringify({ code: 'System.out.println(42);' }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stdout, '42\n');
}));
test('rejects malformed JSON and oversized stdin before execution', async () => withServer(async base => {
  for (const body of ['{', 'null', JSON.stringify({ code: 'int n = 1;', stdin: 'x'.repeat(8193) })]) {
    assert.equal((await fetch(`${base}/run`, { method: 'POST', headers, body })).status, 400);
  }
}));
test('health reports missing Docker/image instead of claiming readiness', async () => withServer(async base => {
  assert.equal((await fetch(`${base}/health`)).status, 503);
}, { ready: async () => false }));
