import unreal


def log(msg):
    try:
        unreal.log(msg)
    except Exception:
        print(msg)


OUT_DIR = "E:/workspace/githubDownloads/silent-depth/artifacts/ocean"

MAPS = [
    ("Clear", "/Game/Maps/Ocean_Main"),
    ("Cloudy", "/Game/Maps/Ocean_Cloudy"),
    ("Storm", "/Game/Maps/Ocean_Storm"),
    ("Night", "/Game/Maps/Ocean_Night"),
]


def set_cam(location, rotation):
    try:
        unreal.EditorLevelLibrary.set_level_viewport_camera_info(
            unreal.Vector(*location), unreal.Rotator(*rotation)
        )
        unreal.EditorLevelLibrary.editor_invalidate_viewports()
        log("viewport camera set: %s %s" % (location, rotation))
    except Exception as exc:
        log("set_viewport_camera error: %s" % exc)


def shot(label):
    path = OUT_DIR + "/" + label + ".png"
    try:
        task = unreal.AutomationLibrary.take_high_res_screenshot(1600, 900, path)
        log("shot %s -> task %s" % (label, task))
        try:
            interesting = [
                m for m in dir(task)
                if not m.startswith("_")
                and ("wait" in m.lower() or "done" in m.lower() or "status" in m.lower())
            ]
            log("task methods: %s" % sorted(interesting))
        except Exception as exc2:
            log("task introspect err: %s" % exc2)
        for m in ("wait_until_done", "wait_until_complete", "wait", "is_done", "get_status"):
            if hasattr(task, m):
                try:
                    r = getattr(task, m)()
                    log("task.%s() -> %s" % (m, r))
                except Exception as exc3:
                    log("task.%s err: %s" % (m, exc3))
    except Exception as exc:
        log("screenshot %s error: %s" % (label, exc))


for name, path in MAPS:
    if not unreal.EditorAssetLibrary.does_asset_exist(path):
        log("missing map %s" % path)
        continue
    unreal.EditorLevelLibrary.load_level(path)
    log("loaded %s" % path)
    set_cam((0, -3000, 800), (-25, 0, 0))
    shot("ocean_%s_surface" % name.lower())

log("OCEAN_CAPTURE_DONE")
