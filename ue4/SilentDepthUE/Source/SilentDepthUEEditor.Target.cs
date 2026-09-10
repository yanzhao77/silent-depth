using UnrealBuildTool;
using System.Collections.Generic;

public class SilentDepthUEEditorTarget : TargetRules
{
    public SilentDepthUEEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V2;
        ExtraModuleNames.Add("SilentDepthUE");
    }
}
