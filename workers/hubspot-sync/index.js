export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(ping(env));
  },
};

async function ping(env) {
  if (!env.SYNC_URL || !env.CRON_SECRET) return;
  if (env.SYNC_URL.includes("REPLACE-with-your-pages-hostname")) return;
  try {
    await fetch(env.SYNC_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
  } catch {
    console.error("hubspot cron ping failed");
  }
}
