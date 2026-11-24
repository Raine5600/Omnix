(function () {
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || "";
  var range = "week";
  var queue = { changes: [], refunds: [], auto_approve: [] };
  var lastAnalytics = null;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  function api(path, options) {
    var opts = options || {};
    var headers = { "content-type": "application/json" };
    if (opts.method && opts.method !== "GET") headers["x-csrf-token"] = csrf;
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      credentials: "same-origin",
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401) {
          location.href = "/admin";
          throw new Error("Sign in required.");
        }
        if (!response.ok) throw new Error(data.error || "Request failed.");
        return data;
      });
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function safeUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (err) {}
    return "";
  }

  function when(sec) {
    if (!sec) return "—";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(sec * 1000));
  }

  function dayLabel(iso) {
    if (!iso) return "Not set";
    var parsed = new Date(String(iso).length === 10 ? iso + "T00:00:00Z" : iso);
    if (Number.isNaN(parsed.getTime())) return String(iso);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
  }

  function tickLabel(ts) {
    var date = new Date(ts * 1000);
    if (range === "day") return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(date);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }

  function countUp(node, target) {
    var value = Number(target) || 0;
    if (reduce) {
      node.textContent = String(value);
      return;
    }
    var started = performance.now();
    function step(now) {
      var t = Math.min(1, (now - started) / 800);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(value * eased));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function showView(name) {
    var known = ["overview", "leads", "messages", "changes", "refunds"];
    if (known.indexOf(name) === -1) name = "overview";
    document.querySelectorAll("[data-view-panel]").forEach(function (panel) {
      panel.classList.toggle("is-on", panel.getAttribute("data-view-panel") === name);
    });
    document.querySelectorAll("#admin-nav [data-view]").forEach(function (button) {
      button.classList.toggle("is-on", button.getAttribute("data-view") === name);
    });
    var nav = document.getElementById("admin-nav");
    nav.classList.remove("is-open");
    document.getElementById("nav-toggle").setAttribute("aria-expanded", "false");
    if (name === "overview" && lastAnalytics) drawChart(lastAnalytics);
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  }

  function drawChart(data) {
    var host = document.getElementById("chart");
    if (!host) return;
    host.textContent = "";
    var width = Math.max(280, host.clientWidth || 640);
    var height = width < 700 ? 210 : 280;
    var pad = { l: 36, r: 28, t: 18, b: 32 };
    var visitors = data.series.visitors || [];
    var views = data.series.pageviews || [];
    var clicks = data.series.clicks || [];
    var times = data.series.t || [];
    var n = times.length;
    if (!n) {
      host.appendChild(el("p", "muted", "No visitors in this range."));
      return;
    }
    var max = 1;
    visitors.concat(views).forEach(function (value) { if (value > max) max = value; });
    max = Math.ceil(max * 1.15);
    function xAt(i) {
      if (n === 1) return pad.l;
      return pad.l + (i * (width - pad.l - pad.r)) / (n - 1);
    }
    function yAt(value) {
      return pad.t + (1 - value / max) * (height - pad.t - pad.b);
    }
    function pathOf(values) {
      return values.map(function (value, i) {
        return (i ? "L" : "M") + xAt(i).toFixed(1) + " " + yAt(value).toFixed(1);
      }).join(" ");
    }

    var svg = svgEl("svg", { viewBox: "0 0 " + width + " " + height, role: "img", "aria-label": "Visitors over time" });
    var defs = svgEl("defs", {});
    var stroke = svgEl("linearGradient", { id: "visitor-stroke", x1: "0", y1: "0", x2: "1", y2: "0" });
    stroke.appendChild(svgEl("stop", { offset: "0", "stop-color": "#4d9fff" }));
    stroke.appendChild(svgEl("stop", { offset: "0.55", "stop-color": "#7cc5ff" }));
    stroke.appendChild(svgEl("stop", { offset: "1", "stop-color": "#c07aff" }));
    var fill = svgEl("linearGradient", { id: "visitor-fill", x1: "0", y1: "0", x2: "0", y2: "1" });
    fill.appendChild(svgEl("stop", { offset: "0", "stop-color": "#7cc5ff", "stop-opacity": "0.55" }));
    fill.appendChild(svgEl("stop", { offset: "0.55", "stop-color": "#c07aff", "stop-opacity": "0.22" }));
    fill.appendChild(svgEl("stop", { offset: "1", "stop-color": "#0d0d1e", "stop-opacity": "0" }));
    defs.appendChild(stroke);
    defs.appendChild(fill);
    svg.appendChild(defs);

    for (var g = 0; g <= 3; g += 1) {
      var gy = yAt((max / 3) * g);
      svg.appendChild(svgEl("line", { x1: pad.l, x2: width - pad.r, y1: gy, y2: gy, stroke: "rgba(124,197,255,0.15)" }));
      var label = svgEl("text", { x: 2, y: gy + 4, fill: "#b0b8e0", "font-size": "11" });
      label.textContent = String(Math.round((max / 3) * g));
      svg.appendChild(label);
    }
    var plotWidth = width - pad.l - pad.r;
    var maxLabels = Math.max(2, Math.floor(plotWidth / 58));
    var indexes = [];
    if (n <= maxLabels) {
      for (var li = 0; li < n; li += 1) indexes.push(li);
    } else {
      var gaps = maxLabels - 1;
      indexes.push(0);
      for (var g = 1; g < gaps; g += 1) indexes.push(Math.round((g * (n - 1)) / gaps));
      indexes.push(n - 1);
    }
    var seen = {};
    indexes.forEach(function (i) {
      if (seen[i]) return;
      seen[i] = true;
      var anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      var tick = svgEl("text", { x: xAt(i), y: height - 8, fill: "#b0b8e0", "font-size": "11", "text-anchor": anchor });
      tick.textContent = tickLabel(times[i]);
      svg.appendChild(tick);
    });

    var area = svgEl("path", { d: pathOf(visitors) + " L " + xAt(n - 1).toFixed(1) + " " + yAt(0) + " L " + xAt(0).toFixed(1) + " " + yAt(0) + " Z", fill: "url(#visitor-fill)" });
    var viewLine = svgEl("path", { d: pathOf(views), fill: "none", stroke: "#c07aff", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round", opacity: "0.85" });
    var line = svgEl("path", { d: pathOf(visitors), fill: "none", stroke: "url(#visitor-stroke)", "stroke-width": "3", "stroke-linejoin": "round", "stroke-linecap": "round" });
    svg.appendChild(area);
    svg.appendChild(viewLine);
    svg.appendChild(line);
    visitors.forEach(function (value, i) {
      svg.appendChild(svgEl("circle", { cx: xAt(i), cy: yAt(value), r: width < 700 ? 3 : 4, fill: "#7cc5ff", stroke: "#c07aff", "stroke-width": "1.5" }));
    });
    host.appendChild(svg);

    var tip = el("div", "tip");
    tip.hidden = true;
    host.appendChild(tip);
    function showTip(index, clientX, clientY) {
      var rect = host.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = "";
      tip.appendChild(el("strong", "", tickLabel(times[index])));
      tip.appendChild(el("span", "", "Visitors " + visitors[index]));
      tip.appendChild(el("span", "", "Pageviews " + views[index]));
      tip.appendChild(el("span", "", "Clicks " + clicks[index]));
      var left = clientX - rect.left + 12;
      if (left > rect.width - 160) left = clientX - rect.left - 160;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, clientY - rect.top - 72) + "px";
    }
    svg.addEventListener("pointermove", function (event) {
      var rect = svg.getBoundingClientRect();
      var x = ((event.clientX - rect.left) / rect.width) * width;
      var index = 0;
      var best = Infinity;
      for (var i = 0; i < n; i += 1) {
        var dist = Math.abs(xAt(i) - x);
        if (dist < best) { best = dist; index = i; }
      }
      showTip(index, event.clientX, event.clientY);
    });
    svg.addEventListener("pointerleave", function () { tip.hidden = true; });

    if (!reduce) {
      [line, viewLine].forEach(function (path) {
        var length = path.getTotalLength();
        path.style.strokeDasharray = String(length);
        path.style.strokeDashoffset = String(length);
        path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 900, easing: "ease-out", fill: "forwards" });
      });
      area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: "ease-out", fill: "forwards" });
    }
  }

  function renderBars(host, title, rows, nameOf, countOf, clickTone) {
    var card = el("article", "bar-card");
    card.appendChild(el("h2", "", title));
    if (!rows.length) {
      card.appendChild(el("p", "muted", "Nothing in this range yet."));
      host.appendChild(card);
      return;
    }
    var max = 1;
    rows.forEach(function (row) { max = Math.max(max, Number(countOf(row)) || 0); });
    rows.forEach(function (row) {
      var count = Number(countOf(row)) || 0;
      var rowEl = el("div", "bar-row");
      rowEl.appendChild(el("span", "bar-label", nameOf(row)));
      var track = el("span", "bar-track");
      var fill = el("span", "bar-fill" + (clickTone ? " clicks" : ""));
      fill.style.setProperty("--w", Math.max(6, Math.round((count / max) * 100)) + "%");
      track.appendChild(fill);
      rowEl.appendChild(track);
      rowEl.appendChild(el("span", "bar-n", String(count)));
      card.appendChild(rowEl);
    });
    host.appendChild(card);
    requestAnimationFrame(function () {
      card.querySelectorAll(".bar-fill").forEach(function (fill) {
        if (reduce) fill.style.width = fill.style.getPropertyValue("--w");
        else fill.classList.add("is-in");
      });
    });
  }

  function renderLists(data) {
    var host = document.getElementById("lists");
    host.textContent = "";
    renderBars(host, "Top pages", data.top_pages, function (row) { return row.path; }, function (row) { return row.views; }, false);
    renderBars(host, "Clicks", data.clicks_by_element, function (row) { return row.element; }, function (row) { return row.n; }, true);
    renderBars(host, "Entry pages", data.entry_pages, function (row) { return row.path; }, function (row) { return row.n; }, false);
    renderBars(host, "Referrers", data.referrers, function (row) { return row.referrer; }, function (row) { return row.n; }, true);
  }

  function decisionBar(kind, id) {
    var bar = el("div", "row-actions");
    var note = document.createElement("textarea");
    note.maxLength = 2000;
    note.placeholder = "Note";
    note.setAttribute("aria-label", "Decision note");
    var approve = el("button", "", "Approve");
    approve.type = "button";
    approve.dataset.decision = "approved";
    var reject = el("button", "reject", "Reject");
    reject.type = "button";
    reject.dataset.decision = "rejected";
    bar.appendChild(note);
    bar.appendChild(approve);
    bar.appendChild(reject);
    bar.dataset.kind = kind;
    bar.dataset.id = String(id);
    return bar;
  }

  function renderCard(item) {
    var card = el("article", "q-card" + (item.flagged ? " is-flagged" : ""));
    card.appendChild(el("span", "badge", item.kind === "refund" ? "Refund" : "Change"));
    if (item.sample) card.appendChild(el("span", "badge", "Sample"));
    if (item.kind === "refund") {
      if (item.covered === false) card.appendChild(el("span", "badge warn", "Not covered"));
      else card.appendChild(el("span", item.flagged ? "badge warn" : "badge ok", item.flagged ? "Terms not met" : "No flags"));
    }
    card.appendChild(el("span", "badge", item.status));
    card.appendChild(el("h3", "", item.client_name));
    if (item.kind === "change") {
      card.appendChild(el("p", "", item.request_text));
      if (item.suggestion) card.appendChild(el("p", "muted", "Suggested: " + item.suggestion));
      var href = safeUrl(item.preview_url);
      if (href) {
        var link = el("a", "", "Preview");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.appendChild(link);
      }
    } else {
      var days = item.days_since_go_live == null ? "Go-live date not set" : item.days_since_go_live + " days since go-live";
      card.appendChild(el("p", "", "Go-live (all purchased services): " + dayLabel(item.go_live_date) + " · " + days));
      card.appendChild(el("p", "", "Tracked paying customer: " + (item.tracked_customer ? "Yes" : "No")));
      card.appendChild(el("p", "", (item.package_name || "Package") + ": " + item.amount_label + ". " + item.amount_note));
      if (item.reasons && item.reasons.length) {
        var reasons = document.createElement("ul");
        reasons.className = "reasons";
        item.reasons.forEach(function (reason) { reasons.appendChild(el("li", "", reason)); });
        card.appendChild(reasons);
      }
      card.appendChild(el("p", "muted", "Approving records the decision here. Stripe is not contacted."));
    }
    if (item.note) card.appendChild(el("p", "muted", "Note: " + item.note));
    if (item.status === "pending") card.appendChild(decisionBar(item.kind, item.id));
    return card;
  }

  function renderQueue() {
    var changes = document.getElementById("change-list");
    var refunds = document.getElementById("refund-list");
    changes.textContent = "";
    refunds.textContent = "";
    var changeItems = queue.changes.slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return (b.created_at || 0) - (a.created_at || 0);
    });
    var refundItems = queue.refunds.slice().sort(function (a, b) {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return (b.created_at || 0) - (a.created_at || 0);
    });
    if (!changeItems.length) changes.appendChild(el("p", "muted", "No change requests."));
    if (!refundItems.length) refunds.appendChild(el("p", "muted", "No refund requests."));
    changeItems.forEach(function (item) { changes.appendChild(renderCard(item)); });
    refundItems.forEach(function (item) { refunds.appendChild(renderCard(item)); });
    var auto = document.getElementById("auto");
    auto.textContent = "";
    var box = el("div", "auto");
    box.appendChild(el("h2", "", "Auto-approve"));
    box.appendChild(el("p", "muted", "These switches are off. Turning one on only saves it. Nothing is auto-approved yet. Refunds have no switch."));
    (queue.auto_approve || []).forEach(function (setting) {
      var label = el("label", "");
      label.appendChild(document.createTextNode(setting.label));
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(setting.enabled);
      input.dataset.changeType = setting.change_type;
      label.appendChild(input);
      box.appendChild(label);
    });
    var msg = el("p", "form-error", "");
    msg.id = "auto-msg";
    box.appendChild(msg);
    auto.appendChild(box);
  }

  function tableBlock(title, rows, headers, cells) {
    var wrap = el("div", "bar-card");
    wrap.appendChild(el("h2", "", title));
    if (!rows || !rows.length) {
      wrap.appendChild(el("p", "muted", "None yet."));
      return wrap;
    }
    var scroller = el("div", "table-wrap");
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    headers.forEach(function (header) { hr.appendChild(el("th", "", header)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var body = document.createElement("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      cells(row).forEach(function (value, index) {
        var cell = el("td", "", value);
        cell.setAttribute("data-label", headers[index]);
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    scroller.appendChild(table);
    wrap.appendChild(scroller);
    return wrap;
  }

  function renderLeads(data) {
    var host = document.getElementById("view-leads");
    host.textContent = "";
    var head = el("div", "section-head");
    head.appendChild(el("h1", "", "Leads"));
    var refresh = el("button", "ghost", "Refresh HubSpot");
    refresh.type = "button";
    refresh.id = "refresh";
    head.appendChild(refresh);
    host.appendChild(head);
    var syncLine = data.last_ok_at ? "Last sync " + when(data.last_ok_at) : "HubSpot has not synced yet.";
    if (data.last_error) syncLine += " " + data.last_error;
    if (data.sample) syncLine = "Sample preview. HubSpot is not contacted.";
    host.appendChild(el("p", "muted", syncLine));
    var grid = el("div", "stack two");
    grid.appendChild(tableBlock("HubSpot contacts", data.contacts, ["Name", "Email", "Phone", "Company"], function (row) {
      return [row.name || "—", row.email || "—", row.phone || "—", row.company || (String(row.id).indexOf("demo-") === 0 ? "Demo" : "—")];
    }));
    grid.appendChild(tableBlock("Form submissions", data.forms, ["Form", "When", "Email", "Summary"], function (row) {
      return [row.form_name || "—", when(row.submitted_at), row.email || "—", row.summary || "—"];
    }));
    host.appendChild(grid);
    host.appendChild(tableBlock("Intake submissions", data.intake, ["When", "Name", "Business", "Phone", "Email", "HubSpot"], function (row) {
      return [when(row.created_at), row.name || "—", row.business_name || "—", row.phone || "—", row.email || "—", row.hubspot_status || "—"];
    }));
  }

  function renderMessages(data) {
    var host = document.getElementById("view-messages");
    host.textContent = "";
    host.appendChild(el("h1", "", "Messages"));
    if (data.conversations_notice) host.appendChild(el("p", "notice", data.conversations_notice));
    if (data.threads && data.threads.length) {
      host.appendChild(tableBlock("HubSpot threads", data.threads, ["Status", "When", "Preview"], function (row) {
        return [row.status || "—", when(row.updated_at), row.preview || "—"];
      }));
    }
    host.appendChild(el("h2", "", "Website chat"));
    host.appendChild(el("p", "muted", data.chat_note || ""));
    if (!data.chat || !data.chat.length) {
      host.appendChild(el("p", "muted", "No chat messages yet."));
      return;
    }
    data.chat.forEach(function (message) {
      var block = el("div", "chat");
      block.appendChild(el("strong", "", (message.client_name || "Site") + " · " + message.role));
      block.appendChild(el("p", "", message.body));
      host.appendChild(block);
    });
  }

  function paintAnalytics(data) {
    lastAnalytics = data;
    document.getElementById("totals").textContent = data.totals.visitors + " visitors · " + data.totals.pageviews + " pageviews · " + data.totals.clicks + " clicks";
    countUp(document.getElementById("stat-visitors"), data.totals.visitors);
    countUp(document.getElementById("stat-pageviews"), data.totals.pageviews);
    countUp(document.getElementById("stat-clicks"), data.totals.clicks);
    drawChart(data);
    renderLists(data);
  }

  function loadAnalytics() {
    return api("/api/admin/analytics?range=" + encodeURIComponent(range)).then(paintAnalytics);
  }
  function loadQueue() {
    return api("/api/admin/queue").then(function (data) {
      queue = data;
      renderQueue();
    });
  }
  function loadLeads() { return api("/api/admin/leads").then(renderLeads); }
  function loadMessages() { return api("/api/admin/messages").then(renderMessages); }

  document.getElementById("ranges").addEventListener("click", function (event) {
    var button = event.target.closest("[data-range]");
    if (!button) return;
    range = button.getAttribute("data-range");
    document.querySelectorAll("#ranges button").forEach(function (node) {
      node.classList.toggle("is-on", node === button);
    });
    loadAnalytics().catch(function (err) { document.getElementById("totals").textContent = err.message; });
  });

  document.getElementById("admin-nav").addEventListener("click", function (event) {
    var button = event.target.closest("[data-view]");
    if (!button) return;
    showView(button.getAttribute("data-view"));
  });
  document.getElementById("nav-toggle").addEventListener("click", function () {
    var nav = document.getElementById("admin-nav");
    var open = nav.classList.toggle("is-open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.querySelector(".dash").addEventListener("click", function (event) {
    var button = event.target.closest("[data-decision]");
    if (!button) return;
    var bar = button.closest(".row-actions");
    button.disabled = true;
    var path = bar.dataset.kind === "refund" ? "/api/admin/refunds/" : "/api/admin/changes/";
    api(path + bar.dataset.id, {
      method: "POST",
      body: { status: button.dataset.decision, note: bar.querySelector("textarea").value }
    }).then(loadQueue).catch(function (err) {
      button.disabled = false;
      alert(err.message);
    });
  });

  document.getElementById("auto").addEventListener("change", function (event) {
    var input = event.target;
    if (!input.dataset || !input.dataset.changeType) return;
    api("/api/admin/settings", {
      method: "POST",
      body: { change_type: input.dataset.changeType, enabled: input.checked }
    }).then(function (data) {
      document.getElementById("auto-msg").textContent = data.message;
    }).catch(function (err) {
      input.checked = !input.checked;
      document.getElementById("auto-msg").textContent = err.message;
    });
  });

  document.getElementById("view-leads").addEventListener("click", function (event) {
    if (event.target.id !== "refresh") return;
    event.target.disabled = true;
    api("/api/admin/sync", { method: "POST" }).then(function () {
      return Promise.all([loadLeads(), loadMessages()]);
    }).catch(function (err) {
      event.target.disabled = false;
      alert(err.message);
    });
  });

  document.getElementById("logout").addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST", body: {} }).then(function () {
      location.href = "/admin";
    }).catch(function () { location.href = "/admin"; });
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (lastAnalytics && document.getElementById("view-overview").classList.contains("is-on")) drawChart(lastAnalytics);
    }, 120);
  });

  Promise.all([loadAnalytics(), loadQueue(), loadLeads(), loadMessages()]).then(function () {
    showView((location.hash || "#overview").slice(1));
  }).catch(function (err) {
    if (document.getElementById("totals")) document.getElementById("totals").textContent = err.message;
  });
})();
