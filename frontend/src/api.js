const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const AUTH_PATHS_WITHOUT_REFRESH = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/register-invited',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/demo-login',
  '/api/auth/refresh',
]);

function cookieValue(name) {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

async function csrfHeader(headers, signal) {
  let token = cookieValue('XSRF-TOKEN');
  if (!token) {
    const response = await fetch('/api/auth/csrf', { credentials: 'include', signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) {
      throw new Error(data.message || 'Could not initialize request security.');
    }
    token = data.csrfToken;
  }
  headers.set('X-XSRF-TOKEN', token);
}

function combineAbortSignal(signal, controller) {
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
}

export async function apiFetch(input, options = {}) {
  const url = input instanceof Request ? input.url : new URL(input, window.location.href).pathname;
  const method = (options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(options.headers || {}).forEach((value, key) => headers.set(key, value));
  const bearer = headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const hasBearer = Boolean(bearer && bearer !== 'null' && bearer !== 'undefined');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), options.timeoutMs || 15000);
  combineAbortSignal(options.signal, controller);

  const requestOptions = {
    ...options,
    headers,
    credentials: 'include',
    signal: controller.signal,
  };
  delete requestOptions.timeoutMs;
  delete requestOptions.retryAuth;

  try {
    if (!SAFE_METHODS.has(method) && !AUTH_PATHS_WITHOUT_REFRESH.has(url) && !hasBearer) {
      await csrfHeader(headers, controller.signal);
    }

    let response = await fetch(input, { ...requestOptions, method });
    if (response.status === 401 && options.retryAuth !== false && !AUTH_PATHS_WITHOUT_REFRESH.has(url)) {
      const refresh = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      if (refresh.ok) {
        if (!SAFE_METHODS.has(method) && !AUTH_PATHS_WITHOUT_REFRESH.has(url) && !hasBearer) {
          await csrfHeader(headers, controller.signal);
        }
        response = await fetch(input, { ...requestOptions, method });
      }
    }
    if (response.status === 401 && !AUTH_PATHS_WITHOUT_REFRESH.has(url)) {
      window.dispatchEvent(new Event('carebridge:unauthorized'));
    }
    return response;
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    if (error.name === 'AbortError' || error.name === 'TimeoutError' || controller.signal.aborted) {
      throw new Error('The request timed out or was cancelled. Please try again.');
    }
    throw new Error(error.message || 'The server could not be reached. Please try again.');
  } finally {
    window.clearTimeout(timeout);
  }
}
