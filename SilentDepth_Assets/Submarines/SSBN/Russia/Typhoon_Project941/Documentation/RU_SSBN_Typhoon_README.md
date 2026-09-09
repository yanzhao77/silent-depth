# Typhoon / Project 941 Exterior Asset

Created 2026-09-08 with Blender 5.2.1 and blender-mcp 1.9.1.
Target: Unreal Engine 4.27 static-mesh pipeline. **Unreal itself was not available for validation.**

## Deliverables

- `Typhoon_UE427.blend`: editable 573-object assembly, packed textures, studio lights and five cameras. The user's original default scene was retained separately.
- `exports/SM_Typhoon.fbx`: triangulated LOD0 and 13 named UCX convex hulls.
- `exports/SM_Typhoon_LOD1.fbx` through `LOD3.fbx`: separate manual LOD imports.
- `exports/Typhoon_Assembly.fbx`: triangulated component assembly, with normals/tangents and ten control-surface/propeller pivots. Not a rigged skeletal mesh.
- `textures/`: two PBR sets, each with BaseColor, ORM, OpenGL normal and DirectX normal.
- `previews/`: actual Cycles renders, not concept images or generated photographs.
- `source/`: reproducible generation, MCP invocation, export, validation and optional Unreal import scripts.
- `VALIDATION.json`: measured geometry, units, FBX roundtrip and explicit validation limits.

## Geometry And Scale

| LOD | Triangles | Material Slots |
| --- | ---: | ---: |
| 0 | 152,234 | 8 |
| 1 | 76,116 | 8 |
| 2 | 33,490 | 8 |
| 3 | 12,938 | 8 |

Authored length is 175 m. Hull beam is 23 m; overall width including extended planes is 29 m. Overall height including extended masts is 28.33 m. These are different measurements, not interchangeable ship specifications.

Blender units are meters. FBX binary version is 7400, with UnitScaleFactor 100 cm. Import scale should be 1.0, yielding 17,500 cm length in Unreal. Do not multiply by another 100.

The main pivot is at the longitudinal center and hull vertical datum, not the keel. The bow is +X in the Blender source; Z is up. FBX uses -Y forward / Z up metadata. Check the actor's forward direction in your Unreal project before scripting motion.

LOD screen sizes are deliberately not certified: tune transitions against your game's FOV, viewing distance and target hardware. UE4.27 does not use Nanite.

## Manual UE4.27 Import

1. Import `exports/SM_Typhoon.fbx` as Static Mesh; Uniform Scale 1; Convert Scene and Convert Scene Unit on; Import Normals and Tangents. Disable material/texture auto-import and automatic collision generation. Keep Combine Meshes off: the file contains one visible mesh plus its UCX helpers.
2. In the Static Mesh Editor, import the three numbered files into LOD1, LOD2 and LOD3. Inspect every transition before accepting screen-size settings.
3. Create the eight materials listed below and assign by slot name. Blender may append a numerical suffix to material names; it does not change the material's purpose.
4. Import only the `NormalDX` normals for Unreal. Use Normalmap compression, sRGB off, Flip Green Channel off. `NormalGL` is for Blender, not Unreal.
5. Set ORM to Masks compression and sRGB off. R = approximate cavity AO, G = roughness, B = metallic. BaseColor uses sRGB on. All images are authored procedurally; cavity AO is not a scene bake.
6. UV0 carries the hull wrap and repeating surface tiles. UV1 is an independently packed lightmap channel. For static baking, select Lightmap Coordinate Index 1; start at 2048 and validate padding/overlap and the final lighting build. For a moving submarine, use Movable mobility and your project's dynamic-lighting policy.
7. Inspect collision in the editor. UCX covers the hull and sail only, not masts, dive planes, rudders or propeller rings. Extend collision deliberately if gameplay needs those parts to block movement.

The base mesh is the practical rendering asset. The 573-part assembly is for editing/rigging, not a recommendation to spawn 573 actors. To preserve local component pivots, use an appropriate FBX scene/component import path or disable Transform Vertex to Absolute when importing parts; test transform behavior in UE4.27.

## PBR Materials

Hull maps: 4096 x 2048. Repeating rubber maps: 2048 x 2048. Keep the eight PNGs together with the source file; its Blender textures are also packed.

| Material | Linear Base Color | Roughness | Metallic |
| --- | --- | ---: | ---: |
| Hull | Hull BaseColor texture | ORM G | ORM B |
| Rubber | Rubber BaseColor texture | ORM G | ORM B |
| PaintedSteel | 0.025, 0.033, 0.037 | 0.68 | 0.10 |
| Recess | 0.004, 0.006, 0.007 | 0.83 | 0.00 |
| Steel | 0.19, 0.23, 0.25 | 0.40 | 0.82 |
| Propeller | 0.25, 0.18, 0.075 | 0.43 | 0.84 |
| Markings | 0.54, 0.58, 0.56 | 0.75 | 0.00 |
| OpticalGlass | 0.004, 0.012, 0.016 | 0.19 | 0.12 |

Glass represents opaque dark exterior glazing, not an interior-view transparent shader. Blender normal strength is 0.45. Match it in UE by scaling decoded normal XY by 0.45 and normalizing XYZ.

`source/import_ue427.py` supplies an optional Python Editor Script Plugin / Editor Scripting Utilities import flow, texture settings and materials. Run it via Unreal's Execute Python Script action. It creates `/Game/Typhoon_941` and refuses to overwrite a populated destination. **Only Python syntax was checked locally; the Unreal API calls were not executed.** Manual import above is the fallback, not evidence that this script already passed UE testing.

## References And Fidelity Limits

The following FAS archival sources were actually retrieved and inspected on 2026-09-08:

- https://nuke.fas.org/guide/russia/slbm/941.htm : broad hull dimensions, two forward rows of covers, paired seven-blade shrouded propellers.
- https://nuke.fas.org/guide/russia/slbm/941.gif : public exterior profile.
- https://nuke.fas.org/guide/russia/slbm/typhoon2.jpg : bow, coating wear, sail glazing and broad visible proportions.

The FAS page is historical and lists length 170-172 m, beam 23-23.3 m and draft 11-11.5 m. This model adopts a 175 m art scale, not the source's exact length. No current fleet-status claims are made. Other reference requests timed out or returned 404; they were not treated as verified evidence. Third-party reference photographs are not redistributed in this asset bundle.

This is a Typhoon-inspired detailed exterior reconstruction, not a photogrammetric scan or a specific boat/year's measured replica. Tile placement, weathering, hatch geometry, vents, mast equipment, blade contours, tail shaping and draft ticks are visual approximations. The windows and bridge opening are represented, but there is no modeled interior, pressure-hull engineering, functional weapon system, real hydrodynamics, animation rig or damage model.

LOD0 is suitable for evaluating medium/close exterior shots, but a 175 m vessel using these texture resolutions is not a sub-centimeter hero asset. For extreme close-ups, replace approximation-heavy areas using a selected vessel's licensed high-resolution references and add local trim/detail maps. Do not describe the current result as an exact, all-details-authenticated reproduction.

## Local Verification

- Model and exports were created through the running Blender MCP connection with safe mode on and telemetry disabled.
- Cycles renders inspected for complete framing, hull profile, material exposure, sail cavity and visible intersections.
- LOD0: finite vertex coordinates, zero zero-area faces, zero boundary edges, zero nonmanifold edges. It consists of overlapping closed exterior shells, not one Boolean-unioned solid.
- Two UV channels preserved; lightmap UV bounds are in [0, 1]. Overlap/padding and the actual UE light bake remain unverified.
- FBX units, eight material slots, two UV channels, triangle count, 13 collision objects and dimensions survived a Blender importer roundtrip.
- LOD triangle counts decrease monotonically. Unreal LOD shading/performance remains unverified.
- Unreal import, frame rate, collision cooking and final material appearance were not tested on this machine.

## Rebuild

Run from this folder with Blender's GUI open and the installed MCP service available:

```sh
uv run --python 3.11 --with numpy --with pillow python source/make_textures.py
uv run --python 3.11 --with blender-mcp==1.9.1 python source/mcp_run.py source/build_model.py
uv run --python 3.11 --with blender-mcp==1.9.1 python source/mcp_run.py source/export_ue.py
```

`build_model.py` replaces only its named generated scene and its collections. Do not keep manual edits inside that generated scene and then rerun the builder without saving a separate copy. Update the ROOT constants when moving the generation scripts to a different folder. Rendering and validation scripts derive their root from their own location.
