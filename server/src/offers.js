/**
 * Prices and offers exactly as the website shows them.
 *
 * Shopify itself works out every price, so the app never guesses:
 *  - Product prices: every 15 minutes the server puts each product (on its own) in a
 *    throwaway Shopify cart and reads the price after the store's automatic discounts.
 *    The app shows these prices on product pages and lists.
 *  - The cart: the app sends its items, the server builds a throwaway Shopify cart and
 *    returns Shopify's own line prices, offers and total — the same numbers the website
 *    cart and checkout show.
 *  - Cart gifts: active "Buy X get Y" / free-gift / free-shipping automatic discounts with
 *    a minimum cart amount are read from Shopify, so the gift bar matches the website.
 * Nothing is ever ordered; the carts are thrown away.
 */
import crypto from 'node:crypto';
import { query } from './db.js';
import * as shopify from './shopify.js';

const PRICE_KEY = 'prices:website';
const REWARDS_KEY = 'rewards:shopify';
const SYNC_EVERY = 15 * 60 * 1000;
const INSTANCE = crypto.randomBytes(6).toString('hex');

const num = (m) => Math.round(Number(m?.amount ?? 0) * 100) / 100;
const vid = (gid) => String(gid ?? '').split('/').pop();

/* ───────── Shared storage (several server copies read the same values) ───────── */

async function readSetting(key) {
  const { rows } = await query('select value from settings where key = $1', [key]);
  if (!rows[0]) return null;
  const v = rows[0].value;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

async function writeSetting(key, value) {
  await query(
    `insert into settings (key, value, updated_at, updated_by) values ($1, $2, now(), 'price sync')
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [key, JSON.stringify(value)],
  );
}

/** Only one server copy runs the sync at a time. */
async function claimLease() {
  const { rows } = await query(
    `insert into settings (key, value, updated_at, updated_by) values ('lease:price-sync', $1, now(), $2)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
     where settings.updated_at < now() - interval '12 minutes'
     returning key`,
    [JSON.stringify({ instance: INSTANCE }), `server ${INSTANCE}`],
  );
  return rows.length > 0;
}

/* ───────── Shopify cart pricing ───────── */

const ALLOC = `discountedAmount { amount } __typename
  ... on CartAutomaticDiscountAllocation { title }
  ... on CartCodeDiscountAllocation { code }
  ... on CartCustomDiscountAllocation { title }`;

const CART_FIELDS = `
  cost { subtotalAmount { amount } totalAmount { amount } }
  discountAllocations { ${ALLOC} }
  lines(first: 100) { nodes {
    quantity
    merchandise { ... on ProductVariant { id price { amount } compareAtPrice { amount } } }
    cost { subtotalAmount { amount } totalAmount { amount } compareAtAmountPerQuantity { amount } }
    discountAllocations { ${ALLOC} }
  } }`;

const offerName = (a) => a.title || a.code || 'Offer';

function cleanLines(lines) {
  const merged = new Map();
  for (const l of Array.isArray(lines) ? lines : []) {
    const id = String(l?.variantId ?? '');
    const q = Math.floor(Number(l?.qty));
    if (!/^\d{1,20}$/.test(id) || !(q > 0)) continue;
    merged.set(id, Math.min(50, (merged.get(id) ?? 0) + q));
  }
  return [...merged].slice(0, 60).map(([id, q]) => ({ merchandiseId: `gid://shopify/ProductVariant/${id}`, quantity: q }));
}

async function priceCart(lines, codes = []) {
  const s = await shopify.getSettings();
  const data = await shopify.storefront(
    `mutation($input: CartInput!) { cartCreate(input: $input) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { input: { lines, buyerIdentity: { countryCode: s.countryCode || 'IN' }, ...(codes.length ? { discountCodes: codes } : {}) } },
  );
  const cart = data?.cartCreate?.cart;
  if (!cart) throw new shopify.ShopifyError(data?.cartCreate?.userErrors?.[0]?.message || 'Could not price the cart right now.', 502);
  return cart;
}

/** Shopify's cart line → what the app shows. */
function mapLine(n) {
  const qty = n.quantity || 1;
  const price = num(n.merchandise?.price);
  const compareAt = Math.max(num(n.merchandise?.compareAtPrice), num(n.cost?.compareAtAmountPerQuantity));
  const before = num(n.cost?.subtotalAmount) || price * qty;
  const total = num(n.cost?.totalAmount);
  const offers = (n.discountAllocations ?? []).map((a) => ({ title: offerName(a), amount: num(a.discountedAmount) })).filter((o) => o.amount > 0);
  const lineSaving = offers.reduce((t, o) => t + o.amount, 0);
  // Some API versions report totalAmount before line discounts; use whichever is lower.
  const after = Math.max(0, Math.min(total || before, before - lineSaving));
  const unit = Math.round((after / qty) * 100) / 100;
  // The struck-out price: the "compare at" price if there is one, else the price before offers.
  const mrp = Math.max(compareAt, price, unit);
  return { variantId: vid(n.merchandise?.id), qty, price: unit, mrp, total: Math.round(after * 100) / 100, offers };
}

/* ───────── Cart quote (cached for a minute) ───────── */

const quoteCache = new Map();

export async function quoteCart({ lines, codes }) {
  const clean = cleanLines(lines);
  if (!clean.length) return { lines: [], subtotal: 0, total: 0, orderOffers: [], source: 'shopify' };
  const c = [...new Set((Array.isArray(codes) ? codes : []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 5);
  const key = JSON.stringify([clean.map((l) => [l.merchandiseId, l.quantity]).sort(), c]);
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;

  const cart = await priceCart(clean, c);
  const out = (cart.lines?.nodes ?? []).map(mapLine);
  const linesTotal = out.reduce((t, l) => t + l.total, 0);
  const orderOffers = (cart.discountAllocations ?? []).map((a) => ({ title: offerName(a), amount: num(a.discountedAmount), code: a.__typename === 'CartCodeDiscountAllocation' })).filter((o) => o.amount > 0);
  const value = {
    source: 'shopify',
    lines: out,
    /** After product offers, before order-level offers. */
    subtotal: Math.round(linesTotal * 100) / 100,
    /** What Shopify will charge for the items (before shipping). */
    total: num(cart.cost?.totalAmount),
    orderOffers,
  };
  quoteCache.set(key, { at: Date.now(), value });
  if (quoteCache.size > 3000) quoteCache.clear();
  return value;
}

/* ───────── Product prices (synced every 15 minutes) ───────── */

async function allVariants() {
  const ids = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const data = await shopify.storefront(
      `query($after: String) { products(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { variants(first: 30) { nodes { id } } } } }`,
      { after },
    );
    const p = data?.products;
    for (const prod of p?.nodes ?? []) for (const v of prod.variants?.nodes ?? []) ids.push(vid(v.id));
    if (!p?.pageInfo?.hasNextPage) break;
    after = p.pageInfo.endCursor;
  }
  return ids;
}

let syncing = false;
let lastSync = 0;

/** Price every product on its own, as the website would for a single item. */
export async function syncPrices({ force = false } = {}) {
  if (syncing) return { busy: true };
  if (!force && Date.now() - lastSync < SYNC_EVERY - 60_000) return { skipped: true };
  const s = await shopify.getSettings();
  if (!s.shopDomain || !s.storefrontToken) return { skipped: true, reason: 'Storefront API not set up' };
  if (!force && !(await claimLease())) return { skipped: true };
  syncing = true;
  lastSync = Date.now();
  try {
    const ids = await allVariants();
    const prices = {};
    let failed = 0;
    // A few at a time, so Shopify isn't flooded.
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        try {
          const cart = await priceCart([{ merchandiseId: `gid://shopify/ProductVariant/${id}`, quantity: 1 }]);
          const line = cart.lines?.nodes?.[0];
          if (!line) continue;
          const m = mapLine(line);
          // Only product offers count here. Order offers ("10% off above ₹1,999") depend on the
          // whole cart, so the cart quote shows them instead.
          prices[id] = { p: m.price, m: m.mrp, o: m.offers.map((o) => o.title).slice(0, 2) };
        } catch {
          failed++;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (Object.keys(prices).length) await writeSetting(PRICE_KEY, { at: Date.now(), prices });
    // Gift tiers from Shopify's automatic discounts (needs the Admin API).
    let rewards = null;
    try {
      rewards = await shopify.adminAutomaticRewards();
      await writeSetting(REWARDS_KEY, { at: Date.now(), rewards });
    } catch {
      /* Admin API not set up or no read_discounts permission */
    }
    pricesCache = null;
    rewardsCache = null;
    return { ok: true, variants: Object.keys(prices).length, failed, rewards: rewards?.length ?? null };
  } finally {
    syncing = false;
  }
}

let pricesCache = null;
/** Latest synced prices for the app: { at, prices: { variantId: { p: price, m: struck-out price, o: offer names } } }. */
export async function publicPrices() {
  if (pricesCache && Date.now() - pricesCache.loaded < 60_000) return pricesCache.value;
  const value = (await readSetting(PRICE_KEY).catch(() => null)) ?? { at: 0, prices: {} };
  pricesCache = { loaded: Date.now(), value };
  return value;
}

let rewardsCache = null;
/** Shopify's automatic gift / free-shipping offers, in the admin panel's "rewards" shape. */
export async function shopifyRewards() {
  if (rewardsCache && Date.now() - rewardsCache.loaded < 60_000) return rewardsCache.value;
  const raw = (await readSetting(REWARDS_KEY).catch(() => null))?.rewards ?? [];
  const value = raw.map((r, i) => ({
    id: `shopify-${i}-${r.minAmount}`,
    enabled: true,
    qty: 1,
    autoAdd: r.kind === 'gift' && !!r.variantId,
    kind: r.kind,
    title: r.kind === 'gift' ? `🎁 ${r.giftTitle || r.title}` : r.kind === 'shipping' ? '🚚 Free shipping' : r.title,
    minAmount: r.minAmount,
    variantId: r.variantId || '',
    giftTitle: r.giftTitle || r.title,
    giftImage: r.giftImage || '',
    lockedText: r.kind === 'gift' ? 'Add ₹{left} more to get a FREE {gift}' : r.kind === 'shipping' ? 'Add ₹{left} more for FREE shipping' : 'Add ₹{left} more to unlock {gift}',
    unlockedText: r.kind === 'gift' ? 'Yay! You’ve unlocked a FREE {gift} 🎉' : r.kind === 'shipping' ? 'You’ve unlocked FREE shipping 🚚' : '{gift} unlocked 🎉',
    startAt: r.startAt || '',
    endAt: r.endAt || '',
  }));
  rewardsCache = { loaded: Date.now(), value };
  return value;
}

/** Status for the admin panel. */
export async function status() {
  const p = await readSetting(PRICE_KEY).catch(() => null);
  const r = await readSetting(REWARDS_KEY).catch(() => null);
  return { pricesAt: p?.at ?? 0, variants: Object.keys(p?.prices ?? {}).length, rewardsAt: r?.at ?? 0, rewards: r?.rewards ?? null, syncing };
}
