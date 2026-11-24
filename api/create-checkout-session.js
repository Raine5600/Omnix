// Prices live only here. A client-sent amount is ignored.
// Phone, SMS, and AI usage are passed through at cost and are not a line item.
const PACKAGES = {
  'never-miss-a-job': {
    id: 'never-miss-a-job',
    name: 'Never Miss a Job',
    setupCents: 50000,
    monthlyCents: 19700,
    guarantee: true,
    monthlyDescription: 'Monthly. Missed-call text-back with after-hours answering, non-gated review requests after every job, an estimate follow-up sequence, and a custom website. Phone, SMS, and AI usage are billed separately at cost. 30-day money-back guarantee: first month back if no tracked paying customer within 30 days of going live. Setup fee is not refundable.',
    setupDescription: 'One-time setup. Live within 7 days of purchase. Starts with a short kickoff call. This setup fee is not refundable.',
    cancelPath: '/pricing',
  },
  'answer-the-call': {
    id: 'answer-the-call',
    name: 'Answer the Call',
    setupCents: 35000,
    monthlyCents: 9700,
    guarantee: true,
    monthlyDescription: 'Monthly. Missed-call text-back with after-hours answering and a custom website. Does not include review requests or estimate follow-up. Phone, SMS, and AI usage are billed separately at cost. 30-day money-back guarantee: first month back if no tracked paying customer within 30 days of going live. Setup fee is not refundable.',
    setupDescription: 'One-time setup. Live within 7 days of purchase. Starts with a short kickoff call. This setup fee is not refundable.',
    cancelPath: '/start',
  },
};

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
  const product = body.product;
  const pkg = PACKAGES[product];

  // Custom AI and anything else are not for sale. Client-sent amounts are ignored.
  if (!pkg) {
    return res.status(400).json({
      error: 'That package cannot be purchased here.',
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
            unit_amount: pkg.monthlyCents,
            recurring: { interval: 'month' },
            product_data: {
              name: pkg.name,
              description: pkg.monthlyDescription,
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pkg.setupCents,
            product_data: {
              name: pkg.name + ' — Setup',
              description: pkg.setupDescription,
            },
          },
        },
      ],
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      success_url: `${origin}/success?type=purchase&package=${pkg.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${pkg.cancelPath}`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};

module.exports.PACKAGES = PACKAGES;
