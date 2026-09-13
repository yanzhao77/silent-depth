#include "TechTreeSubsystem.h"

#include "Core/TechTree/TechTreeProbe.h"

DEFINE_LOG_CATEGORY_STATIC(LogSilentDepthTechTree, Log, All);

void USilentDepthTechTreeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    const SDTechTree::FSDTechTreePaths Paths = SDTechTree::FSDTechTreePaths::ProjectDefault();
    if (!LoadFrom(Paths))
    {
        UE_LOG(LogSilentDepthTechTree, Error,
            TEXT("technology trees failed to load from %s; gameplay must not assume tech-tree data exists"),
            *Paths.Directory);
        return;
    }

    // The DEC-007 gate: a repeatable measurement of what the shipped rules open
    // and what a fixed mission set buys. Only runs when asked for, so a normal
    // session pays nothing for it.
    if (FParse::Param(FCommandLine::Get(), TEXT("sd-techtree-probe")))
    {
        RunStartupProbe();
    }
}

void USilentDepthTechTreeSubsystem::RunStartupProbe()
{
    const SDTechTree::FSDProbeReport Probe = SDTechTree::RunProgressionProbe(
        Registry, UnlockService, ResearchAccounts, SDTechTree::DefaultProbeMissions());

    const auto PerCategory = [&Probe](const int32 Index)
    {
        return Probe.OpeningPerCategory.IsValidIndex(Index) ? Probe.OpeningPerCategory[Index] : 0;
    };
    UE_LOG(LogSilentDepthTechTree, Log,
        TEXT("probe: %d opening node(s) [submarine %d, weapon %d, sensor %d, defensive %d, propulsion %d]; "
             "missions awarded %d point(s), purchases %d spent %d, %d left, %d unlocked, fingerprint %llu"),
        Probe.OpeningNodes,
        PerCategory(0), PerCategory(1), PerCategory(2), PerCategory(3), PerCategory(4),
        Probe.ResearchPointsAwarded,
        Probe.PurchasedNodeIds.Num(),
        Probe.ResearchPointsSpent,
        Probe.ResearchPointsLeft,
        Probe.UnlockedNodes,
        Probe.AccountFingerprint);
}

bool USilentDepthTechTreeSubsystem::LoadFrom(const SDTechTree::FSDTechTreePaths& Paths)
{
    FSDTechTree Loaded;
    FSDTechTreeLoadReport Report;
    if (!SDTechTree::LoadTechTree(Paths, Loaded, Report))
    {
        return FailLoad(Report);
    }

    SDTechTree::FSDResearchCostRule CostRule;
    SDTechTree::FSDTierGateRule TierGate;
    if (!SDTechTree::LoadResearchRules(
        SDTechTree::FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, TierGate, Report))
    {
        return FailLoad(Report);
    }

    // The registry borrows Nodes, so it must be built after the tree is in its
    // final storage rather than on the local variable.
    Tree = MoveTemp(Loaded);
    if (!Registry.Initialize(Tree, CostRule, Report))
    {
        return FailLoad(Report);
    }
    if (!Equipment.Initialize(Tree, Report))
    {
        return FailLoad(Report);
    }
    if (!UnlockService.Initialize(Registry, TierGate, Report))
    {
        return FailLoad(Report);
    }
    if (!ResearchAccounts.Initialize(UnlockService, Report))
    {
        return FailLoad(Report);
    }
    if (!ViewModel.Initialize(Registry, UnlockService, ResearchAccounts, Equipment, Report))
    {
        return FailLoad(Report);
    }

    LastReport = Report;
    bLoaded = true;
    UE_LOG(LogSilentDepthTechTree, Log,
        TEXT("technology trees loaded: %d nodes, %d tier rows, %d prerequisite edges, "
             "%d exclusion groups, %d compatibility records, %d slots, %d data notices"),
        Tree.Nodes.Num(), Tree.Tiers.Num(), CountPrerequisiteEdges(), Registry.NumExclusionGroups(),
        Equipment.NumRecords(), Equipment.NumSlots(), Report.Notices.Num());
    return true;
}

bool USilentDepthTechTreeSubsystem::FailLoad(const FSDTechTreeLoadReport& Report)
{
    LastReport = Report;
    bLoaded = false;
    Tree = FSDTechTree();
    Registry = SDTechTree::FSDNodeRegistry();
    UnlockService = SDTechTree::FSDUnlockService();
    ResearchAccounts = SDTechTree::FSDResearchAccountService();
    Equipment = SDTechTree::FSDEquipmentService();
    ViewModel = SDTechTree::FSDTechTreeViewModel();
    for (const FSDDataError& Error : Report.Errors)
    {
        UE_LOG(LogSilentDepthTechTree, Error, TEXT("[%s] %s :: %s"),
            *Error.Code, *Error.Subject, *Error.Detail);
    }
    return false;
}

int32 USilentDepthTechTreeSubsystem::CountPrerequisiteEdges() const
{
    int32 Edges = 0;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        Edges += Node.Unlock.PrerequisiteNodeIds.Num();
    }
    return Edges;
}
