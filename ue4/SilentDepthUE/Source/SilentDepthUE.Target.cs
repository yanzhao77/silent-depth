using UnrealBuildTool;
using System.Collections.Generic;

public class SilentDepthUETarget : TargetRules
{
    public SilentDepthUETarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V2;
        ExtraModuleNames.Add("SilentDepthUE");
    }
}
