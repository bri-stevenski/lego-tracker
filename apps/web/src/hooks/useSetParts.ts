// apps/web/src/hooks/useSetParts.ts
import { useState, useEffect } from 'react';
import { type LegoCatalogItem, type SetPart, getOrFetchSetParts } from '@anti-kragle/core';

export function useSetParts(item: LegoCatalogItem | undefined): {
  parts: SetPart[];
  loading: boolean;
  error: boolean;
} {
  const [parts, setParts] = useState<SetPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!item || item.type !== 'set') {
      setParts([]);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    getOrFetchSetParts(item)
      .then(result => {
        if (!cancelled) {
          setParts(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id]);

  return { parts, loading, error };
}
