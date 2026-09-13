#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeProbe.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace ProbeTests
{
struct FProbeStack
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;

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
        return true;
    }
};
}
using namespace ProbeTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ProbeOpeningChoices,
    "SilentDepth.TechTree.Probe.OpeningChoicesAndEconomy",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ProbeOpeningChoices::RunTest(const FString& Parameters)
{
    FProbeStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    const TArray<FSDProbeMission> Missions = DefaultProbeMissions();
    const FSDProbeReport Report = RunProgressionProbe(
        Stack.Registry, Stack.Unlock, Stack.Accounts, Missions);

    // DEC-007 took the tier gate to 1, which left 22 nodes available at zero
    // progress. The probe counts them instead of restating the decision.
    TestEqual(TEXT("the opening set matches DEC-007"), Report.OpeningNodes, 22);
    TestEqual(TEXT("five categories are counted"), Report.OpeningPerCategory.Num(), 5);
    if (Report.OpeningPerCategory.Num() == 5)
    {
        TestEqual(TEXT("submarines"), Report.OpeningPerCategory[0], 5);
        TestEqual(TEXT("weapons"), Report.OpeningPerCategory[1], 1);
        TestEqual(TEXT("sensors"), Report.OpeningPerCategory[2], 13);
        TestEqual(TEXT("defensive systems"), Report.OpeningPerCategory[3], 2);
        TestEqual(TEXT("propulsion"), Report.OpeningPerCategory[4], 1);
    }

    // The fixed mission set pays exactly as DEC-004 specifies: score/10 plus a
    // 50 point first-clear bonus per mission.
    TestEqual(TEXT("the fixed mission set pays 600 points"), Report.ResearchPointsAwarded, 600);
    TestTrue(TEXT("the economy buys something"), Report.PurchasedNodeIds.Num() > 0);
    TestTrue(TEXT("spending never exceeds the award"),
        Report.ResearchPointsSpent <= Report.ResearchPointsAwarded);
    TestEqual(TEXT("spent and left add up"),
        Report.ResearchPointsSpent + Report.ResearchPointsLeft, Report.ResearchPointsAwarded);
    TestEqual(TEXT("every purchase is unlocked"),
        Report.UnlockedNodes, Report.PurchasedNodeIds.Num());

    // A second run over the same inputs must agree completely, which is what
    // makes the numbers usable as a gate.
    const FSDProbeReport Again = RunProgressionProbe(
        Stack.Registry, Stack.Unlock, Stack.Accounts, Missions);
    TestEqual(TEXT("the same opening set"), Again.OpeningNodes, Report.OpeningNodes);
    TestEqual(TEXT("the same award"), Again.ResearchPointsAwarded, Report.ResearchPointsAwarded);
    TestEqual(TEXT("the same purchases"), Again.PurchasedNodeIds.Num(), Report.PurchasedNodeIds.Num());
    TestEqual(TEXT("the same account fingerprint"), Again.AccountFingerprint, Report.AccountFingerprint);
    for (int32 Index = 0; Index < Again.PurchasedNodeIds.Num() && Index < Report.PurchasedNodeIds.Num(); ++Index)
    {
        TestEqual(*FString::Printf(TEXT("purchase %d matches"), Index),
            Again.PurchasedNodeIds[Index], Report.PurchasedNodeIds[Index]);
    }

    // An empty sequence must not invent progress.
    const FSDProbeReport Empty = RunProgressionProbe(Stack.Registry, Stack.Unlock, Stack.Accounts, {});
    TestEqual(TEXT("no missions, no points"), Empty.ResearchPointsAwarded, 0);
    TestEqual(TEXT("no missions, no purchases"), Empty.PurchasedNodeIds.Num(), 0);
    TestEqual(TEXT("the opening set does not depend on the missions"),
        Empty.OpeningNodes, Report.OpeningNodes);

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
