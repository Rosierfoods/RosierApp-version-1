import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import { useMemo } from 'react';
import { COINS, coinsForAmount } from '../config/coins';
import { findVariant, STORE_URL, useProducts } from '../data/catalog';
import { CartItem, useCart, useCoins } from '../store/shop';
import type { Product, Variant } from '../data/types';
import { createCheckout, getShopifyFlags } from '../store/auth';
import { checkoutKitAvailable, presentCheckout } from './checkoutKit';
import { useCartQuote } from './cartQuote';

export type CartLine = CartItem & { product: Product; variant: Variant; offers?: { title: string; amount: number }[] };


/** Everything the cart screen and checkout need, derived from stores. */
export function useCartSummary() {
  const items = useCart((s) => s.items);
  const products = useProducts();
  const voucherId = useCoins((s) => s.voucherId);

  // Lines as they are in the cart, then Shopify's own prices for the selected ones.
  const base = useMemo(
    () =>
      items
        .map((i) => {
          const hit = findVariant(products, i.variantId);
          return hit ? { ...i, product: hit.product, variant: hit.variant } : null;
        })
        .filter(Boolean) as CartLine[],
    [items, products],
  );
  const quoteLines = useMemo(() => base.filter((l) => l.selected && l.variant.available).map((l) => ({ variantId: l.variantId, qty: l.qty })), [base]);
  const quote = useCartQuote(quoteLines);

  return useMemo(() => {
    const byId = new Map((quote?.lines ?? []).map((q) => [String(q.variantId), q]));
    const lines = base.map((l) => {
      const q = l.selected ? byId.get(String(l.variantId)) : undefined;
      if (!q || q.qty !== l.qty) return l;
      const price = q.price;
      const mrp = Math.max(q.mrp, price);
      return { ...l, variant: { ...l.variant, price, mrp, discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0 }, offers: q.offers };
    });
    const selected = lines.filter((l) => l.selected && l.variant.available);
    const mrp = selected.reduce((n, l) => n + l.variant.mrp * l.qty, 0);
    const subtotal = Math.round(selected.reduce((n, l) => n + l.variant.price * l.qty, 0) * 100) / 100;
    // Order offers from the store (e.g. "extra 10% off above ₹1,999"), exactly as Shopify applies them.
    const orderOffers = (quote?.orderOffers ?? []).filter((o) => !o.code && o.amount > 0);
    const orderOff = Math.min(subtotal, orderOffers.reduce((n, o) => n + o.amount, 0));
    const afterOffers = subtotal - orderOff;
    const voucher = COINS.vouchers.find((v) => v.id === voucherId) ?? null;
    const voucherOk = !!voucher && afterOffers >= COINS.minCartForVoucher;
    const voucherValue = voucherOk ? Math.min(voucher!.value, afterOffers) : 0;
    // Shipping is calculated by Shopify at checkout.
    const total = Math.max(0, Math.round((afterOffers - voucherValue) * 100) / 100);
    const coins = coinsForAmount(afterOffers - voucherValue);
    const count = selected.reduce((n, l) => n + l.qty, 0);
    return { lines, selected, mrp, subtotal, savings: mrp - subtotal, orderOffers, orderOff, voucher, voucherOk, voucherValue, total, coins, count, fromShopify: !!quote };
  }, [base, quote, voucherId]);
}

const BROWSER = { toolbarColor: '#3E2415', controlsColor: '#F3D48B', presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET };

/** Opens a page in the in-app browser and resolves when the person comes back to the app. */
function openAndWait(url: string) {
  if (Platform.OS !== 'android') return WebBrowser.openBrowserAsync(url, BROWSER).then(() => undefined);
  // On Android the call returns straight away, so wait until the app is in front again.
  return new Promise<void>((resolve) => {
    let left = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') left = true;
      else if (left) {
        sub.remove();
        resolve();
      }
    });
    WebBrowser.openBrowserAsync(url, BROWSER).catch(() => {
      sub.remove();
      resolve();
    });
  });
}

/**
 * Opens Shopify checkout with the selected lines already in the cart.
 * With the Storefront API switched on (admin panel → Shopify connection) this builds a
 * real Shopify cart linked to the logged-in customer; otherwise it uses the cart
 * permalink /cart/{variant}:{qty},…?discount=CODE.
 * Resolves when the person is back in the app.
 */
export type CheckoutResult = {
  mode: 'shopify' | 'web';
  loggedIn: boolean;
  /** Set when checkout ran inside the app (Checkout Kit): we know for sure whether they paid. */
  inApp?: boolean;
  completed?: boolean;
  orderId?: string;
};

export async function openCheckout(lines: { variantId: number; qty: number }[], discountCodes: string[] = []): Promise<CheckoutResult> {
  const codes = [...new Set(discountCodes.filter(Boolean))];
  if (getShopifyFlags().cartCheckout) {
    try {
      const r = await createCheckout(lines, codes);
      if (checkoutKitAvailable()) {
        // Checkout + payment inside the app.
        const o = await presentCheckout(r.url);
        return { mode: 'shopify', loggedIn: r.loggedIn, inApp: true, completed: o.completed, orderId: o.orderId };
      }
      await openAndWait(r.url);
      return { mode: 'shopify', loggedIn: r.loggedIn };
    } catch {
      // Fall back to the website cart below.
    }
  }
  const path = lines.map((l) => `${l.variantId}:${l.qty}`).join(',');
  const params = new URLSearchParams({ utm_source: 'rosier_app', utm_medium: 'app' });
  // Shopify accepts several codes separated by commas.
  if (codes.length) params.set('discount', codes.join(','));
  await openAndWait(`${STORE_URL}/cart/${path}?${params.toString()}`);
  return { mode: 'web', loggedIn: false };
}

export const openStorePage = (path: string) =>
  WebBrowser.openBrowserAsync(`${STORE_URL}${path}`, { toolbarColor: '#3E2415', controlsColor: '#F3D48B' });
