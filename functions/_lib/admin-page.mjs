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
    body: `<header class="top">
  <a class="brand" href="/admin">
    <img src="/Omnix-logo-only.png" alt="" width="52" height="52">
    <span><strong>OMNIX</strong><em>Admin</em></span>
  </a>
  <button type="button" class="nav-toggle" id="nav-toggle" aria-controls="admin-nav" aria-expanded="false">Menu</button>
  <div class="who">
    <span>${escapeHtml(email)}</span>
    <button type="button" id="logout">Log out</button>
  </div>
</header>
<nav id="admin-nav" aria-label="Admin">
  <button type="button" data-view="overview" class="is-on">Overview</button>
  <button type="button" data-view="leads">Leads</button>
  <button type="button" data-view="messages">Messages</button>
  <button type="button" data-view="changes">Changes</button>
  <button type="button" data-view="refunds">Refunds</button>
</nav>
<main class="dash">
  ${sample ? `<p class="sample-banner" role="status">Sample data for this preview. These are not live visitors, not HubSpot, and not real refunds. This banner cannot appear on omnixgenerational.com.</p>` : ""}
  <section class="view is-on" id="view-overview" data-view-panel="overview">
    <div class="stats" id="stats">
      <article class="stat"><span class="stat-n" id="stat-visitors">0</span><span>Visitors</span></article>
      <article class="stat"><span class="stat-n" id="stat-pageviews">0</span><span>Pageviews</span></article>
      <article class="stat"><span class="stat-n" id="stat-clicks">0</span><span>Clicks</span></article>
    </div>
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
      </ul>
      <div id="chart"></div>
    </section>
    <section class="bars-grid" id="lists" aria-label="Pages and clicks"></section>
  </section>
  <section class="view" id="view-leads" data-view-panel="leads"></section>
  <section class="view" id="view-messages" data-view-panel="messages"></section>
  <section class="view" id="view-changes" data-view-panel="changes">
    <div class="section-head"><h1>Changes</h1></div>
    <div id="change-list" class="queue-list"></div>
    <div id="auto"></div>
  </section>
  <section class="view" id="view-refunds" data-view-panel="refunds">
    <div class="section-head"><h1>Refunds</h1></div>
    <p class="muted">First month only. Never Miss a Job is $197. Answer the Call is $97. Setup and pass-through costs are not refundable. Custom AI is not covered.</p>
    <div id="refund-list" class="queue-list"></div>
  </section>
</main>
<script src="/admin/admin.js" defer></script>`,
  });
}
