"""Probes whether UMG widget blueprints can be authored from a headless editor.

Run with:
    UE4Editor-Cmd.exe <uproject> -run=pythonscript -script=<this file> -unattended -nopause -nosplash -stdout

The probe only reports what the Python API exposes and whether an asset can be
created; it is the first half of the UI-001..UI-004 spike. Any asset it creates
is a real candidate for the shipped widget, not scratch data.
"""
from __future__ import annotations

import json

import unreal


def probe() -> dict:
    report: dict = {
        'engine_version': unreal.SystemLibrary.get_engine_version(),
        'has_widget_blueprint': hasattr(unreal, 'WidgetBlueprint'),
        'has_widget_blueprint_factory': hasattr(unreal, 'WidgetBlueprintFactory'),
        'has_widget_tree': hasattr(unreal, 'WidgetTree'),
        'has_widget_blueprint_library': hasattr(unreal, 'WidgetBlueprintLibrary'),
        'has_editor_asset_library': hasattr(unreal, 'EditorAssetLibrary'),
        'has_user_widget': hasattr(unreal, 'UserWidget'),
    }

    widget_names = sorted(name for name in dir(unreal) if 'Widget' in name)
    report['widget_api_count'] = len(widget_names)
    report['widget_api_sample'] = widget_names[:40]

    # Which widgets would the screens need? Report the ones the API exposes.
    needed = [
        'CanvasPanel', 'CanvasPanelSlot', 'VerticalBox', 'HorizontalBox', 'Overlay',
        'ScrollBox', 'Border', 'TextBlock', 'Button', 'Image', 'SizeBox',
        'WidgetSwitcher', 'ListView', 'ComboBoxString',
    ]
    report['needed_widgets_missing'] = [name for name in needed if not hasattr(unreal, name)]

    if not report['has_widget_blueprint_factory']:
        report['create_result'] = 'factory unavailable'
        return report

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.WidgetBlueprintFactory()
    try:
        factory.set_editor_property('parent_class', unreal.UserWidget)
        report['parent_class_set'] = True
    except Exception as error:  # noqa: BLE001 - probe reports whatever happens
        report['parent_class_set'] = False
        report['parent_class_error'] = str(error)

    asset_path = '/Game/SilentDepth/UI/WBP_SD_Probe'
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        report['create_result'] = 'already exists'
        blueprint = unreal.EditorAssetLibrary.load_asset(asset_path)
    else:
        blueprint = asset_tools.create_asset(
            'WBP_SD_Probe', '/Game/SilentDepth/UI', unreal.WidgetBlueprint, factory)
        report['create_result'] = 'created' if blueprint else 'create returned None'

    if blueprint:
        report['blueprint_class'] = blueprint.get_class().get_name()
        tree = None
        try:
            tree = blueprint.get_editor_property('widget_tree')
            report['widget_tree'] = tree.get_class().get_name() if tree else 'None'
        except Exception as error:  # noqa: BLE001
            report['widget_tree_error'] = str(error)
        if tree:
            report['widget_tree_members'] = [
                name for name in dir(tree) if not name.startswith('_')][:40]
        if hasattr(unreal, 'WidgetBlueprintEditorLibrary'):
            report['has_editor_library'] = True
        try:
            unreal.EditorAssetLibrary.save_loaded_asset(blueprint)
            report['saved'] = True
        except Exception as error:  # noqa: BLE001
            report['saved'] = False
            report['save_error'] = str(error)

    return report


unreal.log('SD_UMG_PROBE_BEGIN')
unreal.log(json.dumps(probe(), indent=2, ensure_ascii=False))
unreal.log('SD_UMG_PROBE_END')
