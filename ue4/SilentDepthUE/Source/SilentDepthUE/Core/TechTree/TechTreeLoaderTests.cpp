#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

#include "Misc/AutomationTest.h"
#include "Misc/Paths.h"

using namespace SDTechTree;

namespace LoaderTests
{
int32 CountNodesInCategory(const FSDTechTree& Tree, ESDTechCategory Category)
{
    int32 Count = 0;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        if (Node.Category == Category)
        {
            ++Count;
        }
    }
    return Count;
}

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

const TCHAR* const WeaponCatalogueJson = TEXT(R"JSON(
{
  "weapons": [
    { "weapon_id": "US_TORP_Mk14", "display_name": "Mk 14", "tier": 1, "category": "TORP",
      "asset_status": "COMPLETE", "status": "HISTORICAL", "confidence": "PUBLIC", "asset_priority": "MEDIUM" },
    { "weapon_id": "US_TORP_Mk18", "display_name": "Mk 18", "tier": 1, "category": "TORP",
      "asset_status": "COMPLETE", "status": "HISTORICAL", "confidence": "PUBLIC", "asset_priority": "MEDIUM" }
  ]
}
)JSON");

const TCHAR* const SensorCatalogueJson = TEXT(R"JSON(
{
  "entries": [
    { "sensor_id": "GEN_SONAR_PSV_T1", "name": "Early Passive Hydrophone", "tier": "T1",
      "branch": "PASSIVE", "socket": "SOCKET_SONAR_BOW", "status": "GAMEPLAY",
      "confidence": "GAMEPLAY", "verification": "gameplay-only", "asset_status": "DATABASE_ONLY" }
  ]
}
)JSON");
}
using namespace LoaderTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeLoaderProjectData,
    "SilentDepth.TechTree.Loader.LoadsProjectData",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeLoaderProjectData::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDTechTreeLoadReport Report;
    const FSDTechTreePaths Paths = FSDTechTreePaths::ProjectDefault();
    const bool bLoaded = LoadTechTree(Paths, Tree, Report);

    for (const FSDDataError& Error : Report.Errors)
    {
        AddError(FString::Printf(TEXT("%s :: %s :: %s"), *Error.Code, *Error.Subject, *Error.Detail));
    }
    TestTrue(*FString::Printf(TEXT("tech tree loads from %s"), *Paths.Directory), bLoaded);
    if (!bLoaded)
    {
        return false;
    }

    TestEqual(TEXT("schema version"), Tree.SchemaVersion, SDTechTree::SchemaVersion);
    TestEqual(TEXT("submarine nodes"), CountNodesInCategory(Tree, ESDTechCategory::Submarine), 54);
    TestEqual(TEXT("weapon nodes"), CountNodesInCategory(Tree, ESDTechCategory::Weapon), 124);
    TestEqual(TEXT("sensor nodes"), CountNodesInCategory(Tree, ESDTechCategory::Sensor), 150);
    TestEqual(TEXT("defensive nodes"), CountNodesInCategory(Tree, ESDTechCategory::Defensive), 13);
    TestEqual(TEXT("propulsion nodes"), CountNodesInCategory(Tree, ESDTechCategory::Propulsion), 20);
    TestEqual(TEXT("every category publishes ten tiers"), Tree.Tiers.Num(), 5 * SDTechTree::TierCount);

    // Tier labels come from the tree documents, where the source has them.
    const FSDTierDefinition* WeaponTier1 = nullptr;
    const FSDTierDefinition* SensorTier1 = nullptr;
    for (const FSDTierDefinition& Definition : Tree.Tiers)
    {
        if (Definition.Category == ESDTechCategory::Weapon && Definition.Tier == ESDTechTier::T1)
        {
            WeaponTier1 = &Definition;
        }
        if (Definition.Category == ESDTechCategory::Sensor && Definition.Tier == ESDTechTier::T1)
        {
            SensorTier1 = &Definition;
        }
    }
    TestNotNull(TEXT("weapon T1 row exists"), WeaponTier1);
    TestNotNull(TEXT("sensor T1 row exists"), SensorTier1);
    if (WeaponTier1 != nullptr)
    {
        TestTrue(TEXT("weapon T1 carries its Chinese label"), !WeaponTier1->LabelZh.IsEmpty());
    }
    if (SensorTier1 != nullptr)
    {
        TestTrue(TEXT("sensor T1 carries both labels"),
            !SensorTier1->LabelEn.IsEmpty() && !SensorTier1->LabelZh.IsEmpty());
    }

    // The weapon tree is the only source of explicit research edges today.
    int32 WeaponWithPrerequisite = 0;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        if (Node.Category != ESDTechCategory::Weapon)
        {
            continue;
        }
        if (Node.Unlock.PrerequisiteNodeIds.Num() > 0)
        {
            ++WeaponWithPrerequisite;
        }
        for (const FString& Prerequisite : Node.Unlock.PrerequisiteNodeIds)
        {
            TestNotNull(
                *FString::Printf(TEXT("%s parent resolves"), *Node.Id),
                SDFindNode(Tree, Prerequisite));
        }
    }
    TestEqual(TEXT("weapon nodes carrying a prerequisite"), WeaponWithPrerequisite, 115);

    // Sensors: 140 of 150 entries mount to a physical socket.
    int32 SensorWithMount = 0;
    int32 SensorWithoutMount = 0;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        if (Node.Category != ESDTechCategory::Sensor)
        {
            continue;
        }
        if (Node.Detail.Sensor.bHasPhysicalMount)
        {
            ++SensorWithMount;
        }
        else
        {
            ++SensorWithoutMount;
        }
    }
    TestEqual(TEXT("sensors with a physical mount"), SensorWithMount, 140);
    TestEqual(TEXT("sensors with no mount (processing branch)"), SensorWithoutMount, 10);

    // Defensive nodes take their tier from their family in the defensive tree.
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        if (Node.Category != ESDTechCategory::Defensive)
        {
            continue;
        }
        TestTrue(
            *FString::Printf(TEXT("%s has an in-range tier band"), *Node.Id),
            static_cast<uint8>(Node.Detail.Defensive.TierMax) >= static_cast<uint8>(Node.Detail.Defensive.TierMin));
        TestTrue(
            *FString::Printf(TEXT("%s has a branch"), *Node.Id),
            Node.Detail.Defensive.BranchIds.Num() > 0);
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeLoaderDeterministic,
    "SilentDepth.TechTree.Loader.RepeatedLoadIsIdentical",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeLoaderDeterministic::RunTest(const FString& Parameters)
{
    FSDTechTree First;
    FSDTechTree Second;
    FSDTechTreeLoadReport FirstReport;
    FSDTechTreeLoadReport SecondReport;
    TestTrue(TEXT("first load"), LoadTechTree(FSDTechTreePaths::ProjectDefault(), First, FirstReport));
    TestTrue(TEXT("second load"), LoadTechTree(FSDTechTreePaths::ProjectDefault(), Second, SecondReport));
    TestEqual(TEXT("same node count"), First.Nodes.Num(), Second.Nodes.Num());
    if (First.Nodes.Num() != Second.Nodes.Num())
    {
        return false;
    }
    for (int32 Index = 0; Index < First.Nodes.Num(); ++Index)
    {
        if (!First.Nodes[Index].Id.Equals(Second.Nodes[Index].Id, ESearchCase::CaseSensitive))
        {
            AddError(FString::Printf(TEXT("node %d differs: %s vs %s"),
                Index, *First.Nodes[Index].Id, *Second.Nodes[Index].Id));
            break;
        }
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeLoaderFailClosed,
    "SilentDepth.TechTree.Loader.FailsClosed",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeLoaderFailClosed::RunTest(const FString& Parameters)
{
    // A missing runtime directory must not produce a partially filled tree.
    {
        FSDTechTreePaths Paths;
        Paths.Directory = FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("NoSuchDirectory");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("missing files fail the load"), LoadTechTree(Paths, Tree, Report));
        TestTrue(TEXT("missing file reported"), HasErrorCode(Report, TEXT("MISSING_FILE")));
        TestEqual(TEXT("no nodes returned"), Tree.Nodes.Num(), 0);
        TestEqual(TEXT("five categories reported"), Report.Errors.Num(), 5);
    }

    // A category document without its required array is rejected.
    {
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("empty catalogue rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), TEXT("{}"), FString(), Tree, Report));
        TestTrue(TEXT("missing array reported"), HasErrorCode(Report, TEXT("MISSING_FIELD")));
    }

    // Malformed JSON is rejected rather than skipped.
    {
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("malformed json rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), TEXT("{not json"), FString(), Tree, Report));
        TestTrue(TEXT("invalid json reported"), HasErrorCode(Report, TEXT("INVALID_JSON")));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeLoaderTokenGuards,
    "SilentDepth.TechTree.Loader.TokenGuards",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeLoaderTokenGuards::RunTest(const FString& Parameters)
{
    // An undeclared status token is a load error, not a fallback.
    {
        const TCHAR* const Json = TEXT(R"JSON(
        { "weapons": [ { "weapon_id": "W1", "tier": 1, "asset_status": "ALMOST_DONE" } ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unknown token rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), Json, FString(), Tree, Report));
        TestTrue(TEXT("unknown token reported"), HasErrorCode(Report, TEXT("UNKNOWN_TOKEN")));
    }

    // A token that is valid elsewhere but not for this category is rejected.
    {
        const TCHAR* const Json = TEXT(R"JSON(
        { "entries": [ { "sensor_id": "S1", "tier": "T1", "asset_status": "PARTIAL" } ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("cross-category token rejected"),
            ParseCategoryDocuments(ESDTechCategory::Sensor, TEXT("sensor"), Json, FString(), Tree, Report));
        TestTrue(TEXT("category mismatch reported"),
            HasErrorCode(Report, TEXT("CATEGORY_TOKEN_MISMATCH")));
    }

    // A tier outside T1..T10 is rejected.
    {
        const TCHAR* const Json = TEXT(R"JSON(
        { "weapons": [ { "weapon_id": "W1", "tier": 11, "asset_status": "COMPLETE" } ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("tier 11 rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), Json, FString(), Tree, Report));
        TestTrue(TEXT("bad tier reported"), HasErrorCode(Report, TEXT("UNKNOWN_TOKEN")));
    }

    // A weapon without an id is rejected.
    {
        const TCHAR* const Json = TEXT(R"JSON(
        { "weapons": [ { "tier": 1, "asset_status": "COMPLETE" } ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("missing id rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), Json, FString(), Tree, Report));
        TestTrue(TEXT("missing id reported"), HasErrorCode(Report, TEXT("MISSING_FIELD")));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeLoaderGraphGuards,
    "SilentDepth.TechTree.Loader.GraphGuards",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeLoaderGraphGuards::RunTest(const FString& Parameters)
{
    // A duplicate id inside one document is a load error.
    {
        const TCHAR* const Json = TEXT(R"JSON(
        { "weapons": [
          { "weapon_id": "W1", "tier": 1, "asset_status": "COMPLETE" },
          { "weapon_id": "W1", "tier": 2, "asset_status": "COMPLETE" }
        ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("duplicate id rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), Json, FString(), Tree, Report));
        TestTrue(TEXT("duplicate id reported"), HasErrorCode(Report, TEXT("DUPLICATE_ID")));
    }

    // A research edge that points at a weapon this tree does not contain fails
    // the load instead of leaving an unresolvable prerequisite behind.
    {
        const TCHAR* const TreeJson = TEXT(R"JSON(
        { "ui_nodes": [ { "weapon_id": "US_TORP_Mk18", "parent": "NOT_IN_CATALOGUE" } ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("dangling prerequisite rejected"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"),
                WeaponCatalogueJson, TreeJson, Tree, Report));
        TestTrue(TEXT("dangling prerequisite reported"),
            HasErrorCode(Report, TEXT("MISSING_PREREQUISITE")));
    }

    // Valid edges resolve and are stored sorted and de-duplicated by the caller.
    {
        const TCHAR* const TreeJson = TEXT(R"JSON(
        { "ui_nodes": [ { "weapon_id": "US_TORP_Mk18", "parent": "US_TORP_Mk14" } ] }
        )JSON");
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("valid prerequisite accepted"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"),
                WeaponCatalogueJson, TreeJson, Tree, Report));
        const FSDTechNode* Child = SDFindNode(Tree, TEXT("US_TORP_Mk18"));
        TestNotNull(TEXT("child node present"), Child);
        if (Child != nullptr)
        {
            TestEqual(TEXT("one prerequisite"), Child->Unlock.PrerequisiteNodeIds.Num(), 1);
            TestEqual(TEXT("prerequisite id"),
                Child->Unlock.PrerequisiteNodeIds[0], FString(TEXT("US_TORP_Mk14")));
        }
        TestEqual(TEXT("tier ladder still complete"), Tree.Tiers.Num(), SDTechTree::TierCount);
    }

    // A sensor document exercises the DATABASE_ONLY path end to end.
    {
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("sensor document accepted"),
            ParseCategoryDocuments(ESDTechCategory::Sensor, TEXT("sensor"),
                SensorCatalogueJson, FString(), Tree, Report));
        TestEqual(TEXT("one sensor node"), Tree.Nodes.Num(), 1);
        if (Tree.Nodes.Num() == 1)
        {
            const FSDTechNode& Node = Tree.Nodes[0];
            TestTrue(TEXT("marked database only"), Node.bDatabaseOnly);
            TestFalse(TEXT("database only is not asset backed"),
                SDTechTree::IsAssetBacked(Node.Production));
            TestTrue(TEXT("mount recorded"), Node.Detail.Sensor.bHasPhysicalMount);
            TestEqual(TEXT("verification level"),
                static_cast<int32>(Node.Detail.Sensor.Verification),
                static_cast<int32>(ESDVerificationLevel::GameplayOnly));
            TestEqual(TEXT("sensor tier"),
                static_cast<int32>(Node.Tier), static_cast<int32>(ESDTechTier::T1));
        }
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
