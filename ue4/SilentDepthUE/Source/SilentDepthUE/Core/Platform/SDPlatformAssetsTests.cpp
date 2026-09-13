#if WITH_DEV_AUTOMATION_TESTS

#include "Core/Platform/SDPlatformAssets.h"
#include "Core/TechTree/TechTreeTypes.h"

#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace PlatformAssetTests
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

FString WriteTable(FAutomationTestBase& Test, const FString& Name, const FString& Json)
{
    const FString Directory = FPaths::ProjectSavedDir() / TEXT("PlatformTest");
    IFileManager::Get().MakeDirectory(*Directory, /*Tree*/ true);
    const FString Path = Directory / Name;
    if (!FFileHelper::SaveStringToFile(Json, *Path))
    {
        Test.AddError(FString::Printf(TEXT("could not write %s"), *Path));
    }
    return Path;
}
}
using namespace PlatformAssetTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PlatformAssetsLoadRealTable,
    "SilentDepth.Platform.Assets.LoadsProjectTable",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PlatformAssetsLoadRealTable::RunTest(const FString& Parameters)
{
    FSDPlatformAssetsTable Table;
    FSDTechTreeLoadReport Report;
    if (!SDPlatform::LoadPlatformAssets(SDPlatform::DefaultPlatformAssetsPath(), Table, Report))
    {
        for (const FSDDataError& Error : Report.Errors)
        {
            AddError(FString::Printf(TEXT("[%s] %s :: %s"), *Error.Code, *Error.Subject, *Error.Detail));
        }
        return false;
    }

    TestEqual(TEXT("the documented fallback is Akula"),
        Table.FallbackPlatformId, FString(TEXT("RU_SSN_Akula")));
    TestEqual(TEXT("three hulls have imported assets"), Table.ByPlatform.Num(), 3);

    TArray<FString> Ids;
    Table.SortedIds(Ids);
    TestTrue(TEXT("ids come back sorted"), Ids.Num() > 0 && Ids[0].Equals(TEXT("RU_SSBN_Typhoon")));

    const FSDPlatformAssetSet* Akula = Table.ByPlatform.Find(TEXT("RU_SSN_Akula"));
    TestNotNull(TEXT("Akula is listed"), Akula);
    if (Akula != nullptr)
    {
        // Akula is the only hull whose movable parts were exported separately.
        TestTrue(TEXT("Akula has a hull"), !Akula->Hull.IsEmpty());
        TestTrue(TEXT("Akula has a propulsor"), !Akula->Propulsor.IsEmpty());
        TestTrue(TEXT("Akula has a rudder"), !Akula->Rudder.IsEmpty());
        TestTrue(TEXT("Akula has stern planes"), !Akula->SternPlanes.IsEmpty());
        TestTrue(TEXT("Akula has bow planes"), !Akula->BowPlanes.IsEmpty());
        TestTrue(TEXT("Akula has a periscope"), !Akula->Periscope.IsEmpty());
        TestTrue(TEXT("every path is a game path"), Akula->Hull.StartsWith(TEXT("/Game/")));
    }

    const FSDPlatformAssetSet* Yasen = Table.ByPlatform.Find(TEXT("RU_SSN_Yasen"));
    TestNotNull(TEXT("Yasen is listed"), Yasen);
    if (Yasen != nullptr)
    {
        TestTrue(TEXT("Yasen has a hull"), Yasen->HasHull());
        // Nothing was exported separately for this hull, so the entry stops
        // there instead of pointing at another boat's parts.
        TestTrue(TEXT("Yasen has no separate propulsor"), Yasen->Propulsor.IsEmpty());
        TestTrue(TEXT("Yasen has no separate rudder"), Yasen->Rudder.IsEmpty());
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PlatformAssetsResolve,
    "SilentDepth.Platform.Assets.ResolvesWithExplicitFallback",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PlatformAssetsResolve::RunTest(const FString& Parameters)
{
    FSDPlatformAssetsTable Table;
    FSDTechTreeLoadReport Report;
    if (!SDPlatform::LoadPlatformAssets(SDPlatform::DefaultPlatformAssetsPath(), Table, Report))
    {
        AddError(TEXT("the project table failed to load"));
        return false;
    }

    // A listed platform is used as-is.
    {
        const FSDResolvedPlatformAssets Resolved =
            SDPlatform::ResolvePlatformAssets(Table, TEXT("RU_SSN_Akula"));
        TestTrue(TEXT("exact match reported"), Resolved.bExactMatch);
        TestFalse(TEXT("no fallback used"), Resolved.bUsedFallback);
        TestEqual(TEXT("the resolved platform is the requested one"),
            Resolved.Assets.PlatformId, FString(TEXT("RU_SSN_Akula")));
    }

    // A listed platform with only a hull is still an exact match: missing parts
    // are hidden, not borrowed.
    {
        const FSDResolvedPlatformAssets Resolved =
            SDPlatform::ResolvePlatformAssets(Table, TEXT("RU_SSN_Yasen"));
        TestTrue(TEXT("Yasen is an exact match"), Resolved.bExactMatch);
        TestFalse(TEXT("Yasen does not fall back"), Resolved.bUsedFallback);
        TestTrue(TEXT("Yasen keeps its own hull"),
            Resolved.Assets.Hull.Contains(TEXT("Yasen")));
        TestTrue(TEXT("Yasen has no borrowed propulsor"), Resolved.Assets.Propulsor.IsEmpty());
    }

    // An unlisted platform resolves to the documented fallback and says so.
    {
        const FSDResolvedPlatformAssets Resolved =
            SDPlatform::ResolvePlatformAssets(Table, TEXT("US_SSN_Virginia"));
        TestFalse(TEXT("no exact match"), Resolved.bExactMatch);
        TestTrue(TEXT("fallback reported"), Resolved.bUsedFallback);
        TestEqual(TEXT("the fallback platform is used"),
            Resolved.Assets.PlatformId, FString(TEXT("RU_SSN_Akula")));
        TestEqual(TEXT("the request is remembered for logging"),
            Resolved.RequestedPlatformId, FString(TEXT("US_SSN_Virginia")));
    }

    // An empty request is the same case: the caller has not chosen yet.
    {
        const FSDResolvedPlatformAssets Resolved = SDPlatform::ResolvePlatformAssets(Table, FString());
        TestFalse(TEXT("empty request is not an exact match"), Resolved.bExactMatch);
        TestTrue(TEXT("empty request falls back"), Resolved.bUsedFallback);
    }

    // No table at all means no hull is claimed.
    {
        const FSDPlatformAssetsTable Empty;
        const FSDResolvedPlatformAssets Resolved =
            SDPlatform::ResolvePlatformAssets(Empty, TEXT("RU_SSN_Akula"));
        TestFalse(TEXT("nothing is an exact match"), Resolved.bExactMatch);
        TestFalse(TEXT("nothing is claimed as a fallback"), Resolved.bUsedFallback);
        TestTrue(TEXT("no hull is offered"), Resolved.Assets.Hull.IsEmpty());
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PlatformAssetsFailsClosed,
    "SilentDepth.Platform.Assets.FailsClosed",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PlatformAssetsFailsClosed::RunTest(const FString& Parameters)
{
    struct FCase
    {
        const TCHAR* Name;
        const TCHAR* Json;
        const TCHAR* Code;
    };
    const FCase Cases[] =
    {
        {
            TEXT("bad_version.json"),
            TEXT(R"({"version":2,"fallbackPlatform":"A","platforms":{"A":{"hull":"/Game/A"}}})"),
            TEXT("SCHEMA_VERSION")
        },
        {
            TEXT("no_fallback.json"),
            TEXT(R"({"version":1,"platforms":{"A":{"hull":"/Game/A"}}})"),
            TEXT("MISSING_FIELD")
        },
        {
            TEXT("unknown_fallback.json"),
            TEXT(R"({"version":1,"fallbackPlatform":"B","platforms":{"A":{"hull":"/Game/A"}}})"),
            TEXT("UNKNOWN_FALLBACK_PLATFORM")
        },
        {
            TEXT("fallback_without_hull.json"),
            TEXT(R"({"version":1,"fallbackPlatform":"A","platforms":{"A":{"propulsor":"/Game/P"}}})"),
            TEXT("UNKNOWN_FALLBACK_PLATFORM")
        },
        {
            TEXT("disk_path.json"),
            TEXT(R"({"version":1,"fallbackPlatform":"A",
                "platforms":{"A":{"hull":"/Users/sjw/Projects/A.fbx"}}})"),
            TEXT("INVALID_ASSET_PATH")
        },
        {
            TEXT("bad_entry.json"),
            TEXT(R"({"version":1,"fallbackPlatform":"A","platforms":{"A":"/Game/A"}})"),
            TEXT("INVALID_FIELD_TYPE")
        },
    };

    for (const FCase& Case : Cases)
    {
        const FString Path = WriteTable(*this, Case.Name, Case.Json);
        FSDPlatformAssetsTable Table;
        FSDTechTreeLoadReport Report;
        TestFalse(*FString::Printf(TEXT("%s is refused"), Case.Name),
            SDPlatform::LoadPlatformAssets(Path, Table, Report));
        TestTrue(*FString::Printf(TEXT("%s reports %s"), Case.Name, Case.Code),
            HasErrorCode(Report, Case.Code));
        TestEqual(*FString::Printf(TEXT("%s leaves no platform behind"), Case.Name),
            Table.ByPlatform.Num(), 0);
    }

    // A missing file reports itself rather than pretending the default hull.
    {
        FSDPlatformAssetsTable Table;
        FSDTechTreeLoadReport Report;
        const FString Missing =
            FPaths::ProjectSavedDir() / TEXT("PlatformTest") / TEXT("absent.json");
        TestFalse(TEXT("a missing file is refused"),
            SDPlatform::LoadPlatformAssets(Missing, Table, Report));
        TestTrue(TEXT("missing file reported"), HasErrorCode(Report, TEXT("MISSING_FILE")));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
