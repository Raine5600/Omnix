export function rangeWindow(range, nowSec) {
  if (range === "day") {
    const step = 3600;
    const end = Math.floor(nowSec / step) * step + step;
    return { range, start: end - 24 * step, end, step, points: 24 };
  }
  if (range === "month") {
    const step = 86400;
    const end = Math.floor(nowSec / step) * step + step;
    return { range, start: end - 30 * step, end, step, points: 30 };
  }
  const step = 86400;
  const end = Math.floor(nowSec / step) * step + step;
  return { range: "week", start: end - 7 * step, end, step, points: 7 };
}

export function fillBuckets(window, rows, key) {
  const map = new Map((rows || []).map((row) => [Number(row.bucket), Number(row[key]) || 0]));
  const t = [];
  const values = [];
  for (let ts = window.start; ts < window.end; ts += window.step) {
    t.push(ts);
    values.push(map.get(ts) || 0);
  }
  return { t, values };
}

export async function analyticsReport(db, range, now = Math.floor(Date.now() / 1000)) {
  const window = rangeWindow(range, now);
  const views = await db.prepare(
    `SELECT (ts / ?1) * ?1 AS bucket,
            COUNT(*) AS pageviews,
            COUNT(DISTINCT visitor) AS visitors
     FROM pageviews
     WHERE ts >= ?2 AND ts < ?3
     GROUP BY bucket`
  ).bind(window.step, window.start, window.end).all();
  const clickRows = await db.prepare(
    `SELECT (ts / ?1) * ?1 AS bucket, COUNT(*) AS clicks
     FROM clicks
     WHERE ts >= ?2 AND ts < ?3
     GROUP BY bucket`
  ).bind(window.step, window.start, window.end).all();
  const totals = await db.prepare(
    `SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor) AS visitors
     FROM pageviews WHERE ts >= ? AND ts < ?`
  ).bind(window.start, window.end).first();
  const clickTotal = await db.prepare(
    "SELECT COUNT(*) AS clicks FROM clicks WHERE ts >= ? AND ts < ?"
  ).bind(window.start, window.end).first();
  const topPages = await db.prepare(
    `SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
     FROM pageviews WHERE ts >= ? AND ts < ?
     GROUP BY path ORDER BY views DESC LIMIT 8`
  ).bind(window.start, window.end).all();
  const referrers = await db.prepare(
    `SELECT CASE WHEN referrer = '' THEN '(direct)' ELSE referrer END AS referrer, COUNT(*) AS n
     FROM pageviews WHERE ts >= ? AND ts < ?
     GROUP BY referrer ORDER BY n DESC LIMIT 8`
  ).bind(window.start, window.end).all();
  const clickElements = await db.prepare(
    `SELECT element, COUNT(*) AS n
     FROM clicks WHERE ts >= ? AND ts < ?
     GROUP BY element ORDER BY n DESC LIMIT 12`
  ).bind(window.start, window.end).all();

  const partition = window.range === "day" ? "visitor" : "visitor, (ts / 86400)";
  const entries = await db.prepare(
    `WITH ranked AS (
       SELECT path, visitor, ts,
              ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY ts, id) AS rn
       FROM pageviews
       WHERE ts >= ?1 AND ts < ?2
     )
     SELECT path, COUNT(*) AS n FROM ranked WHERE rn = 1
     GROUP BY path ORDER BY n DESC LIMIT 8`
  ).bind(window.start, window.end).all();

  const viewSeries = fillBuckets(window, views.results, "pageviews");
  const visitorSeries = fillBuckets(window, views.results, "visitors");
  const clickSeries = fillBuckets(window, clickRows.results, "clicks");
  return {
    range: window.range,
    totals: {
      visitors: Number(totals && totals.visitors) || 0,
      pageviews: Number(totals && totals.pageviews) || 0,
      clicks: Number(clickTotal && clickTotal.clicks) || 0,
    },
    series: {
      t: viewSeries.t,
      visitors: visitorSeries.values,
      pageviews: viewSeries.values,
      clicks: clickSeries.values,
    },
    top_pages: topPages.results || [],
    entry_pages: entries.results || [],
    referrers: referrers.results || [],
    clicks_by_element: clickElements.results || [],
  };
}
