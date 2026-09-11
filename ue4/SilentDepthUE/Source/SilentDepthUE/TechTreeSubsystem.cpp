#include "TechTreeSubsystem.h"

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
    }
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
