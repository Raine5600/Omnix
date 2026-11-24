async function startCoreCheckout(button, idleLabel) {
  if (!button) return;
  var errorEl = document.getElementById('checkout-error');
  if (errorEl) errorEl.textContent = '';
  button.disabled = true;
  var previous = button.textContent;
  button.textContent = 'Opening checkout…';

  try {
    var res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'never-miss-a-job' }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Checkout did not start.');
    }
    window.location.href = data.url;
  } catch (err) {
    button.disabled = false;
    button.textContent = idleLabel || previous;
    var message = 'Checkout did not start. Email contact@omnixgenerational.com and we will help you buy Never Miss a Job.';
    if (errorEl) errorEl.textContent = message;
  }
}
