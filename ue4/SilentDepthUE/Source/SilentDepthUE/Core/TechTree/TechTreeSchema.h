#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeTypes.h"

/**
 * Canonical tokens, fail-closed parsers and policies for the unified
 * tech-tree schema (DATA-001).
 *
 * ToString() emits the exact token the asset library writes, so a caller can
 * round-trip a value through text without inventing a second vocabulary.
 * ParseX() accepts only those tokens (case-insensitive) and leaves the output
 * untouched on failure; a caller must treat `false` as a load error.
 */
namespace SDTechTree
{
    const TCHAR* ToString(ESDTechCategory Value);
    const TCHAR* ToString(ESDTechTier Value);
    const TCHAR* ToString(ESDProductionStatus Value);
    const TCHAR* ToString(ESDServiceStatus Value);
    const TCHAR* ToString(ESDCompatibility Value);
    const TCHAR* ToString(ESDEvidenceLevel Value);
    const TCHAR* ToString(ESDVerificationLevel Value);
    const TCHAR* ToString(ESDPriority Value);
    const TCHAR* ToString(ESDAssetCoverage Value);
    const TCHAR* ToString(ESDSourceKind Value);

    bool ParseCategory(const FString& Token, ESDTechCategory& Out);
    /** Accepts "T3" and "3" (the two encodings used by the source data). */
    bool ParseTier(const FString& Token, ESDTechTier& Out);
    bool ParseProductionStatus(const FString& Token, ESDProductionStatus& Out);
    bool ParseServiceStatus(const FString& Token, ESDServiceStatus& Out);
    bool ParseCompatibility(const FString& Token, ESDCompatibility& Out);
    bool ParseEvidenceLevel(const FString& Token, ESDEvidenceLevel& Out);
    bool ParseVerificationLevel(const FString& Token, ESDVerificationLevel& Out);
    bool ParsePriority(const FString& Token, ESDPriority& Out);
    bool ParseAssetCoverage(const FString& Token, ESDAssetCoverage& Out);
    bool ParseSourceKind(const FString& Token, ESDSourceKind& Out);

    /** 1-based tier index to enum, rejecting anything outside T1..T10. */
    bool TierFromOneBasedInt(int32 OneBasedTier, ESDTechTier& Out);
    int32 TierToIndex(ESDTechTier Tier);

    /**
     * TECH-005 compatibility gate. `Unknown` and `Incompatible` are never
     * equippable; `Gameplay` requires the explicit AllowGameplay policy
     * (DEC-005 is still open, so this is never a hidden default).
     */
    bool IsEquippable(ESDCompatibility Relation, ESDEquipPolicy Policy);

    /** Per-category admitted evidence vocabulary, measured from the data. */
    bool IsEvidenceAllowedFor(ESDTechCategory Category, ESDEvidenceLevel Value);

    /**
     * Per-category admitted asset pipeline states. A token that is valid in
     * one tree but appears in another is a data defect, not a new state.
     */
    bool IsProductionStatusAllowedFor(ESDTechCategory Category, ESDProductionStatus Value);

    /** False only for DatabaseOnly and Unknown: everything else is in scope. */
    bool IsAssetBacked(ESDProductionStatus Value);
    bool IsDatabaseOnlyStatus(ESDProductionStatus Value);

    /**
     * DEC-004 research economy. The numbers are data, not code: TECH-004 must
     * populate this from the balance configuration and fail closed when it is
     * missing. The struct default is deliberately invalid so that a forgotten
     * load cannot silently produce a zero-cost tree.
     */
    struct FSDResearchCostRule
    {
        int32 PointsPerTier = 0;
        int32 FirstClearBonus = 0;
        int32 ScoreDivisor = 0;
        int32 MinimumScoreForReward = 0;

        bool IsValid() const
        {
            return PointsPerTier > 0 && FirstClearBonus >= 0
                && ScoreDivisor > 0 && MinimumScoreForReward > 0;
        }
    };

    int32 CostForTier(const FSDResearchCostRule& Rule, ESDTechTier Tier);
    int32 PointsForMissionResult(const FSDResearchCostRule& Rule, int32 Score, bool bFirstClear);

    /**
     * Optional tier gate for the trees that carry no explicit prerequisite
     * edges: a node needs N nodes of its own category researched in the nearest
     * lower *non-empty* tier before it opens.
     *
     * The "non-empty" part is not a detail: the submarine tree starts at T2, so
     * a literal "previous tier" rule would leave every hull unreachable. The
     * requirement is also clamped to that tier's size, so no configuration can
     * deadlock a tree.
     *
     * 0 disables the gate, which is the shipped default: the effect on the
     * opening position is a balance decision, not an engineering one.
     */
    struct FSDTierGateRule
    {
        int32 RequiredUnlockedInPreviousTier = 0;

        bool IsEnabled() const { return RequiredUnlockedInPreviousTier > 0; }
    };

    /**
     * True when the tier gate blocks this node. `UnlockedInLowerTier` is the
     * number of researched nodes the caller counted in the node's nearest lower
     * non-empty tier, and `NodesInLowerTier` is that tier's size. A configuration
     * asking for more than the tier holds is clamped rather than deadlocked.
     */
    bool IsTierGateBlocking(
        const FSDTierGateRule& Rule,
        int32 UnlockedInLowerTier,
        int32 NodesInLowerTier,
        bool bHasLowerTier);

    /**
     * FNV-1a, 64-bit, over a string's UTF-16 code units. Pure and address
     * independent, so a fingerprint computed in two runs (or two machines with
     * the same build) matches. Used by the state and account signatures.
     */
    uint64 HashToken(uint64 Seed, const FString& Token);

    /**
     * Checks the invariants that do not depend on the source file layout:
     * schema version, non-empty unique node ids, and prerequisite ids that
     * resolve inside the same tree.
     *
     * Membership is looked up through a set (lookup only, never iteration),
     * so validation does not depend on SortDeterministically() having run and
     * cannot be perturbed by container ordering.
     *
     * Cross-tree reference integrity — whether the 54 submarines reference
     * weapons, sensors, defensive systems and propulsors that exist — is
     * DATA-005 and is deliberately not duplicated here.
     */
    bool ValidateTreeInvariants(const FSDTechTree& Tree, FSDTechTreeLoadReport& Report);
}
