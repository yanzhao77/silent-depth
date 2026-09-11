#include "Core/TechTree/TechTreeResearchAccount.h"

#include "Core/TechTree/TechTreeNodeRegistry.h"

namespace SDTechTree
{
namespace
{
void SortAndDedupe(TArray<FString>& Values)
{
    Values.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });
    for (int32 Index = Values.Num() - 1; Index > 0; --Index)
    {
        if (Values[Index].Equals(Values[Index - 1], ESearchCase::CaseSensitive))
        {
            Values.RemoveAt(Index);
        }
    }
}
}

bool FSDResearchAccountService::Initialize(
    const FSDUnlockService& InUnlockService,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    UnlockService = nullptr;
    bInitialized = false;

    if (!InUnlockService.IsInitialized() || InUnlockService.GetRegistry() == nullptr)
    {
        Report.AddError(
            TEXT("UNLOCK_SERVICE_NOT_INITIALIZED"),
            TEXT("research account service"),
            TEXT("the unlock service must be initialised before the research account service"));
        return false;
    }

    UnlockService = &InUnlockService;
    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        UnlockService = nullptr;
        return false;
    }

    bInitialized = true;
    return true;
}

void FSDResearchAccountService::PreviewPurchase(
    const FSDResearchAccount& Account,
    const FString& NodeId,
    FSDPurchaseOutcome& OutOutcome) const
{
    OutOutcome = FSDPurchaseOutcome();
    OutOutcome.NodeId = NodeId;
    OutOutcome.PointsBefore = Account.ResearchPoints;
    OutOutcome.PointsAfter = Account.ResearchPoints;

    if (!bInitialized || UnlockService == nullptr || UnlockService->GetRegistry() == nullptr)
    {
        OutOutcome.Result = ESDPurchaseResult::NotInitialized;
        return;
    }

    OutOutcome.Cost = UnlockService->GetCost(NodeId);

    // Structural rules first: a locked node reports its prerequisite, not its
    // price, and an already researched node is never charged twice.
    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;
    const ESDUnlockState State =
        UnlockService->GetState(Account.Progress, NodeId, Blocker, BlockingNodeId);
    switch (State)
    {
    case ESDUnlockState::Unknown:
        OutOutcome.Result = ESDPurchaseResult::UnknownNode;
        return;
    case ESDUnlockState::Unlocked:
        OutOutcome.Result = ESDPurchaseResult::AlreadyUnlocked;
        return;
    case ESDUnlockState::PrerequisiteLocked:
        OutOutcome.Result = ESDPurchaseResult::PrerequisiteLocked;
        OutOutcome.BlockingNodeId = BlockingNodeId;
        return;
    case ESDUnlockState::Excluded:
        OutOutcome.Result = ESDPurchaseResult::Excluded;
        OutOutcome.BlockingNodeId = BlockingNodeId;
        return;
    case ESDUnlockState::TierLocked:
        OutOutcome.Result = ESDPurchaseResult::TierLocked;
        return;
    case ESDUnlockState::Available:
    default:
        break;
    }

    if (Account.ResearchPoints < OutOutcome.Cost)
    {
        OutOutcome.Result = ESDPurchaseResult::InsufficientPoints;
        return;
    }

    OutOutcome.Result = ESDPurchaseResult::Purchased;
    OutOutcome.PointsAfter = Account.ResearchPoints - OutOutcome.Cost;
}

bool FSDResearchAccountService::TryPurchase(
    FSDResearchAccount& InOutAccount,
    const FString& NodeId,
    FSDPurchaseOutcome& OutOutcome) const
{
    PreviewPurchase(InOutAccount, NodeId, OutOutcome);
    if (!OutOutcome.Succeeded())
    {
        return false;
    }

    // Build the candidate, then commit in one assignment. Every exit above this
    // point leaves the caller's account untouched.
    FSDResearchAccount Candidate = InOutAccount;
    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    FSDUnlockProgress NewProgress;
    if (!UnlockService->ApplyUnlock(InOutAccount.Progress, NodeId, NewProgress, Blocker))
    {
        OutOutcome.Result = Blocker == ESDUnlockBlocker::AlreadyUnlocked
            ? ESDPurchaseResult::AlreadyUnlocked
            : ESDPurchaseResult::PrerequisiteLocked;
        return false;
    }

    Candidate.Progress = MoveTemp(NewProgress);
    Candidate.ResearchPoints = OutOutcome.PointsAfter;
    InOutAccount = MoveTemp(Candidate);
    return true;
}

bool FSDResearchAccountService::AwardMissionResult(
    FSDResearchAccount& InOutAccount,
    const FString& MissionId,
    int32 Score,
    FSDMissionSettlement& OutSettlement) const
{
    OutSettlement = FSDMissionSettlement();
    OutSettlement.Score = Score;
    OutSettlement.PointsBefore = InOutAccount.ResearchPoints;
    OutSettlement.PointsAfter = InOutAccount.ResearchPoints;

    if (!bInitialized || UnlockService == nullptr || UnlockService->GetRegistry() == nullptr)
    {
        return false;
    }
    if (MissionId.IsEmpty())
    {
        return false;
    }

    const FSDResearchCostRule& Rule = UnlockService->GetRegistry()->GetCostRule();
    const bool bFirstClear = !InOutAccount.FirstClearMissionIds.Contains(MissionId);
    const int32 Awarded = PointsForMissionResult(Rule, Score, bFirstClear);
    if (Awarded <= 0)
    {
        // Below the reward threshold: no points and, deliberately, no
        // first-clear record, so the bonus is still available later.
        return false;
    }

    FSDResearchAccount Candidate = InOutAccount;
    Candidate.ResearchPoints += Awarded;
    if (bFirstClear)
    {
        Candidate.FirstClearMissionIds.Add(MissionId);
        SortAndDedupe(Candidate.FirstClearMissionIds);
    }
    InOutAccount = MoveTemp(Candidate);

    OutSettlement.bAwarded = true;
    OutSettlement.PointsAwarded = Awarded;
    OutSettlement.bFirstClearBonus = bFirstClear;
    OutSettlement.PointsAfter = InOutAccount.ResearchPoints;
    return true;
}

void FSDResearchAccountService::GrantPoints(FSDResearchAccount& InOutAccount, int32 Points) const
{
    if (Points > 0)
    {
        InOutAccount.ResearchPoints += Points;
    }
}

const FSDNodeRegistry* FSDResearchAccountService::GetRegistry() const
{
    return UnlockService != nullptr ? UnlockService->GetRegistry() : nullptr;
}

bool FSDResearchAccountService::ValidateAccount(
    const FSDResearchAccount& Account,
    FSDTechTreeLoadReport& Report) const
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    if (!bInitialized || UnlockService == nullptr)
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("research account service"),
            TEXT("service is not initialised"));
        return false;
    }

    if (Account.ResearchPoints < 0)
    {
        Report.AddError(
            TEXT("NEGATIVE_BALANCE"),
            FString::FromInt(Account.ResearchPoints),
            TEXT("research points cannot be negative"));
    }

    UnlockService->ValidateProgress(Account.Progress, Report);

    TArray<FString> SortedProgress = Account.Progress.UnlockedNodeIds;
    SortAndDedupe(SortedProgress);
    if (SortedProgress.Num() != Account.Progress.UnlockedNodeIds.Num())
    {
        Report.AddError(
            TEXT("DUPLICATE_NODE_IN_PROGRESS"),
            TEXT("progress"),
            TEXT("the unlocked list contains duplicate ids"));
    }

    TArray<FString> SortedMissions = Account.FirstClearMissionIds;
    for (const FString& MissionId : SortedMissions)
    {
        if (MissionId.IsEmpty())
        {
            Report.AddError(TEXT("EMPTY_MISSION_ID"), TEXT("first clear"), TEXT("mission id is empty"));
        }
    }
    SortAndDedupe(SortedMissions);
    if (SortedMissions.Num() != Account.FirstClearMissionIds.Num())
    {
        Report.AddError(
            TEXT("DUPLICATE_FIRST_CLEAR"),
            TEXT("first clear"),
            TEXT("the first-clear list contains duplicate mission ids"));
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool FSDResearchAccountService::IsUnlocked(
    const FSDResearchAccount& Account,
    const FString& NodeId) const
{
    return Account.Progress.UnlockedNodeIds.Contains(NodeId);
}

int32 FSDResearchAccountService::GetCost(const FString& NodeId) const
{
    return UnlockService != nullptr ? UnlockService->GetCost(NodeId) : 0;
}

uint64 FSDResearchAccountService::ComputeAccountSignature(const FSDResearchAccount& Account) const
{
    constexpr uint64 OffsetBasis = 14695981039346656037ull;
    if (UnlockService == nullptr)
    {
        return OffsetBasis;
    }

    uint64 Hash = UnlockService->ComputeSignature(Account.Progress, Account.ResearchPoints);

    TArray<FString> SortedMissions = Account.FirstClearMissionIds;
    SortAndDedupe(SortedMissions);
    for (const FString& MissionId : SortedMissions)
    {
        Hash = HashToken(Hash, MissionId);
    }
    return Hash;
}
}
