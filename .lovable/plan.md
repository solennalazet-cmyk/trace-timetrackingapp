

# Monthly/Yearly Plan Toggle Implementation (revised)

## Overview
Add a monthly/yearly toggle to the upgrade UI, pass the selected interval to the checkout edge function, and display the correct refund-window notice with a contact email for yearly subscribers.

## What changes

### 1. New secret: `STRIPE_PRICE_ID_YEARLY`
Store the yearly Stripe Price ID as a separate secret. The existing `STRIPE_PRICE_ID` remains the monthly price.

### 2. Edge function: `create-checkout-session`
Accept an optional `interval` field (`"monthly"` or `"yearly"`). Use `STRIPE_PRICE_ID` for monthly, `STRIPE_PRICE_ID_YEARLY` for yearly. Default to monthly.

### 3. `src/lib/stripe.ts`
Update `redirectToCheckout` to accept an optional `interval` parameter and pass it in the invoke body.

### 4. PaywallModal — plan toggle
Replace the static button + "Or €39/year" text with a toggle (two pill buttons: Monthly / Yearly). Selected option updates the CTA text and passes the interval to `redirectToCheckout`.

### 5. AccountModal — upgrade sections
Same toggle treatment where the upgrade CTA appears (free plan and canceled sections).

### 6. Database: `billing_interval` column on `profiles`
Add a nullable `billing_interval` text column so the app knows whether the user is on monthly or yearly.

### 7. Webhook: store interval
On `checkout.session.completed` and `customer.subscription.updated`, read the subscription's recurring interval and write it to `profiles.billing_interval`.

### 8. Account modal — active yearly subscriber notice
For yearly subscribers, calculate whether they're within 30 days of their subscription start. If so, show:

> "You're within your 30-day refund window. Contact connect@lla-studio.com to request a refund."

The email will be rendered as a `mailto:` link. After 30 days the notice disappears.

### 9. Email protection
To protect `connect@lla-studio.com` from scrapers and spam bots:
- The address will **not** appear as plain text in the HTML source. It will be assembled at runtime in JavaScript (e.g., `const e = "connect" + "@" + "lla-studio.com"`), so crawlers scanning raw HTML won't find it.
- The `mailto:` link will only be rendered inside the Account modal for authenticated, yearly-plan users within the 30-day window — it's never exposed on a public page.

These two measures (JS-only assembly + authenticated-only rendering) are sufficient for a web app. No server-side email relay or CAPTCHA is needed here since the address is never on a publicly crawlable page.

### 10. Cancellation behaviour (no change)
Stripe already handles "cancel at period end." Both monthly and yearly subscribers keep access until their billing period ends. The 30-day refund for yearly is a manual process you handle via Stripe dashboard when contacted.

## Technical details

```text
PaywallModal / AccountModal
  ┌─────────────┬─────────────┐
  │   Monthly   │   Yearly    │  ← toggle
  └─────────────┴─────────────┘
  [Upgrade — €3.99/mo]  or  [Upgrade — €39/year · save 20%]
         │
         ▼
  redirectToCheckout("monthly" | "yearly")
         │
         ▼
  Edge function → picks STRIPE_PRICE_ID or STRIPE_PRICE_ID_YEARLY
         │
         ▼
  Stripe Checkout → webhook → profiles.billing_interval = "month" | "year"
```

## Files modified
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `src/lib/stripe.ts`
- `src/components/PaywallModal.tsx`
- `src/components/AccountModal.tsx`
- New migration for `billing_interval` column

