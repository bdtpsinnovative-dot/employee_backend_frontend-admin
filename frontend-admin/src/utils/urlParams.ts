import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type QueryParamUpdates = Record<string, string | null | undefined>;

/**
 * Shared React Router URL query-param helper.
 * Patches individual keys without clobbering unrelated params (e.g. convId, brand, q)
 * and defaults to `{ replace: true }` so refreshes restore state without polluting Back history.
 */
export function useQueryParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;

  const patchParams = useCallback(
    (updates: QueryParamUpdates, options?: { replace?: boolean }) => {
      setSearchParamsRef.current(
        (prev) => {
          const next = new URLSearchParams(prev);
          let changed = false;
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined || value === '') {
              if (next.has(key)) {
                next.delete(key);
                changed = true;
              }
            } else if (next.get(key) !== value) {
              next.set(key, value);
              changed = true;
            }
          }
          return changed ? next : prev;
        },
        { replace: options?.replace ?? true }
      );
    },
    []
  );

  const getParam = useCallback(
    (key: string, fallback = '') => searchParams.get(key) ?? fallback,
    [searchParams]
  );

  const getEnumParam = useCallback(
    <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
      const raw = searchParams.get(key);
      return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
    },
    [searchParams]
  );

  return { searchParams, patchParams, getParam, getEnumParam };
}

/**
 * Syncs a responsive search input to a URL query parameter (debounced during typing,
 * flushed on blur, cleared immediately via clear(), and kept in sync with browser navigation).
 */
export function useDebouncedUrlSearch(paramKey = 'q', delayMs = 150) {
  const { searchParams, patchParams } = useQueryParams();
  const urlValue = searchParams.get(paramKey) || '';

  const [value, setValue] = useState(urlValue);
  const lastSyncedRef = useRef(urlValue);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (urlValue !== lastSyncedRef.current) {
      lastSyncedRef.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  useEffect(() => {
    if (value === urlValue) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      lastSyncedRef.current = value;
      patchParams({ [paramKey]: value || null });
    }, delayMs);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, urlValue, paramKey, delayMs, patchParams]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (value !== urlValue) {
      lastSyncedRef.current = value;
      patchParams({ [paramKey]: value || null });
    }
  }, [value, urlValue, paramKey, patchParams]);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastSyncedRef.current = '';
    setValue('');
    patchParams({ [paramKey]: null });
  }, [paramKey, patchParams]);

  return { value, setValue, flush, clear };
}
