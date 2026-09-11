#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Core/TechTree/TechTreeUnlockService.h"

/**
 * Research wallet and purchase transactions (TECH-004).
 *
 * The account is save data: a point balance, the researched nodes and the
 * missions whose first-clear bonus has already been paid. The service is a
 * rule module bound to an unlock service (TECH-003), which supplies the
 * structural rules and the DEC-004 cost rule.
 *
 * Atomicity: every mutating call builds the candidate account, checks all of
 * its preconditions, and only then assigns the result in one step. A rejected
 * purchase, an unaffordable node, a repeated purchase or a failed settlement
 * leaves the caller's account bit-for-bit unchanged, which the tests assert
 * through the account signature.
 *
 * Determinism: no actor, no world, no frame delta, no wall clock and no
 * randomness. Mission ids and scores arrive as explicit inputs.
 */
namespace SDTechTree
{
    /** Points, researched nodes and first-clear bookkeeping. */
    struct FSDResearchAccount
    {
        int32 ResearchPoints = 0;
        FSDUnlockProgress Progress;
        /** Mission ids whose first-clear bonus has been paid, kept sorted. */
        TArray<FString> FirstClearMissionIds;
    };

    /** Why a purchase did or did not happen. */
    enum class ESDPurchaseResult : uint8
    {
        Purchased,
        NotInitialized,
        UnknownNode,
        /** Already researched; nothing is charged. */
        AlreadyUnlocked,
        PrerequisiteLocked,
        Excluded,
        /** The tier gate wants more research in the tier below. */
        TierLocked,
        InsufficientPoints
    };

    /** Full outcome of a purchase attempt, successful or not. */
    struct FSDPurchaseOutcome
    {
        ESDPurchaseResult Result = ESDPurchaseResult::NotInitialized;
        FString NodeId;
        int32 Cost = 0;
        int32 PointsBefore = 0;
        int32 PointsAfter = 0;
        /** The missing prerequisite or unlocked rival, when there is one. */
        FString BlockingNodeId;

        bool Succeeded() const { return Result == ESDPurchaseResult::Purchased; }
    };

    /** Outcome of a mission settlement (DEC-004). */
    struct FSDMissionSettlement
    {
        bool bAwarded = false;
        int32 Score = 0;
        int32 PointsAwarded = 0;
        bool bFirstClearBonus = false;
        int32 PointsBefore = 0;
        int32 PointsAfter = 0;
    };

    class FSDResearchAccountService
    {
    public:
        /** Binds to the unlock service, which must outlive this service. */
        bool Initialize(const FSDUnlockService& InUnlockService, FSDTechTreeLoadReport& Report);

        bool IsInitialized() const { return bInitialized; }

        /** Registry behind the unlock service, or nullptr when uninitialised. */
        const FSDNodeRegistry* GetRegistry() const;

        /**
         * Researches a node and charges its DEC-004 cost, or changes nothing.
         * Structural rules are checked before the balance, so a locked node
         * reports its prerequisite rather than its price.
         */
        bool TryPurchase(
            FSDResearchAccount& InOutAccount,
            const FString& NodeId,
            FSDPurchaseOutcome& OutOutcome) const;

        /** Same checks without committing anything. */
        void PreviewPurchase(
            const FSDResearchAccount& Account,
            const FString& NodeId,
            FSDPurchaseOutcome& OutOutcome) const;

        /**
         * DEC-004 settlement: score / ScoreDivisor, plus the first-clear bonus
         * the first time a mission id is completed. A score below
         * MinimumScoreForReward pays nothing and records no first clear.
         */
        bool AwardMissionResult(
            FSDResearchAccount& InOutAccount,
            const FString& MissionId,
            int32 Score,
            FSDMissionSettlement& OutSettlement) const;

        /** Grants points directly; used by tests and by future reward sources. */
        void GrantPoints(FSDResearchAccount& InOutAccount, int32 Points) const;

        /** Rejects a corrupted account: negative balance, unknown ids, duplicates. */
        bool ValidateAccount(
            const FSDResearchAccount& Account,
            FSDTechTreeLoadReport& Report) const;

        bool IsUnlocked(const FSDResearchAccount& Account, const FString& NodeId) const;
        int32 GetBalance(const FSDResearchAccount& Account) const { return Account.ResearchPoints; }

        int32 GetCost(const FString& NodeId) const;

        /**
         * Stable fingerprint of the whole account: node states, balance and
         * first-clear set. Save migration and replay tests compare it.
         */
        uint64 ComputeAccountSignature(const FSDResearchAccount& Account) const;

    private:
        const FSDUnlockService* UnlockService = nullptr;
        bool bInitialized = false;
    };
}
