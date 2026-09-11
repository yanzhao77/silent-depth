#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

/**
 * Equipment compatibility queries (TECH-005).
 *
 * Read-only index over FSDTechTree::Compatibility and ::Slots. It answers the
 * only question the fitting UI and the save validator need: may this candidate
 * go on this platform in this slot?
 *
 * The rules are exactly the ones DEC-005 asked for:
 *  - Only combinations the matrix allows are allowed. A pair with no row is
 *    Unknown and is never treated as compatible.
 *  - Confirmed and Probable pass the strict policy.
 *  - Gameplay assignments are a deliberate, explicit opt-in: they need
 *    ESDEquipPolicy::AllowGameplay and are reported as gameplay-derived so the
 *    UI can label them.
 *  - Incompatible and Unknown never pass, under any policy.
 *
 * Lifetime: the service borrows the tree, so the tree must outlive it and must
 * not be moved afterwards.
 */
namespace SDTechTree
{
    class FSDEquipmentService
    {
    public:
        bool Initialize(const FSDTechTree& InTree, FSDTechTreeLoadReport& Report);

        bool IsInitialized() const { return bInitialized; }

        /** Borrowed tree. Only valid while IsInitialized() is true. */
        const FSDTechTree& GetTree() const { return *Tree; }

        int32 NumRecords() const;
        int32 NumSlots() const;

        /** Matrix relation for a pair, ignoring the slot. Unknown when absent. */
        ESDCompatibility GetCompatibility(
            const FString& PlatformId,
            const FString& CandidateId) const;

        /**
         * Matrix relation for one slot. When SlotName is empty the query
         * ignores the slot, which matches how the propulsion matrix is stored.
         */
        ESDCompatibility GetCompatibilityInSlot(
            const FString& PlatformId,
            const FString& SlotName,
            const FString& CandidateId) const;

        /** True only when the matrix allows the pair under the given policy. */
        bool IsEquippable(
            const FString& PlatformId,
            const FString& CandidateId,
            ESDEquipPolicy Policy) const;

        /** Slot-aware variant used by the fitting UI. */
        bool IsEquippableInSlot(
            const FString& PlatformId,
            const FString& SlotName,
            const FString& CandidateId,
            ESDEquipPolicy Policy) const;

        /**
         * True when the pair's relation is a gameplay assignment, so the UI can
         * mark it as not backed by public sources.
         */
        bool IsGameplayAssignment(
            const FString& PlatformId,
            const FString& CandidateId) const;

        /**
         * True when the matrix records a relation whose candidate asset has not
         * been produced. The claim is real and may be displayed, but nothing
         * can be fitted, so this pair never appears as a candidate.
         */
        bool IsAssetPending(
            const FString& PlatformId,
            const FString& CandidateId) const;

        /** The full record, or nullptr. SlotName may be empty for a wildcard. */
        const FSDCompatibilityRecord* FindRecord(
            const FString& PlatformId,
            const FString& SlotName,
            const FString& CandidateId) const;

        /** Slots defined for a platform, in slot-name order. */
        void CollectSlots(const FString& PlatformId, TArray<const FSDEquipmentSlot*>& OutSlots) const;

        /**
         * Candidates the matrix allows in a slot under the policy, sorted by id.
         * A candidate that only appears with another slot is not returned.
         */
        void CollectCandidates(
            const FString& PlatformId,
            const FString& SlotName,
            ESDEquipPolicy Policy,
            TArray<FString>& OutCandidateIds) const;

    private:
        const FSDTechTree* Tree = nullptr;
        /** Indices into Tree->Compatibility, keyed by platform id. Lookup only. */
        TMap<FString, TArray<int32>> RecordsByPlatform;
        /** Indices into Tree->Slots, keyed by platform id. Lookup only. */
        TMap<FString, TArray<int32>> SlotsByPlatform;
        bool bInitialized = false;
    };
}
