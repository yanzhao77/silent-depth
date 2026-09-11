#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"

using namespace SDTechTree;

namespace NodeRegistryTests
{
/** DEC-004 initial values, loaded from Config/SilentDepth/research_cost.json. */
FSDResearchCostRule LoadProjectCostRule(FAutomationTestBase& Test)
{
    FSDResearchCostRule Rule;
    FSDTechTreeLoadReport Report;
    if (!LoadResearchCostRule(FSDTechTreePaths::ProjectDefaultCostFile(), Rule, Report))
    {
        for (const FSDDataError& Error : Report.Errors)
        {
            Test.AddError(FString::Printf(TEXT("%s :: %s"), *Error.Code, *Error.Detail));
        }
    }
    return Rule;
}

FSDResearchCostRule DecreeRule()
{
    FSDResearchCostRule Rule;
    Rule.PointsPerTier = 100;
    Rule.FirstClearBonus = 50;
    Rule.ScoreDivisor = 10;
    Rule.MinimumScoreForReward = 400;
    return Rule;
}

FSDTechNode MakeNode(const TCHAR* Id, ESDTechCategory Category, ESDTechTier Tier)
{
    FSDTechNode Node;
    Node.Id = Id;
    Node.Category = Category;
    Node.Tier = Tier;
    Node.Unlock.RequiredTier = Tier;
    return Node;
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
}
using namespace NodeRegistryTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeRegistryRealData,
    "SilentDepth.TechTree.Registry.IndexesRealTree",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeRegistryRealData::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDTechTreeLoadReport LoadReport;
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, LoadReport))
    {
        AddError(TEXT("tech tree failed to load; see LoadTechTree tests"));
        return false;
    }

    const FSDResearchCostRule CostRule = LoadProjectCostRule(*this);
    FSDNodeRegistry Registry;
    FSDTechTreeLoadReport Report;
    if (!Registry.Initialize(Tree, CostRule, Report))
    {
        for (const FSDDataError& Error : Report.Errors)
        {
            AddError(FString::Printf(TEXT("[%s] %s :: %s"), *Error.Code, *Error.Subject, *Error.Detail));
        }
        return false;
    }

    TestEqual(TEXT("every node is indexed"), Registry.Num(), Tree.Nodes.Num());
    TestEqual(TEXT("all nodes returned"), Registry.All().Num(), Tree.Nodes.Num());

    // All() must be id-ordered, because the UI and the unlock service both
    // iterate it and rely on a stable order.
    bool bSorted = true;
    for (int32 Index = 1; Index < Registry.All().Num(); ++Index)
    {
        if (Registry.All()[Index - 1]->Id.Compare(Registry.All()[Index]->Id, ESearchCase::CaseSensitive) >= 0)
        {
            bSorted = false;
            break;
        }
    }
    TestTrue(TEXT("nodes are id-ordered"), bSorted);

    TArray<const FSDTechNode*> Weapons;
    Registry.CollectByCategory(ESDTechCategory::Weapon, Weapons);
    TestEqual(TEXT("weapon count"), Weapons.Num(), 124);

    TArray<const FSDTechNode*> TierOneWeapons;
    Registry.CollectByTier(ESDTechCategory::Weapon, ESDTechTier::T1, TierOneWeapons);
    TestTrue(TEXT("tier 1 has weapons"), TierOneWeapons.Num() > 0);
    for (const FSDTechNode* Node : TierOneWeapons)
    {
        TestEqual(TEXT("collect by tier stays inside the tier"), static_cast<int32>(Node->Tier), 1);
    }

    // Lookup and display metadata come straight from the node.
    const FSDTechNode* Akula = Registry.Find(TEXT("RU_SSN_Akula"));
    TestNotNull(TEXT("Akula is present"), Akula);
    if (Akula != nullptr)
    {
        TestEqual(TEXT("Akula category"),
            static_cast<int32>(Akula->Category), static_cast<int32>(ESDTechCategory::Submarine));
        TestTrue(TEXT("Akula has a display name"), !Akula->DisplayName.IsEmpty());
        TestTrue(TEXT("Akula has an asset reference"), Akula->Asset.HasAnySourcePath());
    }
    TestNull(TEXT("unknown id returns null"), Registry.Find(TEXT("NO_SUCH_NODE")));

    // Reverse edges: the first torpedo in the chain has dependents.
    const TArray<FString>& Mk14Dependents = Registry.GetDependents(TEXT("US_TORP_Mk14"));
    TestTrue(TEXT("Mk14 has dependents"), Mk14Dependents.Num() > 0);
    TestTrue(TEXT("Mk14 unlocks Mk18"),
        Mk14Dependents.Contains(FString(TEXT("US_TORP_Mk18"))));
    TestEqual(TEXT("root has no prerequisites"),
        Registry.GetPrerequisites(TEXT("US_TORP_Mk14")).Num(), 0);

    // Costs follow DEC-004 through the configuration file.
    TestTrue(TEXT("cost rule loaded"), Registry.HasCostRule());
    TestEqual(TEXT("T1 cost"), Registry.GetCostForTier(ESDTechTier::T1), 100);
    TestEqual(TEXT("T10 cost"), Registry.GetCostForTier(ESDTechTier::T10), 1000);
    TestEqual(TEXT("Akula cost follows its tier"),
        Registry.GetCost(TEXT("RU_SSN_Akula")), Registry.GetCostForTier(Akula->Tier));
    TestEqual(TEXT("unknown node costs nothing"), Registry.GetCost(TEXT("NO_SUCH_NODE")), 0);

    // Sockets come from the catalogue; sensors and defence systems have them.
    TestTrue(TEXT("a bow sonar exposes its socket"),
        Registry.GetSocketNames(TEXT("GEN_SONAR_PSV_T3")).Contains(FString(TEXT("SOCKET_SONAR_BOW"))));
    TestEqual(TEXT("a weapon has no mount socket today"),
        Registry.GetSocketNames(TEXT("US_TORP_Mk14")).Num(), 0);

    // The five trees declare no mutual exclusions yet: the loader has nowhere
    // to read them from. This is asserted so a future data change is noticed.
    TestEqual(TEXT("no exclusion groups are declared yet"), Registry.NumExclusionGroups(), 0);
    TestEqual(TEXT("an unordered node has an empty exclusion group"),
        Registry.GetExclusionGroup(TEXT("US_TORP_Mk14")).Num(), 0);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeRegistryTopology,
    "SilentDepth.TechTree.Registry.TopologicalOrder",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeRegistryTopology::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDTechTreeLoadReport LoadReport;
    TestTrue(TEXT("tech tree loads"), LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, LoadReport));
    if (Tree.Nodes.Num() == 0)
    {
        return false;
    }

    TArray<FString> First;
    TArray<FString> Second;
    FSDTechTreeLoadReport Report;
    TestTrue(TEXT("order builds"), BuildTopologicalOrder(Tree, First, Report));
    TestTrue(TEXT("order is repeatable"), BuildTopologicalOrder(Tree, Second, Report));
    TestEqual(TEXT("order covers every node"), First.Num(), Tree.Nodes.Num());

    bool bIdentical = First.Num() == Second.Num();
    for (int32 Index = 0; bIdentical && Index < First.Num(); ++Index)
    {
        bIdentical = First[Index].Equals(Second[Index], ESearchCase::CaseSensitive);
    }
    TestTrue(TEXT("two builds agree"), bIdentical);

    // Every prerequisite must appear before the node that needs it.
    TMap<FString, int32> PositionById;
    PositionById.Reserve(First.Num());
    for (int32 Index = 0; Index < First.Num(); ++Index)
    {
        PositionById.Add(First[Index], Index);
    }
    int32 Violations = 0;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        for (const FString& Prerequisite : Node.Unlock.PrerequisiteNodeIds)
        {
            const int32* PrerequisitePosition = PositionById.Find(Prerequisite);
            const int32* NodePosition = PositionById.Find(Node.Id);
            if (PrerequisitePosition == nullptr || NodePosition == nullptr
                || *PrerequisitePosition >= *NodePosition)
            {
                ++Violations;
            }
        }
    }
    TestEqual(TEXT("every edge points forward"), Violations, 0);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeRegistryCycleAndExclusions,
    "SilentDepth.TechTree.Registry.DetectsCyclesAndExclusions",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeRegistryCycleAndExclusions::RunTest(const FString& Parameters)
{
    // A cycle must fail the topological build instead of returning a partial order.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        FSDTechNode NodeA = MakeNode(TEXT("A"), ESDTechCategory::Weapon, ESDTechTier::T1);
        FSDTechNode NodeB = MakeNode(TEXT("B"), ESDTechCategory::Weapon, ESDTechTier::T2);
        NodeA.Unlock.PrerequisiteNodeIds.Add(TEXT("B"));
        NodeB.Unlock.PrerequisiteNodeIds.Add(TEXT("A"));
        Tree.Nodes.Add(NodeA);
        Tree.Nodes.Add(NodeB);
        Tree.SortDeterministically();

        TArray<FString> Order;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("cycle fails the order"), BuildTopologicalOrder(Tree, Order, Report));
        TestTrue(TEXT("cycle reported"), HasErrorCode(Report, TEXT("CYCLE")));
        TestEqual(TEXT("no partial order returned"), Order.Num(), 0);
    }

    // The registry must fail closed when asked to work with invalid inputs.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        Tree.Nodes.Add(MakeNode(TEXT("A"), ESDTechCategory::Weapon, ESDTechTier::T1));
        Tree.SortDeterministically();

        FSDNodeRegistry Registry;
        FSDTechTreeLoadReport Report;
        FSDResearchCostRule InvalidRule;
        TestFalse(TEXT("missing cost rule rejected"), Registry.Initialize(Tree, InvalidRule, Report));
        TestFalse(TEXT("registry stays uninitialised"), Registry.IsInitialized());
        TestTrue(TEXT("cost rule reported"), HasErrorCode(Report, TEXT("INVALID_COST_RULE")));
        TestEqual(TEXT("no nodes indexed"), Registry.Num(), 0);
    }

    // Declared exclusions become a group that contains the node itself.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        FSDTechNode NodeA = MakeNode(TEXT("A"), ESDTechCategory::Weapon, ESDTechTier::T1);
        FSDTechNode NodeB = MakeNode(TEXT("B"), ESDTechCategory::Weapon, ESDTechTier::T1);
        NodeA.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("B"));
        NodeB.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("A"));
        Tree.Nodes.Add(NodeA);
        Tree.Nodes.Add(NodeB);
        Tree.SortDeterministically();

        FSDNodeRegistry Registry;
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("declared exclusions accepted"),
            Registry.Initialize(Tree, DecreeRule(), Report));
        TestEqual(TEXT("one exclusion group"), Registry.NumExclusionGroups(), 1);
        const TArray<FString>& GroupA = Registry.GetExclusionGroup(TEXT("A"));
        TestEqual(TEXT("group holds the node and its rival"), GroupA.Num(), 2);
        if (GroupA.Num() == 2)
        {
            TestEqual(TEXT("group is ordered"), GroupA[0], FString(TEXT("A")));
            TestEqual(TEXT("group names the rival"), GroupA[1], FString(TEXT("B")));
        }
    }

    // An exclusion that points at a missing node is a data defect.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        FSDTechNode NodeA = MakeNode(TEXT("A"), ESDTechCategory::Weapon, ESDTechTier::T1);
        NodeA.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("GHOST"));
        Tree.Nodes.Add(NodeA);
        Tree.SortDeterministically();

        FSDNodeRegistry Registry;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("dangling exclusion rejected"),
            Registry.Initialize(Tree, DecreeRule(), Report));
        TestTrue(TEXT("dangling exclusion reported"), HasErrorCode(Report, TEXT("MISSING_EXCLUSION")));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeRegistryCostConfig,
    "SilentDepth.TechTree.Registry.CostConfig",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeRegistryCostConfig::RunTest(const FString& Parameters)
{
    const FString Path = FSDTechTreePaths::ProjectDefaultCostFile();
    FSDResearchCostRule Rule;
    FSDTechTreeLoadReport Report;
    TestTrue(*FString::Printf(TEXT("cost config loads from %s"), *Path),
        LoadResearchCostRule(Path, Rule, Report));
    if (Rule.IsValid())
    {
        TestEqual(TEXT("points per tier"), Rule.PointsPerTier, 100);
        TestEqual(TEXT("first clear bonus"), Rule.FirstClearBonus, 50);
        TestEqual(TEXT("score divisor"), Rule.ScoreDivisor, 10);
        TestEqual(TEXT("minimum score"), Rule.MinimumScoreForReward, 400);
    }

    // A missing file must fail instead of silently pricing everything at zero.
    {
        FSDResearchCostRule MissingRule;
        FSDTechTreeLoadReport MissingReport;
        const FString MissingPath =
            FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("no_such_cost.json");
        TestFalse(TEXT("missing cost file rejected"),
            LoadResearchCostRule(MissingPath, MissingRule, MissingReport));
        TestFalse(TEXT("no rule returned"), MissingRule.IsValid());
        TestTrue(TEXT("missing file reported"), HasErrorCode(MissingReport, TEXT("MISSING_FILE")));
    }

    // Zero or negative numbers are rejected as data defects.
    {
        const FString TempPath = FPaths::ProjectSavedDir() / TEXT("TechTreeCostTest") / TEXT("invalid_cost.json");
        IFileManager::Get().MakeDirectory(*FPaths::GetPath(TempPath), true);
        FFileHelper::SaveStringToFile(
            TEXT("{\"pointsPerTier\":0,\"firstClearBonus\":50,\"scoreDivisor\":10,\"minimumScoreForReward\":400}"),
            *TempPath);

        FSDResearchCostRule BadRule;
        FSDTechTreeLoadReport BadReport;
        TestFalse(TEXT("zero points per tier rejected"), LoadResearchCostRule(TempPath, BadRule, BadReport));
        TestFalse(TEXT("no rule returned"), BadRule.IsValid());
        TestTrue(TEXT("invalid numbers reported"), HasErrorCode(BadReport, TEXT("INVALID_COST_RULE")));

        IFileManager::Get().Delete(*TempPath);
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
