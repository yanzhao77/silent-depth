"""Pull the fields that matter from scraped Wikipedia submarine pages.

Reads firecrawl scrape output (markdown) and prints a compact record per page:
type, displacement, dimensions, propulsion, speed, depth, complement, sensors
and armament. Keeps the research pass readable instead of dumping whole pages.

Usage:
  python extract_infobox.py <page.md> [<page.md> ...]
"""

import os
import re
import sys

FIELDS = (
    "Type", "Displacement", "Length", "Beam", "Draught", "Draft",
    "Installed power", "Propulsion", "Speed", "Range", "Test depth",
    "Complement", "Sensors &", "Armament", "Endurance", "Boats",
)


def clean(text):
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[\d+\]", "", text)
    text = re.sub(r"<br\s*/?>", " / ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" |")


def extract(path):
    raw = open(path, encoding="utf-8", errors="ignore").read()
    start = raw.find("General characteristics")
    if start < 0:
        start = raw.find("Class overview")
    if start < 0:
        start = 0
    block = raw[start:start + 6000]

    print("=" * 8, os.path.basename(path).replace("wp-", "").replace(".md", ""))
    seen = set()
    for line in block.splitlines():
        match = re.match(r"\|\s*([^|]+?)\s*\|(.*)$", line)
        if not match:
            continue
        label, value = match.group(1).strip(), match.group(2).strip()
        if label not in FIELDS or label in seen or not value:
            continue
        seen.add(label)
        print("{}: {}".format(label, clean(value)[:400]))


for argument in sys.argv[1:]:
    extract(argument)
