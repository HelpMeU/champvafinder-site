# Crowd-sourced provider submissions — no manual review

You said you don't need (and can't do) a manual review queue for new
submissions. This replaces the old Netlify Forms flow with an auto-publish
system: submissions go live immediately, and the crowd — not you — keeps
it honest via Confirm/Report buttons.

## How it works

```
submit.html
    │  fetch POST (JSON)
    ▼
netlify/functions/submit-provider.js  ──stores──▶  Netlify Blobs ("providers" store)
                                                            │
index.html  ──fetch POST──▶  netlify/functions/list-providers.js  ◀────────┘
    │                                    │
    │  merges static (providers.js)      reads votes for every id from
    │  + dynamic (from Blobs) providers  Netlify Blobs ("votes" store)
    ▼
   renders cards with Confirm/Report buttons
    │
    │  fetch POST (on click)
    ▼
netlify/functions/vote-provider.js  ──updates──▶  Netlify Blobs ("votes" store)
```

Three Netlify Functions, backed by Netlify Blobs (built into your Netlify
account — no new service, no sign-up elsewhere):

- **`submit-provider`** — validates and stores a new submission immediately.
- **`list-providers`** — returns all live community submissions, plus
  confirm/report counts for every provider on the page (seed, CMS-imported,
  and community-submitted alike).
- **`vote-provider`** — records one Confirm or Report click.

## What a visitor sees

- A freshly submitted provider shows up right away with an *"New
  submission — not yet confirmed by other community members"* note and
  whatever CHAMPVA-experience badge the submitter picked.
- A CMS-imported provider (from the other pipeline) shows the gray
  **Unverified** badge with *"Imported from federal Medicare records — not
  yet confirmed for CHAMPVA by anyone in the community."*
- Once a listing gets **3 confirmations** (`CONFIRM_THRESHOLD` in
  `netlify/functions/lib/config.js`), the note changes to *"✓ Confirmed
  accurate by N people in the community"* and it's treated as trustworthy.
- Once a listing gets **3 reports** (`REPORT_HIDE_THRESHOLD`), it stops
  appearing in search results entirely — automatically, no one has to look
  at it. Its data isn't deleted (still sitting in Blobs) in case you ever
  want to glance at what got hidden, but nothing forces you to.
- Every visitor can vote once per listing per action (tracked by a random
  token in their browser's `localStorage`) — not bulletproof against
  someone clearing their browser data, but enough friction to stop casual
  abuse without needing an account system.

## Automated defenses on submission (not a substitute for real moderation)

- **Honeypot field** — a hidden input real visitors never see; bots that
  fill every field often fill this too. If it's non-empty, the submission
  is silently discarded (the bot gets a fake "success" response).
- **Minimum fill time** — submissions faster than 3 seconds after the page
  loaded are discarded (a human doesn't fill 8 fields in half a second).
- **Rate limiting** — max 3 submissions per hour per IP address.
- **Field validation** — required fields, valid US state, valid ZIP, phone
  has at least 7 digits, length caps, and a flat rejection of `<`/`>`
  characters (blocks the crudest injection attempts at the door).
- **A short blocked-word list** — catches the most obvious spam keywords.
  It's deliberately small and will need additions over time; it is not a
  profanity filter or a moderation system.
- **Output-side HTML-escaping** — every field is escaped in
  `providers.js` before it's ever inserted into the page, regardless of
  what made it past the above. This is the real backstop against stored
  XSS — even if a malicious payload gets stored, it renders as inert text,
  never executes.

**What this does NOT protect against:** someone submitting a real
practice's information with false or defamatory notes, a coordinated
group of accounts confirming a fake listing past the threshold, or
someone submitting their own competitor's real practice with harmful
notes. Nothing here verifies the submitter's identity or relationship to
the practice. This is the deliberate tradeoff of "no human reviews
anything" — the mitigation is that reports auto-hide fast (3 reports, no
waiting on you), not that bad content can't appear at all. If that
tradeoff ever feels wrong for a specific case, the fix is a manual
override, not a review queue: since Netlify Blobs is just data, you (or
a future admin tool) can always delete or edit a specific
`provider:<id>` or `votes:<id>` entry directly — see "Manual overrides"
below.

## Deploying this

1. **Install the one new dependency:**
   ```bash
   cd site/
   npm install
   ```
   This pulls `@netlify/blobs`, declared in `package.json`. Netlify's
   build will also run this automatically on deploy, but running it
   locally first lets you generate a `package-lock.json` (recommended —
   commit it for reproducible builds) and test with `netlify dev`.

2. **No Blobs setup needed.** Netlify Blobs is available on your account
   by default for any site with Functions enabled — `getStore(name)`
   inside a function just works once deployed, no manual provisioning, no
   extra token or API key to configure.

3. **Deploy as normal** (git push, or `netlify deploy`). `netlify.toml`
   already points Netlify at `netlify/functions/` for the functions and
   `.` for the static site — nothing else to configure.

4. **Test locally before deploying**, if you want: `netlify dev` (Netlify
   CLI) runs the site and functions together and emulates Blobs locally
   automatically — no fake modules or mocking needed. `dev-tests/` also
   has a standalone logic smoke test if you just want to sanity-check the
   validation/threshold logic in isolation (see the comment at the top of
   `dev-tests/test-functions.js` for how to run it — it needs a throwaway
   fake `@netlify/blobs` module since it doesn't go through `netlify dev`).

## Tuning the thresholds

Everything is in one file: `netlify/functions/lib/config.js`.

| Constant | Default | What it controls |
|---|---|---|
| `CONFIRM_THRESHOLD` | 3 | Confirmations before a listing shows as crowd-verified |
| `REPORT_HIDE_THRESHOLD` | 3 | Reports before a listing auto-hides |
| `RATE_LIMIT_MAX_SUBMISSIONS` / `_WINDOW_MS` | 3 / 1 hour | Per-IP submission rate limit |
| `MIN_FILL_TIME_MS` | 3000 | Fastest a real human could plausibly fill the form |
| `BLOCKED_WORDS` | short list | Add to this any time something obvious slips through |

If 3 reports feels too easy to game (e.g. you notice coordinated
reporting hiding legitimate listings), raise `REPORT_HIDE_THRESHOLD`. If
confirmations feel too slow to accumulate on a low-traffic site, lower
`CONFIRM_THRESHOLD`. No code changes needed beyond this file.

## Manual overrides (you still can, you just don't have to)

Nothing about this system prevents you from stepping in on a specific
listing — it just doesn't require you to. Via the Netlify CLI or a small
one-off script using `@netlify/blobs`'s `getStore`:

- **Remove a bad listing:** delete its `provider:<id>` blob from the
  `providers` store.
- **Un-hide something wrongly buried by reports, or force-hide something
  reports haven't caught yet:** overwrite its `votes:<id>` blob in the
  `votes` store (e.g. reset `reportedBy` to `[]`, or pad it past the
  threshold).
- **See what's been auto-hidden:** `list-providers.js` filters hidden
  listings out of its response by design; a two-line variant (or a quick
  `netlify blobs:get` via the CLI) can list them without that filter if
  you ever want to look.

None of these require rebuilding the moderation system — they're just
direct edits to the underlying data, available whenever you want them,
never required.

## What changed in the existing site files

- `providers.js` — added `escapeHTML()` and applied it everywhere a field
  reaches `innerHTML`; added Confirm/Report button markup and the
  verification-ribbon logic; `filterProviders()` now takes the list to
  filter as its first argument (it used to always filter the global
  `PROVIDERS` constant — now it filters whatever merged list `index.html`
  builds).
- `index.html` — replaced the synchronous "read PROVIDERS, render once"
  flow with: render the static list immediately, then fetch dynamic
  providers + vote status and re-render. Added `getVoterToken()`,
  `castVote()`, `loadDynamicProviders()`.
- `submit.html` — no longer a Netlify Forms submission (`data-netlify`,
  `action="/thank-you.html"` are gone); now does a `fetch()` POST to
  `submit-provider` and redirects to `thankyou.html` on success, or shows
  an inline error (rate-limited, validation failure) without losing the
  user's filled-in form.
- `thankyou.html` — copy updated to reflect immediate publishing instead
  of a 1–3 day review.
- `style.css` — added `.vote-row` / `.vote-btn` / `.vote-feedback` styles.

## If you outgrow this later

This design optimizes for zero ongoing effort from you. If the directory
grows enough that spam becomes a real problem despite the thresholds, the
natural next steps (each independent, add only what you need) are: a
CAPTCHA on the submit form, an email-verification step before a
submission counts as a "real" confirm vote, or a lightweight admin view
that lists recently-reported items for you to glance at (not a
requirement to review everything — just a faster way to spot patterns).
None of that needs to be built now.
