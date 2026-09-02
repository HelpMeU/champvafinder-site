// POST /.netlify/functions/list-providers
// Body: { staticIds: [1, 2, ..., 1000, 1001, ...] }   (the ids already
//        baked into providers.js on the page making the request)
//
// Returns every community-submitted provider that isn't auto-hidden, plus
// computed vote status (confirmCount, reportCount, verified, hidden) for
// BOTH the dynamic providers this function stores AND every static id the
// page asks about — so the front-end never has to know the confirm/report
// thresholds itself, just render what it's told.
const config = require("./lib/config");
const { jsonResponse, providersStore, votesStore } = require("./lib/util");

function computeStatus(votes) {
  const confirmCount = (votes && votes.confirmedBy) ? votes.confirmedBy.length : 0;
  const reportCount = (votes && votes.reportedBy) ? votes.reportedBy.length : 0;
  return {
    confirmCount,
    reportCount,
    verified: confirmCount >= config.CONFIRM_THRESHOLD,
    hidden: reportCount >= config.REPORT_HIDE_THRESHOLD,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  let staticIds = [];
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      if (Array.isArray(body.staticIds)) staticIds = body.staticIds;
    } catch {
      // ignore malformed body, just return dynamic providers with no static votes
    }
  }

  const pStore = providersStore();
  const vStore = votesStore();

  // ── Dynamic (community-submitted) providers ──
  const { blobs } = await pStore.list({ prefix: "provider:" });
  const dynamicProviders = [];
  for (const { key } of blobs) {
    const record = await pStore.get(key, { type: "json" });
    if (!record) continue;
    const votes = await vStore.get(`votes:${record.id}`, { type: "json" });
    const status = computeStatus(votes);
    if (status.hidden) continue; // auto-hidden, never sent to the client
    dynamicProviders.push({ ...record, ...status });
  }

  // ── Vote status for static (seed + CMS-imported) ids ──
  const staticVotes = {};
  for (const id of staticIds.slice(0, 5000)) { // sanity cap
    const votes = await vStore.get(`votes:${id}`, { type: "json" });
    staticVotes[String(id)] = computeStatus(votes);
  }

  return jsonResponse(200, { ok: true, dynamicProviders, staticVotes });
};
