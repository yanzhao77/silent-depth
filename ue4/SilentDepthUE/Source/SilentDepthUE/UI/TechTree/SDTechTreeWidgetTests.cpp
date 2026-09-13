#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"
#include "Core/TechTree/TechTreeViewModel.h"
#include "UI/TechTree/SDTechNodeDetailWidget.h"
#include "UI/TechTree/SDTechTreeLoadoutWidget.h"
#include "UI/TechTree/SDTechTreeOverviewWidget.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace TechTreeWidgetTests
{
/** The same service stack the screens consume in game, built from real data. */
struct FWidgetStack
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
        if (!ViewModel.Initialize(Registry, Unlock, Accounts, Equipment, ViewReport))
        {
            Test.AddError(TEXT("view model failed to initialise"));
            return false;
        }
        return true;
    }
};

template <typename PredicateType>
const FSDNodeRow* FindRow(const FSDTechTreeScreen& Screen, PredicateType&& Predicate)
{
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        if (Predicate(Row))
        {
            return &Row;
        }
    }
    return nullptr;
}
}
using namespace TechTreeWidgetTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_WidgetOverviewRendersModel,
    "SilentDepth.TechTree.Widgets.OverviewRendersModel",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_WidgetOverviewRendersModel::RunTest(const FString& Parameters)
{
    FWidgetStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // A funded wallet, so the opening nodes are affordable and their state is
    // the one the rules produce rather than "not enough points".
    FSDResearchAccount Account;
    Account.ResearchPoints = 5000;
    USDTechTreeOverviewWidget* Widget = NewObject<USDTechTreeOverviewWidget>();
    Widget->SetViewModel(&Stack.ViewModel);
    Widget->SetAccount(Account);

    const FSDTechTreeScreen& Screen = Widget->GetRenderedScreen();
    TestEqual(TEXT("all five tabs are listed"), Screen.Tabs.Num(), 5);
    TestEqual(TEXT("every tab, tier and node row is on screen"),
        Widget->GetRenderedRowIds().Num(),
        Screen.Tabs.Num() + Screen.Tiers.Num() + Screen.Rows.Num());
    TestTrue(TEXT("the tabs come first"),
        Widget->GetRenderedRowIds().Num() > 0
        && Widget->GetRenderedRowIds()[0].Equals(TEXT("TAB:SUBMARINE")));
    TestTrue(TEXT("the wallet is on screen"), Widget->HasRenderedLineContaining(TEXT("研究点 5000")));
    TestTrue(TEXT("the category is labelled in Chinese"),
        Widget->HasRenderedLineContaining(TEXT("当前分类 潜艇")));

    // Every node the model produced has a row, in the model's order.
    int32 MatchedRows = 0;
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        if (Widget->GetRenderedRowIds().Contains(Row.NodeId))
        {
            ++MatchedRows;
        }
    }
    TestEqual(TEXT("no node row was dropped"), MatchedRows, Screen.Rows.Num());

    // The shipped tier gate opens a small opening set, and the screen shows the
    // state text for it rather than only the node id.
    int32 AvailableRows = 0;
    for (const FSDNodeRow& Row : Screen.Rows)
    {
        if (Row.State == ESDNodeRowState::Available)
        {
            ++AvailableRows;
        }
    }
    TestTrue(TEXT("the opening set is not empty"), AvailableRows > 0);
    TestTrue(TEXT("an opening node shows its state"),
        Widget->HasRenderedLineContaining(TEXT("可研究")));

    // Switching tabs rebuilds the screen from the same model.
    Widget->SetCategory(ESDTechCategory::Weapon);
    TestEqual(TEXT("the selected category follows the request"),
        static_cast<int32>(Widget->GetRenderedScreen().SelectedCategory),
        static_cast<int32>(ESDTechCategory::Weapon));
    TestTrue(TEXT("weapon rows are rendered"),
        Widget->HasRenderedLineContaining(TEXT("分类 武器")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_WidgetDetailShowsStatesAndBadges,
    "SilentDepth.TechTree.Widgets.DetailShowsStatesAndBadges",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_WidgetDetailShowsStatesAndBadges::RunTest(const FString& Parameters)
{
    FWidgetStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    const FSDResearchAccount Account;
    USDTechNodeDetailWidget* Detail = NewObject<USDTechNodeDetailWidget>();
    Detail->SetViewModel(&Stack.ViewModel);

    // An empty panel says so instead of inventing a node.
    TestFalse(TEXT("no row is selected yet"), Detail->HasRow());
    TestTrue(TEXT("the empty panel explains itself"),
        Detail->HasRenderedLineContaining(TEXT("未选择节点")));

    // DATABASE_ONLY nodes carry the DEC-001 explanation.
    FSDTechTreeScreen SensorScreen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Sensor, Account, SensorScreen);
    if (const FSDNodeRow* DatabaseOnly = FindRow(
        SensorScreen, [](const FSDNodeRow& Row) { return Row.bDatabaseOnly; }))
    {
        Detail->SetRow(*DatabaseOnly);
        TestTrue(TEXT("the node id is on screen"),
            Detail->HasRenderedLineContaining(DatabaseOnly->NodeId));
        TestTrue(TEXT("the DATABASE_ONLY badge is on screen"),
            Detail->HasRenderedLineContaining(TEXT("仅数据库")));
        TestTrue(TEXT("the DEC-001 rule is explained"),
            Detail->HasRenderedLineContaining(TEXT("DEC-001")));
    }
    else
    {
        AddError(TEXT("the sensor tree should contain a DATABASE_ONLY node"));
    }

    // A prerequisite-locked node names the blocker the rules actually enforce.
    FSDTechTreeScreen WeaponScreen;
    Stack.ViewModel.BuildScreen(ESDTechCategory::Weapon, Account, WeaponScreen);
    if (const FSDNodeRow* Locked = FindRow(
        WeaponScreen, [](const FSDNodeRow& Row)
        {
            return Row.State == ESDNodeRowState::PrerequisiteLocked && !Row.BlockingNodeId.IsEmpty();
        }))
    {
        Detail->SetRow(*Locked);
        TestTrue(TEXT("the blocker is named"),
            Detail->HasRenderedLineContaining(Locked->BlockingNodeId));
        TestTrue(TEXT("the blocker is explained"),
            Detail->HasRenderedLineContaining(TEXT("需要先研究")));
    }
    else
    {
        AddError(TEXT("the weapon tree should contain a prerequisite-locked node"));
    }

    // The panel can be cleared again without leaving stale text behind.
    Detail->ClearRow();
    TestFalse(TEXT("the row is cleared"), Detail->HasRow());
    TestTrue(TEXT("the cleared panel explains itself"),
        Detail->HasRenderedLineContaining(TEXT("未选择节点")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_WidgetLoadoutShowsConflictsAndCapabilities,
    "SilentDepth.TechTree.Widgets.LoadoutShowsConflictsAndCapabilities",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_WidgetLoadoutShowsConflictsAndCapabilities::RunTest(const FString& Parameters)
{
    FWidgetStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    const FSDResearchAccount Account;
    USDTechTreeLoadoutWidget* Widget = NewObject<USDTechTreeLoadoutWidget>();
    Widget->SetViewModel(&Stack.ViewModel);
    Widget->SetPolicy(ESDEquipPolicy::AllowGameplay);
    Widget->SetPlatform(TEXT("RU_SSN_Akula"));

    TestTrue(TEXT("the platform header is on screen"),
        Widget->HasRenderedLineContaining(TEXT("RU_SSN_Akula")));
    TestTrue(TEXT("the shared socket is explained"),
        Widget->HasRenderedLineContaining(TEXT("互斥")));
    TestTrue(TEXT("the competing slot is named"),
        Widget->HasRenderedLineContaining(TEXT("NOISE_MAKER")));
    TestTrue(TEXT("the capability layer is explained as having no equipment"),
        Widget->HasRenderedLineContaining(TEXT("没有对应的装备资产")));

    // Gameplay assignments must be labelled where they are offered.
    TestTrue(TEXT("gameplay assignments are labelled"),
        Widget->HasRenderedLineContaining(TEXT("游戏化配发")));

    // Filling both alternatives is predicted before the save is written.
    TArray<FSDEquipmentRow> DecoyRows;
    Stack.ViewModel.BuildEquipmentRows(
        TEXT("RU_SSN_Akula"), TEXT("DECOY"), Account, ESDEquipPolicy::AllowGameplay, DecoyRows);
    TArray<FSDEquipmentRow> NoiseMakerRows;
    Stack.ViewModel.BuildEquipmentRows(
        TEXT("RU_SSN_Akula"), TEXT("NOISE_MAKER"), Account, ESDEquipPolicy::AllowGameplay, NoiseMakerRows);
    TestTrue(TEXT("the decoy slot has gameplay candidates"), DecoyRows.Num() > 0);
    TestTrue(TEXT("the noise maker slot has gameplay candidates"), NoiseMakerRows.Num() > 0);
    if (DecoyRows.Num() > 0 && NoiseMakerRows.Num() > 0)
    {
        TMap<FString, FString> Fitted;
        Fitted.Add(TEXT("DECOY"), DecoyRows[0].CandidateId);
        Fitted.Add(TEXT("NOISE_MAKER"), NoiseMakerRows[0].CandidateId);
        Widget->SetFittedSlots(Fitted);
        TestTrue(TEXT("the overflow is predicted on screen"),
            Widget->HasRenderedLineContaining(TEXT("SOCKET_CAPACITY_EXCEEDED")));
    }

    // The strict policy offers nothing here, and the screen says why.
    Widget->SetPolicy(ESDEquipPolicy::Strict);
    TestTrue(TEXT("the strict policy reports an empty candidate set"),
        Widget->HasRenderedLineContaining(TEXT("没有可装配的候选")));

    // A platform with no slot definitions is not silently rendered as empty.
    Widget->SetPlatform(TEXT("NO_SUCH_PLATFORM"));
    TestTrue(TEXT("an unknown platform is reported"),
        Widget->HasRenderedLineContaining(TEXT("没有安装位定义")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_WidgetsFailClosedWithoutModel,
    "SilentDepth.TechTree.Widgets.FailClosedWithoutModel",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_WidgetsFailClosedWithoutModel::RunTest(const FString& Parameters)
{
    USDTechTreeOverviewWidget* Overview = NewObject<USDTechTreeOverviewWidget>();
    Overview->RebuildFromModel();
    TestEqual(TEXT("no rows without a model"), Overview->GetRenderedRowIds().Num(), 0);
    TestTrue(TEXT("the overview says why it is empty"),
        Overview->HasRenderedLineContaining(TEXT("失败关闭")));

    USDTechTreeLoadoutWidget* Loadout = NewObject<USDTechTreeLoadoutWidget>();
    Loadout->SetPlatform(TEXT("RU_SSN_Akula"));
    TestEqual(TEXT("no rows without a model"), Loadout->GetRenderedRowIds().Num(), 0);
    TestTrue(TEXT("the loadout screen says why it is empty"),
        Loadout->HasRenderedLineContaining(TEXT("失败关闭")));

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
