const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan } = req.body; // 'monthly' or 'yearly'

    const isYearly = plan === 'yearly';

    // Pick the correct recurring price and setup fee based on plan
    const subscriptionPriceId = isYearly
      ? process.env.STRIPE_YEARLY_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    const setupFeePriceId = isYearly
      ? process.env.STRIPE_YEARLY_SETUP_FEE_PRICE_ID
      : process.env.STRIPE_MONTHLY_SETUP_FEE_PRICE_ID;

    if (!subscriptionPriceId || !setupFeePriceId) {
      return res.status(500).json({ error: 'Stripe price IDs are not configured.' });
    }

    // Build the origin for redirect URLs
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Create the Stripe Checkout session.
    // Both the recurring subscription price and the one-time setup fee
    // are passed as line_items — Stripe supports mixing one-time and
    // recurring prices in subscription-mode checkout.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: subscriptionPriceId,
          quantity: 1,
        },
        {
          price: setupFeePriceId,
          quantity: 1,
        },
      ],
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      success_url: `${origin}/success.html?type=purchase&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
