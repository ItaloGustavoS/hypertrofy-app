/* A fetch for the server that waits as long as a job may.
 *
 * The job runner hands the HTTP adapters this fetch so the transport budget comes from
 * COACH_JOB_TIMEOUT_MS instead of from the platform's own idea of patience. It is also the one
 * place that knows the server's transport, so swapping it stays a one-file change.
 *
 * Node-only by design: the phone's transport is capacitor-fetch.js, and the core adapters take
 * whichever fetch they are given.
 *
 * shortcut: the global fetch caps the wait for response headers at 300 s, which a cloud API
 * never reaches but a local model on a slow box can. Add back a transport with its own
 * headersTimeout if the Coach ever has to run one of those. */
const GRACE_MS = 15000;

/** fetch(url, init) that will wait `timeoutMs` for the provider; AbortController still wins. */
export function fetchFor(timeoutMs) {
  const budget = Math.max(60000, +timeoutMs || 0) + GRACE_MS;
  return async (url, init = {}) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), budget);
    const outer = init.signal;
    const relay = () => ctl.abort();
    if (outer) {
      if (outer.aborted) ctl.abort();
      else outer.addEventListener('abort', relay, { once: true });
    }
    try {
      return await fetch(url, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', relay);
    }
  };
}
