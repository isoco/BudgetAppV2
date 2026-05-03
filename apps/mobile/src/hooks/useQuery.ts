/**
 * Lightweight async-data hook (replaces TanStack Query for local SQLite calls).
 */
import { useState, useEffect, useCallback } from 'react';

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData]       = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(e as Error);
      console.error('[useQuery] failed:', (e as Error)?.message, e);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
