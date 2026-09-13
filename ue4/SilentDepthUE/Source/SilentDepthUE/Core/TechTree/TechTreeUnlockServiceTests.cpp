#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Misc/AutomationTest.h"
#include "Misc/Paths.h"

using namespace SDTechTree;

namespace UnlockServiceTests
{
FSDResearchCostRule DecreeRule()
{
    FSDResearchCostRule Rule;
    Rule.PointsPerTier = 100;
    Rule.FirstClearBonus = 50;
    Rule.ScoreDivisor = 10;
    Rule.MinimumScoreForReward = 400;
    return Rule;
}

FSDTechNode MakeNode(const TCHAR* Id, ESDTechTier Tier)
{
    FSDTechNode Node;
    Node.Id = Id;
    Node.Category = ESDTechCategory::Weapon;
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

int32 CountInState(const TArray<FSDNodeStatus>& Statuses, ESDUnlockState State)
{
    int32 Count = 0;
    for (const FSDNodeStatus& Status : Statuses)
    {
        if (Status.State == State)
        {
            ++Count;
        }
    }
    return Count;
}

/** Loads the project tree and builds a registry plus unlock service on it. */
bool BuildProjectService(
    FAutomationTestBase& Test,
    FSDTechTree& OutTree,
    FSDNodeRegistry& OutRegistry,
    FSDUnlockService& OutService)
{
    FSDTechTreeLoadReport LoadReport;
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), OutTree, LoadReport))
    {
        Test.AddError(TEXT("tech tree failed to load"));
        return false;
    }

    FSDResearchCostRule CostRule;
    FSDTierGateRule TierGate;
    FSDTechTreeLoadReport CostReport;
    if (!LoadResearchRules(FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, TierGate, CostReport))
    {
        Test.AddError(TEXT("research cost rule failed to load"));
        return false;
    }

    FSDTechTreeLoadReport RegistryReport;
    if (!OutRegistry.Initialize(OutTree, CostRule, RegistryReport))
    {
        Test.AddError(TEXT("registry failed to initialise"));
        return false;
    }

    FSDTechTreeLoadReport ServiceReport;
    return OutService.Initialize(OutRegistry, TierGate, ServiceReport);
}
}
using namespace UnlockServiceTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeUnlockRealTree,
    "SilentDepth.TechTree.Unlock.EvaluatesRealTreeDeterministically",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeUnlockRealTree::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Service;
    if (!BuildProjectService(*this, Tree, Registry, Service))
    {
        return false;
    }

    const FSDUnlockProgress Empty;
    TArray<FSDNodeStatus> Statuses;
    Service.EvaluateAll(Empty, 0, Statuses);
    TestEqual(TEXT("one row per node"), Statuses.Num(), Registry.Num());

    // Rows come out in registry id order, which is what the UI and the
    // signature both rely on.
    bool bSorted = true;
    for (int32 Index = 1; Index < Statuses.Num(); ++Index)
    {
        if (Statuses[Index - 1].NodeId.Compare(Statuses[Index].NodeId, ESearchCase::CaseSensitive) >= 0)
        {
            bSorted = false;
            break;
        }
    }
    TestTrue(TEXT("evaluation is id-ordered"), bSorted);

    // With the shipped tier gate on (DEC-007 = 1) and the weapon chain's 115
    // prerequisite edges, a fresh save opens 22 nodes: the lowest non-empty tier
    // of each category, minus whatever the weapon chain still holds back.
    TestEqual(TEXT("nodes unlocked from scratch"), CountInState(Statuses, ESDUnlockState::Unlocked), 0);
    TestEqual(TEXT("available nodes"), CountInState(Statuses, ESDUnlockState::Available), 22);
    TestEqual(TEXT("nodes waiting on a prerequisite"),
        CountInState(Statuses, ESDUnlockState::PrerequisiteLocked), 115);
    // 225 since CN_PJ_Type093B joined the propulsion tree at T9 (Batch B).
    TestEqual(TEXT("nodes waiting on the tier gate"),
        CountInState(Statuses, ESDUnlockState::TierLocked), 225);
    TestEqual(TEXT("every node is accounted for"),
        CountInState(Statuses, ESDUnlockState::Available)
            + CountInState(Statuses, ESDUnlockState::PrerequisiteLocked)
            + CountInState(Statuses, ESDUnlockState::TierLocked),
        Registry.Num());

    // The blocker names the exact prerequisite, not just "locked".
    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;
    const ESDUnlockState ChildState =
        Service.GetState(Empty, TEXT("US_TORP_Mk18"), Blocker, BlockingNodeId);
    TestEqual(TEXT("child is prerequisite locked"),
        static_cast<int32>(ChildState), static_cast<int32>(ESDUnlockState::PrerequisiteLocked));
    TestEqual(TEXT("blocker kind"),
        static_cast<int32>(Blocker), static_cast<int32>(ESDUnlockBlocker::PrerequisiteLocked));
    TestEqual(TEXT("blocker names the parent"), BlockingNodeId, FString(TEXT("US_TORP_Mk14")));

    // Costs come from the DEC-004 configuration, not from code.
    TestEqual(TEXT("T1 cost"), Service.GetCost(TEXT("US_TORP_Mk14")), 100);
    TestFalse(TEXT("99 points cannot afford a T1 node"), Service.CanAfford(TEXT("US_TORP_Mk14"), 99));
    TestTrue(TEXT("100 points can afford a T1 node"), Service.CanAfford(TEXT("US_TORP_Mk14"), 100));
    TestFalse(TEXT("unknown node cannot be afforded"), Service.CanAfford(TEXT("NO_SUCH_NODE"), 100000));

    // With an empty wallet the available roots report why they cannot be bought.
    for (const FSDNodeStatus& Status : Statuses)
    {
        if (Status.State == ESDUnlockState::Available && Status.Blocker != ESDUnlockBlocker::InsufficientPoints)
        {
            AddError(FString::Printf(TEXT("%s is available but not flagged unaffordable"), *Status.NodeId));
            break;
        }
    }

    // Two evaluations of the same inputs must agree bit for bit.
    const uint64 FirstSignature = Service.ComputeSignature(Empty, 0);
    const uint64 SecondSignature = Service.ComputeSignature(Empty, 0);
    TestEqual(TEXT("signature is stable"), FirstSignature, SecondSignature);

    // A second, independently built service must agree with the first.
    FSDTechTree OtherTree;
    FSDNodeRegistry OtherRegistry;
    FSDUnlockService OtherService;
    if (BuildProjectService(*this, OtherTree, OtherRegistry, OtherService))
    {
        TestEqual(TEXT("independent builds agree"),
            OtherService.ComputeSignature(Empty, 0), FirstSignature);
    }

    // The wallet is an input: the same structure with more points differs.
    TestTrue(TEXT("points change the signature"),
        Service.ComputeSignature(Empty, 1000) != FirstSignature);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeUnlockProgress,
    "SilentDepth.TechTree.Unlock.ProgressRules",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeUnlockProgress::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Service;
    if (!BuildProjectService(*this, Tree, Registry, Service))
    {
        return false;
    }

    // Unlocking a root makes its dependent available.
    FSDUnlockProgress Progress;
    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    TestTrue(TEXT("root unlocks"),
        Service.ApplyUnlock(Progress, TEXT("US_TORP_Mk14"), Progress, Blocker));
    TestEqual(TEXT("one node researched"), Progress.UnlockedNodeIds.Num(), 1);

    ESDUnlockBlocker StateBlocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;
    TestEqual(TEXT("dependent becomes available"),
        static_cast<int32>(Service.GetState(Progress, TEXT("US_TORP_Mk18"), StateBlocker, BlockingNodeId)),
        static_cast<int32>(ESDUnlockState::Available));
    TestEqual(TEXT("root reports unlocked"),
        static_cast<int32>(Service.GetState(Progress, TEXT("US_TORP_Mk14"), StateBlocker, BlockingNodeId)),
        static_cast<int32>(ESDUnlockState::Unlocked));

    // Re-researching the same node changes nothing and says why.
    FSDUnlockProgress AfterRepeat = Progress;
    ESDUnlockBlocker RepeatBlocker = ESDUnlockBlocker::None;
    TestFalse(TEXT("repeat unlock rejected"),
        Service.ApplyUnlock(Progress, TEXT("US_TORP_Mk14"), AfterRepeat, RepeatBlocker));
    TestEqual(TEXT("repeat reports already unlocked"),
        static_cast<int32>(RepeatBlocker), static_cast<int32>(ESDUnlockBlocker::AlreadyUnlocked));
    TestEqual(TEXT("progress unchanged"), AfterRepeat.UnlockedNodeIds.Num(), 1);
    TestEqual(TEXT("unchanged progress keeps its signature"),
        Service.ComputeSignature(AfterRepeat, 0), Service.ComputeSignature(Progress, 0));

    // A locked node cannot be jumped to.
    FSDUnlockProgress Skipped = Progress;
    ESDUnlockBlocker SkipBlocker = ESDUnlockBlocker::None;
    TestFalse(TEXT("locked node rejected"),
        Service.ApplyUnlock(Progress, TEXT("US_TORP_Mk23"), Skipped, SkipBlocker));
    TestEqual(TEXT("skip reports the prerequisite"),
        static_cast<int32>(SkipBlocker), static_cast<int32>(ESDUnlockBlocker::PrerequisiteLocked));
    TestEqual(TEXT("skipped progress unchanged"), Skipped.UnlockedNodeIds.Num(), 1);

    // Unknown ids never enter progress.
    FSDUnlockProgress WithGhost = Progress;
    ESDUnlockBlocker GhostBlocker = ESDUnlockBlocker::None;
    TestFalse(TEXT("unknown node rejected"),
        Service.ApplyUnlock(Progress, TEXT("NO_SUCH_NODE"), WithGhost, GhostBlocker));
    TestEqual(TEXT("unknown reported"),
        static_cast<int32>(GhostBlocker), static_cast<int32>(ESDUnlockBlocker::UnknownNode));

    // Order of the unlocked list must not change the outcome.
    FSDUnlockProgress Unordered = Progress;
    Unordered.UnlockedNodeIds.Add(TEXT("US_TORP_Mk14")); // exact duplicate
    Unordered.UnlockedNodeIds.Add(TEXT("AAA_GHOST"));    // unknown id, sorts first
    FSDUnlockProgress Normalized = Unordered;
    FSDUnlockService::NormalizeProgress(Normalized);
    TestEqual(TEXT("normalisation removes the duplicate"), Normalized.UnlockedNodeIds.Num(), 2);
    TestEqual(TEXT("normalisation sorts"), Normalized.UnlockedNodeIds[0], FString(TEXT("AAA_GHOST")));
    TestEqual(TEXT("normalisation keeps the real id"),
        Normalized.UnlockedNodeIds[1], FString(TEXT("US_TORP_Mk14")));
    TestEqual(TEXT("normalisation never drops an unknown id"),
        Service.ComputeSignature(Normalized, 0), Service.ComputeSignature(Unordered, 0));

    // Validation catches a corrupted save instead of dropping ids silently.
    FSDTechTreeLoadReport Report;
    TestFalse(TEXT("unknown id in progress rejected"), Service.ValidateProgress(Unordered, Report));
    TestTrue(TEXT("corruption reported"), HasErrorCode(Report, TEXT("UNKNOWN_NODE_IN_PROGRESS")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeUnlockExclusionsAndGuards,
    "SilentDepth.TechTree.Unlock.ExclusionsAndGuards",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeUnlockExclusionsAndGuards::RunTest(const FString& Parameters)
{
    // Declared exclusions block the rival once one member is researched. The
    // five trees declare none today, so this is driven with a synthetic tree.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        FSDTechNode NodeA = MakeNode(TEXT("A"), ESDTechTier::T1);
        FSDTechNode NodeB = MakeNode(TEXT("B"), ESDTechTier::T1);
        NodeA.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("B"));
        NodeB.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("A"));
        Tree.Nodes.Add(NodeA);
        Tree.Nodes.Add(NodeB);
        Tree.SortDeterministically();

        FSDNodeRegistry Registry;
        FSDTechTreeLoadReport RegistryReport;
        TestTrue(TEXT("registry builds"), Registry.Initialize(Tree, DecreeRule(), RegistryReport));

        FSDUnlockService Service;
        FSDTechTreeLoadReport ServiceReport;
        TestTrue(TEXT("service builds"), Service.Initialize(Registry, ServiceReport));

        FSDUnlockProgress Progress;
        ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
        TestTrue(TEXT("A unlocks"), Service.ApplyUnlock(Progress, TEXT("A"), Progress, Blocker));

        ESDUnlockBlocker StateBlocker = ESDUnlockBlocker::None;
        FString BlockingNodeId;
        TestEqual(TEXT("B becomes excluded"),
            static_cast<int32>(Service.GetState(Progress, TEXT("B"), StateBlocker, BlockingNodeId)),
            static_cast<int32>(ESDUnlockState::Excluded));
        TestEqual(TEXT("blocker names A"), BlockingNodeId, FString(TEXT("A")));

        FSDUnlockProgress AfterB = Progress;
        ESDUnlockBlocker ExclusionBlocker = ESDUnlockBlocker::None;
        TestFalse(TEXT("excluded node rejected"),
            Service.ApplyUnlock(Progress, TEXT("B"), AfterB, ExclusionBlocker));
        TestEqual(TEXT("exclusion reported"),
            static_cast<int32>(ExclusionBlocker), static_cast<int32>(ESDUnlockBlocker::Excluded));
    }

    // An uninitialised service must fail closed instead of reporting everything
    // as available.
    {
        FSDUnlockService Service;
        TestFalse(TEXT("not initialised"), Service.IsInitialized());

        ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
        FString BlockingNodeId;
        TestEqual(TEXT("state is unknown"),
            static_cast<int32>(Service.GetState(FSDUnlockProgress(), TEXT("A"), Blocker, BlockingNodeId)),
            static_cast<int32>(ESDUnlockState::Unknown));
        TestEqual(TEXT("blocker is not-initialised"),
            static_cast<int32>(Blocker), static_cast<int32>(ESDUnlockBlocker::NotInitialized));

        TArray<FSDNodeStatus> Statuses;
        Service.EvaluateAll(FSDUnlockProgress(), 0, Statuses);
        TestEqual(TEXT("no rows without a registry"), Statuses.Num(), 0);

        const FSDUnlockProgress Empty;
        FSDUnlockProgress Out;
        ESDUnlockBlocker ApplyBlocker = ESDUnlockBlocker::None;
        TestFalse(TEXT("apply fails"), Service.ApplyUnlock(Empty, TEXT("A"), Out, ApplyBlocker));
        TestEqual(TEXT("apply reports not-initialised"),
            static_cast<int32>(ApplyBlocker), static_cast<int32>(ESDUnlockBlocker::NotInitialized));
    }

    // Binding to a registry that was never initialised is rejected.
    {
        FSDNodeRegistry EmptyRegistry;
        FSDUnlockService Service;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("empty registry rejected"), Service.Initialize(EmptyRegistry, Report));
        TestTrue(TEXT("registry guard reported"), HasErrorCode(Report, TEXT("REGISTRY_NOT_INITIALIZED")));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
