"""Fetch reference images for every submarine that does not have them yet.

Walks ASSETS.tsv, skips assets that already have a References/PROVENANCE.json,
and runs fetch_for_asset.py for the rest. Prints one line per asset.

Usage:
  python fetch_missing_images.py [count]      # default 4 images per asset
"""

import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FETCH = os.path.join(HERE, "fetch_for_asset.py")


def main():
    count = sys.argv[1] if len(sys.argv) > 1 else "4"
    rows = []
    with open(os.path.join(HERE, "ASSETS.tsv"), encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 5:
                rows.append(parts)

    done = skipped = failed = 0
    for tier, asset_id, kind, country, path in [(r[0], r[1], r[2], r[3], r[4]) for r in rows]:
        references = os.path.join(ROOT, path.replace("/", os.sep), "Documentation", "References")
        if os.path.isfile(os.path.join(references, "PROVENANCE.json")):
            skipped += 1
            continue
        class_name = path.split("/")[-1].replace("_", " ")
        query = "{} class submarine".format(class_name)
        result = subprocess.run(
            [sys.executable, FETCH, asset_id, path, query, count],
            capture_output=True, text=True,
        )
        line = (result.stdout or result.stderr or "").strip().splitlines()
        if result.returncode == 0 and line:
            print(line[-1], flush=True)
            done += 1
        else:
            print("FAILED {} ({})".format(asset_id, query), flush=True)
            failed += 1
        # Firecrawl throttles bursty callers; pace the loop.
        time.sleep(5)

    print("done={} skipped={} failed={}".format(done, skipped, failed))


main()
