/**
 * Retired. Do not run this to create Stripe products.
 *
 * Checkout (api/create-checkout-session.js) uses inline price_data:
 *   - Never Miss a Job — Setup: $500 one-time
 *   - Never Miss a Job: $197/month
 * No Price IDs are invented here. STRIPE_SECRET_KEY is still required on Vercel.
 *
 * Phone, SMS, and AI usage are passed through at cost and are not a Stripe line item.
 *
 * If the Stripe dashboard still has the old prices, archive them. Do not delete
 * prices that old invoices already reference:
 *   - Omnix Monthly Plan — $597/month
 *   - Omnix Yearly Plan — $3,564/year
 *   - Omnix Setup Fee (Monthly) — $1,499
 *   - Omnix Setup Fee (Yearly) — $749
 *   - Any Web Pack, AI Receptionist, or Ads prices at $297/month or $499/month
 *     (env vars STRIPE_WEBPACK_*, STRIPE_RECEPTIONIST_*, STRIPE_ADS_*,
 *     STRIPE_MONTHLY_PRICE_ID, STRIPE_YEARLY_PRICE_ID,
 *     STRIPE_MONTHLY_SETUP_FEE_PRICE_ID, STRIPE_YEARLY_SETUP_FEE_PRICE_ID)
 * Those env vars are no longer read.
 *
 * Starter and Premium on /start are PROPOSED. Do not create Stripe prices for
 * them until Big Chicken approves a price.
 */

console.error('setup-stripe.js does not create products. Checkout uses inline price_data: $500 setup + $197/month.');
process.exit(1);
