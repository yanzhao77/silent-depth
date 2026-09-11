"""Fetch reference images for one submarine and write its PROVENANCE.json.

Runs a firecrawl image search, downloads up to N images into the asset's
Documentation/References folder (Wikimedia first), and writes the provenance
record next to them. Re-running is safe: existing files are overwritten and the
provenance file is regenerated.

Usage:
  python fetch_for_asset.py <AssetId> <Path> "<search query>" [count]

<Path> is the ASSETS.tsv path, e.g. Submarines/SSN/UK/Astute
"""

import json
import os
import re
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

MIN_BYTES = 5000
EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
USER_AGENT = "Mozilla/5.0 (compatible; SilentDepthReferenceCollector/1.0)"


def slug(text, limit=32):
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", text or "").strip("_")
    return cleaned[:limit] or "ref"


def extension_for(url):
    lowered = url.lower()
    for ext in EXTENSIONS:
        if ext in lowered:
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"


def search_images(query, limit=10):
    # Merge stderr into stdout: on Windows the CLI writes its payload to
    # whichever stream the wrapper picked, and stdout can arrive as None.
    result = subprocess.run(
        'npx firecrawl search "{}" --sources images --limit {} --json'.format(
            query.replace('"', " "), limit),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=True,
        encoding="utf-8", errors="replace",
    )
    output = result.stdout or ""
    match = re.search(r"\{.*\}", output, re.S)
    if not match:
        raise SystemExit("image search returned no payload for: {} (rc={})".format(
            query, result.returncode))
    return json.loads(match.group(0))


def download(url, path):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    if len(data) < MIN_BYTES:
        return False
    with open(path, "wb") as handle:
        handle.write(data)
    return True


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    asset_id, asset_path, query = sys.argv[1], sys.argv[2], sys.argv[3]
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 5

    out_dir = os.path.join(ROOT, asset_path.replace("/", os.sep), "Documentation", "References")
    os.makedirs(out_dir, exist_ok=True)

    payload = search_images(query)
    candidates, seen = [], set()
    for entry in payload.get("data", {}).get("images") or []:
        url = entry.get("imageUrl") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        candidates.append({"title": entry.get("title") or "", "url": url,
                           "page": entry.get("url") or ""})
    candidates.sort(key=lambda c: 0 if "wikimedia" in c["url"] else 1)

    images, index = [], 0
    for candidate in candidates:
        if len(images) >= count:
            break
        index += 1
        name = "{:02d}_{}{}".format(index, slug(candidate["title"]), extension_for(candidate["url"]))
        path = os.path.join(out_dir, name)
        try:
            if not download(candidate["url"], path):
                continue
        except Exception as exc:  # noqa: BLE001
            print("skip {}: {}".format(candidate["url"][:70], exc), file=sys.stderr)
            if os.path.exists(path):
                os.remove(path)
            continue
        images.append({
            "file": name,
            "source_page": candidate["page"],
            "image_url": candidate["url"],
            "accessed": "2026-09-11",
            "license": "Public Domain (US Government)" if "navy.mil" in candidate["url"] else "UNKNOWN",
            "description": candidate["title"][:90],
        })

    record = {
        "asset_id": asset_id,
        "generated_at": "2026-09-11",
        "note": "参考图仅供本地审阅，不进入运行时资产包。许可未核实者不得再分发。",
        "images": images,
    }
    with open(os.path.join(out_dir, "PROVENANCE.json"), "w", encoding="utf-8") as handle:
        json.dump(record, handle, ensure_ascii=False, indent=2)

    print("{}: {} image(s), credits used {}".format(
        asset_id, len(images), payload.get("creditsUsed")))


main()
