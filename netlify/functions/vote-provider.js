// POST /.netlify/functions/vote-provider
// Body: { id, action: "confirm" | "report", voterToken }
//
// voterToken is a random id the browser generates once and keeps in
// localStorage (see index.html's getVoterToken()) — it's a light deterrent
// against one person clicking a button 50 times, not real identity
// verification. Someone determined can clear storage and vote again; that's
// an accepted tradeoff for a low-stakes community directory, not a security
// boundary.
const config = require("./lib/config");
const { jsonResponse, votesStore } = require("./lib/util");

function computeStatus(votes) {
  const confirmCount = votes.confirmedBy.length;
  const reportCount = votes.reportedBy.length;
  return {
    confirmCount,
    reportCount,
    verified: confirmCount >= config.CONFIRM_THRESHOLD,
    hidden: reportCount >= config.REPORT_HIDE_THRESHOLD,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { ok: false, error: "Invalid request body" });
  }

  const { id, action, voterToken } = body;
  if (!id || !["confirm", "report"].includes(action) || !voterToken || typeof voterToken !== "string") {
    return jsonResponse(400, { ok: false, error: "Missing id, action, or voterToken" });
  }

  const store = votesStore();
  const key = `votes:${id}`;
  const votes = (await store.get(key, { type: "json" })) || { confirmedBy: [], reportedBy: [] };

  const bucket = action === "confirm" ? "confirmedBy" : "reportedBy";
  const alreadyVoted = votes[bucket].includes(voterToken);
  if (!alreadyVoted) {
    votes[bucket].push(voterToken);
    // Bound growth — this is a vote counter, not an audit log.
    if (votes[bucket].length > 500) votes[bucket] = votes[bucket].slice(-500);
    await store.setJSON(key, votes);
  }

  return jsonResponse(200, { ok: true, alreadyVoted, ...computeStatus(votes) });
};
