import os
from PIL import Image
from PIL import ImageStat


BASE = r"E:\workspace\githubDownloads\silent-depth\artifacts\ocean"
FILES = [
    "ocean_clear_surface.png",
    "ocean_cloudy_surface.png",
    "ocean_storm_surface.png",
    "ocean_night_surface.png",
]


def fmt(v):
    return "%.0f,%.0f,%.0f" % (v[0], v[1], v[2])


print("%-8s %-22s %-22s %-22s" % ("weather", "overall", "sky(top0.4)", "water(bot0.55)"))
for f in FILES:
    p = os.path.join(BASE, f)
    im = Image.open(p).convert("RGB")
    w, h = im.size
    overall = ImageStat.Stat(im).mean
    sky = ImageStat.Stat(im.crop((0, 0, w, int(h * 0.4)))).mean
    water = ImageStat.Stat(im.crop((0, int(h * 0.55), w, h))).mean
    name = f.split("_")[1].title()
    print("%-8s %-22s %-22s %-22s" % (name, fmt(overall), fmt(sky), fmt(water)))
