#include "Core/TechTree/TechTreeProbe.h"

namespace SDTechTree
{
TArray<FSDProbeMission> DefaultProbeMissions()
{
    TArray<FSDProbeMission> Missions;
    Missions.Add(FSDProbeMission{ TEXT("M01"), 700 });
    Missions.Add(FSDProbeMission{ TEXT("M02"), 750 });
    Missions.Add(FSDProbeMission{ TEXT("M03"), 800 });
    Missions.Add(FSDProbeMission{ TEXT("M04"), 600 });
    Missions.Add(FSDProbeMission{ TEXT("M05"), 650 });
    return Missions;
}

FSDProbeReport RunProgressionProbe(
    const FSDNodeRegistry& Registry,
    const FSDUnlockService& Unlock,
    const FSDResearchAccountService& Accounts,
    const TArray<FSDProbeMission>& Missions)
{
    FSDProbeReport Report;
    Report.OpeningPerCategory.Init(0, static_cast<int32>(ESDTechCategory::Propulsion) + 1);

    if (!Registry.IsInitialized() || !Unlock.IsInitialized() || !Accounts.IsInitialized())
    {
        return Report;
    }

    // Opening set: the rules with no progress and no research points. This is
    // the number DEC-007 set to 22, counted rather than restated.
    FSDResearchAccount Account;
    for (const FSDTechNode* Node : Registry.All())
    {
        ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
        FString BlockingNodeId;
        if (Unlock.GetState(Account.Progress, Node->Id, Blocker, BlockingNodeId)
            == ESDUnlockState::Available)
        {
            ++Report.OpeningNodes;
            ++Report.OpeningPerCategory[static_cast<int32>(Node->Category)];
        }
    }

    // Missions settle exactly as the game settles them (DEC-004).
    for (const FSDProbeMission& Mission : Missions)
    {
        FSDMissionSettlement Settlement;
        if (Accounts.AwardMissionResult(Account, Mission.MissionId, Mission.Score, Settlement))
        {
            Report.ResearchPointsAwarded += Settlement.PointsAwarded;
        }
    }

    // Then research: cheapest first, ties by id, until nothing else fits.
    bool bBoughtSomething = true;
    while (bBoughtSomething)
    {
        bBoughtSomething = false;

        const FSDTechNode* Best = nullptr;
        int32 BestCost = 0;
        for (const FSDTechNode* Node : Registry.All())
        {
            FSDPurchaseOutcome Preview;
            Accounts.PreviewPurchase(Account, Node->Id, Preview);
            if (!Preview.Succeeded())
            {
                continue;
            }
            if (Best == nullptr || Preview.Cost < BestCost
                || (Preview.Cost == BestCost && Node->Id.Compare(Best->Id, ESearchCase::CaseSensitive) < 0))
            {
                Best = Node;
                BestCost = Preview.Cost;
            }
        }

        if (Best != nullptr)
        {
            FSDPurchaseOutcome Outcome;
            if (Accounts.TryPurchase(Account, Best->Id, Outcome) && Outcome.Succeeded())
            {
                Report.ResearchPointsSpent += Outcome.Cost;
                Report.PurchasedNodeIds.Add(Best->Id);
                bBoughtSomething = true;
            }
        }
    }

    Report.ResearchPointsLeft = Account.ResearchPoints;
    Report.UnlockedNodes = Account.Progress.UnlockedNodeIds.Num();
    Report.AccountFingerprint = Accounts.ComputeAccountSignature(Account);
    return Report;
}
}
