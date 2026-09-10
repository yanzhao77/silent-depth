import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


# Verify the compiled module actually loads (this only works if the DLL is found).
try:
    gm = unreal.load_class(None, "/Script/SilentDepthUE.SilentDepthGameMode")
    log("game mode class loaded: %s" % str(gm))
except Exception as exc:
    log("game mode load error: %s" % exc)
try:
    sub = unreal.load_class(None, "/Script/SilentDepthUE.SubmarinePawn")
    log("submarine pawn class loaded: %s" % str(sub))
except Exception as exc:
    log("submarine pawn load error: %s" % exc)

PATH = "/Game/Maps/Ocean_Main"
unreal.EditorLevelLibrary.load_level(PATH)
log("loaded %s" % PATH)

player_start = None
try:
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        if a.get_class().get_name() == "PlayerStart":
            player_start = a
            break
except Exception as exc:
    log("enumerate actors error: %s" % exc)

if player_start is not None:
    player_start.set_actor_location(unreal.Vector(0.0, 0.0, 100.0), False, False)
    log("PlayerStart moved to water surface (Z=100, depth 0)")
    unreal.EditorLevelLibrary.save_current_level()
    log("saved %s" % PATH)
else:
    log("no PlayerStart found")

log("UE_M2_PLACEMENT_DONE")
