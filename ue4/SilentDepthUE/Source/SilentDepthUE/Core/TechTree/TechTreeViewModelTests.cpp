#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"
#include "Core/TechTree/TechTreeViewModel.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace ViewModelTests
{
bool HasErrorCode(const FSDTechTreeLoadReport& Report, const TCHAR* Code)
{
    for (const FSDDataError& Error : Report.Errors)
    {
        if (Error.Code.Equals(Code, ESearchCase::CaseSensitive))
        {
            return true;
        }
    }
    return false;
}

struct FViewModelStack
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    FSDEquipmentService Equipment;
    FSDTechTreeViewModel ViewModel;

    bool Build(FAutomationTestBase& Test)
    {
        FSDTechTreeLoadReport LoadReport;
        if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, LoadReport))
        {
            Test.AddError(TEXT("tech tree failed to load"));
            return false;
        }
        FSDResearchCostRule CostRule;
        FSDTierGateRule TierGate;
        FSDTechTreeLoadReport CostReport;
        if (!LoadResearchRules(FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, TierGate, CostReport))
        {
            Test.AddError(TEXT("research cost rule failed to load"));
            return false;
        }
        FSDTechTreeLoadReport RegistryReport;
        if (!Registry.Initialize(Tree, CostRule, RegistryReport))
        {
            Test.AddError(TEXT("registry failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport EquipmentReport;
        if (!Equipment.Initialize(Tree, EquipmentReport))
        {
            Test.AddError(TEXT("equipment service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport UnlockReport;
        if (!Unlock.Initialize(Registry, TierGate, UnlockReport))
        {
            Test.AddError(TEXT("unlock service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport AccountReport;
        if (!Accounts.Initialize(Unlock, AccountReport))
        {
            Test.AddError(TEXT("account service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport ViewReport;
        return ViewModel.Initialize(Registry, Unlock, Accounts, Equipment, ViewReport);
    }
};

const FSDCategoryTab* FindTab(const FSDTechTreeScreen& Screen, ESDTechCategory Category)
{
    for (const FSDCategoryTab& Tab : Screen.Tabs)
    {
        if (Tab.Category == Category)
        {
            return &Tab;
        }
    }
    return nullptr;
}
}
using namespace ViewModelTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ViewModelTabsSummarize,
    "SilentDepth.TechTree.ViewModel.TabsSummarizeCategories",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ViewModelTabsSummarize::RunTest(const FString& Parameters)
{
    FViewModelStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    const FSDResearchAccount Empty;
    FSDTechTreeScreen Screen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Weapon, Empty, Screen);

    TestEqual(TEXT("five tabs"), Screen.Tabs.Num(), 5);
    const ESDTechCategory ExpectedOrder[] = {
        ESDTechCategory::Submarine, ESDTechCategory::Weapon, ESDTechCategory::Sensor,
        ESDTechCategory::Defensive, ESDTechCategory::Propulsion
    };
    for (int32 Index = 0; Index < Screen.Tabs.Num() && Index < 5; ++Index)
    {
        TestEqual(*FString::Printf(TEXT("tab %d follows the enum order"), Index),
            static_cast<int32>(Screen.Tabs[Index].Category),
            static_cast<int32>(ExpectedOrder[Index]));
    }

    int32 TotalNodes = 0;
    int32 AvailableNodes = 0;
    int32 LockedNodes = 0;
    int32 UnlockedNodes = 0;
    for (const FSDCategoryTab& Tab : Screen.Tabs)
    {
        TotalNodes += Tab.TotalNodes;
        AvailableNodes += Tab.AvailableCount;
        LockedNodes += Tab.LockedCount;
        UnlockedNodes += Tab.UnlockedCount;
    }
    TestEqual(TEXT("tabs cover every node"), TotalNodes, Stack.Registry.Num());
    TestEqual(TEXT("an empty account has nothing researched"), UnlockedNodes, 0);
    TestEqual(TEXT("available plus locked is the whole tree"),
        AvailableNodes + LockedNodes, Stack.Registry.Num());

    // The shipped tier gate holds every category to its lowest non-empty tier,
    // and the weapon chain then holds its dependents back as well.
    const FSDCategoryTab* WeaponTab = FindTab(Screen, ESDTechCategory::Weapon);
    TestNotNull(TEXT("weapon tab exists"), WeaponTab);
    if (WeaponTab != nullptr)
    {
        TestEqual(TEXT("weapon nodes"), WeaponTab->TotalNodes, 124);
        TestEqual(TEXT("only the tier-1 root opens"), WeaponTab->AvailableCount, 1);
        TestEqual(TEXT("115 prerequisites plus 8 gated roots stay locked"), WeaponTab->LockedCount, 123);
    }
    const FSDCategoryTab* SensorTab = FindTab(Screen, ESDTechCategory::Sensor);
    TestNotNull(TEXT("sensor tab exists"), SensorTab);
    if (SensorTab != nullptr)
    {
        TestEqual(TEXT("sensor nodes"), SensorTab->TotalNodes, 150);
        TestEqual(TEXT("database-only sensors are counted"), SensorTab->DatabaseOnlyCount, 111);
        TestEqual(TEXT("sensors open one tier at a time"), SensorTab->AvailableCount, 13);
        TestEqual(TEXT("the rest of the sensor tree is tier locked"), SensorTab->LockedCount, 137);
    }

    // Research changes the roll-up.
    FSDResearchAccount Progressed;
    FSDMissionSettlement Settlement;
    Stack.Accounts.AwardMissionResult(Progressed, TEXT("M02"), 700, Settlement);
    FSDPurchaseOutcome Purchase;
    Stack.Accounts.TryPurchase(Progressed, TEXT("US_TORP_Mk14"), Purchase);
    FSDTechTreeScreen AfterPurchase;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Weapon, Progressed, AfterPurchase);
    const FSDCategoryTab* AfterTab = FindTab(AfterPurchase, ESDTechCategory::Weapon);
    TestNotNull(TEXT("weapon tab still exists"), AfterTab);
    if (AfterTab != nullptr)
    {
        TestEqual(TEXT("one node researched"), AfterTab->UnlockedCount, 1);
        TestEqual(TEXT("its dependent opened with it"), AfterTab->AvailableCount, 2);
        TestEqual(TEXT("one fewer waits on a prerequisite"), AfterTab->LockedCount, 121);
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ViewModelRowsMatchTheRules,
    "SilentDepth.TechTree.ViewModel.RowsMatchTheRules",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ViewModelRowsMatchTheRules::RunTest(const FString& Parameters)
{
    FViewModelStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    const FSDResearchAccount Empty;
    FSDTechTreeScreen Screen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Weapon, Empty, Screen);

    TestEqual(TEXT("every weapon has a row"), Screen.Rows.Num(), 124);
    TestEqual(TEXT("ten tier sections"), Screen.Tiers.Num(), 10);

    int32 TierTotal = 0;
    for (const FSDTierRow& TierRow : Screen.Tiers)
    {
        TierTotal += TierRow.NodeCount;
    }
    TestEqual(TEXT("tier sections cover every row"), TierTotal, Screen.Rows.Num());

    // Rows are ordered by (tier, id), so a tier section is always contiguous.
    bool bOrdered = true;
    for (int32 Index = 1; Index < Screen.Rows.Num(); ++Index)
    {
        const FSDNodeRow& Previous = Screen.Rows[Index - 1];
        const FSDNodeRow& Current = Screen.Rows[Index];
        if (static_cast<uint8>(Previous.Tier) > static_cast<uint8>(Current.Tier))
        {
            bOrdered = false;
            break;
        }
        if (Previous.Tier == Current.Tier
            && Previous.NodeId.Compare(Current.NodeId, ESearchCase::CaseSensitive) >= 0)
        {
            bOrdered = false;
            break;
        }
    }
    TestTrue(TEXT("rows are ordered by tier then id"), bOrdered);

    // Every row agrees with the services it is derived from.
    int32 Mismatches = 0;
    int32 NamedBlockers = 0;
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        if (Row.Cost != Stack.Unlock.GetCost(Row.NodeId))
        {
            ++Mismatches;
            continue;
        }
        ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
        FString BlockingNodeId;
        const ESDUnlockState State =
            Stack.Unlock.GetState(Empty.Progress, Row.NodeId, Blocker, BlockingNodeId);
        if (State == ESDUnlockState::PrerequisiteLocked)
        {
            if (Row.State != ESDNodeRowState::PrerequisiteLocked || Row.BlockingNodeId.IsEmpty())
            {
                ++Mismatches;
                continue;
            }
            ++NamedBlockers;
        }
        // No points were granted, so every available node is unaffordable.
        if (State == ESDUnlockState::Available && Row.State != ESDNodeRowState::Unaffordable)
        {
            ++Mismatches;
        }
    }
    TestEqual(TEXT("rows agree with the unlock rules"), Mismatches, 0);
    TestEqual(TEXT("every locked row names its blocker"), NamedBlockers, 115);

    // Granting points turns the same rows into affordable ones.
    FSDResearchAccount Rich;
    Stack.Accounts.GrantPoints(Rich, 1000);
    FSDTechTreeScreen RichScreen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Weapon, Rich, RichScreen);
    int32 Affordable = 0;
    for (const FSDNodeRow& Row : RichScreen.Rows)
    {
        if (Row.State == ESDNodeRowState::Available)
        {
            ++Affordable;
            TestTrue(TEXT("an available row is affordable"), Row.bAffordable);
        }
    }
    TestEqual(TEXT("the one open weapon root is affordable with 1000 points"), Affordable, 1);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ViewModelBadgesMatchData,
    "SilentDepth.TechTree.ViewModel.BadgesMatchData",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ViewModelBadgesMatchData::RunTest(const FString& Parameters)
{
    FViewModelStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    const FSDResearchAccount Empty;
    FSDTechTreeScreen Screen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Sensor, Empty, Screen);

    // Badges are derived from the node, so model and tree must agree for every
    // row rather than for one hand-picked example.
    int32 BadgeMismatches = 0;
    int32 DatabaseOnlyRows = 0;
    int32 UnknownEvidenceRows = 0;
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        const FSDTechNode* Node = Stack.Registry.Find(Row.NodeId);
        if (Node == nullptr)
        {
            ++BadgeMismatches;
            continue;
        }
        const bool bExpectDatabaseOnly = Node->bDatabaseOnly;
        const bool bExpectUnknownEvidence = Node->Evidence == ESDEvidenceLevel::Unknown;
        const bool bExpectNotVerified =
            !Node->bDatabaseOnly && Node->Production != ESDProductionStatus::Complete;
        if (Row.bDatabaseOnly != bExpectDatabaseOnly
            || Row.bEvidenceUnknown != bExpectUnknownEvidence
            || Row.bAssetNotVerified != bExpectNotVerified)
        {
            ++BadgeMismatches;
        }
        DatabaseOnlyRows += Row.bDatabaseOnly ? 1 : 0;
        UnknownEvidenceRows += Row.bEvidenceUnknown ? 1 : 0;
    }
    TestEqual(TEXT("every badge matches its node"), BadgeMismatches, 0);
    TestEqual(TEXT("database-only sensors are flagged"), DatabaseOnlyRows, 111);
    TestTrue(TEXT("some sensors carry unknown evidence"), UnknownEvidenceRows > 0);

    // The "unverified asset" badge only fires where the asset pipeline has not
    // reached COMPLETE. After DATA-003 the weapon catalogue is COMPLETE for all
    // 120 produced entries, so the badge belongs to the hulls: every submarine
    // is still PLANNED or VALIDATING.
    FSDTechTreeScreen SubmarineScreen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Submarine, Empty, SubmarineScreen);
    int32 NotVerifiedHulls = 0;
    for (const FSDNodeRow& Row : SubmarineScreen.Rows)
    {
        NotVerifiedHulls += Row.bAssetNotVerified ? 1 : 0;
    }
    TestEqual(TEXT("every submarine is still unverified"), NotVerifiedHulls, 54);

    // Weapons are the opposite case: produced and verified, so no badge.
    FSDTechTreeScreen WeaponScreen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Weapon, Empty, WeaponScreen);
    int32 NotVerifiedWeapons = 0;
    for (const FSDNodeRow& Row : WeaponScreen.Rows)
    {
        NotVerifiedWeapons += Row.bAssetNotVerified ? 1 : 0;
    }
    TestEqual(TEXT("no produced weapon is flagged as unverified"),
        NotVerifiedWeapons, 0);

    // A database-only row is data-only, so it must not also claim a missing
    // asset: there is nothing to verify.
    bool bDatabaseOnlyIsNotAssetFlagged = true;
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        if (Row.bDatabaseOnly && Row.bAssetNotVerified)
        {
            bDatabaseOnlyIsNotAssetFlagged = false;
            break;
        }
    }
    TestTrue(TEXT("database-only rows are not flagged as unverified assets"),
        bDatabaseOnlyIsNotAssetFlagged);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ViewModelDependenciesAndEquipment,
    "SilentDepth.TechTree.ViewModel.DependenciesAndEquipment",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ViewModelDependenciesAndEquipment::RunTest(const FString& Parameters)
{
    FViewModelStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // Dependency lists come from the registry and must stay symmetric.
    TArray<FString> Prerequisites;
    TArray<FString> Dependents;
    Stack.ViewModel.BuildDependencies(TEXT("US_TORP_Mk18"), Prerequisites, Dependents);
    TestEqual(TEXT("Mk18 waits on one node"), Prerequisites.Num(), 1);
    if (Prerequisites.Num() == 1)
    {
        TestEqual(TEXT("Mk18 waits on Mk14"), Prerequisites[0], FString(TEXT("US_TORP_Mk14")));
    }

    int32 Asymmetries = 0;
    for (const FSDTechNode* Node : Stack.Registry.All())
    {
        for (const FString& Prerequisite : Stack.Registry.GetPrerequisites(Node->Id))
        {
            if (!Stack.Registry.GetDependents(Prerequisite).Contains(Node->Id))
            {
                ++Asymmetries;
            }
        }
    }
    TestEqual(TEXT("every prerequisite edge has a reverse edge"), Asymmetries, 0);

    // Equipment rows are the matrix filtered by the policy.
    const FSDResearchAccount Account;
    TArray<FSDEquipmentRow> StrictRows;
    Stack.ViewModel.BuildEquipmentRows(
        TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), Account, ESDEquipPolicy::Strict, StrictRows);
    TestEqual(TEXT("four strict torpedoes"), StrictRows.Num(), 4);
    for (const FSDEquipmentRow& Row : StrictRows)
    {
        TestTrue(*FString::Printf(TEXT("%s is equippable"), *Row.CandidateId), Row.bEquippable);
        TestFalse(*FString::Printf(TEXT("%s is not gameplay-only"), *Row.CandidateId), Row.bGameplayOnly);
        TestTrue(*FString::Printf(TEXT("%s has a display name"), *Row.CandidateId), !Row.DisplayName.IsEmpty());
    }

    TArray<FSDEquipmentRow> GameplayRows;
    Stack.ViewModel.BuildEquipmentRows(
        TEXT("US_SSN_Virginia"), TEXT("TORPEDO"), Account, ESDEquipPolicy::AllowGameplay, GameplayRows);
    bool bSawGameplayOnly = false;
    for (const FSDEquipmentRow& Row : GameplayRows)
    {
        if (Row.bGameplayOnly)
        {
            bSawGameplayOnly = true;
            TestTrue(TEXT("a gameplay row is equippable under this policy"), Row.bEquippable);
        }
    }
    TestTrue(TEXT("the MOSS decoy shows as gameplay-only"), bSawGameplayOnly);

    // An uninitialised model renders nothing instead of guessing.
    {
        FSDTechTreeViewModel Cold;
        FSDTechTreeScreen EmptyScreen;
        Cold.BuildScreen(ESDTechCategory::Weapon, Account, EmptyScreen);
        TestEqual(TEXT("no tabs without a model"), EmptyScreen.Tabs.Num(), 0);
        TestEqual(TEXT("no rows without a model"), EmptyScreen.Rows.Num(), 0);

        FSDNodeRegistry Registry;
        FSDUnlockService Unlock;
        FSDResearchAccountService Accounts;
        FSDEquipmentService Equipment;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("missing services rejected"),
            Cold.Initialize(Registry, Unlock, Accounts, Equipment, Report));
        TestTrue(TEXT("guard reported"), HasErrorCode(Report, TEXT("NOT_INITIALIZED")));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
