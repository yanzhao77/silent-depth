#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeUnlockService.h"

/**
 * The repeatable headless gate for the opening-choice question (DEC-007).
 *
 * Replaying a fixed mission sequence and then researching with one documented
 * policy makes two things measurable the same way on every run: how many nodes
 * the shipped tier gate opens at zero progress, and what the economy buys with
 * a fixed set of mission scores. It answers "is the opening set meaningful?",
 * not "does it feel good" - the second question needs people, not a probe.
 */
namespace SDTechTree
{
    /** One step of the fixed sequence the probe replays. */
    struct FSDProbeMission
    {
        FString MissionId;
        int32 Score = 0;
    };

    /** What one deterministic run produced. */
    struct FSDProbeReport
    {
        /** Nodes the shipped rules open with no progress at all. */
        int32 OpeningNodes = 0;
        /** One entry per category, in ESDTechCategory order. */
        TArray<int32> OpeningPerCategory;
        int32 ResearchPointsAwarded = 0;
        int32 ResearchPointsSpent = 0;
        int32 ResearchPointsLeft = 0;
        /** Purchases in the order they were made. */
        TArray<FString> PurchasedNodeIds;
        int32 UnlockedNodes = 0;
        /** Fingerprint of the final account; two runs must agree. */
        uint64 AccountFingerprint = 0;
    };

    /**
     * Replays the missions and then researches: each round buys the cheapest
     * node the rules allow, ties broken by id. The policy belongs to the probe,
     * not to the game; it exists so the numbers are comparable run to run.
     */
    FSDProbeReport RunProgressionProbe(
        const FSDNodeRegistry& Registry,
        const FSDUnlockService& Unlock,
        const FSDResearchAccountService& Accounts,
        const TArray<FSDProbeMission>& Missions);

    /**
     * The five-mission sequence the probe uses by default. The scores are a
     * fixed, plausible progression (a mixed clear and failure record), not a
     * measurement of any real play session.
     */
    TArray<FSDProbeMission> DefaultProbeMissions();
}
