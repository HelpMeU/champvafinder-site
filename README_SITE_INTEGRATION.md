# Getting CMS provider data onto champvafinder.org

This is the second half of the pipeline: taking `providers.csv` (from
`fetch_providers.py` in the parent folder) and getting it into your
Netlify site's `providers.js` — a periodic, human-triggered batch import,
distinct from the always-on crowd-sourced submission system covered in
`README_CROWDSOURCING.md`. Both paths avoid claiming things about a
provider that the data doesn't actually support.

**Note:** this doc was written before the crowd-sourcing system existed,
back when new listings meant either a bulk CMS import (this doc) or a
manually-reviewed one-off submission. Submissions are no longer manually
reviewed — see `README_CROWDSOURCING.md` for how those work now. This
doc still covers the CMS bulk-import path, which is unchanged and still
useful for periodically seeding new states/specialties at once.

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `providers.js`, `style.css` | Your site's files, with the three display changes below applied. Everything else is untouched. |
| `existing_community_providers.json` | The 15 hand-entered providers currently in `providers.js` (name/city/state only) — used to skip obvious duplicates. |
| `transform_to_site_schema.py` | Converts `providers.csv` into a staging file shaped like your site's provider records. |
| `merge_staging.py` | Merges a reviewed staging file into `providers.js`, writing `providers.js.new` (never overwrites the original). |

## Why three small display changes were needed

CMS's data tells you a provider's name, specialty, address, phone, and
whether they're enrolled to bill Medicare. It does **not** tell you a
star rating, a review count, whether they're accepting new CHAMPVA
patients, or how experienced they are with CHAMPVA billing specifically
— because nobody has actually reported that yet. Rather than fabricate
those numbers, three things changed:

1. **A new `Unverified` badge** (gray, next to Expert/Familiar/Learning)
   for any provider that came from CMS data rather than a submission.
   `badgeHTML()` and `style.css` both got a fourth case for it, and the
   legend on the search page now shows it too.
2. **No fake ratings.** A record with `reviews: 0` now shows "Not yet
   rated by the community" instead of a misleading "0.0 ★ (0 reviews)".
3. **`acceptingNew` is now tri-state.** `true`/`false` still render as
   before (a real answer from a submission). `null` — meaning "we don't
   know" — now shows a neutral "Status Not Confirmed" tag instead of
   silently defaulting to "Waitlist", which would have been a false
   claim for every CMS-imported record.

None of this changes the *content* of your 15 existing community
entries — their name/address/rating/etc. are untouched. `providers.js`
has since picked up additional changes for the crowd-sourcing system
(see `README_CROWDSOURCING.md`), including a `source: "community"` field
on each seed record and HTML-escaping in the render functions, so it is
no longer byte-for-byte identical to the pre-crowd-sourcing version —
just unchanged in the data that matters.

## The import workflow

```
fetch_providers.py  →  providers.csv
        │
        ▼
transform_to_site_schema.py  →  cms-import-staging.json   ← YOU REVIEW THIS
        │
        ▼
merge_staging.py  →  providers.js.new   ← diff, then rename to providers.js
```

### 1. Generate the staging file

```bash
cd site/
python transform_to_site_schema.py --input ../output/providers.csv --output cms-import-staging.json
```

This skips anything that looks like a duplicate of your 15 existing
entries (fuzzy match on name + city + state) and assigns new IDs
starting at 1000, well clear of your existing 1–15.

Add `--only-medicare-enrolled` to skip any row CMS's enrollment file
didn't actually confirm (i.e. drop the `medicare_enrolled: N` /
`Unknown` rows) if you'd rather only stage the strongest candidates.

### 2. Review it (optional, but recommended for a bulk batch)

Open `cms-import-staging.json` in any editor. Each record has extra
`_npi`, `_medicare_enrolled`, `_pipeline_source`, `_last_verified` fields
(leading underscore) purely for your own sanity-checking — they get
stripped automatically before anything reaches the live site, along with
the real `source: "cms"` field the site uses to show the right
verification note. Delete any record you don't want listed. Unlike the
crowd-sourced submissions covered in `README_CROWDSOURCING.md` (which
publish with zero human involvement by design), a CMS batch import is
something you trigger yourself, so a quick skim before merging hundreds
or thousands of records at once is worth the few minutes — though nothing
stops you from merging the whole staging file unreviewed if you'd rather.

### 3. Merge

```bash
python merge_staging.py --providers-js providers.js --staging cms-import-staging.json
diff providers.js providers.js.new
```

Heads up: the diff will show *every* existing record as "changed" the
first time you run this — the merge script reformats the whole array as
indented JSON rather than preserving the original one-line-per-record
style. No data changes for existing entries; only the new records at the
end are actually new content. `git diff --color-words` reads easier than
plain `diff` for confirming this.

If it looks right:

```bash
mv providers.js.new providers.js
git add providers.js
git commit -m "Import CMS-sourced provider candidates for GA/SC/NC/WA/OH/PA/NY"
git push
```

Netlify redeploys automatically on push, same as any other change to
the site.

### Re-running later

Both scripts are idempotent-ish: `transform_to_site_schema.py` re-checks
against `existing_community_providers.json`, and `merge_staging.py`
skips any staged `id` already present in `providers.js`. If you re-run
the fetch pipeline in a few months to catch newly-enrolled providers,
regenerate `existing_community_providers.json` first by copying the
current (id, name, city, state) for every record in `providers.js` —
otherwise the new run won't know about last time's imports and could
offer to re-add them (merge_staging.py would then just skip the
duplicate IDs, so this is a minor efficiency thing, not a correctness
risk).

## One thing worth deciding, not solved here

**Recurring CMS pulls.** The parent README suggests a scheduled GitHub
Action to re-run `fetch_providers.py` periodically. Worth wiring up once
you're happy with how the first batch looks live — happy to build it when
you are. (The submit.html → live-listing gap mentioned in an earlier
version of this doc is now solved — see `README_CROWDSOURCING.md`.)
