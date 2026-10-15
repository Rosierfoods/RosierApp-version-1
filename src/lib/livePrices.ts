/**
 * Prices and gift offers exactly as on rosierfoods.com.
 * The server reads them from Shopify every 15 minutes (after the store's automatic
 * discounts), so a price or offer changed on the website shows in the app by itself.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_URL } from '../config/remote';
import { storage } from '../store/storage';
import type { Product } from '../data/types';

export type LivePrice = { p: number; m: number; o?: string[] };

type State = {
  at: number;
  prices: Record<string, LivePrice>;
  /** Shopify's automatic gift / free-shipping tiers, in the admin panel's rewards shape. */
  rewards: any[];
  refresh: () => Promise<void>;
};

export const useLivePrices = create<State>()(
  persist(
    (set) => ({
      at: 0,
      prices: {},
      rewards: [],
      refresh: async () => {
        if (!API_URL) return;
        try {
          const r = await fetch(`${API_URL}/api/store/prices`);
          if (!r.ok) return;
          const j = await r.json();
          if (j && typeof j.prices === 'object') set({ at: Number(j.at) || 0, prices: j.prices ?? {}, rewards: Array.isArray(j.rewards) ? j.rewards : [] });
        } catch {
          /* offline — keep the last prices */
        }
      },
    }),
    { name: 'rosier-live-prices', storage, partialize: ({ at, prices, rewards }) => ({ at, prices, rewards }) },
  ),
);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Puts the website's real prices on the products (when the server has them). */
export function applyLivePrices(products: Product[], prices: Record<string, LivePrice>): Product[] {
  if (!prices || !Object.keys(prices).length) return products;
  return products.map((p) => {
    let changed = false;
    const variants = p.variants.map((v) => {
      const lp = prices[String(v.id)];
      if (!lp || !(Number(lp.p) >= 0) || !(Number(lp.m) > 0)) return v;
      const price = round2(Number(lp.p));
      const mrp = Math.max(round2(Number(lp.m)), price);
      if (price === v.price && mrp === v.mrp) return v;
      changed = true;
      return { ...v, price, mrp, discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0 };
    });
    return changed ? { ...p, variants } : p;
  });
}
