/**
 * Run this once to create all Stripe products & prices for Omnix.
 * Usage: node setup-stripe.js sk_live_YOUR_SECRET_KEY
 */

const secretKey = process.argv[2];
if (!secretKey || !secretKey.startsWith('sk_')) {
  console.error('Usage: node setup-stripe.js sk_live_YOUR_SECRET_KEY');
  process.exit(1);
}

const stripe = require('stripe')(secretKey);

async function setup() {
  console.log('\n⏳ Creating Stripe products and prices...\n');

  // 1. Monthly subscription — $597/mo
  const monthly = await stripe.prices.create({
    currency: 'usd',
    unit_amount: 59700,
    recurring: { interval: 'month' },
    product_data: { name: 'Omnix Monthly Plan' },
  });

  // 2. Yearly subscription — $3,564/yr
  const yearly = await stripe.prices.create({
    currency: 'usd',
    unit_amount: 356400,
    recurring: { interval: 'year' },
    product_data: { name: 'Omnix Yearly Plan' },
  });

  // 3. Monthly setup fee — $1,499 one-time
  const setupMonthly = await stripe.prices.create({
    currency: 'usd',
    unit_amount: 149900,
    product_data: { name: 'Omnix Setup Fee (Monthly)' },
  });

  // 4. Yearly setup fee — $749 one-time
  const setupYearly = await stripe.prices.create({
    currency: 'usd',
    unit_amount: 74900,
    product_data: { name: 'Omnix Setup Fee (Yearly)' },
  });

  console.log('✅ Done! Add these to Vercel environment variables:\n');
  console.log(`STRIPE_SECRET_KEY          = ${secretKey}`);
  console.log(`STRIPE_MONTHLY_PRICE_ID    = ${monthly.id}`);
  console.log(`STRIPE_YEARLY_PRICE_ID     = ${yearly.id}`);
  console.log(`STRIPE_MONTHLY_SETUP_FEE_PRICE_ID = ${setupMonthly.id}`);
  console.log(`STRIPE_YEARLY_SETUP_FEE_PRICE_ID  = ${setupYearly.id}`);
  console.log('\nPaste these back to Claude and he will wire them in for you.\n');
}

setup().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
