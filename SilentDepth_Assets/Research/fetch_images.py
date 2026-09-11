"""Download reference images from a firecrawl image-search dump.

Usage:
  python fetch_images.py <search-json> <output-dir> [count] [--asset-id ID]

The firecrawl CLI prints npm notices before its JSON payload, so the payload is
located by scanning for the first brace rather than parsing the file directly.
Wikimedia sources are preferred, then anything else. Prints a JSON array of the
downloaded files (file, title, image_url, source_page) so the caller can build
PROVENANCE.json. Files smaller than 5 KB are treated as failures and removed.
"""

import json
import os
import re
import sys
import urllib.request

MIN_BYTES = 5000
EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
USER_AGENT = "Mozilla/5.0 (compatible; SilentDepthReferenceCollector/1.0)"


def load_payload(path):
    raw = open(path, encoding="utf-8-sig", errors="ignore").read()
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        raise SystemExit("no JSON payload found in " + path)
    return json.loads(match.group(0))


def slug(text, limit=32):
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", text or "").strip("_")
    return cleaned[:limit] or "ref"


def extension_for(url):
    lowered = url.lower()
    for ext in EXTENSIONS:
        if ext in lowered:
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"


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
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    payload = load_payload(sys.argv[1])
    out_dir = sys.argv[2]
    count = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 4
    os.makedirs(out_dir, exist_ok=True)

    images = payload.get("data", {}).get("images") or []
    candidates = []
    seen = set()
    for entry in images:
        url = entry.get("imageUrl") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        candidates.append({
            "title": entry.get("title") or "",
            "image_url": url,
            "source_page": entry.get("url") or "",
        })
    candidates.sort(key=lambda c: 0 if "wikimedia" in c["image_url"] else 1)

    saved = []
    index = 0
    for candidate in candidates:
        if len(saved) >= count:
            break
        index += 1
        name = "{:02d}_{}{}".format(index, slug(candidate["title"]), extension_for(candidate["image_url"]))
        path = os.path.join(out_dir, name)
        try:
            if not download(candidate["image_url"], path):
                continue
        except Exception as exc:  # noqa: BLE001 - report and continue
            print("skip {}: {}".format(candidate["image_url"][:80], exc), file=sys.stderr)
            if os.path.exists(path):
                os.remove(path)
            continue
        candidate["file"] = name
        saved.append(candidate)

    print(json.dumps(saved, ensure_ascii=False, indent=2))
    print("saved {} image(s) to {}".format(len(saved), out_dir), file=sys.stderr)


main()
