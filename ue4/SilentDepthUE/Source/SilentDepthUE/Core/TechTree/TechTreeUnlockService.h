#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

/**
 * Deterministic unlock rules (TECH-003).
 *
 * The service answers "what is the research state of every node, given which
 * nodes are already unlocked and how many research points are on hand". It is a
 * pure rule module: no actor, no world, no frame delta, no wall clock, no
 * randomness and no hidden state. The same progress and the same point balance
 * always produce the same evaluation, in the same order, with the same
 * signature.
 *
 * Scope boundary: the wallet lives in TECH-004. Research points arrive here as
 * an input parameter, this service never spends them, and FSDUnlockProgress
 * stores structure only. TECH-004 composes CanAfford() and ApplyUnlock() inside
 * its atomic purchase transaction.
 */
namespace SDTechTree
{
    /** Research state of one node. */
    enum class ESDUnlockState : uint8
    {
        /** Researched. */
        Unlocked,
        /** Every prerequisite is unlocked and nothing excludes it. */
        Available,
        /** At least one prerequisite is still locked. */
        PrerequisiteLocked,
        /** An unlocked node in the same exclusion group blocks it. */
        Excluded,
        /** The tier gate wants more researched nodes in the tier below. */
        TierLocked,
        /** The id is not in the registry. */
        Unknown
    };

    /** Why a node cannot be unlocked. */
    enum class ESDUnlockBlocker : uint8
    {
        None,
        UnknownNode,
        AlreadyUnlocked,
        PrerequisiteLocked,
        Excluded,
        TierLocked,
        InsufficientPoints,
        NotInitialized
    };

    /** One row of an evaluation. Rows are emitted in registry id order. */
    struct FSDNodeStatus
    {
        FString NodeId;
        ESDUnlockState State = ESDUnlockState::Unknown;
        ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
        /** The prerequisite or unlocked rival behind the blocker, when there is one. */
        FString BlockingNodeId;
        int32 Cost = 0;
        bool bAffordable = false;
    };

    /** Which nodes are researched. Structure only; no wallet, no counters. */
    struct FSDUnlockProgress
    {
        TArray<FString> UnlockedNodeIds;
    };

    class FSDUnlockService
    {
    public:
        /**
         * Binds to a registry. The registry must outlive the service and must
         * not be re-initialised afterwards.
         */
        bool Initialize(const FSDNodeRegistry& InRegistry, FSDTechTreeLoadReport& Report);

        /** Binds with an explicit tier gate. A disabled gate keeps current rules. */
        bool Initialize(
            const FSDNodeRegistry& InRegistry,
            const FSDTierGateRule& InTierGate,
            FSDTechTreeLoadReport& Report);

        bool IsInitialized() const { return bInitialized; }

        /** The registry this service is bound to, or nullptr when uninitialised. */
        const FSDNodeRegistry* GetRegistry() const { return Registry; }

        /** Sorts and de-duplicates the unlocked list in place. */
        static void NormalizeProgress(FSDUnlockProgress& InOut);

        /**
         * Reports every id that is not in the registry. Ids are never dropped
         * silently: SAVE-002 uses this to reject a corrupted save.
         */
        bool ValidateProgress(
            const FSDUnlockProgress& Progress,
            FSDTechTreeLoadReport& Report) const;

        /**
         * State of one node. OutBlockingNodeId names the prerequisite or the
         * unlocked rival when the node is blocked.
         */
        ESDUnlockState GetState(
            const FSDUnlockProgress& Progress,
            const FString& NodeId,
            ESDUnlockBlocker& OutBlocker,
            FString& OutBlockingNodeId) const;

        /**
         * Full evaluation, one row per registry node, in registry id order.
         * ResearchPoints only feeds the affordability flag.
         */
        void EvaluateAll(
            const FSDUnlockProgress& Progress,
            int32 ResearchPoints,
            TArray<FSDNodeStatus>& OutStatuses) const;

        /** DEC-004 cost of a node, 0 when the id is unknown. */
        int32 GetCost(const FString& NodeId) const;

        /** Pure affordability predicate; never spends. */
        bool CanAfford(const FString& NodeId, int32 ResearchPoints) const;

        /**
         * Structural unlock: copies Progress, adds the node, returns the sorted
         * result. It deliberately does not touch research points — TECH-004
         * charges for the purchase and commits both changes together.
         *
         * On failure OutProgress is left equal to the input.
         */
        bool ApplyUnlock(
            const FSDUnlockProgress& Progress,
            const FString& NodeId,
            FSDUnlockProgress& OutProgress,
            ESDUnlockBlocker& OutBlocker) const;

        /**
         * Stable FNV-1a fingerprint of a full evaluation. Two runs over the
         * same inputs must produce the same value; saves, replays and tests use
         * it to detect drift.
         */
        uint64 ComputeSignature(const FSDUnlockProgress& Progress, int32 ResearchPoints) const;

    private:
        /**
         * Counts the researched nodes in the node's nearest lower non-empty
         * tier of the same category. Sets bOutHasLowerTier false when the node
         * already sits in its category's lowest non-empty tier.
         */
        int32 CountLowerTierProgress(
            const FSDTechNode& Node,
            const TSet<FString>& Unlocked,
            bool& bOutHasLowerTier,
            int32& OutNodesInLowerTier) const;

        const FSDNodeRegistry* Registry = nullptr;
        FSDTierGateRule TierGate;
        bool bInitialized = false;
    };
}
