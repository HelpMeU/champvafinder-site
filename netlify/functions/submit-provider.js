// POST /.netlify/functions/submit-provider
//
// Publishes a community-submitted provider immediately — no human review —
// tagged "pending" until the crowd confirms it (see vote-provider.js and
// _config.js's CONFIRM_THRESHOLD). Basic automated defenses only:
// honeypot field, minimum fill-time, per-IP rate limit, field validation,
// and a short blocked-word list. None of this is a substitute for real
// moderation — see README_CROWDSOURCING.md for the tradeoffs.
const config = require("./lib/config");
const {
  jsonResponse, getClientIp, hashIp,
  providersStore, rateLimitStore,
  containsBlockedWord, tooLong, containsMarkup,
} = require("./lib/util");

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

  // ── Honeypot: real users never fill this hidden field. Pretend success
  // so a bot doesn't learn anything from the response. ──
  if (body.company) {
    return jsonResponse(200, { ok: true, id: "discarded" });
  }

  // ── Minimum fill time: submit.html sends how long the form was open. ──
  const elapsed = Date.now() - Number(body.renderedAt || 0);
  if (!body.renderedAt || elapsed < config.MIN_FILL_TIME_MS) {
    return jsonResponse(200, { ok: true, id: "discarded" });
  }

  // ── Rate limit by IP ──
  const ip = getClientIp(event);
  const rlStore = rateLimitStore();
  const rlKey = hashIp(ip);
  const now = Date.now();
  let rl = (await rlStore.get(rlKey, { type: "json" })) || { count: 0, windowStart: now };
  if (now - rl.windowStart > config.RATE_LIMIT_WINDOW_MS) {
    rl = { count: 0, windowStart: now };
  }
  if (rl.count >= config.RATE_LIMIT_MAX_SUBMISSIONS) {
    return jsonResponse(429, { ok: false, error: "Too many submissions from this connection. Please try again later." });
  }

  // ── Field validation ──
  const required = ["name", "type", "phone", "address", "city", "state", "zip"];
  for (const field of required) {
    if (!body[field] || typeof body[field] !== "string" || !body[field].trim()) {
      return jsonResponse(400, { ok: false, error: `Missing required field: ${field}` });
    }
  }

  const name = body.name.trim();
  const type = body.type.trim();
  const phone = body.phone.trim();
  const address = body.address.trim();
  const city = body.city.trim();
  const state = body.state.trim().toUpperCase();
  const zip = body.zip.trim();
  const notes = (body.notes || "").trim();

  if (!config.ALLOWED_TYPES.includes(type)) {
    return jsonResponse(400, { ok: false, error: "Invalid provider type" });
  }
  if (!config.US_STATES.includes(state)) {
    return jsonResponse(400, { ok: false, error: "Invalid state" });
  }
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    return jsonResponse(400, { ok: false, error: "Invalid ZIP code" });
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return jsonResponse(400, { ok: false, error: "Invalid phone number" });
  }
  for (const [field, value] of Object.entries({ name, address, city, notes })) {
    if (tooLong(value, field)) {
      return jsonResponse(400, { ok: false, error: `${field} is too long` });
    }
    if (containsMarkup(value)) {
      return jsonResponse(400, { ok: false, error: `${field} contains characters that aren't allowed (< or >)` });
    }
  }
  if (containsBlockedWord(name) || containsBlockedWord(notes)) {
    return jsonResponse(400, { ok: false, error: "Submission couldn't be processed." });
  }

  const experience = config.ALLOWED_EXPERIENCE.includes(body.champva_experience)
    ? body.champva_experience
    : "Learning";
  const acceptingNew = body.accepting_new === "Yes" ? true : body.accepting_new === "No" ? false : null;
  const telehealth = body.telehealth === "Yes";

  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    name, type, address, city, state, zip, phone,
    rating: 0,
    reviews: 0,
    champvaExperience: experience,
    acceptingNew,
    telehealth,
    languages: [],
    notes: notes || "No additional notes provided by the submitter.",
    specialties: [],
    source: "community",
    submittedAt: new Date().toISOString(),
  };

  await providersStore().setJSON(`provider:${id}`, record);

  // Update rate-limit counter only after a real (non-bot, valid) submission.
  await rlStore.setJSON(rlKey, { count: rl.count + 1, windowStart: rl.windowStart });

  return jsonResponse(200, { ok: true, id });
};
