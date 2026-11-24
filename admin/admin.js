(function () {
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || "";
  var range = "week";
  var filter = "all";
  var queue = { changes: [], refunds: [], auto_approve: [] };
  var plot = null;
  var anim = 0;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    if (range === "day") {
      return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(date);
    }
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }

  function drawChart(data) {
    var host = document.getElementById("chart");
    var totals = document.getElementById("totals");
    totals.textContent = data.totals.visitors + " visitors · " + data.totals.pageviews + " pageviews · " + data.totals.clicks + " clicks";
    if (typeof uPlot !== "function") {
      host.textContent = "Chart library did not load.";
      return;
    }
    if (plot) {
      plot.destroy();
      plot = null;
    }
    var width = Math.max(280, host.clientWidth || 320);
    var height = width < 700 ? 210 : 280;
    var full = [data.series.t, data.series.visitors, data.series.pageviews, data.series.clicks];
    function fill(from, to) {
      return function (u) {
        var g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
        g.addColorStop(0, from);
        g.addColorStop(1, to);
        return g;
      };
    }
    plot = new uPlot({
      width: width,
      height: height,
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      select: { show: false },
      axes: [
        { stroke: "#b0b8e0", grid: { stroke: "rgba(124,197,255,0.15)" }, values: function (_u, vals) { return vals.map(tickLabel); } },
        { stroke: "#b0b8e0", grid: { stroke: "rgba(192,122,255,0.14)" }, size: 42 }
      ],
      series: [
        {},
        { label: "Visitors", stroke: "#7cc5ff", width: 2.5, fill: fill("rgba(124,197,255,0.55)", "rgba(77,159,255,0.02)"), points: { show: range !== "month", size: 7, stroke: "#c07aff", fill: "#7cc5ff" } },
        { label: "Pageviews", stroke: "#c07aff", width: 2, fill: fill("rgba(192,122,255,0.35)", "rgba(13,13,30,0)"), points: { show: false } },
        { label: "Clicks", stroke: "#ffd36a", width: 2, dash: [6, 4], points: { show: false } }
      ],
      scales: { x: { time: true } }
    }, reduce ? full : [full[0], full[1].map(function () { return 0; }), full[2].map(function () { return 0; }), full[3].map(function () { return 0; })], host);

    if (reduce) return;
    var token = ++anim;
    var frame = 0;
    var frames = 28;
    function step() {
      if (token !== anim || !plot) return;
      frame += 1;
      var t = 1 - Math.pow(1 - frame / frames, 3);
      plot.setData([
        full[0],
        full[1].map(function (value) { return value * t; }),
        full[2].map(function (value) { return value * t; }),
        full[3].map(function (value) { return value * t; })
      ]);
      if (frame < frames) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function listCard(title, rows, labeler) {
    var card = el("article", "mini");
    card.appendChild(el("h3", "", title));
    if (!rows.length) {
      card.appendChild(el("p", "muted", "Nothing in this range yet."));
      return card;
    }
    var list = document.createElement("ol");
    rows.forEach(function (row) {
      var item = document.createElement("li");
      var name = el("span", "", String(labeler.count(row)));
      item.appendChild(document.createTextNode(labeler.name(row) + " "));
      item.appendChild(name);
      list.appendChild(item);
    });
    card.appendChild(list);
    return card;
  }

  function renderLists(data) {
    var host = document.getElementById("lists");
    host.textContent = "";
    host.appendChild(listCard("Top pages", data.top_pages, {
      name: function (row) { return row.path; },
      count: function (row) { return row.views; }
    }));
    host.appendChild(listCard("Entry pages", data.entry_pages, {
      name: function (row) { return row.path; },
      count: function (row) { return row.n; }
    }));
    host.appendChild(listCard("Referrers", data.referrers, {
      name: function (row) { return row.referrer; },
      count: function (row) { return row.n; }
    }));
    host.appendChild(listCard("Clicks", data.clicks_by_element, {
      name: function (row) { return row.element; },
      count: function (row) { return row.n; }
    }));
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

  function renderQueue() {
    var host = document.getElementById("queue-list");
    host.textContent = "";
    var items = [];
    if (filter !== "refund") queue.changes.forEach(function (row) { items.push(row); });
    if (filter !== "change") queue.refunds.forEach(function (row) { items.push(row); });
    items.sort(function (a, b) {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return (b.created_at || 0) - (a.created_at || 0);
    });
    if (!items.length) {
      host.appendChild(el("p", "muted", "Nothing in this queue."));
    }
    items.forEach(function (item) {
      var card = el("article", "q-card" + (item.flagged ? " is-flagged" : ""));
      var kind = el("span", "badge", item.kind === "refund" ? "Refund" : "Change");
      card.appendChild(kind);
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
        } else if (item.preview_url) {
          card.appendChild(el("p", "muted", item.preview_url));
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
      host.appendChild(card);
    });

    var auto = document.getElementById("auto");
    auto.textContent = "";
    var box = el("div", "auto");
    box.appendChild(el("h3", "", "Auto-approve"));
    box.appendChild(el("p", "muted", "These switches are off. Turning one on only saves it. Nothing is auto-approved yet. Refunds have no switch and cannot be auto-approved."));
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

  function renderLeads(data) {
    var host = document.getElementById("leads");
    host.textContent = "";
    var head = el("div", "panel-head");
    head.appendChild(el("h2", "", "Leads"));
    var refresh = el("button", "ghost", "Refresh HubSpot");
    refresh.type = "button";
    refresh.id = "refresh";
    head.appendChild(refresh);
    host.appendChild(head);
    var syncLine = data.last_ok_at ? "Last sync " + when(data.last_ok_at) : "HubSpot has not synced yet.";
    if (data.last_error) syncLine += " " + data.last_error;
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

  function tableBlock(title, rows, headers, cells) {
    var wrap = el("div", "");
    wrap.appendChild(el("h3", "", title));
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
      cells(row).forEach(function (value) { tr.appendChild(el("td", "", value)); });
      body.appendChild(tr);
    });
    table.appendChild(body);
    scroller.appendChild(table);
    wrap.appendChild(scroller);
    return wrap;
  }

  function renderMessages(data) {
    var host = document.getElementById("messages");
    host.textContent = "";
    host.appendChild(el("h2", "", "Messages"));
    if (data.conversations_notice) host.appendChild(el("p", "notice", data.conversations_notice));
    if (data.threads && data.threads.length) {
      host.appendChild(tableBlock("HubSpot threads", data.threads, ["Status", "When", "Preview"], function (row) {
        return [row.status || "—", when(row.updated_at), row.preview || "—"];
      }));
    } else if (!data.conversations_notice) {
      host.appendChild(el("p", "muted", "No conversation threads yet."));
    }
    host.appendChild(el("h3", "", "Website chat"));
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

  function loadAnalytics() {
    return api("/api/admin/analytics?range=" + encodeURIComponent(range)).then(function (data) {
      drawChart(data);
      renderLists(data);
    });
  }

  function loadQueue() {
    return api("/api/admin/queue").then(function (data) {
      queue = data;
      renderQueue();
    });
  }

  function loadLeads() {
    return api("/api/admin/leads").then(renderLeads);
  }

  function loadMessages() {
    return api("/api/admin/messages").then(renderMessages);
  }

  document.getElementById("ranges").addEventListener("click", function (event) {
    var button = event.target.closest("[data-range]");
    if (!button) return;
    range = button.getAttribute("data-range");
    document.querySelectorAll("#ranges button").forEach(function (node) {
      node.classList.toggle("is-on", node === button);
    });
    loadAnalytics().catch(function (err) { document.getElementById("totals").textContent = err.message; });
  });

  document.getElementById("filters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.getAttribute("data-filter");
    document.querySelectorAll("#filters button").forEach(function (node) {
      node.classList.toggle("is-on", node === button);
    });
    renderQueue();
  });

  document.getElementById("queue-list").addEventListener("click", function (event) {
    var button = event.target.closest("[data-decision]");
    if (!button) return;
    var bar = button.closest(".row-actions");
    var note = bar.querySelector("textarea").value;
    button.disabled = true;
    var path = bar.dataset.kind === "refund" ? "/api/admin/refunds/" : "/api/admin/changes/";
    api(path + bar.dataset.id, {
      method: "POST",
      body: { status: button.dataset.decision, note: note }
    }).then(loadQueue).catch(function (err) {
      button.disabled = false;
      alert(err.message);
    });
  });

  document.getElementById("auto").addEventListener("change", function (event) {
    var input = event.target;
    if (!input.dataset.changeType) return;
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

  document.getElementById("leads").addEventListener("click", function (event) {
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

  window.addEventListener("resize", function () {
    if (!plot) return;
    var host = document.getElementById("chart");
    plot.setSize({ width: Math.max(280, host.clientWidth || 320), height: host.clientWidth < 700 ? 210 : 280 });
  });

  Promise.all([loadAnalytics(), loadQueue(), loadLeads(), loadMessages()]).catch(function (err) {
    if (document.getElementById("totals")) document.getElementById("totals").textContent = err.message;
  });
})();
