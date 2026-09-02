// Shared constants for the crowd-sourcing backend. Change thresholds here —
// every function reads from this one place.
module.exports = {
  // Votes needed before a "pending" community submission (or a CMS-imported
  // "Unverified" record) shows as crowd-confirmed instead.
  CONFIRM_THRESHOLD: 3,

  // Reports needed before a listing is automatically hidden. No human
  // reviews this queue by design — see README_CROWDSOURCING.md if you
  // later want to add a way to glance at hidden listings.
  REPORT_HIDE_THRESHOLD: 3,

  // Basic anti-spam: max new submissions from one IP per window.
  RATE_LIMIT_MAX_SUBMISSIONS: 3,
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000, // 1 hour

  // Forms filled out faster than this are almost certainly bots, not
  // humans reading five form sections. submit.html records when the form
  // rendered and sends the elapsed time.
  MIN_FILL_TIME_MS: 3000,

  MAX_FIELD_LENGTHS: {
    name: 120,
    address: 120,
    city: 60,
    notes: 800,
    submitter_name: 80,
    submitter_email: 120,
  },

  ALLOWED_TYPES: [
    "Primary Care", "Specialist", "Mental Health", "Pediatrics",
    "OB/GYN", "Dental", "Urgent Care", "Physical Therapy", "Other",
  ],

  ALLOWED_EXPERIENCE: ["Expert", "Familiar", "Learning"],

  US_STATES: [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
    "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
    "TX","UT","VT","VA","WA","WV","WI","WY","DC",
  ],

  // A deliberately short, low-effort keyword filter — not a substitute for
  // real moderation, just a first speed bump against the crudest spam/abuse.
  // Add to this list any time something obvious slips through.
  BLOCKED_WORDS: [
    "viagra", "casino", "porn", "xxx", "crypto airdrop", "forex signal",
  ],
};
