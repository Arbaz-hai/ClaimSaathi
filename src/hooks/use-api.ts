'use client';

// ---------------------------------------------------------------------------
// API helpers for the ClaimSaathi frontend. Every JSON route returns the
// ApiOk/ApiErr envelope from src/lib/types.ts; these helpers unwrap it and
// turn failures into ApiError with {code, message, fallback}.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiErr, ApiResult } from '@/lib/types';

export class ApiError extends Error {
  code: string;
  fallback?: string;
  status: number;

  constructor(message: string, code: string, status: number, fallback?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fallback = fallback;
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  let body: ApiResult<T> | null = null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      body = (await res.json()) as ApiResult<T>;
    } catch {
      body = null;
    }
  }
  if (!body) {
    throw new ApiError(
      `Request failed (HTTP ${res.status})`,
      'HTTP_ERROR',
      res.status
    );
  }
  if (!body.ok) {
    const err = (body as ApiErr).error;
    throw new ApiError(
      err?.message ?? `Request failed (HTTP ${res.status})`,
      err?.code ?? 'HTTP_ERROR',
      res.status,
      err?.fallback
    );
  }
  return body.data;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  return unwrap<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, jsonInit('POST', body));
  return unwrap<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, jsonInit('PATCH', body));
  return unwrap<T>(res);
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  // Do not set content-type: the browser adds the multipart boundary.
  const res = await fetch(path, { method: 'POST', body: form, cache: 'no-store' });
  return unwrap<T>(res);
}

export function errorMessage(e: unknown, fallbackKey?: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallbackKey ?? 'Unknown error';
}

/** JSON-safe stable key for hook dependencies. */
function depKey(deps: unknown[]): string {
  try {
    return JSON.stringify(deps);
  } catch {
    return String(deps.length);
  }
}

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Generic GET hook with loading/error/retry, refetching when deps change. */
export function useFetch<T>(path: string | null, deps: unknown[] = []): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const key = depKey(deps);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<T>(path);
      if (mounted.current) setData(result);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/** Simple interval polling hook; `active` gates the interval. */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  active: boolean
): void {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      void saved.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
}
