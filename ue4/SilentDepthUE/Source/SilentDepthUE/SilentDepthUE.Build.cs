using UnrealBuildTool;

public class SilentDepthUE : ModuleRules
{
    public SilentDepthUE(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        // The tech-tree code is split into many small files that each keep
        // file-local test helpers. Unity builds merge them into one translation
        // unit, where those helpers collide, so this module compiles each file
        // separately.
        bUseUnity = false;
        PublicIncludePaths.AddRange(new string[] { ModuleDirectory });
        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "Json",
            "JsonUtilities",
            "Niagara",
            // UI-001..UI-004: the technology-tree screens are UMG widgets.
            "Slate",
            "SlateCore",
            "UMG"
        });
    }
}
