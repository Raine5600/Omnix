const CORE_PRODUCT = 'never-miss-a-job';

// Approved price only. Inline price_data so checkout does not depend on
// dashboard Price IDs (and so we do not invent IDs here).
// Setup $500 once + Never Miss a Job $197/month.
// Phone, SMS, and AI usage are passed through at cost and are NOT part of this charge.
const SETUP_CENTS = 50000;
const MONTHLY_CENTS = 19700;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const product = body.product || CORE_PRODUCT;

  // Starter and Premium are proposals. Never create a Checkout Session for them.
  // TODO(Big Chicken): when you approve another tier, add it here on purpose.
  if (product !== CORE_PRODUCT) {
    return res.status(400).json({
      error: 'Only Never Miss a Job can be purchased here. Other packages are proposed and are not for sale.',
    });
  }

  const stripe = getStripe();
  if (!stripe) {
    return res.status(500).json({ error: 'Checkout is not configured yet.' });
  }

  try {
    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: MONTHLY_CENTS,
            recurring: { interval: 'month' },
            product_data: {
              name: 'Never Miss a Job',
              description: 'Monthly. Missed-call text-back with after-hours answering, non-gated review requests after every job, an estimate follow-up sequence, and a custom website. Phone, SMS, and AI usage are billed separately at cost.',
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: SETUP_CENTS,
            product_data: {
              name: 'Never Miss a Job — Setup',
              description: 'One-time setup. Live within 7 days of purchase. Starts with a short kickoff call.',
            },
          },
        },
      ],
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      success_url: `${origin}/success?type=purchase&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};

module.exports.CORE_PRODUCT = CORE_PRODUCT;
module.exports.SETUP_CENTS = SETUP_CENTS;
module.exports.MONTHLY_CENTS = MONTHLY_CENTS;
