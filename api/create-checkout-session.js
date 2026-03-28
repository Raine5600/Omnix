const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Map of product keys to their Stripe price IDs (set via Vercel env vars)
const PRICE_IDS = {
  webpack: {
    monthly: process.env.STRIPE_WEBPACK_MONTHLY,
    yearly:  process.env.STRIPE_WEBPACK_YEARLY,
  },
  receptionist: {
    monthly: process.env.STRIPE_RECEPTIONIST_MONTHLY,
    yearly:  process.env.STRIPE_RECEPTIONIST_YEARLY,
  },
  ads: {
    monthly: process.env.STRIPE_ADS_MONTHLY,
    yearly:  process.env.STRIPE_ADS_YEARLY,
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { product, billing } = req.body;
    // product: 'webpack' | 'receptionist' | 'ads'
    // billing: 'monthly' | 'yearly'

    const priceId = PRICE_IDS[product]?.[billing];

    if (!priceId) {
      return res.status(400).json({
        error: `No price configured for product="${product}" billing="${billing}"`,
      });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
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
