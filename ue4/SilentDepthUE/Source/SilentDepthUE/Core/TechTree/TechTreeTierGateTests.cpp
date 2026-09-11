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

namespace TierGateTests
{
struct FGatedStack
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    FSDEquipmentService Equipment;
    FSDTierGateRule Gate;

    bool Build(FAutomationTestBase& Test, int32 GateValue)
    {
        FSDTechTreeLoadReport LoadReport;
        if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, LoadReport))
        {
            Test.AddError(TEXT("tech tree failed to load"));
            return false;
        }
        FSDResearchCostRule CostRule;
        FSDTechTreeLoadReport RuleReport;
        if (!LoadResearchRules(
            FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, Gate, RuleReport))
        {
            Test.AddError(TEXT("research rules failed to load"));
            return false;
        }
        Gate.RequiredUnlockedInPreviousTier = GateValue;

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
        if (!Unlock.Initialize(Registry, Gate, UnlockReport))
        {
            Test.AddError(TEXT("unlock service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport AccountReport;
        return Accounts.Initialize(Unlock, AccountReport);
    }
};

/** Lowest tier in the category that holds at least one node. */
bool LowestNonEmptyTier(const FSDNodeRegistry& Registry, ESDTechCategory Category, ESDTechTier& OutTier)
{
    for (int32 TierIndex = SDTechTree::MinTier; TierIndex <= SDTechTree::MaxTier; ++TierIndex)
    {
        TArray<const FSDTechNode*> Nodes;
        Registry.CollectByTier(Category, static_cast<ESDTechTier>(TierIndex), Nodes);
        if (Nodes.Num() > 0)
        {
            OutTier = static_cast<ESDTechTier>(TierIndex);
            return true;
        }
    }
    return false;
}

int32 CountAvailableInCategory(
    const TArray<FSDNodeStatus>& Statuses,
    ESDTechCategory Category,
    const FSDNodeRegistry& Registry)
{
    int32 Count = 0;
    for (const FSDNodeStatus& Status : Statuses)
    {
        const FSDTechNode* Node = Registry.Find(Status.NodeId);
        if (Node != nullptr && Node->Category == Category && Status.State == ESDUnlockState::Available)
        {
            ++Count;
        }
    }
    return Count;
}
}
using namespace TierGateTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TierGateShippedConfig,
    "SilentDepth.TechTree.TierGate.ShippedConfigMatchesDecision",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TierGateShippedConfig::RunTest(const FString& Parameters)
{
    // DEC-007 chose one node of the tier below. The gate changes the opening
    // position, so the shipped value is pinned: changing it is a balance
    // decision, not an edit someone should make by accident.
    FSDResearchCostRule CostRule;
    FSDTierGateRule Gate;
    FSDTechTreeLoadReport Report;
    TestTrue(TEXT("research rules load"),
        LoadResearchRules(FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, Gate, Report));
    TestEqual(TEXT("shipped tier gate is DEC-007's value"),
        Gate.RequiredUnlockedInPreviousTier, 1);
    TestTrue(TEXT("gate reports enabled"), Gate.IsEnabled());
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TierGateOpensOnlyTheLowestTier,
    "SilentDepth.TechTree.TierGate.OpensOnlyTheLowestNonEmptyTier",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TierGateOpensOnlyTheLowestTier::RunTest(const FString& Parameters)
{
    FGatedStack Stack;
    if (!Stack.Build(*this, 1))
    {
        return false;
    }

    const FSDResearchAccount Empty;
    TArray<FSDNodeStatus> Statuses;
    Stack.Unlock.EvaluateAll(Empty.Progress, 0, Statuses);
    TestEqual(TEXT("one row per node"), Statuses.Num(), Stack.Registry.Num());

    // Every available node must sit in its category's lowest non-empty tier.
    int32 OutOfTier = 0;
    for (const FSDNodeStatus& Status : Statuses)
    {
        if (Status.State != ESDUnlockState::Available)
        {
            continue;
        }
        const FSDTechNode* Node = Stack.Registry.Find(Status.NodeId);
        ESDTechTier Lowest = ESDTechTier::T1;
        if (Node == nullptr || !LowestNonEmptyTier(Stack.Registry, Node->Category, Lowest)
            || Node->Tier != Lowest)
        {
            ++OutOfTier;
        }
    }
    TestEqual(TEXT("no node above the lowest tier is open"), OutOfTier, 0);

    // Report the effect of enabling the gate, per category.
    const ESDTechCategory Categories[] = {
        ESDTechCategory::Submarine, ESDTechCategory::Weapon, ESDTechCategory::Sensor,
        ESDTechCategory::Defensive, ESDTechCategory::Propulsion
    };
    int32 TotalAvailable = 0;
    for (const ESDTechCategory Category : Categories)
    {
        TArray<const FSDTechNode*> All;
        Stack.Registry.CollectByCategory(Category, All);
        const int32 Available = CountAvailableInCategory(Statuses, Category, Stack.Registry);
        TotalAvailable += Available;
        AddInfo(FString::Printf(TEXT("gate=1 category %d: %d of %d nodes open"),
            static_cast<int32>(Category), Available, All.Num()));
    }
    AddInfo(FString::Printf(TEXT("gate=1 total open from zero progress: %d of %d"),
        TotalAvailable, Stack.Registry.Num()));
    TestTrue(TEXT("the gate closes most of the tree"), TotalAvailable < Stack.Registry.Num() / 4);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TierGateSubmarineHasNoDeadlock,
    "SilentDepth.TechTree.TierGate.SubmarineTreeStaysReachable",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TierGateSubmarineHasNoDeadlock::RunTest(const FString& Parameters)
{
    FGatedStack Stack;
    if (!Stack.Build(*this, 1))
    {
        return false;
    }

    // The submarine catalogue has no T1 entry at all. A literal "previous tier"
    // rule would leave every hull permanently unreachable; the gate skips empty
    // tiers instead.
    TArray<const FSDTechNode*> TierOneHulls;
    Stack.Registry.CollectByTier(ESDTechCategory::Submarine, ESDTechTier::T1, TierOneHulls);
    TestEqual(TEXT("the submarine tree really has no tier 1"), TierOneHulls.Num(), 0);

    TArray<const FSDTechNode*> TierTwoHulls;
    Stack.Registry.CollectByTier(ESDTechCategory::Submarine, ESDTechTier::T2, TierTwoHulls);
    TestEqual(TEXT("tier 2 holds five hulls"), TierTwoHulls.Num(), 5);

    const FSDResearchAccount Empty;
    for (const FSDTechNode* Hull : TierTwoHulls)
    {
        ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
        FString BlockingNodeId;
        TestEqual(*FString::Printf(TEXT("%s is open"), *Hull->Id),
            static_cast<int32>(Stack.Unlock.GetState(Empty.Progress, Hull->Id, Blocker, BlockingNodeId)),
            static_cast<int32>(ESDUnlockState::Available));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TierGateOpensNextTierOnResearch,
    "SilentDepth.TechTree.TierGate.ResearchOpensTheNextTier",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TierGateOpensNextTierOnResearch::RunTest(const FString& Parameters)
{
    FGatedStack Stack;
    if (!Stack.Build(*this, 1))
    {
        return false;
    }

    TArray<const FSDTechNode*> TierOneSensors;
    Stack.Registry.CollectByTier(ESDTechCategory::Sensor, ESDTechTier::T1, TierOneSensors);
    TArray<const FSDTechNode*> TierTwoSensors;
    Stack.Registry.CollectByTier(ESDTechCategory::Sensor, ESDTechTier::T2, TierTwoSensors);
    TestTrue(TEXT("sensors exist in both tiers"), TierOneSensors.Num() > 0 && TierTwoSensors.Num() > 0);

    FSDResearchAccount Account;
    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;
    TestEqual(TEXT("tier 2 starts locked"),
        static_cast<int32>(Stack.Unlock.GetState(Account.Progress, TierTwoSensors[0]->Id, Blocker, BlockingNodeId)),
        static_cast<int32>(ESDUnlockState::TierLocked));

    // Research one tier-1 sensor: the next tier opens for the whole category.
    Stack.Accounts.GrantPoints(Account, 1000);
    FSDPurchaseOutcome Purchase;
    TestTrue(TEXT("tier 1 purchase succeeds"),
        Stack.Accounts.TryPurchase(Account, TierOneSensors[0]->Id, Purchase));
    TestEqual(TEXT("tier 2 is open after one tier-1 node"),
        static_cast<int32>(Stack.Unlock.GetState(Account.Progress, TierTwoSensors[0]->Id, Blocker, BlockingNodeId)),
        static_cast<int32>(ESDUnlockState::Available));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TierGateClampsAndBlocksPurchases,
    "SilentDepth.TechTree.TierGate.ClampsAndBlocksPurchases",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TierGateClampsAndBlocksPurchases::RunTest(const FString& Parameters)
{
    // A requirement larger than the tier holds is clamped, so no configuration
    // can lock a tree forever.
    FGatedStack Stack;
    if (!Stack.Build(*this, 99))
    {
        return false;
    }

    FSDResearchAccount Account;
    Stack.Accounts.GrantPoints(Account, 100000);
    ESDUnlockBlocker Blocker = ESDUnlockBlocker::None;
    FString BlockingNodeId;

    TArray<const FSDTechNode*> TierOneSensors;
    Stack.Registry.CollectByTier(ESDTechCategory::Sensor, ESDTechTier::T1, TierOneSensors);
    TArray<const FSDTechNode*> TierTwoSensors;
    Stack.Registry.CollectByTier(ESDTechCategory::Sensor, ESDTechTier::T2, TierTwoSensors);

    // Research every tier-1 sensor; tier 2 must then open despite the huge ask.
    for (const FSDTechNode* Sensor : TierOneSensors)
    {
        FSDPurchaseOutcome Purchase;
        TestTrue(*FString::Printf(TEXT("%s is purchasable"), *Sensor->Id),
            Stack.Accounts.TryPurchase(Account, Sensor->Id, Purchase));
    }
    TestEqual(TEXT("tier 2 opens once the whole tier 1 is researched"),
        static_cast<int32>(Stack.Unlock.GetState(Account.Progress, TierTwoSensors[0]->Id, Blocker, BlockingNodeId)),
        static_cast<int32>(ESDUnlockState::Available));

    // A tier-locked purchase is refused, named as a tier lock, and changes nothing.
    FSDResearchAccount Fresh;
    Stack.Accounts.GrantPoints(Fresh, 100000);
    const uint64 Before = Stack.Accounts.ComputeAccountSignature(Fresh);
    FSDPurchaseOutcome Refused;
    TestFalse(TEXT("tier-locked purchase is refused"),
        Stack.Accounts.TryPurchase(Fresh, TierTwoSensors[0]->Id, Refused));
    TestEqual(TEXT("reported as a tier lock"),
        static_cast<int32>(Refused.Result), static_cast<int32>(ESDPurchaseResult::TierLocked));
    TestEqual(TEXT("account is untouched"),
        Stack.Accounts.ComputeAccountSignature(Fresh), Before);

    // The view model shows the same thing the rules say.
    FSDTechTreeViewModel ViewModel;
    FSDTechTreeLoadReport ViewReport;
    TestTrue(TEXT("view model builds"),
        ViewModel.Initialize(Stack.Registry, Stack.Unlock, Stack.Accounts, Stack.Equipment, ViewReport));
    FSDTechTreeScreen Screen;
    ViewModel.BuildScreen(ESDTechCategory::Sensor, Fresh, Screen);
    int32 TierLockedRows = 0;
    int32 AvailableRows = 0;
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        TierLockedRows += Row.State == ESDNodeRowState::TierLocked ? 1 : 0;
        AvailableRows += Row.State == ESDNodeRowState::Available ? 1 : 0;
    }
    TestEqual(TEXT("only tier 1 is available in the sensor category"),
        AvailableRows, TierOneSensors.Num());
    TestEqual(TEXT("every other sensor row is tier locked"),
        TierLockedRows, Screen.Rows.Num() - TierOneSensors.Num());

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TierGateIsDeterministic,
    "SilentDepth.TechTree.TierGate.IsDeterministic",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TierGateIsDeterministic::RunTest(const FString& Parameters)
{
    FGatedStack First;
    FGatedStack Second;
    if (!First.Build(*this, 2) || !Second.Build(*this, 2))
    {
        return false;
    }

    FSDResearchAccount AccountA;
    FSDResearchAccount AccountB;
    for (FGatedStack* Stack : { &First, &Second })
    {
        FSDResearchAccount& Account = Stack == &First ? AccountA : AccountB;
        Stack->Accounts.GrantPoints(Account, 5000);
        TArray<const FSDTechNode*> TierOneSensors;
        Stack->Registry.CollectByTier(ESDTechCategory::Sensor, ESDTechTier::T1, TierOneSensors);
        for (int32 Index = 0; Index < FMath::Min(3, TierOneSensors.Num()); ++Index)
        {
            FSDPurchaseOutcome Purchase;
            Stack->Accounts.TryPurchase(Account, TierOneSensors[Index]->Id, Purchase);
        }
    }

    TestEqual(TEXT("same gate, same result"),
        First.Accounts.ComputeAccountSignature(AccountA),
        Second.Accounts.ComputeAccountSignature(AccountB));
    TestEqual(TEXT("same unlock signature"),
        First.Unlock.ComputeSignature(AccountA.Progress, AccountA.ResearchPoints),
        Second.Unlock.ComputeSignature(AccountB.Progress, AccountB.ResearchPoints));
    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
