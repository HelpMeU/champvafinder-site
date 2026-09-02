#!/usr/bin/env python3
"""
Transform fetch_providers.py's output (providers.csv) into champvafinder.org's
site schema, as a STAGING file for human review — nothing here touches the
live site directly.

Usage:
    python transform_to_site_schema.py --input ../output/providers.csv --output cms-import-staging.json

Each output record matches the shape providers.js expects, with three
deliberate differences from a real community submission (see
README_SITE_INTEGRATION.md for the reasoning):

    champvaExperience : "Unverified"   (never a guessed Expert/Familiar/Learning)
    rating / reviews   : 0 / 0          (no fabricated star rating)
    acceptingNew       : null           (unknown, not a guessed true/false)

Records that look like an existing community entry (fuzzy match on name +
city + state against existing_community_providers.json) are skipped so you
don't get accidental duplicates of providers already hand-entered.
"""

import argparse
import csv
import json
import re
from pathlib import Path

# NUCC taxonomy / NPPES specialty text -> the broad `type` categories the
# site's dropdown and card header already use. Keep in sync with
# config.py's SPECIALTIES list in the parent pipeline.
TYPE_MAP = {
    "Family Medicine": "Primary Care",
    "Internal Medicine": "Primary Care",
    "General Practice": "Primary Care",
    "Nurse Practitioner": "Primary Care",
    "Physician Assistant": "Primary Care",

    "Psychiatry": "Mental Health",
    "Clinical Psychologist": "Mental Health",
    "Clinical Social Worker": "Mental Health",
    "Marriage & Family Therapist": "Mental Health",
    "Mental Health Counselor": "Mental Health",
    "Psychoanalyst": "Mental Health",

    "Obstetrics & Gynecology": "OB/GYN",
    "Midwife": "OB/GYN",

    "Pediatrics": "Pediatrics",
    "Physical Therapist": "Physical Therapy",
}
DEFAULT_TYPE = "Specialist"


def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def load_existing_keys(path: Path) -> set[str]:
    if not path.exists():
        print(f"[warn] {path} not found — skipping de-dup against existing community entries")
        return set()
    existing = json.loads(path.read_text(encoding="utf-8"))
    return {normalize(e["name"]) + "|" + normalize(e["city"]) + "|" + normalize(e["state"]) for e in existing}


def next_id_start(existing_ids_hint: int = 1000) -> int:
    # Starts well above the current 15 hand-entered IDs (1-15) so there's no
    # risk of colliding with future one-off community submissions someone
    # adds by hand before a merge happens.
    return existing_ids_hint


def map_type(primary_specialty: str, all_specialties: str) -> str:
    if primary_specialty in TYPE_MAP:
        return TYPE_MAP[primary_specialty]
    for s in (all_specialties or "").split(";"):
        s = s.strip()
        if s in TYPE_MAP:
            return TYPE_MAP[s]
    return DEFAULT_TYPE


def build_record(row: dict, next_id: int) -> dict:
    specialties = [s.strip() for s in (row.get("all_matched_specialties") or "").split(";") if s.strip()]
    if not specialties and row.get("primary_specialty"):
        specialties = [row["primary_specialty"]]

    medicare_flag = row.get("medicare_enrolled", "Unknown")
    if medicare_flag == "Y":
        medicare_note = f"Confirmed enrolled to bill Medicare per CMS federal records (checked {row.get('last_verified','')})."
    elif medicare_flag == "N":
        medicare_note = f"NOT found in CMS's Medicare enrollment file as of {row.get('last_verified','')} — verify before listing."
    else:
        medicare_note = "Medicare enrollment status not checked."

    return {
        "id": next_id,
        "name": row.get("display_name") or f"{row.get('first_name','')} {row.get('last_name','')}".strip(),
        "type": map_type(row.get("primary_specialty", ""), row.get("all_matched_specialties", "")),
        "address": row.get("address_line1", ""),
        "city": row.get("city", ""),
        "state": row.get("state", ""),
        "zip": (row.get("zip") or "")[:5],
        "phone": row.get("phone", ""),
        "rating": 0,
        "reviews": 0,
        "champvaExperience": "Unverified",
        "acceptingNew": None,
        "telehealth": False,
        "languages": [],
        "notes": f"{medicare_note} CHAMPVA acceptance not yet confirmed by a family or the provider — call ahead to confirm before your visit.",
        "specialties": specialties,
        # Real, kept field: index.html's verificationRibbonHTML() checks
        # source === "cms" to show the "imported from federal records, not
        # yet crowd-confirmed" note instead of the community-submission one.
        "source": "cms",
        # Everything below is leading-underscore audit-only — stripped by
        # merge_staging.py before it reaches providers.js.
        "_npi": row.get("npi", ""),
        "_medicare_enrolled": medicare_flag,
        "_pipeline_source": row.get("source", ""),
        "_last_verified": row.get("last_verified", ""),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, default=Path("../output/providers.csv"),
                        help="Path to providers.csv produced by fetch_providers.py")
    parser.add_argument("--output", type=Path, default=Path("cms-import-staging.json"),
                        help="Where to write the staging JSON for review")
    parser.add_argument("--existing", type=Path, default=Path("existing_community_providers.json"),
                        help="Existing community entries, for de-dup")
    parser.add_argument("--start-id", type=int, default=1000,
                        help="First ID to assign to staged records (default 1000, well clear of the 15 hand-entered IDs)")
    parser.add_argument("--only-medicare-enrolled", action="store_true",
                        help="Only stage rows CMS confirms as medicare_enrolled == Y")
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input not found: {args.input}\n"
                          f"Run fetch_providers.py first (see the pipeline README).")

    existing_keys = load_existing_keys(args.existing)

    staged = []
    skipped_duplicate = 0
    skipped_not_enrolled = 0
    next_id = args.start_id

    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if args.only_medicare_enrolled and row.get("medicare_enrolled") != "Y":
                skipped_not_enrolled += 1
                continue

            key = normalize(row.get("display_name", "")) + "|" + normalize(row.get("city", "")) + "|" + normalize(row.get("state", ""))
            if key in existing_keys:
                skipped_duplicate += 1
                continue

            staged.append(build_record(row, next_id))
            next_id += 1

    args.output.write_text(json.dumps(staged, indent=2), encoding="utf-8")

    print(f"Staged {len(staged)} candidate providers -> {args.output}")
    print(f"Skipped {skipped_duplicate} likely duplicates of existing community entries")
    if args.only_medicare_enrolled:
        print(f"Skipped {skipped_not_enrolled} rows not confirmed Medicare-enrolled")
    print(f"\nNext step: open {args.output}, review/trim rows as needed, then run merge_staging.py.")


if __name__ == "__main__":
    main()
