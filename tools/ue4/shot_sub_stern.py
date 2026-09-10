import unreal


def log(message):
    try:
        unreal.log(message)
    except Exception:
        print(message)


# UE writes high-res screenshots below <project>/Saved/Screenshots/Windows.
# Keep the filename relative there; a second shell step archives the PNG to
# the E: artifacts directory used for UE evidence.
OUT = "sub_stern.png"

cls = unreal.load_class(None, "/Script/SilentDepthUE.SubmarinePawn")
unreal.EditorLevelLibrary.load_level("/Game/Maps/Ocean_Main")

# Remove any previously spawned submarine to avoid duplicates.
try:
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_class().get_name() == "SubmarinePawn":
            actor.destroy_actor()
            log("removed old submarine")
except Exception as exc:
    log("dedupe error: %s" % exc)

pawn = unreal.EditorLevelLibrary.spawn_actor_from_class(
    cls, unreal.Vector(0.0, 0.0, 500.0), unreal.Rotator(0.0, 0.0, 0.0)
)
log("spawned sub at surface, bow +X")

# Camera behind the stern (-X), slightly above, looking forward (+X).
try:
    unreal.EditorLevelLibrary.set_level_viewport_camera_info(
        unreal.Vector(-3200.0, 0.0, 300.0), unreal.Rotator(0.0, 0.0, 0.0)
    )
    unreal.EditorLevelLibrary.editor_invalidate_viewports()
    log("viewport camera at stern")
except Exception as exc:
    log("camera error: %s" % exc)

try:
    unreal.AutomationLibrary.take_high_res_screenshot(1600, 900, OUT)
    log("shot -> %s" % OUT)
except Exception as exc:
    log("shot error: %s" % exc)

log("UE_SHOT_STERN_DONE")
