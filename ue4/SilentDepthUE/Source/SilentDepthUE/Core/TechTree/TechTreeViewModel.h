#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Core/TechTree/TechTreeUnlockService.h"

/**
 * Presentation model for the technology-tree screens (UI-001 / UI-002).
 *
 * This is the layer the UMG widgets read: it turns the registry, the unlock
 * state and the compatibility matrix into exactly the rows a screen needs, with
 * the state and the caveat badges already resolved. Keeping it in plain C++
 * means the display rules are testable without a widget, a world or a frame.
 *
 * Display rules decided here, not in the widget:
 *  - Tabs follow the category enum order, so the five entries never reorder.
 *  - Rows are ordered by (tier, id) and a tier section is always contiguous.
 *  - A node's primary state comes from the unlock service, so "unlocked",
 *    "available", "prerequisite locked" and "excluded" always agree with the
 *    rules that actually gate research.
 *  - Caveats are separate badges, because they are orthogonal to state: a node
 *    can be available and still be DATABASE_ONLY.
 *  - Nothing is invented to fill a gap: a missing asset or an unknown evidence
 *    level shows as a badge rather than a plausible-looking value.
 */
namespace SDTechTree
{
    /** Primary research state of a row. Mirrors ESDUnlockState one-to-one. */
    enum class ESDNodeRowState : uint8
    {
        Unlocked,
        Available,
        Unaffordable,
        PrerequisiteLocked,
        Excluded,
        /** The tier gate needs more research in the tier below. */
        TierLocked,
        UnknownNode
    };

    /** One row of the tree screen. */
    struct FSDNodeRow
    {
        FString NodeId;
        ESDTechCategory Category = ESDTechCategory::Submarine;
        ESDTechTier Tier = ESDTechTier::T1;

        FString DisplayName;
        FString DisplayNameZh;
        FString ShortName;
        FString Country;
        FString Era;
        FString RoleText;

        ESDNodeRowState State = ESDNodeRowState::UnknownNode;
        FString BlockingNodeId;
        int32 Cost = 0;
        bool bAffordable = false;

        ESDProductionStatus Production = ESDProductionStatus::Unknown;
        ESDEvidenceLevel Evidence = ESDEvidenceLevel::Unknown;
        /** DEC-001: data only, no engineering model is planned. */
        bool bDatabaseOnly = false;
        /** The evidence level is unknown, so nothing may be presented as fact. */
        bool bEvidenceUnknown = false;
        /** Geometry exists but has not passed verification. */
        bool bAssetNotVerified = false;

        TArray<FString> PrerequisiteNodeIds;
        TArray<FString> DependentNodeIds;
        TArray<FString> SocketNames;
    };

    /** One tier section header. */
    struct FSDTierRow
    {
        ESDTechTier Tier = ESDTechTier::T1;
        FString LabelEn;
        FString LabelZh;
        FString Description;
        int32 NodeCount = 0;
        int32 UnlockedCount = 0;
    };

    /** One category tab with its roll-up counters. */
    struct FSDCategoryTab
    {
        ESDTechCategory Category = ESDTechCategory::Submarine;
        int32 TotalNodes = 0;
        int32 UnlockedCount = 0;
        int32 AvailableCount = 0;
        int32 LockedCount = 0;
        int32 DatabaseOnlyCount = 0;
    };

    /** A whole screen: tabs for every category plus the selected one's rows. */
    struct FSDTechTreeScreen
    {
        ESDTechCategory SelectedCategory = ESDTechCategory::Submarine;
        int32 ResearchPoints = 0;
        TArray<FSDCategoryTab> Tabs;
        TArray<FSDTierRow> Tiers;
        TArray<FSDNodeRow> Rows;
    };

    /** One equippable candidate in the loadout screen. */
    struct FSDEquipmentRow
    {
        FString CandidateId;
        FString DisplayName;
        ESDCompatibility Compatibility = ESDCompatibility::Unknown;
        bool bEquippable = false;
        /** Only a gameplay assignment allows this, so the UI must label it. */
        bool bGameplayOnly = false;
        int32 Cost = 0;
        bool bUnlocked = false;
    };

    class FSDTechTreeViewModel
    {
    public:
        bool Initialize(
            const FSDNodeRegistry& InRegistry,
            const FSDUnlockService& InUnlockService,
            const FSDResearchAccountService& InAccounts,
            const FSDEquipmentService& InEquipment,
            FSDTechTreeLoadReport& Report);

        bool IsInitialized() const { return bInitialized; }

        /** Fills tabs for all five categories and the rows of one of them. */
        void BuildScreen(
            ESDTechCategory SelectedCategory,
            const FSDResearchAccount& Account,
            FSDTechTreeScreen& OutScreen) const;

        /** Rows of a single tier, in id order. */
        void BuildTierRows(
            ESDTechCategory Category,
            ESDTechTier Tier,
            const FSDResearchAccount& Account,
            TArray<FSDNodeRow>& OutRows) const;

        /**
         * Ids a node waits on and ids it unlocks, in id order. Both lists are
         * empty when the node has no edges.
         */
        void BuildDependencies(
            const FString& NodeId,
            TArray<FString>& OutPrerequisiteIds,
            TArray<FString>& OutDependentIds) const;

        /** Candidates for one slot, filtered by the policy and cost-annotated. */
        void BuildEquipmentRows(
            const FString& PlatformId,
            const FString& SlotName,
            const FSDResearchAccount& Account,
            ESDEquipPolicy Policy,
            TArray<FSDEquipmentRow>& OutRows) const;

        /** The equipment index this model was built with. */
        const FSDEquipmentService& GetEquipment() const { return *Equipment; }

    private:
        /** Unlock state plus affordability to the row state the UI shows. */
        static ESDNodeRowState TranslateState(ESDUnlockState State, bool bAffordable);

        FSDNodeRow MakeRow(const FSDTechNode& Node, const FSDResearchAccount& Account) const;
        FSDTierRow MakeTierRow(ESDTechCategory Category, const FSDTierDefinition& Definition) const;

        const FSDNodeRegistry* Registry = nullptr;
        const FSDUnlockService* UnlockService = nullptr;
        const FSDResearchAccountService* Accounts = nullptr;
        const FSDEquipmentService* Equipment = nullptr;
        bool bInitialized = false;
    };
}
