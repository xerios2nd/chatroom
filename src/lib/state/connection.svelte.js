import { ErrorKind } from '../api/errors.js';

/**
 * Connection health monitor. Polls the server, tracks latency and available
 * models, and reacts to the browser going offline or online and to tab focus.
 *
 * status: 'idle' | 'checking' | 'online' | 'offline' | 'unauthorized' | 'error'
 */
export function createConnection({ client, settings }) {
  let status = $state('idle');
  let latencyMs = $state(null);
  /** @type {{id: string}[]} */
  let models = $state([]);
  let lastCheckedAt = $state(null);
  let error = $state(null);
  let browserOnline = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  let consecutiveFailures = $state(0);

  let timer;
  let inflight = null;

  async function check({ silent = false } = {}) {
    if (inflight) return inflight;
    if (!silent || status === 'idle') status = 'checking';
    inflight = (async () => {
      const result = await client.ping();
      lastCheckedAt = Date.now();
      latencyMs = result.latencyMs;
      if (result.ok) {
        status = 'online';
        error = null;
        models = result.models ?? [];
        consecutiveFailures = 0;
      } else {
        consecutiveFailures += 1;
        error = result.error?.toJSON?.() ?? { message: String(result.error) };
        status =
          result.error?.kind === ErrorKind.AUTH ? 'unauthorized' : result.error?.kind === ErrorKind.NETWORK || result.error?.kind === ErrorKind.TIMEOUT ? 'offline' : 'error';
      }
      return result;
    })().finally(() => {
      inflight = null;
      schedule();
    });
    return inflight;
  }

  /** Poll on the configured interval; back off while the server is down. */
  function schedule() {
    clearTimeout(timer);
    const base = settings.values.healthIntervalMs;
    if (!base || typeof window === 'undefined') return;
    const backoff = Math.min(base * 2 ** Math.min(consecutiveFailures, 3), 5 * 60_000);
    timer = setTimeout(() => {
      if (document.visibilityState === 'visible') check({ silent: true });
      else schedule();
    }, backoff);
  }

  const onOnline = () => {
    browserOnline = true;
    check();
  };
  const onOffline = () => {
    browserOnline = false;
    status = 'offline';
    error = { message: 'Your device is offline.', kind: ErrorKind.NETWORK };
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible' && lastCheckedAt && Date.now() - lastCheckedAt > 15_000) check({ silent: true });
  };

  function start() {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    check();
    return stop;
  }

  function stop() {
    clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
  }

  /** Lets the chat controller report results from real traffic, so the badge reacts immediately. */
  function report(ok, err) {
    if (ok) {
      if (status !== 'online') {
        status = 'online';
        error = null;
        consecutiveFailures = 0;
      }
    } else if (err && [ErrorKind.NETWORK, ErrorKind.AUTH].includes(err.kind)) {
      status = err.kind === ErrorKind.AUTH ? 'unauthorized' : 'offline';
      error = err.toJSON?.() ?? err;
    }
  }

  return {
    get status() {
      return status;
    },
    get latencyMs() {
      return latencyMs;
    },
    get models() {
      return models;
    },
    get lastCheckedAt() {
      return lastCheckedAt;
    },
    get error() {
      return error;
    },
    get browserOnline() {
      return browserOnline;
    },
    check,
    start,
    stop,
    report,
  };
}
