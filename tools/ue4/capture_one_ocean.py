import os
import unreal


def log(msg):
    try:
        unreal.log(msg)
    except Exception:
        print(msg)


OUT_DIR = "E:/workspace/githubDownloads/silent-depth/artifacts/ocean"

MAPS = [
    ("Clear", "/Game/Maps/Ocean_Main", "ocean_clear_surface"),
    ("Cloudy", "/Game/Maps/Ocean_Cloudy", "ocean_cloudy_surface"),
    ("Storm", "/Game/Maps/Ocean_Storm", "ocean_storm_surface"),
    ("Night", "/Game/Maps/Ocean_Night", "ocean_night_surface"),
]


index = int(os.environ.get("OCEAN_CAP", "0")) % len(MAPS)
name, path, label = MAPS[index]

if not unreal.EditorAssetLibrary.does_asset_exist(path):
    log("missing map %s" % path)
else:
    unreal.EditorLevelLibrary.load_level(path)
    log("loaded %s" % path)
    try:
        unreal.EditorLevelLibrary.set_level_viewport_camera_info(
            unreal.Vector(0, -3000, 800), unreal.Rotator(-25, 0, 0)
        )
        unreal.EditorLevelLibrary.editor_invalidate_viewports()
    except Exception as exc:
        log("camera set error: %s" % exc)
    try:
        unreal.AutomationLibrary.take_high_res_screenshot(
            1600, 900, OUT_DIR + "/" + label + ".png"
        )
        log("shot requested for %s" % label)
    except Exception as exc:
        log("screenshot error: %s" % exc)

log("OCEAN_CAPTURE_DONE")
