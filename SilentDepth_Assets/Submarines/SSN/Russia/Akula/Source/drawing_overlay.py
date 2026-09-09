"""Compare saved Blender mesh contours with board 04, without editing the board."""
import json
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parent.parent
data=json.loads((ROOT/"Validation/DRAWING_CONTOURS.json").read_text())
board=Image.open(ROOT/"Documentation/References/UserBoards/04_russian_scheme.png").convert("RGB")
draw=ImageDraw.Draw(board)
colors={"Hull_Drawing04":"#e24840","Sail_AsymmetricDrawing04":"#078b83","TowedArrayPod":"#2467ba"}
for name,lines in data.items():
    for key in ("upper","lower"):
        if name=="Sail_AsymmetricDrawing04" and key=="lower":
            continue
        points=[((x+55.1)/110.2*1913+30,383-z*244/13.6) for x,z in lines[key]]
        draw.line(points,fill=colors[name],width=3)
    if name!="TowedArrayPod":
        for key in ("port","starboard"):
            points=[((x+55.1)/110.2*1913+30,750-y*230/13.6) for x,y in lines[key]]
            draw.line(points,fill=colors[name],width=3)
path=ROOT/"Preview/Reference_Overlay.png"
board.save(path)
checks={}
for path in (ROOT/"Preview").glob("*.png"):
    im=np.asarray(Image.open(path).convert("RGB"))
    checks[path.name]={"width":im.shape[1],"height":im.shape[0],"stddev":float(im.std()),"nonblank":bool(im.std()>10)}
assert all(c["nonblank"] for c in checks.values())
(ROOT/"Validation/PREVIEW_PIXELS.json").write_text(json.dumps(checks,indent=2)+"\n")
spec_path=ROOT/"Documentation/RU_SSN_Akula_SPEC.json"
spec=json.loads(spec_path.read_text())
overlay=ROOT/"Preview/Reference_Overlay.png"
spec["sha256"]["Preview/Reference_Overlay.png"]=hashlib.sha256(overlay.read_bytes()).hexdigest()
spec_path.write_text(json.dumps(spec,ensure_ascii=False,indent=2)+"\n")
manifest_path=ROOT.parents[3]/"Manifest/submarine_manifest.json"
manifest=json.loads(manifest_path.read_text())
asset=next(a for a in manifest["assets"] if a["asset_id"]=="RU_SSN_Akula")
asset["sha256"]=spec["sha256"]
asset["previews"]=sorted(set(asset["previews"]+[str(overlay)]))
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(checks,indent=2))
