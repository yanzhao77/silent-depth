#include "Core/TechTree/TechTreeViewModel.h"

namespace SDTechTree
{
ESDNodeRowState FSDTechTreeViewModel::TranslateState(
    ESDUnlockState State,
    bool bAffordable)
{
    switch (State)
    {
    case ESDUnlockState::Unlocked:           return ESDNodeRowState::Unlocked;
    case ESDUnlockState::PrerequisiteLocked: return ESDNodeRowState::PrerequisiteLocked;
    case ESDUnlockState::Excluded:           return ESDNodeRowState::Excluded;
    case ESDUnlockState::TierLocked:         return ESDNodeRowState::TierLocked;
    case ESDUnlockState::Available:          return bAffordable ? ESDNodeRowState::Available : ESDNodeRowState::Unaffordable;
    case ESDUnlockState::Unknown:
    default:                                 return ESDNodeRowState::UnknownNode;
    }
}

bool FSDTechTreeViewModel::Initialize(
    const FSDNodeRegistry& InRegistry,
    const FSDUnlockService& InUnlockService,
    const FSDResearchAccountService& InAccounts,
    const FSDEquipmentService& InEquipment,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    Registry = nullptr;
    UnlockService = nullptr;
    Accounts = nullptr;
    Equipment = nullptr;
    bInitialized = false;

    if (!InRegistry.IsInitialized() || !InUnlockService.IsInitialized()
        || !InAccounts.IsInitialized() || !InEquipment.IsInitialized())
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("tech tree view model"),
            TEXT("registry, unlock service, account service and equipment service must all be initialised"));
        return false;
    }
    if (InUnlockService.GetRegistry() != &InRegistry
        || InAccounts.GetRegistry() != &InRegistry
        || InEquipment.GetTree().Nodes.Num() != InRegistry.Num())
    {
        Report.AddError(
            TEXT("MISMATCHED_SERVICES"),
            TEXT("tech tree view model"),
            TEXT("the services are not bound to the same tree"));
        return false;
    }

    Registry = &InRegistry;
    UnlockService = &InUnlockService;
    Accounts = &InAccounts;
    Equipment = &InEquipment;

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        Registry = nullptr;
        UnlockService = nullptr;
        Accounts = nullptr;
        Equipment = nullptr;
        return false;
    }
    bInitialized = true;
    return true;
}

FSDNodeRow FSDTechTreeViewModel::MakeRow(
    const FSDTechNode& Node,
    const FSDResearchAccount& Account) const
{
    FSDNodeRow Row;
    Row.NodeId = Node.Id;
    Row.Category = Node.Category;
    Row.Tier = Node.Tier;
    Row.DisplayName = Node.DisplayName;
    Row.DisplayNameZh = Node.DisplayNameZh;
    Row.ShortName = Node.ShortName;
    Row.Country = Node.Country;
    Row.Era = Node.Era;
    Row.RoleText = Node.RoleText;
    Row.Production = Node.Production;
    Row.Evidence = Node.Evidence;
    Row.bDatabaseOnly = Node.bDatabaseOnly;
    Row.bEvidenceUnknown = Node.Evidence == ESDEvidenceLevel::Unknown;
    // Verified means the asset pipeline reached COMPLETE; anything else still
    // has to be labelled, including VALIDATING and PARTIAL.
    Row.bAssetNotVerified = !Node.bDatabaseOnly && Node.Production != ESDProductionStatus::Complete;
    Row.Cost = UnlockService->GetCost(Node.Id);
    Row.bAffordable = Account.ResearchPoints >= Row.Cost;
    Row.PrerequisiteNodeIds = Registry->GetPrerequisites(Node.Id);
    Row.DependentNodeIds = Registry->GetDependents(Node.Id);
    Row.SocketNames = Registry->GetSocketNames(Node.Id);

    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;
    const ESDUnlockState State = UnlockService->GetState(Account.Progress, Node.Id, Blocker, BlockingNodeId);
    Row.State = TranslateState(State, Row.bAffordable);
    Row.BlockingNodeId = BlockingNodeId;
    return Row;
}

FSDTierRow FSDTechTreeViewModel::MakeTierRow(
    ESDTechCategory Category,
    const FSDTierDefinition& Definition) const
{
    FSDTierRow Row;
    Row.Tier = Definition.Tier;
    Row.LabelEn = Definition.LabelEn;
    Row.LabelZh = Definition.LabelZh;
    Row.Description = Definition.Description;

    for (const FSDTechNode* Node : Registry->All())
    {
        if (Node->Category == Category && Node->Tier == Definition.Tier)
        {
            ++Row.NodeCount;
        }
    }
    return Row;
}

void FSDTechTreeViewModel::BuildScreen(
    ESDTechCategory SelectedCategory,
    const FSDResearchAccount& Account,
    FSDTechTreeScreen& OutScreen) const
{
    OutScreen = FSDTechTreeScreen();
    if (!bInitialized)
    {
        return;
    }

    OutScreen.SelectedCategory = SelectedCategory;
    OutScreen.ResearchPoints = Account.ResearchPoints;

    // Tabs: one per category, in enum order, with roll-up counters.
    for (uint8 CategoryIndex = 0; CategoryIndex < static_cast<uint8>(SDTechTree::CategoryCount); ++CategoryIndex)
    {
        const ESDTechCategory Category = static_cast<ESDTechCategory>(CategoryIndex);
        FSDCategoryTab Tab;
        Tab.Category = Category;
        for (const FSDTechNode* Node : Registry->All())
        {
            if (Node->Category != Category)
            {
                continue;
            }
            ++Tab.TotalNodes;
            if (Node->bDatabaseOnly)
            {
                ++Tab.DatabaseOnlyCount;
            }
            ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
            FString BlockingNodeId;
            switch (UnlockService->GetState(Account.Progress, Node->Id, Blocker, BlockingNodeId))
            {
            case ESDUnlockState::Unlocked:
                ++Tab.UnlockedCount;
                break;
            case ESDUnlockState::Available:
                ++Tab.AvailableCount;
                break;
            case ESDUnlockState::PrerequisiteLocked:
            case ESDUnlockState::Excluded:
            case ESDUnlockState::TierLocked:
                ++Tab.LockedCount;
                break;
            default:
                break;
            }
        }
        OutScreen.Tabs.Add(MoveTemp(Tab));
    }

    // Tier headers plus the rows of the selected category.
    for (const FSDTierDefinition& Definition : Registry->GetTree().Tiers)
    {
        if (Definition.Category != SelectedCategory)
        {
            continue;
        }
        FSDTierRow TierRow = MakeTierRow(SelectedCategory, Definition);
        OutScreen.Tiers.Add(MoveTemp(TierRow));
    }
    OutScreen.Rows.Reserve(Registry->Num());
    for (const FSDTechNode* Node : Registry->All())
    {
        if (Node->Category != SelectedCategory)
        {
            continue;
        }
        OutScreen.Rows.Add(MakeRow(*Node, Account));
    }

    // Rows come out in registry id order; the screen groups them by tier, so
    // re-order by (tier, id) to keep a section contiguous.
    OutScreen.Rows.Sort([](const FSDNodeRow& A, const FSDNodeRow& B)
    {
        const uint8 ByTier = static_cast<uint8>(A.Tier);
        const uint8 OtherTier = static_cast<uint8>(B.Tier);
        if (ByTier != OtherTier)
        {
            return ByTier < OtherTier;
        }
        return A.NodeId.Compare(B.NodeId, ESearchCase::CaseSensitive) < 0;
    });

    // Tier unlock counts need the same state pass, so fill them after the rows.
    for (FSDTierRow& TierRow : OutScreen.Tiers)
    {
        for (const FSDNodeRow& Row : OutScreen.Rows)
        {
            if (Row.Tier == TierRow.Tier && Row.State == ESDNodeRowState::Unlocked)
            {
                ++TierRow.UnlockedCount;
            }
        }
    }
}

void FSDTechTreeViewModel::BuildTierRows(
    ESDTechCategory Category,
    ESDTechTier Tier,
    const FSDResearchAccount& Account,
    TArray<FSDNodeRow>& OutRows) const
{
    OutRows.Reset();
    if (!bInitialized)
    {
        return;
    }
    for (const FSDTechNode* Node : Registry->All())
    {
        if (Node->Category == Category && Node->Tier == Tier)
        {
            OutRows.Add(MakeRow(*Node, Account));
        }
    }
}

void FSDTechTreeViewModel::BuildDependencies(
    const FString& NodeId,
    TArray<FString>& OutPrerequisiteIds,
    TArray<FString>& OutDependentIds) const
{
    OutPrerequisiteIds.Reset();
    OutDependentIds.Reset();
    if (!bInitialized)
    {
        return;
    }
    OutPrerequisiteIds = Registry->GetPrerequisites(NodeId);
    OutDependentIds = Registry->GetDependents(NodeId);
}

void FSDTechTreeViewModel::BuildEquipmentRows(
    const FString& PlatformId,
    const FString& SlotName,
    const FSDResearchAccount& Account,
    ESDEquipPolicy Policy,
    TArray<FSDEquipmentRow>& OutRows) const
{
    OutRows.Reset();
    if (!bInitialized)
    {
        return;
    }

    TArray<FString> CandidateIds;
    Equipment->CollectCandidates(PlatformId, SlotName, Policy, CandidateIds);
    OutRows.Reserve(CandidateIds.Num());
    for (const FString& CandidateId : CandidateIds)
    {
        FSDEquipmentRow Row;
        Row.CandidateId = CandidateId;
        Row.Compatibility = Equipment->GetCompatibilityInSlot(PlatformId, SlotName, CandidateId);
        Row.bEquippable = SDTechTree::IsEquippable(Row.Compatibility, Policy);
        Row.bGameplayOnly = Row.Compatibility == ESDCompatibility::Gameplay;
        Row.Cost = UnlockService->GetCost(CandidateId);
        Row.bUnlocked = Accounts->IsUnlocked(Account, CandidateId);
        if (const FSDTechNode* Node = Registry->Find(CandidateId))
        {
            Row.DisplayName = Node->DisplayName.IsEmpty() ? Node->Id : Node->DisplayName;
        }
        OutRows.Add(MoveTemp(Row));
    }
}
}
