"""Generate INDEX.md from the research directory.

Scans ASSETS.tsv, checks each submarine's Documentation folder for the
reference document, the provenance file and the images, and writes a status
table plus a per-tier listing. Also prints a summary of what is missing, which
is the quickest way to see whether the research pass is complete.

Usage:
  python make_index.py            # writes INDEX.md next to this script
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)              # SilentDepth_Assets
TSV = os.path.join(HERE, "ASSETS.tsv")
OUT = os.path.join(HERE, "INDEX.md")


def load_rows():
    rows = []
    with open(TSV, encoding="utf-8") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            tier, asset_id, kind, country, path = parts[:5]
            rows.append({"tier": tier, "id": asset_id, "kind": kind,
                         "country": country, "path": path})
    return rows


def scan(row):
    docs = os.path.join(ROOT, row["path"].replace("/", os.sep), "Documentation")
    reference = os.path.join(docs, row["id"] + "_REFERENCE.md")
    provenance = os.path.join(docs, "References", "PROVENANCE.json")
    images = []
    if os.path.isdir(os.path.join(docs, "References")):
        folder = os.path.join(docs, "References")
        images = [f for f in os.listdir(folder)
                  if os.path.isfile(os.path.join(folder, f)) and f != "PROVENANCE.json"]

    row["doc_lines"] = 0
    if os.path.isfile(reference):
        with open(reference, encoding="utf-8", errors="ignore") as handle:
            row["doc_lines"] = sum(1 for _ in handle)
    row["has_doc"] = row["doc_lines"] > 0
    row["has_provenance"] = os.path.isfile(provenance)
    row["images"] = len(images)

    # Modelling status: a submarine counts as modelled once it has LOD exports.
    fbx = os.path.join(ROOT, row["path"].replace("/", os.sep), "FBX")
    row["modelled"] = os.path.isdir(fbx) and any(
        f.startswith(row["id"] + "_LOD0") for f in os.listdir(fbx)
    )
    return row


def main():
    rows = [scan(row) for row in load_rows()]
    rows.sort(key=lambda r: (int(r["tier"][1:]) if r["tier"][1:].isdigit() else 99,
                             r["kind"], r["country"], r["id"]))

    missing_docs = [r for r in rows if not r["has_doc"]]
    missing_prov = [r for r in rows if not r["has_provenance"]]
    no_images = [r for r in rows if r["images"] == 0]
    modelled = [r for r in rows if r["modelled"]]

    lines = [
        "# 潜艇资料索引",
        "",
        "由 `make_index.py` 自动生成，不要手工编辑。资料规范见 [GUIDE.md](GUIDE.md)。",
        "",
        "## 总览",
        "",
        "| 项目 | 数量 |",
        "|---|---|",
        "| 科技树潜艇总数 | {} |".format(len(rows)),
        "| 已有资料文档 | {} |".format(len(rows) - len(missing_docs)),
        "| 已有来源记录 | {} |".format(len(rows) - len(missing_prov)),
        "| 已有参考图 | {} |".format(len(rows) - len(no_images)),
        "| 已有模型（LOD 导出） | {} |".format(len(modelled)),
        "",
    ]

    if missing_docs:
        lines += ["**尚缺资料文档**：" + "、".join(r["id"] for r in missing_docs), ""]
    if missing_prov:
        lines += ["**尚缺来源记录**：" + "、".join(r["id"] for r in missing_prov), ""]
    if no_images:
        lines += ["**尚无参考图**：" + "、".join(r["id"] for r in no_images), ""]

    lines += ["## 逐艇清单", "",
              "| Tier | AssetId | 艇型 | 国家 | 资料 | 行数 | 参考图 | 来源记录 | 模型 |",
              "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append("| {} | `{}` | {} | {} | {} | {} | {} | {} | {} |".format(
            r["tier"], r["id"], r["kind"], r["country"],
            "[有]({}/Documentation/{}_REFERENCE.md)".format(
                r["path"].replace(" ", "%20"), r["id"]) if r["has_doc"] else "缺",
            r["doc_lines"],
            r["images"] if r["images"] else "缺",
            "有" if r["has_provenance"] else "缺",
            "有" if r["modelled"] else "无",
        ))

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")

    print("wrote {} ({} subs, {} missing docs, {} missing provenance, {} without images)".format(
        OUT, len(rows), len(missing_docs), len(missing_prov), len(no_images)))


main()
