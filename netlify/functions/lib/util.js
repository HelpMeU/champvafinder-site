const { getStore } = require("@netlify/blobs");
const config = require("./config");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getClientIp(event) {
  // Netlify sets this on every request; x-forwarded-for is a fallback for
  // local `netlify dev` testing.
  const nf = event.headers["x-nf-client-connection-ip"];
  if (nf) return nf;
  const fwd = event.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

// Very small hash so we don't store raw IPs long-term in the rate-limit
// store — not cryptographic, just avoids keeping plaintext IPs around.
function hashIp(ip) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = (h * 31 + ip.charCodeAt(i)) | 0;
  }
  return "ip-" + Math.abs(h).toString(36);
}

function providersStore() {
  return getStore("providers");
}

function votesStore() {
  return getStore("votes");
}

function rateLimitStore() {
  return getStore("ratelimit");
}

function containsBlockedWord(text) {
  const lower = (text || "").toLowerCase();
  return config.BLOCKED_WORDS.some((w) => lower.includes(w));
}

function tooLong(value, field) {
  const max = config.MAX_FIELD_LENGTHS[field];
  return max && typeof value === "string" && value.length > max;
}

// Reject obvious HTML/script injection at the door. This is a second layer
// on top of output-side escaping in providers.js — never rely on just one.
function containsMarkup(value) {
  return typeof value === "string" && /[<>]/.test(value);
}

module.exports = {
  jsonResponse,
  getClientIp,
  hashIp,
  providersStore,
  votesStore,
  rateLimitStore,
  containsBlockedWord,
  tooLong,
  containsMarkup,
};
