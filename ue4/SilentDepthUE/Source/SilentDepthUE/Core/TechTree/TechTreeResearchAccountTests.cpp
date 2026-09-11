#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace ResearchAccountTests
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

/** Loads the project tree and wires registry to account service. */
bool BuildAccountService(
    FAutomationTestBase& Test,
    FSDTechTree& OutTree,
    FSDNodeRegistry& OutRegistry,
    FSDUnlockService& OutUnlock,
    FSDResearchAccountService& OutAccounts)
{
    FSDTechTreeLoadReport LoadReport;
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), OutTree, LoadReport))
    {
        Test.AddError(TEXT("tech tree failed to load"));
        return false;
    }

    FSDResearchCostRule CostRule;
    // Load the rules the game ships with, gate included: a test stack that
    // silently ran with a different configuration would not be testing the
    // shipped behaviour.
    FSDTierGateRule TierGate;
    FSDTechTreeLoadReport CostReport;
    if (!LoadResearchRules(FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, TierGate, CostReport))
    {
        Test.AddError(TEXT("research cost rule failed to load"));
        return false;
    }

    FSDTechTreeLoadReport RegistryReport;
    if (!OutRegistry.Initialize(OutTree, CostRule, RegistryReport))
    {
        Test.AddError(TEXT("registry failed to initialise"));
        return false;
    }

    FSDTechTreeLoadReport UnlockReport;
    if (!OutUnlock.Initialize(OutRegistry, TierGate, UnlockReport))
    {
        Test.AddError(TEXT("unlock service failed to initialise"));
        return false;
    }

    FSDTechTreeLoadReport AccountReport;
    return OutAccounts.Initialize(OutUnlock, AccountReport);
}
}
using namespace ResearchAccountTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ResearchAccountPurchaseFlow,
    "SilentDepth.TechTree.Account.PurchaseFlow",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ResearchAccountPurchaseFlow::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildAccountService(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDResearchAccount Account;
    TestEqual(TEXT("T1 root costs 100"), Accounts.GetCost(TEXT("US_TORP_Mk14")), 100);

    // An empty wallet cannot buy anything, and nothing changes.
    FSDPurchaseOutcome Outcome;
    TestFalse(TEXT("purchase without points fails"),
        Accounts.TryPurchase(Account, TEXT("US_TORP_Mk14"), Outcome));
    TestEqual(TEXT("reports insufficient points"),
        static_cast<int32>(Outcome.Result), static_cast<int32>(ESDPurchaseResult::InsufficientPoints));
    TestEqual(TEXT("balance untouched"), Account.ResearchPoints, 0);
    TestEqual(TEXT("nothing researched"), Account.Progress.UnlockedNodeIds.Num(), 0);

    // Preview must agree with the real purchase and must not mutate.
    Accounts.GrantPoints(Account, 150);
    TestEqual(TEXT("balance after grant"), Account.ResearchPoints, 150);
    Accounts.PreviewPurchase(Account, TEXT("US_TORP_Mk14"), Outcome);
    TestTrue(TEXT("preview succeeds"), Outcome.Succeeded());
    TestEqual(TEXT("preview cost"), Outcome.Cost, 100);
    TestEqual(TEXT("preview balance after"), Outcome.PointsAfter, 50);
    TestEqual(TEXT("preview does not spend"), Account.ResearchPoints, 150);
    TestEqual(TEXT("preview does not research"), Account.Progress.UnlockedNodeIds.Num(), 0);

    // The real purchase commits the node and the charge together.
    TestTrue(TEXT("purchase succeeds"), Accounts.TryPurchase(Account, TEXT("US_TORP_Mk14"), Outcome));
    TestEqual(TEXT("points deducted"), Account.ResearchPoints, 50);
    TestTrue(TEXT("node researched"), Accounts.IsUnlocked(Account, TEXT("US_TORP_Mk14")));
    TestEqual(TEXT("outcome reports the charge"), Outcome.PointsAfter, 50);

    // Repeat purchase is refused without charging again.
    TestFalse(TEXT("repeat purchase refused"),
        Accounts.TryPurchase(Account, TEXT("US_TORP_Mk14"), Outcome));
    TestEqual(TEXT("repeat reports already unlocked"),
        static_cast<int32>(Outcome.Result), static_cast<int32>(ESDPurchaseResult::AlreadyUnlocked));
    TestEqual(TEXT("repeat does not charge"), Account.ResearchPoints, 50);
    TestEqual(TEXT("repeat does not add a second entry"), Account.Progress.UnlockedNodeIds.Num(), 1);

    // The dependent is now reachable but still unaffordable: the two failures
    // must stay distinguishable.
    TestFalse(TEXT("dependent purchase fails"),
        Accounts.TryPurchase(Account, TEXT("US_TORP_Mk18"), Outcome));
    TestEqual(TEXT("dependent is affordable-blocked, not prerequisite-blocked"),
        static_cast<int32>(Outcome.Result), static_cast<int32>(ESDPurchaseResult::InsufficientPoints));
    TestEqual(TEXT("dependent cost"), Outcome.Cost, 100);

    Accounts.GrantPoints(Account, 50);
    TestTrue(TEXT("dependent purchase succeeds"),
        Accounts.TryPurchase(Account, TEXT("US_TORP_Mk18"), Outcome));
    TestEqual(TEXT("balance spent down"), Account.ResearchPoints, 0);
    TestEqual(TEXT("two nodes researched"), Account.Progress.UnlockedNodeIds.Num(), 2);

    // An unknown id never charges anything.
    Accounts.GrantPoints(Account, 500);
    TestFalse(TEXT("unknown node refused"),
        Accounts.TryPurchase(Account, TEXT("NO_SUCH_NODE"), Outcome));
    TestEqual(TEXT("unknown reported"),
        static_cast<int32>(Outcome.Result), static_cast<int32>(ESDPurchaseResult::UnknownNode));
    TestEqual(TEXT("unknown does not charge"), Account.ResearchPoints, 500);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ResearchAccountAtomicity,
    "SilentDepth.TechTree.Account.FailedPurchaseChangesNothing",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ResearchAccountAtomicity::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildAccountService(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDResearchAccount Account;
    Accounts.GrantPoints(Account, 100);
    FSDPurchaseOutcome FirstOutcome;
    TestTrue(TEXT("first purchase"), Accounts.TryPurchase(Account, TEXT("US_TORP_Mk14"), FirstOutcome));

    const uint64 SignatureBefore = Accounts.ComputeAccountSignature(Account);
    const int32 PointsBefore = Account.ResearchPoints;
    const int32 NodesBefore = Account.Progress.UnlockedNodeIds.Num();

    // Every failure path must leave the account bit-for-bit unchanged.
    const TCHAR* const RejectedIds[] = {
        TEXT("US_TORP_Mk14"),
        TEXT("US_TORP_Mk23"),
        TEXT("US_TORP_Mk45"),
        TEXT("NO_SUCH_NODE")
    };
    for (const TCHAR* RejectedId : RejectedIds)
    {
        FSDPurchaseOutcome Outcome;
        TestFalse(*FString::Printf(TEXT("%s refused"), RejectedId),
            Accounts.TryPurchase(Account, RejectedId, Outcome));
        TestEqual(*FString::Printf(TEXT("%s keeps the signature"), RejectedId),
            Accounts.ComputeAccountSignature(Account), SignatureBefore);
    }

    TestEqual(TEXT("points unchanged"), Account.ResearchPoints, PointsBefore);
    TestEqual(TEXT("researched set unchanged"), Account.Progress.UnlockedNodeIds.Num(), NodesBefore);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ResearchAccountSettlement,
    "SilentDepth.TechTree.Account.MissionSettlement",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ResearchAccountSettlement::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildAccountService(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDResearchAccount Account;
    FSDMissionSettlement Settlement;

    // A failed mission pays nothing and does not consume the first-clear bonus.
    TestFalse(TEXT("failed mission awards nothing"),
        Accounts.AwardMissionResult(Account, TEXT("M02"), 399, Settlement));
    TestEqual(TEXT("no points for a failure"), Account.ResearchPoints, 0);
    TestEqual(TEXT("no first-clear recorded"), Account.FirstClearMissionIds.Num(), 0);

    // First clear: floor(700 / 10) + 50 = 120.
    TestTrue(TEXT("first clear awards points"),
        Accounts.AwardMissionResult(Account, TEXT("M02"), 700, Settlement));
    TestEqual(TEXT("first clear total"), Settlement.PointsAwarded, 120);
    TestTrue(TEXT("first clear flagged"), Settlement.bFirstClearBonus);
    TestEqual(TEXT("balance after first clear"), Account.ResearchPoints, 120);
    TestEqual(TEXT("mission recorded"), Account.FirstClearMissionIds.Num(), 1);

    // Replaying the same mission pays the score share only.
    TestTrue(TEXT("replay awards points"),
        Accounts.AwardMissionResult(Account, TEXT("M02"), 1000, Settlement));
    TestEqual(TEXT("replay has no bonus"), Settlement.PointsAwarded, 100);
    TestFalse(TEXT("replay is not a first clear"), Settlement.bFirstClearBonus);
    TestEqual(TEXT("balance after replay"), Account.ResearchPoints, 220);

    // A different mission earns its own first-clear bonus.
    TestTrue(TEXT("second mission first clear"),
        Accounts.AwardMissionResult(Account, TEXT("M03"), 1000, Settlement));
    TestEqual(TEXT("second first clear total"), Settlement.PointsAwarded, 150);
    TestEqual(TEXT("both missions recorded"), Account.FirstClearMissionIds.Num(), 2);

    // An empty mission id is rejected outright.
    TestFalse(TEXT("empty mission id refused"),
        Accounts.AwardMissionResult(Account, TEXT(""), 1000, Settlement));

    // The same sequence run twice must land on the same account.
    FSDResearchAccount Repeat;
    FSDMissionSettlement RepeatSettlement;
    Accounts.AwardMissionResult(Repeat, TEXT("M02"), 399, RepeatSettlement);
    Accounts.AwardMissionResult(Repeat, TEXT("M02"), 700, RepeatSettlement);
    Accounts.AwardMissionResult(Repeat, TEXT("M02"), 1000, RepeatSettlement);
    Accounts.AwardMissionResult(Repeat, TEXT("M03"), 1000, RepeatSettlement);
    TestEqual(TEXT("replayed settlement matches"),
        Accounts.ComputeAccountSignature(Repeat), Accounts.ComputeAccountSignature(Account));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ResearchAccountValidation,
    "SilentDepth.TechTree.Account.ValidationAndGuards",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ResearchAccountValidation::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildAccountService(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDResearchAccount Valid;
    Accounts.GrantPoints(Valid, 100);
    FSDPurchaseOutcome Outcome;
    TestTrue(TEXT("valid purchase"), Accounts.TryPurchase(Valid, TEXT("US_TORP_Mk14"), Outcome));
    FSDTechTreeLoadReport ValidReport;
    TestTrue(TEXT("valid account accepted"), Accounts.ValidateAccount(Valid, ValidReport));

    // A corrupted save is rejected rather than silently repaired.
    {
        FSDResearchAccount Account = Valid;
        Account.ResearchPoints = -1;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("negative balance rejected"), Accounts.ValidateAccount(Account, Report));
        TestTrue(TEXT("negative balance reported"), HasErrorCode(Report, TEXT("NEGATIVE_BALANCE")));
    }
    {
        FSDResearchAccount Account = Valid;
        Account.Progress.UnlockedNodeIds.Add(TEXT("US_TORP_Mk14"));
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("duplicate node rejected"), Accounts.ValidateAccount(Account, Report));
        TestTrue(TEXT("duplicate reported"), HasErrorCode(Report, TEXT("DUPLICATE_NODE_IN_PROGRESS")));
    }
    {
        FSDResearchAccount Account = Valid;
        Account.Progress.UnlockedNodeIds.Add(TEXT("NO_SUCH_NODE"));
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unknown node rejected"), Accounts.ValidateAccount(Account, Report));
        TestTrue(TEXT("unknown reported"), HasErrorCode(Report, TEXT("UNKNOWN_NODE_IN_PROGRESS")));
    }
    {
        FSDResearchAccount Account = Valid;
        Account.FirstClearMissionIds.Add(TEXT("M02"));
        Account.FirstClearMissionIds.Add(TEXT("M02"));
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("duplicate mission rejected"), Accounts.ValidateAccount(Account, Report));
        TestTrue(TEXT("duplicate mission reported"), HasErrorCode(Report, TEXT("DUPLICATE_FIRST_CLEAR")));
    }
    {
        FSDResearchAccount Account = Valid;
        Account.FirstClearMissionIds.Add(TEXT(""));
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("empty mission rejected"), Accounts.ValidateAccount(Account, Report));
        TestTrue(TEXT("empty mission reported"), HasErrorCode(Report, TEXT("EMPTY_MISSION_ID")));
    }

    // An uninitialised service must not hand out free research.
    {
        FSDResearchAccountService Cold;
        FSDResearchAccount Account;
        FSDPurchaseOutcome ColdOutcome;
        TestFalse(TEXT("uninitialised purchase refused"),
            Cold.TryPurchase(Account, TEXT("US_TORP_Mk14"), ColdOutcome));
        TestEqual(TEXT("reports not initialised"),
            static_cast<int32>(ColdOutcome.Result), static_cast<int32>(ESDPurchaseResult::NotInitialized));
        TestEqual(TEXT("no free points"), Account.ResearchPoints, 0);
        TestEqual(TEXT("no free research"), Account.Progress.UnlockedNodeIds.Num(), 0);
        TestEqual(TEXT("cost is zero without a registry"), Cold.GetCost(TEXT("US_TORP_Mk14")), 0);
    }
    {
        FSDUnlockService ColdUnlock;
        FSDResearchAccountService Service;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("uninitialised unlock service rejected"),
            Service.Initialize(ColdUnlock, Report));
        TestTrue(TEXT("guard reported"), HasErrorCode(Report, TEXT("UNLOCK_SERVICE_NOT_INITIALIZED")));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
