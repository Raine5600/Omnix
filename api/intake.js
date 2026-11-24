/**
 * Server-side check for the post-purchase intake form.
 *
 * This does not store the submission and does not open a HubSpot ticket.
 * The browser submits the same answers (plus files) to Web3Forms, which is
 * the form backend contact.html already uses.
 *
 * TODO(Big Chicken): on a real submit, open one HubSpot ticket in portal 248103970
 * and keep the answers, customer list, and estimate list only in that client's
 * folder. Do not add a password field. Google Business Profile and the domain
 * are manager/delegate access, or they get done on the kickoff call.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function validateIntake(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Send the intake fields as JSON.';
  }

  const keys = Object.keys(body);
  if (keys.some((key) => /password|passwd|secret/i.test(key))) {
    return 'Do not send passwords. Add contact@omnixgenerational.com as a manager or delegate instead.';
  }

  const name = String(body.name || '').trim();
  const business = String(body.business_name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();

  if (!name && !business) {
    return 'Add your name or your business name.';
  }
  if (!phone && !email) {
    return 'Add a phone number or an email address.';
  }
  if (phone && digits(phone).length < 10) {
    return 'Enter a phone number with at least 10 digits, or leave phone blank and use email.';
  }
  if (email && !EMAIL_RE.test(email)) {
    return 'That email address does not look valid.';
  }

  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const error = validateIntake(req.body);
  if (error) return res.status(400).json({ error });

  return res.status(200).json({ ok: true });
};

module.exports.validateIntake = validateIntake;
