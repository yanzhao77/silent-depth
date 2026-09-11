#include "Core/TechTree/TechTreeUnlockService.h"

namespace SDTechTree
{
namespace
{
/** Membership-only view of the unlocked set. Never iterated for decisions. */
TSet<FString> MakeUnlockedSet(const FSDUnlockProgress& Progress)
{
    TSet<FString> Unlocked;
    Unlocked.Reserve(Progress.UnlockedNodeIds.Num());
    for (const FString& NodeId : Progress.UnlockedNodeIds)
    {
        Unlocked.Add(NodeId);
    }
    return Unlocked;
}

/** First sorted prerequisite that is not unlocked, or nullptr. */
const FString* FindMissingPrerequisite(
    const TArray<FString>& Prerequisites,
    const TSet<FString>& Unlocked)
{
    for (const FString& Prerequisite : Prerequisites)
    {
        if (!Unlocked.Contains(Prerequisite))
        {
            return &Prerequisite;
        }
    }
    return nullptr;
}

/** First sorted group member other than the node itself that is unlocked. */
const FString* FindUnlockedRival(
    const TArray<FString>& ExclusionGroup,
    const FString& NodeId,
    const TSet<FString>& Unlocked)
{
    for (const FString& Member : ExclusionGroup)
    {
        if (!Member.Equals(NodeId, ESearchCase::CaseSensitive) && Unlocked.Contains(Member))
        {
            return &Member;
        }
    }
    return nullptr;
}

}

bool FSDUnlockService::Initialize(const FSDNodeRegistry& InRegistry, FSDTechTreeLoadReport& Report)
{
    return Initialize(InRegistry, FSDTierGateRule(), Report);
}

bool FSDUnlockService::Initialize(
    const FSDNodeRegistry& InRegistry,
    const FSDTierGateRule& InTierGate,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    Registry = nullptr;
    TierGate = FSDTierGateRule();
    bInitialized = false;

    if (!InRegistry.IsInitialized())
    {
        Report.AddError(
            TEXT("REGISTRY_NOT_INITIALIZED"),
            TEXT("unlock service"),
            TEXT("the node registry must be initialised before the unlock service"));
        return false;
    }

    Registry = &InRegistry;
    TierGate = InTierGate;
    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        Registry = nullptr;
        TierGate = FSDTierGateRule();
        return false;
    }

    bInitialized = true;
    return true;
}

int32 FSDUnlockService::CountLowerTierProgress(
    const FSDTechNode& Node,
    const TSet<FString>& Unlocked,
    bool& bOutHasLowerTier,
    int32& OutNodesInLowerTier) const
{
    bOutHasLowerTier = false;
    OutNodesInLowerTier = 0;
    if (Registry == nullptr)
    {
        return 0;
    }

    // Nearest lower tier that actually holds nodes. Skipping empty tiers is
    // what keeps the submarine tree (which starts at T2) reachable.
    for (int32 TierIndex = static_cast<int32>(Node.Tier) - 1;
         TierIndex >= SDTechTree::MinTier;
         --TierIndex)
    {
        const ESDTechTier LowerTier = static_cast<ESDTechTier>(TierIndex);
        TArray<const FSDTechNode*> NodesInTier;
        Registry->CollectByTier(Node.Category, LowerTier, NodesInTier);
        if (NodesInTier.Num() == 0)
        {
            continue;
        }
        bOutHasLowerTier = true;
        OutNodesInLowerTier = NodesInTier.Num();
        int32 UnlockedCount = 0;
        for (const FSDTechNode* LowerNode : NodesInTier)
        {
            if (Unlocked.Contains(LowerNode->Id))
            {
                ++UnlockedCount;
            }
        }
        return UnlockedCount;
    }
    return 0;
}

void FSDUnlockService::NormalizeProgress(FSDUnlockProgress& InOut)
{
    InOut.UnlockedNodeIds.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });
    for (int32 Index = InOut.UnlockedNodeIds.Num() - 1; Index > 0; --Index)
    {
        if (InOut.UnlockedNodeIds[Index].Equals(InOut.UnlockedNodeIds[Index - 1], ESearchCase::CaseSensitive))
        {
            InOut.UnlockedNodeIds.RemoveAt(Index);
        }
    }
}

bool FSDUnlockService::ValidateProgress(
    const FSDUnlockProgress& Progress,
    FSDTechTreeLoadReport& Report) const
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    if (Registry == nullptr)
    {
        Report.AddError(TEXT("NOT_INITIALIZED"), TEXT("unlock service"), TEXT("service is not initialised"));
        return false;
    }
    for (const FString& NodeId : Progress.UnlockedNodeIds)
    {
        if (Registry->Find(NodeId) == nullptr)
        {
            Report.AddError(
                TEXT("UNKNOWN_NODE_IN_PROGRESS"),
                NodeId,
                TEXT("progress references a node that is not in the tree"));
        }
    }
    return Report.Errors.Num() == ErrorsAtEntry;
}

ESDUnlockState FSDUnlockService::GetState(
    const FSDUnlockProgress& Progress,
    const FString& NodeId,
    ESDUnlockBlocker& OutBlocker,
    FString& OutBlockingNodeId) const
{
    OutBlocker = ESDUnlockBlocker::None;
    OutBlockingNodeId.Reset();

    if (Registry == nullptr)
    {
        OutBlocker = ESDUnlockBlocker::NotInitialized;
        return ESDUnlockState::Unknown;
    }

    const FSDTechNode* Node = Registry->Find(NodeId);
    if (Node == nullptr)
    {
        OutBlocker = ESDUnlockBlocker::UnknownNode;
        return ESDUnlockState::Unknown;
    }

    const TSet<FString> Unlocked = MakeUnlockedSet(Progress);
    if (Unlocked.Contains(NodeId))
    {
        return ESDUnlockState::Unlocked;
    }

    if (const FString* Missing = FindMissingPrerequisite(Registry->GetPrerequisites(NodeId), Unlocked))
    {
        OutBlocker = ESDUnlockBlocker::PrerequisiteLocked;
        OutBlockingNodeId = *Missing;
        return ESDUnlockState::PrerequisiteLocked;
    }

    if (const FString* Rival = FindUnlockedRival(Registry->GetExclusionGroup(NodeId), NodeId, Unlocked))
    {
        OutBlocker = ESDUnlockBlocker::Excluded;
        OutBlockingNodeId = *Rival;
        return ESDUnlockState::Excluded;
    }

    if (TierGate.IsEnabled())
    {
        bool bHasLowerTier = false;
        int32 NodesInLowerTier = 0;
        const int32 LowerProgress =
            CountLowerTierProgress(*Node, Unlocked, bHasLowerTier, NodesInLowerTier);
        if (IsTierGateBlocking(TierGate, LowerProgress, NodesInLowerTier, bHasLowerTier))
        {
            OutBlocker = ESDUnlockBlocker::TierLocked;
            return ESDUnlockState::TierLocked;
        }
    }

    return ESDUnlockState::Available;
}

void FSDUnlockService::EvaluateAll(
    const FSDUnlockProgress& Progress,
    int32 ResearchPoints,
    TArray<FSDNodeStatus>& OutStatuses) const
{
    OutStatuses.Reset();
    if (Registry == nullptr)
    {
        return;
    }

    const TSet<FString> Unlocked = MakeUnlockedSet(Progress);
    OutStatuses.Reserve(Registry->Num());

    // Registry::All() is id-ordered, so the evaluation order is fixed by data,
    // not by any container's iteration order.
    for (const FSDTechNode* Node : Registry->All())
    {
        FSDNodeStatus Status;
        Status.NodeId = Node->Id;
        Status.Cost = Registry->GetCostForTier(Node->Tier);
        Status.bAffordable = ResearchPoints >= Status.Cost;

        if (Unlocked.Contains(Node->Id))
        {
            Status.State = ESDUnlockState::Unlocked;
            OutStatuses.Add(MoveTemp(Status));
            continue;
        }

        if (const FString* Missing = FindMissingPrerequisite(
            Registry->GetPrerequisites(Node->Id), Unlocked))
        {
            Status.State = ESDUnlockState::PrerequisiteLocked;
            Status.Blocker = ESDUnlockBlocker::PrerequisiteLocked;
            Status.BlockingNodeId = *Missing;
            OutStatuses.Add(MoveTemp(Status));
            continue;
        }

        if (const FString* Rival = FindUnlockedRival(
            Registry->GetExclusionGroup(Node->Id), Node->Id, Unlocked))
        {
            Status.State = ESDUnlockState::Excluded;
            Status.Blocker = ESDUnlockBlocker::Excluded;
            Status.BlockingNodeId = *Rival;
            OutStatuses.Add(MoveTemp(Status));
            continue;
        }

        if (TierGate.IsEnabled())
        {
            bool bHasLowerTier = false;
            int32 NodesInLowerTier = 0;
            const int32 LowerProgress =
                CountLowerTierProgress(*Node, Unlocked, bHasLowerTier, NodesInLowerTier);
            if (IsTierGateBlocking(TierGate, LowerProgress, NodesInLowerTier, bHasLowerTier))
            {
                Status.State = ESDUnlockState::TierLocked;
                Status.Blocker = ESDUnlockBlocker::TierLocked;
                OutStatuses.Add(MoveTemp(Status));
                continue;
            }
        }

        Status.State = ESDUnlockState::Available;
        if (!Status.bAffordable)
        {
            Status.Blocker = ESDUnlockBlocker::InsufficientPoints;
        }
        OutStatuses.Add(MoveTemp(Status));
    }
}

int32 FSDUnlockService::GetCost(const FString& NodeId) const
{
    return Registry != nullptr ? Registry->GetCost(NodeId) : 0;
}

bool FSDUnlockService::CanAfford(const FString& NodeId, int32 ResearchPoints) const
{
    if (Registry == nullptr || Registry->Find(NodeId) == nullptr)
    {
        return false;
    }
    return ResearchPoints >= Registry->GetCost(NodeId);
}

bool FSDUnlockService::ApplyUnlock(
    const FSDUnlockProgress& Progress,
    const FString& NodeId,
    FSDUnlockProgress& OutProgress,
    ESDUnlockBlocker& OutBlocker) const
{
    OutProgress = Progress;
    OutBlocker = ESDUnlockBlocker::None;

    ESDUnlockBlocker StateBlocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;
    const ESDUnlockState State = GetState(Progress, NodeId, StateBlocker, BlockingNodeId);

    switch (State)
    {
    case ESDUnlockState::Unlocked:
        OutBlocker = ESDUnlockBlocker::AlreadyUnlocked;
        return false;
    case ESDUnlockState::Unknown:
        OutBlocker = StateBlocker;
        return false;
    case ESDUnlockState::PrerequisiteLocked:
    case ESDUnlockState::Excluded:
        OutBlocker = StateBlocker;
        return false;
    case ESDUnlockState::Available:
    default:
        break;
    }

    OutProgress.UnlockedNodeIds.Add(NodeId);
    NormalizeProgress(OutProgress);
    return true;
}

uint64 FSDUnlockService::ComputeSignature(
    const FSDUnlockProgress& Progress,
    int32 ResearchPoints) const
{
    constexpr uint64 OffsetBasis = 14695981039346656037ull;

    TArray<FSDNodeStatus> Statuses;
    EvaluateAll(Progress, ResearchPoints, Statuses);

    uint64 Hash = OffsetBasis;
    for (const FSDNodeStatus& Status : Statuses)
    {
        Hash = HashToken(Hash, Status.NodeId);
        Hash = HashToken(Hash, FString::FromInt(static_cast<int32>(Status.State)));
        Hash = HashToken(Hash, FString::FromInt(static_cast<int32>(Status.Blocker)));
        Hash = HashToken(Hash, Status.BlockingNodeId);
        Hash = HashToken(Hash, FString::FromInt(Status.Cost));
        Hash = HashToken(Hash, Status.bAffordable ? TEXT("1") : TEXT("0"));
    }
    return Hash;
}
}
