#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

using namespace SDTechTree;

namespace SocketTests
{
bool HasErrorCode(const FSDTechTreeLoadReport& Report, const TCHAR* Code)
{
    for (const FSDDataError& Error : Report.Errors)
    {
        if (Error.Code.Equals(Code, ESearchCase::CaseSensitive))
        {
            return true;
        }
    }
    return false;
}

const FSDSocketBinding* FindBinding(
    const FSDTechTree& Tree,
    const FString& PlatformId,
    const FString& LogicalId)
{
    for (const FSDSocketBinding& Binding : Tree.Sockets)
    {
        if (Binding.PlatformId.Equals(PlatformId, ESearchCase::CaseSensitive)
            && Binding.LogicalId.Equals(LogicalId, ESearchCase::CaseSensitive))
        {
            return &Binding;
        }
    }
    return nullptr;
}

/** Writes one synthetic assembly document and returns its path. */
FString WriteDocument(FAutomationTestBase& Test, const FString& Name, const FString& Json)
{
    const FString Directory = FPaths::ProjectSavedDir() / TEXT("SocketTest");
    const FString Path = Directory / Name;
    IFileManager::Get().MakeDirectory(*Directory, /*Tree*/ true);
    if (!FFileHelper::SaveStringToFile(Json, *Path))
    {
        Test.AddError(FString::Printf(TEXT("could not write %s"), *Path));
    }
    return Path;
}

const TCHAR* ValidDocument =
    TEXT(R"({
      "schemaVersion": 1,
      "assetId": "RU_SSN_Yasen",
      "sockets": [
        {
          "id": "torpedo_tube_09_muzzle",
          "parent": "root",
          "purpose": "torpedo_muzzle",
          "sourceAnchor": "SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_09_MUZZLE",
          "transform": {
            "translation": [1.5, -2.5, 3.5],
            "rotationDegrees": [0, 0, 0],
            "scale": [1, 1, 1]
          }
        }
      ]
    })");
}
using namespace SocketTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_SocketsLoadRealAssembly,
    "SilentDepth.TechTree.Sockets.LoadsRealAssembly",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_SocketsLoadRealAssembly::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDTechTreeLoadReport Report;
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, Report))
    {
        for (const FSDDataError& Error : Report.Errors)
        {
            AddError(FString::Printf(TEXT("[%s] %s :: %s"), *Error.Code, *Error.Subject, *Error.Detail));
        }
        return false;
    }

    // Yasen's one muzzle plus the nine SOCKET-001 anchors added to Akula.
    // The count moves with each hull that gains an assembly document, so the
    // per-binding assertions below carry the meaning.
    TestEqual(TEXT("every staged assembly document contributed bindings"), Tree.Sockets.Num(), 10);
    const FSDSocketBinding* AkulaMuzzle = FindBinding(
        Tree, TEXT("RU_SSN_Akula"), TEXT("torpedo_tube_01_muzzle"));
    TestNotNull(TEXT("SOCKET-001 added the Akula muzzle"), AkulaMuzzle);
    if (AkulaMuzzle != nullptr)
    {
        TestEqual(TEXT("its anchor follows the DEC-002 naming"),
            AkulaMuzzle->BlenderAnchor, FString(TEXT("SOCKET_SUB_SSN_Akula_TORPEDO_TUBE_01_MUZZLE")));
        TestEqual(TEXT("and maps to the weapon registry token"),
            AkulaMuzzle->RegistryCategory, FString(TEXT("SOCKET_TUBE_01")));
    }
    const FSDSocketBinding* Binding = FindBinding(
        Tree, TEXT("RU_SSN_Yasen"), TEXT("torpedo_tube_01_muzzle"));
    if (Binding == nullptr)
    {
        AddError(TEXT("the Yasen torpedo muzzle binding is missing"));
        return false;
    }

    TestEqual(TEXT("the Blender anchor is kept"),
        Binding->BlenderAnchor,
        FString(TEXT("SOCKET_SUB_RU_YASEN_TORPEDO_TUBE_01_MUZZLE")));
    TestEqual(TEXT("the purpose is kept"), Binding->Purpose, FString(TEXT("torpedo_muzzle")));
    TestTrue(TEXT("the anchor came from the asset library"),
        Binding->TranslationM.X > 38.0 && Binding->TranslationM.X < 39.0);
    TestTrue(TEXT("the Y offset is kept"),
        Binding->TranslationM.Y > -7.0 && Binding->TranslationM.Y < -6.0);
    TestTrue(TEXT("the Z offset is kept"),
        Binding->TranslationM.Z > 1.7 && Binding->TranslationM.Z < 1.8);
    TestTrue(TEXT("a muzzle carries the launch direction"), Binding->bHasDirection);
    TestFalse(TEXT("nothing claims an editor check has happened"), Binding->bEditorVerified);
    // DEF-002 / SNS-002: the registry token comes from the mapping table, not
    // from the anchor name (DEC-002 §3.3.1).
    TestEqual(TEXT("the registry token is mapped"),
        Binding->RegistryCategory, FString(TEXT("SOCKET_TUBE_01")));

    // Two loads agree, so the bindings are stable for replay and diffs.
    FSDTechTree Second;
    FSDTechTreeLoadReport SecondReport;
    if (LoadTechTree(FSDTechTreePaths::ProjectDefault(), Second, SecondReport))
    {
        TestEqual(TEXT("the second load has the same bindings"),
            Second.Sockets.Num(), Tree.Sockets.Num());
        if (Second.Sockets.Num() == Tree.Sockets.Num() && Second.Sockets.Num() > 0)
        {
            TestEqual(TEXT("the same first logical id"),
                Second.Sockets[0].LogicalId, Tree.Sockets[0].LogicalId);
        }
    }
    else
    {
        AddError(TEXT("the second load failed"));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_SocketsFailsClosed,
    "SilentDepth.TechTree.Sockets.FailsClosed",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_SocketsFailsClosed::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDTechTreeLoadReport Report;
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, Report))
    {
        AddError(TEXT("tech tree failed to load"));
        return false;
    }
    const int32 BindingsAtEntry = Tree.Sockets.Num();

    // A well-formed document is accepted and appends exactly one binding.
    {
        const FString Path = WriteDocument(*this, TEXT("valid.json"), ValidDocument);
        FSDTechTreeLoadReport LoadReport;
        TestTrue(TEXT("a valid document loads"), LoadSocketBindings(Path, Tree, LoadReport));
        TestEqual(TEXT("the binding was appended"), Tree.Sockets.Num(), BindingsAtEntry + 1);
        const FSDSocketBinding* Binding = FindBinding(
            Tree, TEXT("RU_SSN_Yasen"), TEXT("torpedo_tube_09_muzzle"));
        TestNotNull(TEXT("the new binding is findable"), Binding);
        if (Binding != nullptr)
        {
            TestTrue(TEXT("its translation is kept"),
                FMath::IsNearlyEqual(Binding->TranslationM.X, 1.5, 1e-9));
            // This logical id is not in the mapping table, so the binding is
            // still recorded but claims no registry token, and says so.
            TestTrue(TEXT("an unmapped socket carries no token"), Binding->RegistryCategory.IsEmpty());
            bool bSawNotice = false;
            for (const FSDDataNotice& Notice : LoadReport.Notices)
            {
                bSawNotice |= Notice.Code.Equals(
                    TEXT("MISSING_SOCKET_REGISTRY_CATEGORY"), ESearchCase::CaseSensitive);
            }
            TestTrue(TEXT("the unmapped socket is reported"), bSawNotice);
        }
    }

    // Every malformed document is refused by code, and none of them is added.
    struct FCase
    {
        const TCHAR* Name;
        const TCHAR* Json;
        const TCHAR* Code;
    };
    const FCase Cases[] =
    {
        {
            TEXT("unknown_purpose.json"),
            TEXT(R"({"schemaVersion":1,"assetId":"RU_SSN_Yasen","sockets":[
                {"id":"x","purpose":"torpedo_tube","sourceAnchor":"A",
                 "transform":{"translation":[0,0,0],"rotationDegrees":[0,0,0]}}]})"),
            TEXT("UNKNOWN_TOKEN")
        },
        {
            TEXT("duplicate.json"),
            TEXT(R"({"schemaVersion":1,"assetId":"RU_SSN_Yasen","sockets":[
                {"id":"x","purpose":"sensor_mount","sourceAnchor":"A",
                 "transform":{"translation":[0,0,0],"rotationDegrees":[0,0,0]}},
                {"id":"x","purpose":"sensor_mount","sourceAnchor":"B",
                 "transform":{"translation":[0,0,0],"rotationDegrees":[0,0,0]}}]})"),
            TEXT("DUPLICATE_SOCKET_ID")
        },
        {
            TEXT("no_transform.json"),
            TEXT(R"({"schemaVersion":1,"assetId":"RU_SSN_Yasen","sockets":[
                {"id":"x","purpose":"sensor_mount","sourceAnchor":"A"}]})"),
            TEXT("MISSING_FIELD")
        },
        {
            TEXT("unknown_platform.json"),
            TEXT(R"({"schemaVersion":1,"assetId":"NO_SUCH_HULL","sockets":[]})"),
            TEXT("UNKNOWN_SOCKET_PLATFORM")
        },
        {
            TEXT("missing_required.json"),
            TEXT(R"({"schemaVersion":1,"assetId":"RU_SSN_Yasen","sockets":[],
                "validation":{"requiredSockets":["torpedo_tube_01_muzzle"]}})"),
            TEXT("MISSING_REQUIRED_SOCKET")
        },
        {
            TEXT("bad_version.json"),
            TEXT(R"({"schemaVersion":2,"assetId":"RU_SSN_Yasen","sockets":[]})"),
            TEXT("SCHEMA_VERSION")
        },
        {
            TEXT("empty_anchor.json"),
            TEXT(R"({"schemaVersion":1,"assetId":"RU_SSN_Yasen","sockets":[
                {"id":"x","purpose":"sensor_mount","sourceAnchor":"",
                 "transform":{"translation":[0,0,0],"rotationDegrees":[0,0,0]}}]})"),
            TEXT("MISSING_FIELD")
        },
    };

    for (const FCase& Case : Cases)
    {
        const FString Path = WriteDocument(*this, Case.Name, Case.Json);
        const int32 Before = Tree.Sockets.Num();
        FSDTechTreeLoadReport LoadReport;
        TestFalse(*FString::Printf(TEXT("%s is refused"), Case.Name),
            LoadSocketBindings(Path, Tree, LoadReport));
        TestTrue(*FString::Printf(TEXT("%s reports %s"), Case.Name, Case.Code),
            HasErrorCode(LoadReport, Case.Code));
        TestEqual(*FString::Printf(TEXT("%s adds nothing"), Case.Name),
            Tree.Sockets.Num(), Before);
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
