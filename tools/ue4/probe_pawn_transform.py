import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


cls = unreal.load_class(None, "/Script/SilentDepthUE.SubmarinePawn")
if cls is None:
    log("SubmarinePawn class NOT found")
    raise SystemExit("no class")
log("SubmarinePawn class loaded: %s" % str(cls))

pawn = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
log("spawned pawn: %s" % str(pawn))

comps = pawn.get_components_by_class(unreal.ActorComponent)
log("ActorComponent count=%d" % len(comps))
for c in comps:
    cname = c.get_class().get_name()
    relr = None
    sm = None
    try:
        rel = c.get_relative_transform()
        relr = rel.rotation
    except Exception:
        pass
    if cname.endswith("StaticMeshComponent"):
        try:
            sm = c.get_editor_property("static_mesh")
            sm = sm.get_path_name() if sm else "(null)"
        except Exception:
            sm = "(read err)"
    log("  comp=%s rel_rot=%s mesh=%s" % (cname, relr, sm))

# Also grab the spring arm & camera.
try:
    arms = pawn.get_components_by_class(unreal.SpringArmComponent)
    if arms:
        log("spring arm length=%s" % arms[0].get_editor_property("target_arm_length"))
except Exception as exc:
    log("spring arm error: %s" % exc)

try:
    cam = pawn.get_components_by_class(unreal.CameraComponent)
    log("camera count=%d" % len(cam))
except Exception as exc:
    log("camera error: %s" % exc)

log("UE_PROBE_PAWN_DONE")
