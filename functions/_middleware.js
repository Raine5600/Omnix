export async function onRequest(context) {
  const response = await context.next();
  const path = new URL(context.request.url).pathname;
  const guarded = path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin") || path.startsWith("/api/cron");
  if (!guarded) return response;
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  if (path === "/admin" || path.startsWith("/admin/")) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
