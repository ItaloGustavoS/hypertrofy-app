/* The server-side fetch is the one the job runner hands the adapters: it must outlast the
 * provider, and it must still be interruptible. Both asserted against a server that answers
 * slowly — the answer arrives, and an abort does not wait for it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { fetchFor } = await import('../coach/node-fetch.js');

function slowServer(delayMs) {
  const server = http.createServer((req, res) => setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); }, delayMs));
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

test('the job fetch waits for an answer slower than a second', async () => {
  const s = await slowServer(2500);
  try {
    const r = await fetchFor(60000)(s.url);
    assert.equal((await r.json()).ok, true);
  } finally { s.close(); }
});

test('an AbortController still wins over the transport budget', async () => {
  const s = await slowServer(1500);
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 100);
    await assert.rejects(fetchFor(60000)(s.url, { signal: ctl.signal }), e => e.name === 'AbortError');
  } finally { s.close(); }
});

test('a caller that aborted before the call never reaches the server', async () => {
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(fetchFor(60000)('http://127.0.0.1:1/', { signal: ctl.signal }), e => e.name === 'AbortError');
});
