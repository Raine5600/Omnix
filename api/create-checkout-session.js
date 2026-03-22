const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan } = req.body; // 'monthly' or 'yearly'

    // Pick the correct recurring price based on the selected plan
    const subscriptionPriceId =
      plan === 'yearly'
        ? process.env.STRIPE_YEARLY_PRICE_ID
        : process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!subscriptionPriceId) {
      return res.status(500).json({ error: 'Stripe price IDs are not configured.' });
    }

    // Build the origin for redirect URLs
    const origin = req.headers.origin || `https://${req.headers.host}`;

    // Create the Stripe Checkout session
    // The one-time setup fee is added as an invoice item alongside the subscription
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: subscriptionPriceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        // Add the one-time setup fee to the first invoice
        add_invoice_items: [
          {
            price: process.env.STRIPE_SETUP_FEE_PRICE_ID,
            quantity: 1,
          },
        ],
      },
      // Collect billing address for tax purposes
      billing_address_collection: 'required',
      // Allow promo codes if you want to offer discounts later
      allow_promotion_codes: true,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing.html`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
