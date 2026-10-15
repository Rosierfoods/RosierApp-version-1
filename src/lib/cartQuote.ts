/**
 * Shopify's own prices for the cart (same engine as the website cart and checkout):
 * line prices after the store's automatic offers, order offers and the total.
 * Asked again whenever the cart changes (after a short pause). If the server can't be
 * reached, the cart falls back to the synced product prices.
 */
import { useEffect, useState } from 'react';
import { API_URL } from '../config/remote';

export type QuoteLine = { variantId: string; qty: number; price: number; mrp: number; total: number; offers: { title: string; amount: number }[] };
export type CartQuote = { source: 'shopify'; lines: QuoteLine[]; subtotal: number; total: number; orderOffers: { title: string; amount: number; code?: boolean }[] };

const cache = new Map<string, { at: number; quote: CartQuote }>();
const inflight = new Map<string, Promise<CartQuote | null>>();
const FRESH = 60_000;

export function quoteKey(lines: { variantId: number; qty: number }[]) {
  return lines
    .filter((l) => l.qty > 0)
    .map((l) => `${l.variantId}:${l.qty}`)
    .sort()
    .join(',');
}

async function fetchQuote(key: string, lines: { variantId: number; qty: number }[]): Promise<CartQuote | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH) return hit.quote;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${API_URL}/api/store/cart-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (!r.ok) return null;
      const q = (await r.json()) as CartQuote;
      if (!q || !Array.isArray(q.lines)) return null;
      cache.set(key, { at: Date.now(), quote: q });
      if (cache.size > 50) cache.delete(cache.keys().next().value!);
      return q;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** The latest Shopify quote for these lines, or null while loading / offline. */
export function useCartQuote(lines: { variantId: number; qty: number }[]) {
  const key = quoteKey(lines);
  const [state, setState] = useState<{ key: string; quote: CartQuote | null }>(() => ({ key, quote: cache.get(key)?.quote ?? null }));
  useEffect(() => {
    if (!API_URL || !key) return;
    const cached = cache.get(key);
    if (cached) setState({ key, quote: cached.quote });
    let alive = true;
    const id = setTimeout(
      () => {
        fetchQuote(key, lines).then((q) => {
          if (alive && q) setState({ key, quote: q });
        });
      },
      cached ? 0 : 450,
    );
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Only use a quote that matches the cart as it is now.
  return state.key === key ? state.quote : null;
}
