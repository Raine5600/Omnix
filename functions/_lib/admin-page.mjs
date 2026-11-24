import { escapeHtml } from "./http.mjs";

const FONT = "https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Inter:wght@400;500;600&display=swap";

function shell({ title, body, csrf, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="robots" content="noindex, nofollow">
  ${csrf ? `<meta name="csrf-token" content="${escapeHtml(csrf)}">` : ""}
  <link rel="icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONT}" rel="stylesheet">
  <link rel="stylesheet" href="/admin/admin.css">
  ${extraHead}
</head>
<body>
${body}
</body>
</html>`;
}

export function renderLogin({ configured = true } = {}) {
  const setup = configured
    ? ""
    : `<p class="notice">Admin login is not set up yet. Add the ADMIN_PASSWORD_HASH secret in Cloudflare, then reload this page. You can make that hash in the browser at <a href="/admin/hash-tool.html">the password hash page</a>. The password stays on that page.</p>`;
  return shell({
    title: "Sign in | Omnix Admin",
    body: `<main class="login-wrap">
  <form class="login-card" id="login-form">
    <img src="/Omnix-logo-only.png" alt="" width="88" height="88">
    <p class="brand-name">OMNIX</p>
    <h1>Admin</h1>
    ${setup}
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <p id="login-error" class="form-error" role="alert"></p>
    <button type="submit">Sign in</button>
  </form>
  <script>
    document.getElementById("login-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      var error = document.getElementById("login-error");
      var button = event.target.querySelector("button");
      error.textContent = "";
      button.disabled = true;
      try {
        var response = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: document.getElementById("email").value,
            password: document.getElementById("password").value
          })
        });
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(data.error || "Sign-in failed.");
        location.href = "/admin";
      } catch (err) {
        error.textContent = err.message || "Sign-in failed.";
        button.disabled = false;
      }
    });
  </script>
</main>`,
  });
}

export function renderDashboard({ email, csrf, sample = false }) {
  return shell({
    title: "Dashboard | Omnix Admin",
    csrf,
    extraHead: `<link rel="stylesheet" href="/admin/vendor/uPlot.min.css">`,
    body: `<header class="top">
  <a class="brand" href="/admin">
    <img src="/Omnix-logo-only.png" alt="" width="52" height="52">
    <span><strong>OMNIX</strong><em>Admin</em></span>
  </a>
  <div class="who">
    <span>${escapeHtml(email)}</span>
    <button type="button" id="logout">Log out</button>
  </div>
</header>
<main class="dash">
  ${sample ? `<p class="sample-banner" role="status">Sample data for this preview. These are not live visitors, not HubSpot, and not real refunds. This banner cannot appear on omnixgenerational.com.</p>` : ""}
  <div class="layout">
    <section class="chart-card" aria-labelledby="visitors-heading">
      <div class="section-head">
        <div>
          <h1 id="visitors-heading">Visitors</h1>
          <p id="totals" class="muted">Loading…</p>
        </div>
        <div class="pills" id="ranges" role="group" aria-label="Time range">
          <button type="button" data-range="day">Day</button>
          <button type="button" data-range="week" class="is-on">Week</button>
          <button type="button" data-range="month">Month</button>
        </div>
      </div>
      <ul class="legend">
        <li><i class="swatch visitors"></i> Visitors</li>
        <li><i class="swatch views"></i> Pageviews</li>
        <li><i class="swatch clicks"></i> Clicks</li>
      </ul>
      <div id="chart"></div>
    </section>
    <section class="queue-panel" aria-labelledby="queue-heading">
      <div class="section-head">
        <h2 id="queue-heading">Review queue</h2>
        <div class="pills" id="filters" role="group" aria-label="Queue type">
          <button type="button" data-filter="all" class="is-on">All</button>
          <button type="button" data-filter="change">Changes</button>
          <button type="button" data-filter="refund">Refunds</button>
        </div>
      </div>
      <div id="queue-list"></div>
      <div id="auto"></div>
    </section>
    <section class="lists" id="lists" aria-label="Pages and clicks"></section>
  </div>
  <section class="panel" id="leads" aria-labelledby="leads-heading"></section>
  <section class="panel" id="messages" aria-labelledby="messages-heading"></section>
</main>
<script src="/admin/vendor/uPlot.iife.min.js" defer></script>
<script src="/admin/admin.js" defer></script>`,
  });
}
