#!/usr/bin/env python3
"""
Merge a reviewed staging file (see transform_to_site_schema.py) into
providers.js, producing providers.js.new — it NEVER overwrites your live
providers.js directly, so you can diff before deploying.

Usage:
    # after reviewing/trimming cms-import-staging.json by hand:
    python merge_staging.py --providers-js providers.js --staging cms-import-staging.json

    diff providers.js providers.js.new   # sanity check
    mv providers.js.new providers.js     # when you're happy
    git add providers.js && git commit -m "Import CMS-sourced provider candidates"
    git push   # Netlify redeploys automatically

What it does:
    1. Reads providers.js as text and locates the `const PROVIDERS = [ ... ];`
       array by its exact opening/closing markers.
    2. Parses that array as JSON (it already is valid JSON — just double-quote
       everything consistently before saving, or leave it; Python's parser
       tolerates the array's existing JS-ish formatting since it's really
       JSON under the hood).
    3. Appends every record from the staging file whose id isn't already
       present (so re-running this after further edits doesn't duplicate).
    4. Strips the leading-underscore audit fields (_npi, _medicare_enrolled,
       etc.) before writing back — those were for your review only, the
       live site doesn't need them.
    5. Writes the array back into providers.js.new. Everything outside the
       PROVIDERS array is untouched; the array itself is reformatted as
       indented JSON (still perfectly valid JS) rather than preserving the
       original one-line-per-record style, so the diff will show every
       existing record reformatted even though none of their data changed
       — read the diff for content, not line-by-line formatting.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

START_MARKER = "const PROVIDERS = ["
END_MARKER_RE = re.compile(r"\n\];\s*\n")


def extract_array_span(text: str) -> tuple[int, int]:
    start = text.find(START_MARKER)
    if start == -1:
        raise SystemExit("Could not find 'const PROVIDERS = [' in the given providers.js — "
                          "has the file been restructured? Merge manually this time.")
    array_start = start + len("const PROVIDERS = ")
    m = END_MARKER_RE.search(text, array_start)
    if not m:
        raise SystemExit("Could not find the closing '];' for the PROVIDERS array — "
                          "has the file been restructured? Merge manually this time.")
    array_end = m.start() + 2  # m.start() is the '\n' before ']'; +2 includes the ']' itself
    return array_start, array_end


def parse_js_array(array_text: str) -> list:
    """The existing PROVIDERS array is a JS object-literal array (unquoted
    keys, single quotes possible, etc.) — not strict JSON — so it can't be
    parsed with json.loads. Node itself is the one thing that reliably
    parses arbitrary JS object-literal syntax, so shell out to it rather
    than hand-rolling a parser or risking a corrupt merge."""
    node = shutil.which("node")
    if not node:
        raise SystemExit("Node.js is required to parse the existing PROVIDERS array "
                          "(it uses JS object-literal syntax, not strict JSON) but "
                          "`node` was not found on PATH. Install Node, or convert the "
                          "array to strict JSON and merge manually this time.")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False, encoding="utf-8") as tf:
        tf.write("const ___ARR = " + array_text + ";\n")
        tf.write("process.stdout.write(JSON.stringify(___ARR));\n")
        tmp_path = tf.name
    try:
        result = subprocess.run([node, tmp_path], capture_output=True, text=True, timeout=30)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    if result.returncode != 0:
        raise SystemExit(f"Node failed to parse the existing PROVIDERS array:\n{result.stderr}\n"
                          f"The array may use syntax Node's expression evaluator can't handle "
                          f"(e.g. a trailing function call) — merge manually this time.")
    return json.loads(result.stdout)


def clean_record(rec: dict) -> dict:
    return {k: v for k, v in rec.items() if not k.startswith("_")}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--providers-js", type=Path, default=Path("providers.js"))
    parser.add_argument("--staging", type=Path, default=Path("cms-import-staging.json"))
    parser.add_argument("--out", type=Path, default=None,
                        help="Defaults to <providers-js>.new")
    args = parser.parse_args()
    out_path = args.out or args.providers_js.with_suffix(args.providers_js.suffix + ".new")

    text = args.providers_js.read_text(encoding="utf-8")
    array_start, array_end = extract_array_span(text)
    array_text = text[array_start:array_end]

    existing = parse_js_array(array_text)

    existing_ids = {rec["id"] for rec in existing}
    staged = json.loads(args.staging.read_text(encoding="utf-8"))

    added = 0
    for rec in staged:
        if rec["id"] in existing_ids:
            continue
        existing.append(clean_record(rec))
        existing_ids.add(rec["id"])
        added += 1

    new_array_text = json.dumps(existing, indent=2)
    new_text = text[:array_start] + new_array_text + text[array_end:]
    out_path.write_text(new_text, encoding="utf-8")

    print(f"Added {added} new provider(s) (skipped {len(staged) - added} already-present id(s)).")
    print(f"Wrote {out_path} — diff it against {args.providers_js} before replacing it.")


if __name__ == "__main__":
    main()
