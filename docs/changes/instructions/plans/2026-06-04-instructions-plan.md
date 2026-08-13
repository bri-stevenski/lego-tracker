# Plan: Building Instructions

**Date:** 2026-06-04 | **Tasks:** 5 | **Time:** ~25 min

## Goal

When viewing a set, the detail panel shows available instruction booklets fetched from LEGO's CDN via a Supabase Edge Function, with a download button per booklet and a fallback link to LEGO.com.

## Architecture

```text
DetailPanel
  └── InstructionsSection
        └── useInstructions (hook)
              └── fetchInstructionBooklets (core service)
                    └── Supabase Edge Function: /functions/v1/instructions
                          └── LEGO instructions page (server-to-server fetch + regex)
```

## Observable Truths

1. A set's detail panel shows a "Building Instructions" section with booklet download cards
2. Clicking a download card triggers a PDF download from LEGO's CDN
3. A "View on LEGO.com ↗" link opens the official instructions page
4. If the Edge Function is down or returns no booklets, the section shows a graceful fallback
5. Minifigs never show the instructions section

## Uncertainties

- `[ASSUMPTION]` LEGO instructions URL pattern: `https://www.lego.com/en-us/service/building-instructions/{num_without_variant}`
- `[ASSUMPTION]` PDF URLs in HTML match pattern: `/cdn/product-assets/product.bi.core.pdf/\d+\.pdf`
- `[DEFERRABLE]` Step tracking and parts-consumed-per-step — deferred (no structured step data from LEGO)

## File Map

```text
CREATE  supabase/functions/instructions/index.ts
CREATE  packages/core/src/services/instructions.ts
CREATE  packages/core/src/services/instructions.test.ts
MODIFY  packages/core/src/types/lego.ts          — add InstructionBooklet
MODIFY  packages/core/src/index.ts               — export instructions service
MODIFY  apps/web/src/app/App.tsx                 — fix VITE_SUPABASE_ANON_KEY → PUBLISHABLE_KEY
MODIFY  apps/web/src/components/DetailPanel.tsx  — add InstructionsSection
MODIFY  apps/web/src/app/styles.css              — instructions section styles
```

---

## Tasks

### Task 1: InstructionBooklet type + core service + env key fix

**Files:**

- Modify: `packages/core/src/types/lego.ts`
- Create: `packages/core/src/services/instructions.ts`
- Create: `packages/core/src/services/instructions.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/app/App.tsx`

- [ ] **Step 1: Add InstructionBooklet to types**

In `packages/core/src/types/lego.ts`, add after the `SetPart` interface:

```ts
export interface InstructionBooklet {
  title: string;
  url: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/src/services/instructions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchInstructionBooklets } from './instructions';
import { getConfig } from '../config';

vi.mock('../config', () => ({ getConfig: vi.fn() }));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchInstructionBooklets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getConfig as any).mockReturnValue({ supabaseUrl: 'https://abc.supabase.co' });
  });

  it('calls the edge function with correct set_num', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        booklets: [{ title: 'Part 1 of 2', url: 'https://cdn.lego.com/1.pdf' }],
        legoUrl: 'https://www.lego.com/en-us/service/building-instructions/10305',
      }),
    });
    const result = await fetchInstructionBooklets('10305-1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('set_num=10305-1'),
    );
    expect(result.booklets).toHaveLength(1);
    expect(result.booklets[0].title).toBe('Part 1 of 2');
  });

  it('returns empty booklets when supabaseUrl is missing', async () => {
    (getConfig as any).mockReturnValue({ supabaseUrl: null });
    const result = await fetchInstructionBooklets('10305-1');
    expect(result.booklets).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty booklets on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchInstructionBooklets('10305-1');
    expect(result.booklets).toEqual([]);
  });

  it('returns empty booklets on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchInstructionBooklets('10305-1');
    expect(result.booklets).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run packages/core/src/services/instructions.test.ts
```

Expected: fails with "Cannot find module './instructions'".

- [ ] **Step 4: Implement the service**

Create `packages/core/src/services/instructions.ts`:

```ts
import { getConfig } from '../config';
import type { InstructionBooklet } from '../types/lego';

export async function fetchInstructionBooklets(setNum: string): Promise<{
  booklets: InstructionBooklet[];
  legoUrl: string;
}> {
  const { supabaseUrl } = getConfig();
  if (!supabaseUrl) return { booklets: [], legoUrl: '' };

  const url = `${supabaseUrl}/functions/v1/instructions?set_num=${encodeURIComponent(setNum)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { booklets: [], legoUrl: '' };
    return await res.json();
  } catch {
    return { booklets: [], legoUrl: '' };
  }
}
```

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts`:

```ts
export * from './services/instructions';
```

- [ ] **Step 6: Fix the VITE_SUPABASE_ANON_KEY mismatch in App.tsx**

In `apps/web/src/app/App.tsx`, change:

```ts
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
```

to:

```ts
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
```

- [ ] **Step 7: Run all tests and verify they pass**

```bash
npx vitest run
```

Expected: all tests pass (134+).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/types/lego.ts packages/core/src/services/instructions.ts packages/core/src/services/instructions.test.ts packages/core/src/index.ts apps/web/src/app/App.tsx
git commit -m "feat(instructions): InstructionBooklet type + fetchInstructionBooklets service + fix anon key"
```

---

### Task 2: Supabase Edge Function

**Files:**

- Create: `supabase/functions/instructions/index.ts`

- [ ] **Step 1: Write the Edge Function**

Create `supabase/functions/instructions/index.ts`:

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { searchParams } = new URL(req.url);
  const setNum = searchParams.get('set_num') ?? '';

  if (!setNum) {
    return new Response(JSON.stringify({ error: 'set_num required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Strip variant suffix: "10305-1" → "10305"
  const legoNum = setNum.replace(/-\d+$/, '');
  const legoUrl = `https://www.lego.com/en-us/service/building-instructions/${legoNum}`;

  let booklets: { title: string; url: string }[] = [];

  try {
    const res = await fetch(legoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AntiKragle/1.0)' },
    });

    if (res.ok) {
      const html = await res.text();
      const seen = new Set<string>();
      const pdfPattern = /https:\/\/www\.lego\.com\/cdn\/product-assets\/product\.bi\.core\.pdf\/[^"'\s]+\.pdf/g;

      for (const match of html.matchAll(new RegExp(pdfPattern, 'g'))) {
        if (!seen.has(match[0])) seen.add(match[0]);
      }

      const urls = [...seen];
      booklets = urls.map((url, i) => ({
        title: urls.length > 1 ? `Part ${i + 1} of ${urls.length}` : 'Building Instructions',
        url,
      }));
    }
  } catch {
    // Return empty booklets — legoUrl is still the fallback
  }

  return new Response(
    JSON.stringify({ booklets, legoUrl }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/instructions/index.ts
git commit -m "feat(instructions): Supabase Edge Function — scrape LEGO instructions page"
```

---

### Task 3: useInstructions hook + InstructionsSection in DetailPanel

**Files:**

- Create: `apps/web/src/hooks/useInstructions.ts`
- Modify: `apps/web/src/components/DetailPanel.tsx`
- Modify: `apps/web/src/app/styles.css`

- [ ] **Step 1: Create useInstructions hook**

Create `apps/web/src/hooks/useInstructions.ts`:

```ts
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
```

- [ ] **Step 2: Add InstructionsSection to DetailPanel**

In `apps/web/src/components/DetailPanel.tsx`, add these imports:

```ts
import { BookOpen, Download } from 'lucide-react';
import { useInstructions } from '../hooks/useInstructions';
```

Add this component at the bottom of the file (before the closing brace):

```tsx
function InstructionsSection({ item }: { item: LegoCatalogItem }) {
  const { booklets, legoUrl, loading } = useInstructions(item);

  return (
    <section className="instructions-section" data-testid="instructions-section">
      <div className="parts-list-header">
        <h3 className="parts-heading">Building Instructions</h3>
        {legoUrl && (
          <a
            href={legoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-button"
            data-testid="instructions-lego-link"
          >
            LEGO.com ↗
          </a>
        )}
      </div>
      {loading && <p className="parts-loading">Loading instructions…</p>}
      {!loading && booklets.length === 0 && (
        <p className="parts-count">
          {legoUrl ? 'No instruction files found.' : 'Instructions unavailable.'}
        </p>
      )}
      {!loading && booklets.length > 0 && (
        <div className="booklets-list">
          {booklets.map((b, i) => (
            <a
              key={i}
              href={b.url}
              download
              className="booklet-card"
              data-testid={`booklet-${i}`}
            >
              <BookOpen size={16} className="booklet-icon" />
              <span className="booklet-title">{b.title}</span>
              <Download size={13} className="booklet-download" />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
```

In the main `DetailPanel` return, add after `{item.type === 'set' && <PartsList item={item} />}`:

```tsx
{item.type === 'set' && <InstructionsSection item={item} />}
```

- [ ] **Step 3: Add CSS for the instructions section**

Add to `apps/web/src/app/styles.css` after the parts-list section:

```css
/* ─── Instructions ────────────────────────────────────── */

.instructions-section {
  border-top: 1px solid var(--color-border-light);
  margin-top: 32px;
  padding-top: 24px;
}

.booklets-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.booklet-card {
  align-items: center;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  color: var(--color-text);
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.booklet-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-sm);
}

.booklet-icon { color: var(--color-accent); flex-shrink: 0; }

.booklet-title { flex: 1; font-size: 13px; font-weight: 600; }

.booklet-download { color: var(--color-text-subtle); flex-shrink: 0; }
```

- [ ] **Step 4: TypeScript + test suite check**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json && npx vitest run
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useInstructions.ts apps/web/src/components/DetailPanel.tsx apps/web/src/app/styles.css
git commit -m "feat(instructions): InstructionsSection in DetailPanel with booklet download cards"
```

---

### Task 4: Deploy Edge Function + smoke test

**[checkpoint:human-action]** Requires manual deploy step.

- [ ] **Step 1: Deploy the Edge Function**

```bash
npx supabase functions deploy instructions --no-verify-jwt
```

Expected: `Deployed Functions instructions`

- [ ] **Step 2: Verify the Edge Function directly**

```bash
curl "https://ihmosqkxdwnvtlgezcml.supabase.co/functions/v1/instructions?set_num=10305-1" | python3 -m json.tool
```

Expected: JSON with `booklets` array containing 2 items and `legoUrl`.

- [ ] **Step 3: Open the app and navigate to Lion Knights Castle**

Scroll to the bottom of the detail panel. The "Building Instructions" section should show:

- "Part 1 of 2" download card
- "Part 2 of 2" download card
- "LEGO.com ↗" link

- [ ] **Step 4: Update roadmap**

In `docs/roadmap.md`, mark the In-App Building Instructions milestone tasks as complete (adjusting for the deferred items).

- [ ] **Step 5: Commit and push**

```bash
git add docs/roadmap.md
git commit -m "chore(roadmap): mark M5 Building Instructions done (viewer + step-tracking deferred)"
git push
```

---

## Summary

| Task | What | Time |
| --- | --- | --- |
| 1 | InstructionBooklet type + service + env key fix | 6 min |
| 2 | Supabase Edge Function (Deno) | 4 min |
| 3 | useInstructions hook + InstructionsSection UI + CSS | 8 min |
| 4 | Deploy + smoke test + roadmap | 5 min |

**Total:** ~23 min
