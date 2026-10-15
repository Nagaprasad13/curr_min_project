import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
});

describe('apiFetch', () => {
  it('includes cookies and adds the existing CSRF cookie to unsafe requests', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-test-token; path=/';
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/example', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
    });
    expect(fetchMock.mock.calls[0][1].headers.get('X-XSRF-TOKEN')).toBe('csrf-test-token');
  });

  it('refreshes once after an unauthorized response and retries the request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/example');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
  });

  it('dispatches the unauthorized event when refresh does not recover the session', async () => {
    const unauthorized = vi.fn();
    window.addEventListener('carebridge:unauthorized', unauthorized);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    await apiFetch('/api/example');

    expect(unauthorized).toHaveBeenCalledTimes(1);
    window.removeEventListener('carebridge:unauthorized', unauthorized);
  });

  it('reports a timed-out request clearly', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    })));

    const request = apiFetch('/api/example', { timeoutMs: 50 });
    const assertion = expect(request).rejects.toThrow('timed out or was cancelled');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
