const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

// Keep these messages aligned with api/intake.js.
export function validateIntake(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Send the intake fields as JSON.";
  }

  const keys = Object.keys(body);
  if (keys.some((key) => /password|passwd|secret/i.test(key))) {
    return "Do not send passwords. Add contact@omnixgenerational.com as a manager or delegate instead.";
  }

  const name = String(body.name || "").trim();
  const business = String(body.business_name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();

  if (!name && !business) return "Add your name or your business name.";
  if (!phone && !email) return "Add a phone number or an email address.";
  if (phone && digits(phone).length < 10) {
    return "Enter a phone number with at least 10 digits, or leave phone blank and use email.";
  }
  if (email && !EMAIL_RE.test(email)) return "That email address does not look valid.";
  return null;
}

export const INTAKE_FIELDS = [
  "name",
  "business_name",
  "phone",
  "email",
  "logo_link",
  "photo_link",
  "brand_colors",
  "services",
  "service_area",
  "hours",
  "gbp_access",
  "domain_name",
  "domain_access",
  "phone_provider",
  "past_customers",
  "past_customers_link",
  "open_estimates",
  "open_estimates_link",
  "stripe_session_id",
];

export function pickIntake(body) {
  const out = {};
  for (const key of INTAKE_FIELDS) {
    if (body[key] == null) continue;
    out[key] = String(body[key]).trim().slice(0, 5000);
  }
  return out;
}
