#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeSchema.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace LaunchInterfaceTests
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

struct FLaunchStack
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;
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
        FSDTechTreeLoadReport EquipmentReport;
        return Equipment.Initialize(Tree, EquipmentReport);
    }
};
}
using namespace LaunchInterfaceTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_LaunchInterfaceLoadsRealData,
    "SilentDepth.Platform.LaunchInterface.LoadsDeclaredCapacities",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_LaunchInterfaceLoadsRealData::RunTest(const FString& Parameters)
{
    FLaunchStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // Every platform in the weapon loadout manifest declares an interface.
    TestEqual(TEXT("one interface per platform"), Stack.Tree.LaunchInterfaces.Num(), 54);

    const FSDLaunchInterface* Virginia =
        Stack.Equipment.FindLaunchInterface(TEXT("US_SSN_Virginia"));
    TestNotNull(TEXT("Virginia is described"), Virginia);
    if (Virginia != nullptr)
    {
        TestEqual(TEXT("four torpedo tubes"), Virginia->TorpedoTubes, 4);
        TestTrue(TEXT("533 mm tubes"), FMath::IsNearlyEqual(Virginia->TorpedoTubeDiameterMm, 533.0));
        TestEqual(TEXT("twelve VLS cells"), Virginia->VlsCells, 12);
        TestEqual(TEXT("twelve VLS sockets"), Virginia->CountSocketsOfKind(TEXT("VLS")), 12);
        TestEqual(TEXT("four tube sockets"), Virginia->CountSocketsOfKind(TEXT("TORPEDO_TUBE")), 4);
        TestEqual(TEXT("no SLBM tubes"), Virginia->SlbmTubes, 0);
    }

    // Capacity comes from the declared numbers, not from a fixed constant.
    TestEqual(TEXT("Virginia fits four torpedoes"),
        Stack.Equipment.GetPayloadCapacity(TEXT("US_SSN_Virginia"), TEXT("TORPEDO")), 4);
    TestEqual(TEXT("Virginia fits twelve VLS rounds"),
        Stack.Equipment.GetPayloadCapacity(TEXT("US_SSN_Virginia"), TEXT("VLS")), 12);
    TestEqual(TEXT("an undeclared slot kind states no limit"),
        Stack.Equipment.GetPayloadCapacity(TEXT("US_SSN_Virginia"), TEXT("NO_SUCH_SLOT")), 0);
    TestEqual(TEXT("an unknown platform states no limit"),
        Stack.Equipment.GetPayloadCapacity(TEXT("NO_SUCH_PLATFORM"), TEXT("TORPEDO")), 0);

    // A boat without VLS reports zero cells and zero VLS sockets.
    const FSDLaunchInterface* Akula = Stack.Equipment.FindLaunchInterface(TEXT("RU_SSN_Akula"));
    TestNotNull(TEXT("Akula is described"), Akula);
    if (Akula != nullptr)
    {
        TestEqual(TEXT("Akula has no VLS sockets"),
            Akula->CountSocketsOfKind(TEXT("VLS")), 0);
        TestEqual(TEXT("Akula's VLS capacity is undeclared"),
            Stack.Equipment.GetPayloadCapacity(TEXT("RU_SSN_Akula"), TEXT("VLS")), 0);
    }

    // An SSBN declares SLBM tubes instead of VLS cells.
    const FSDLaunchInterface* Ohio = Stack.Equipment.FindLaunchInterface(TEXT("US_SSBN_Ohio"));
    TestNotNull(TEXT("Ohio is described"), Ohio);
    if (Ohio != nullptr)
    {
        TestTrue(TEXT("Ohio declares SLBM tubes"), Ohio->SlbmTubes > 0);
        TestEqual(TEXT("SLBM capacity follows the declaration"),
            Stack.Equipment.GetPayloadCapacity(TEXT("US_SSBN_Ohio"), TEXT("SLBM")),
            Ohio->SlbmTubes);
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_LaunchInterfaceLimitsLoadouts,
    "SilentDepth.Platform.LaunchInterface.SaveRespectsPayloadCapacity",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_LaunchInterfaceLimitsLoadouts::RunTest(const FString& Parameters)
{
    FLaunchStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // Five torpedoes do not fit four tubes, even when every row is legal on its
    // own; the sixth is where the data says the boat runs out.
    const FString Slot = TEXT("TORPEDO");
    const FString Candidate = TEXT("US_TORP_Mk48_Mod6");
    const int32 Capacity = Stack.Equipment.GetPayloadCapacity(TEXT("US_SSN_Virginia"), Slot);
    TestTrue(TEXT("Virginia declares a tube count"), Capacity > 0);

    {
        FSDTechTreeSaveData Data;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("US_SSN_Virginia");
        Assignment.SlotName = Slot;
        Assignment.CandidateId = Candidate;
        Assignment.Count = Capacity;
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("a full load fits"), ValidateSaveCompatibility(
            Data, Stack.Equipment, ESDEquipPolicy::AllowGameplay, Report));
    }

    {
        FSDTechTreeSaveData Data;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("US_SSN_Virginia");
        Assignment.SlotName = Slot;
        Assignment.CandidateId = Candidate;
        Assignment.Count = Capacity + 1;
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("one too many is refused"), ValidateSaveCompatibility(
            Data, Stack.Equipment, ESDEquipPolicy::AllowGameplay, Report));
        TestTrue(TEXT("the refusal names the payload limit"),
            HasErrorCode(Report, TEXT("PAYLOAD_CAPACITY_EXCEEDED")));
    }

    // A slot whose capacity the data does not state is not enforced: an unknown
    // number must not become a prohibition.
    {
        FSDTechTreeSaveData Data;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("US_SSN_Virginia");
        Assignment.SlotName = TEXT("SPECIAL");
        Assignment.CandidateId = TEXT("US_SPECIAL_DDS");
        Assignment.Count = 3;
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("an undeclared capacity is not a limit"), ValidateSaveCompatibility(
            Data, Stack.Equipment, ESDEquipPolicy::AllowGameplay, Report));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
