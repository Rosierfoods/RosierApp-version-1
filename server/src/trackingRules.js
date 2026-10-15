/**
 * Hide tracking for chosen products (admin panel → Order tracking).
 *
 * If an order contains any of the chosen products, the server removes the tracking
 * details before they reach the app, so they can't be seen even by looking at the data:
 *  - "details": courier name, tracking number, tracking link, courier history and the
 *    website order-status link are removed; the simple status (shipped, delivered…) stays.
 *  - "all": every delivery update is removed; the customer only sees your message.
 * Delivery notifications for those orders can be turned off too.
 */
import { allSections } from './content.js';
import * as shopify from './shopify.js';
import * as website from './website.js';

const tail = (gid) => (gid == null ? '' : String(gid).split('/').pop());
const norm = (s) => String(s ?? '').trim().toLowerCase();

let ruleCache = null;
/** The published tracking settings, read at most every 30 seconds. */
async function rule() {
  if (ruleCache && Date.now() - ruleCache.at < 30_000) return ruleCache.value;
  let value = null;
  try {
    const row = (await allSections()).find((r) => r.key === 'tracking');
    const t = row?.published ?? {};
    const handles = (Array.isArray(t.hideForProducts) ? t.hideForProducts : []).map(String).filter(Boolean);
    if (handles.length) {
      value = {
        handles,
        mode: t.hideMode === 'all' ? 'all' : 'details',
        message: String(t.hiddenMessage || '').trim() || 'Tracking details aren’t available for this order. We’ll keep you posted when it’s on the way.',
        stopNotifications: !!t.hideNotifications,
      };
    }
  } catch {
    value = null;
  }
  ruleCache = { at: Date.now(), value };
  return value;
}

const productCache = new Map();
/** The chosen products' variant IDs and titles, so order items can be matched. */
async function productKeys(handles) {
  const key = handles.slice().sort().join(',');
  const hit = productCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
  const variants = new Set();
  const titles = new Set();
  const handleSet = new Set(handles.map(norm));
  let found = [];
  try {
    const { storefrontProducts } = await import('./catalog.js');
    found = await storefrontProducts(handles);
  } catch {
    found = [];
  }
  const missing = handles.filter((h) => !found.some((p) => p.handle === h));
  for (const h of missing) {
    try {
      found.push(await website.productJson(h));
    } catch {
      /* not on the website either */
    }
  }
  for (const p of found) {
    titles.add(norm(p.title));
    for (const v of p.variants ?? []) variants.add(String(v.id));
  }
  const value = { variants, titles, handles: handleSet };
  productCache.set(key, { at: Date.now(), value });
  return value;
}

/** Does this order contain a product whose tracking is hidden? */
function orderMatches(keys, items) {
  return (items ?? []).some(
    (it) =>
      (it.variantId && keys.variants.has(tail(it.variantId))) ||
      (it.handle && keys.handles.has(norm(it.handle))) ||
      (it.title && keys.titles.has(norm(it.title))),
  );
}

/** Removes tracking from an order (app shape) when it has a hidden product. */
function redact(order, r) {
  if (r.mode === 'all') {
    return { ...order, shipments: [], fulfillmentStatus: null, statusPageUrl: '', trackingHidden: 'all', trackingNote: r.message };
  }
  return {
    ...order,
    statusPageUrl: '',
    trackingHidden: 'details',
    trackingNote: r.message,
    shipments: (order.shipments ?? []).map((s) => ({ ...s, company: '', number: '', url: '', events: [] })),
  };
}

/**
 * Apply the rule to app orders. `rawItems(order, index)` gives each order's items with
 * variantId / handle / title (whatever Shopify returned).
 */
export async function applyToOrders(orders, rawItems) {
  const r = await rule();
  if (!r || !orders?.length) return orders;
  const keys = await productKeys(r.handles);
  return orders.map((o, i) => (orderMatches(keys, rawItems(o, i)) ? redact(o, r) : o));
}

/** For delivery notifications: null = normal, otherwise how to treat this order. */
export async function notificationRule(items) {
  const r = await rule();
  if (!r) return null;
  const keys = await productKeys(r.handles);
  if (!orderMatches(keys, items)) return null;
  return { stop: r.stopNotifications || r.mode === 'all', hideCourier: true };
}

/** For tests and the admin panel. */
export function clearCache() {
  ruleCache = null;
  productCache.clear();
}
