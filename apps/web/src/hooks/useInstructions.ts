import { useState, useEffect } from 'react';
import { type LegoCatalogItem, type InstructionBooklet, fetchInstructionBooklets } from '@anti-kragle/core';

export function useInstructions(item: LegoCatalogItem | undefined): {
  booklets: InstructionBooklet[];
  legoUrl: string;
  loading: boolean;
} {
  const [booklets, setBooklets] = useState<InstructionBooklet[]>([]);
  const [legoUrl, setLegoUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item || item.type !== 'set') {
      setBooklets([]);
      setLegoUrl('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const rebrickableNum = item.number.includes('-') ? item.number : `${item.number}-1`;
    fetchInstructionBooklets(rebrickableNum).then(result => {
      if (!cancelled) {
        setBooklets(result.booklets);
        setLegoUrl(result.legoUrl);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [item?.id]);

  return { booklets, legoUrl, loading };
}
