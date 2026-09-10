import unreal


def log(m):
    try:
        unreal.log(m)
    except Exception:
        print(m)


names = [x for x in dir(unreal) if any(k in x.lower() for k in (
    "blueprint", "kismet", "subobject", "node", "graph", "input",
))]
log("blueprint-related unreal members: %s" % sorted(names))

for clsname in ("BlueprintEditorLibrary", "SubobjectDataSubsystem"):
    cls = getattr(unreal, clsname, None)
    if cls is not None:
        log("%s funcs: %s" % (clsname, sorted([m for m in dir(cls) if not m.startswith("_")])))
