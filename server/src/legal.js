/**
 * Store-required pages and account deletion:
 *  - /privacy          public privacy policy (text edited in the admin panel → Privacy & account deletion)
 *  - /terms            public terms of use for the app
 *  - /delete-account   public page to ask for account deletion (Google Play needs a web link)
 *  - reported reviews  customers can report a review from the app; the team sees them in the admin panel
 *  - API for the app's "Delete my account" and the admin list of requests.
 */
import { query } from './db.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export async function legalContent() {
  const { rows } = await query("select published from content where key = 'legal'");
  return rows[0]?.published ?? {};
}

/** Very small text → HTML: "## Heading", "- bullet", blank line = new paragraph. */
function textToHtml(text, vars) {
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ''));
  const out = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('- ')) {
      list = list || [];
      list.push(`<li>${fill(esc(line.slice(2)))}</li>`);
      continue;
    }
    if (list) {
      out.push(`<ul>${list.join('')}</ul>`);
      list = null;
    }
    if (!line) continue;
    if (line.startsWith('## ')) out.push(`<h2>${fill(esc(line.slice(3)))}</h2>`);
    else out.push(`<p>${fill(esc(line))}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  // Make e-mail addresses clickable.
  return out
    .join('\n')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(>])([\w.+-]+@[\w-]+\.[\w.]+)/g, '$1<a href="mailto:$2">$2</a>');
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Rosier Foods</title>
<style>
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#FFFBF5;color:#2B1A10;margin:0;line-height:1.6}
main{max-width:760px;margin:0 auto;padding:32px 20px 60px}
h1{font-family:Georgia,serif;color:#3E2415;font-size:30px;margin:0 0 4px}
h2{font-family:Georgia,serif;color:#9A5B22;font-size:20px;margin:28px 0 6px}
p,li{font-size:15.5px}.muted{color:#7A6453;font-size:14px}
a{color:#A56312}
form{background:#fff;border:1px solid #EFDCC6;border-radius:16px;padding:20px;margin-top:20px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}
input,textarea{width:100%;box-sizing:border-box;border:1px solid #EFDCC6;border-radius:12px;padding:12px;font:inherit;background:#FFFBF5}
button{margin-top:18px;background:#3E2415;color:#FBE6CF;border:0;border-radius:24px;padding:13px 26px;font-weight:600;font-size:15px;cursor:pointer}
.ok{background:#E4F2E1;color:#2F8A3E;border-radius:12px;padding:14px;margin-top:16px}
.err{background:#FDECEA;color:#B3261E;border-radius:12px;padding:14px;margin-top:16px}
</style></head><body><main>${body}</main></body></html>`;

function varsOf(c) {
  const store = (c.storeUrl || 'https://www.rosierfoods.com').replace(/\/$/, '');
  return {
    company: c.companyName || 'Rosier Foods Private Limited',
    email: c.contactEmail || 'support@rosierfoods.com',
    address: c.address || '',
    days: String(c.deletionDays || 7),
    grievanceName: c.grievanceName || 'Grievance Officer',
    grievanceEmail: c.grievanceEmail || c.contactEmail || 'support@rosierfoods.com',
    grievancePhone: c.grievancePhone || '',
    storeTerms: c.storeTermsUrl || `${store}/policies/terms-of-service`,
    refunds: c.refundUrl || `${store}/policies/refund-policy`,
    shipping: c.shippingUrl || `${store}/policies/shipping-policy`,
  };
}

/** Grievance officer — Consumer Protection (E-Commerce) Rules, 2020 and IT Rules, 2021 (India). */
function grievanceHtml(v, address) {
  return `<h2>Grievance officer</h2><p>${esc(v.grievanceName)}<br>${esc(v.company)}${address ? `<br>${esc(address)}` : ''}<br>Email: <a href="mailto:${esc(v.grievanceEmail)}">${esc(v.grievanceEmail)}</a>${v.grievancePhone ? `<br>Phone: ${esc(v.grievancePhone)}` : ''}</p><p class="muted">We acknowledge complaints within 48 hours and resolve them within one month.</p>`;
}

export async function privacyPage() {
  const c = await legalContent();
  const vars = varsOf(c);
  return page(
    'Privacy policy',
    `<h1>Privacy policy</h1><p class="muted">Rosier Foods app · Last updated ${esc(c.updated || '')}</p>${textToHtml(c.privacyText, vars)}
<h2>Delete your account</h2><p>You can delete your account from the app (Profile → Delete my account) or on <a href="/delete-account">this page</a>.</p>
${grievanceHtml(vars, c.address)}<p class="muted"><a href="/terms">Terms of use</a></p>`,
  );
}

export async function termsPage() {
  const c = await legalContent();
  const vars = varsOf(c);
  return page(
    'Terms of use',
    `<h1>Terms of use</h1><p class="muted">Rosier Foods app · Last updated ${esc(c.updated || '')}</p>${textToHtml(c.termsText, vars)}
${grievanceHtml(vars, c.address)}<p class="muted"><a href="/privacy">Privacy policy</a> · <a href="/delete-account">Delete your account</a></p>`,
  );
}

export async function deletePage({ done = false, error = '' } = {}) {
  const c = await legalContent();
  const days = c.deletionDays || 7;
  return page(
    'Delete your account',
    `<h1>Delete your Rosier account</h1>
<p>Tell us the email or phone number you use with Rosier. We'll delete your account and personal data within ${esc(days)} days and email you when it's done.</p>
<p class="muted">What gets deleted: your account, name, email, phone number, saved addresses, Rosier Coins, wishlist and app notifications. What we keep: invoices and order records we must keep by law (for example GST records), without using them for anything else.</p>
<p class="muted">Using the app? It's quicker there: Profile → Delete my account.</p>
${done ? '<div class="ok">Got it. Your request is in — we’ll take care of it and email you once it’s done.</div>' : ''}
${error ? `<div class="err">${esc(error)}</div>` : ''}
${done ? '' : `<form method="post" action="/delete-account">
<label for="e">Email or phone number</label><input id="e" name="contact" required maxlength="200" autocomplete="email">
<label for="n">Your name (optional)</label><input id="n" name="name" maxlength="80" autocomplete="name">
<label for="r">Anything you'd like to tell us? (optional)</label><textarea id="r" name="reason" rows="3" maxlength="500"></textarea>
<button type="submit">Request account deletion</button></form>`}
<p class="muted" style="margin-top:24px">Questions? Write to ${esc(c.contactEmail || 'support@rosierfoods.com')}. <a href="/privacy">Privacy policy</a></p>`,
  );
}

/** A deletion request, from the app (logged-in customer) or the web page. */
export async function requestDeletion({ customer = null, contact = '', name = '', reason = '', source = 'app', deviceId = '' }) {
  const email = clip(customer?.email || (String(contact).includes('@') ? contact : ''), 200) || null;
  const phone = clip(customer?.phone || (!String(contact).includes('@') ? contact : ''), 40) || null;
  if (!email && !phone) throw Object.assign(new Error('Please enter your email or phone number.'), { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Please check the email address.'), { status: 400 });
  if (phone && !email && String(phone).replace(/\D/g, '').length < 10) throw Object.assign(new Error('Please check the phone number.'), { status: 400 });
  // One open request per person is enough.
  const open = await query("select id from deletion_requests where status = 'pending' and (($1::text is not null and email = $1) or ($2::text is not null and phone = $2)) limit 1", [email, phone]);
  if (open.rows[0]) return { ok: true, id: open.rows[0].id, already: true };
  const { rows } = await query(
    'insert into deletion_requests (customer_id, email, phone, name, reason, source, device_id) values ($1, $2, $3, $4, $5, $6, $7) returning id',
    [customer?.id ? String(customer.id).split('/').pop() : null, email, phone, clip(name || customer?.name, 80) || null, clip(reason, 500), source, clip(deviceId, 80) || null],
  );
  // Stop notifications to this person straight away.
  if (customer?.id) await query('update push_devices set enabled = false where customer_id = $1', [String(customer.id).split('/').pop()]);
  if (deviceId) await query('update push_devices set enabled = false where device_id = $1', [clip(deviceId, 80)]);
  return { ok: true, id: rows[0].id };
}

export async function listRequests() {
  const { rows } = await query('select * from deletion_requests order by (status = \'pending\') desc, created_at desc limit 200');
  return rows;
}

export async function markDone(id, by, note = '') {
  await query("update deletion_requests set status = 'done', done_at = now(), done_by = $2, note = $3 where id = $1", [Number(id), by, clip(note, 300)]);
  // Forget their app data on our side too.
  const { rows } = await query('select customer_id, device_id from deletion_requests where id = $1', [Number(id)]);
  const r = rows[0];
  if (r?.customer_id) await query('delete from push_devices where customer_id = $1', [r.customer_id]);
  if (r?.device_id) {
    await query('delete from push_devices where device_id = $1', [r.device_id]);
    await query('delete from push_outbox where device_id = $1', [r.device_id]);
    await query('delete from app_sessions where device_id = $1', [r.device_id]).catch(() => {});
  }
  return listRequests();
}

/* ───────── Reported reviews ───────── */

/** A customer reported a review in the app. Each phone can report a review once. */
export async function reportReview({ reviewId, productId = '', product = '', reason = '', excerpt = '', deviceId = '' }) {
  const id = clip(reviewId, 80);
  if (!id) throw Object.assign(new Error('Missing review.'), { status: 400 });
  await query(
    'insert into review_reports (review_id, product_id, product, reason, excerpt, device_id) values ($1, $2, $3, $4, $5, $6) on conflict do nothing',
    [id, clip(productId, 120) || null, clip(product, 160) || null, clip(reason, 60), clip(excerpt, 300), clip(deviceId, 80) || null],
  );
  return { ok: true };
}

export async function listReports() {
  const { rows } = await query(
    `select review_id, max(product) as product, max(product_id) as product_id, max(excerpt) as excerpt,
            string_agg(distinct reason, ', ') as reasons, count(*)::int as reports,
            bool_or(status = 'pending') as pending, max(created_at) as last_at, max(done_at) as done_at
       from review_reports group by review_id
      order by bool_or(status = 'pending') desc, max(created_at) desc limit 200`,
  );
  return rows;
}

export async function markReportDone(reviewId, by) {
  await query("update review_reports set status = 'done', done_at = now(), done_by = $2 where review_id = $1 and status = 'pending'", [clip(reviewId, 80), by]);
  return listReports();
}
