#if WITH_DEV_AUTOMATION_TESTS

#include "Core/Balance.h"
#include "Core/Platform/SDEquipmentEffects.h"
#include "Core/SubmarineCore.h"
#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeSchema.h"

#include "Misc/AutomationTest.h"
#include "Misc/Paths.h"

using namespace SDTechTree;

namespace EquipmentEffectTests
{
struct FEffectStack
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;

    bool Build(FAutomationTestBase& Test, FSDEquipmentEffectsTable& OutTable)
    {
        FSDTechTreeLoadReport LoadReport;
        if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, LoadReport))
        {
            Test.AddError(TEXT("tech tree failed to load"));
            return false;
        }
        FSDTechTreeLoadReport EquipmentReport;
        if (!Equipment.Initialize(Tree, EquipmentReport))
        {
            Test.AddError(TEXT("equipment service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport EffectReport;
        if (!SDPlatform::LoadEquipmentEffects(
            SDPlatform::DefaultEquipmentEffectsPath(), OutTable, EffectReport))
        {
            for (const FSDDataError& Error : EffectReport.Errors)
            {
                Test.AddError(FString::Printf(TEXT("[%s] %s :: %s"),
                    *Error.Code, *Error.Subject, *Error.Detail));
            }
            return false;
        }
        return true;
    }
};

FSDLoadoutAssignment MakeAssignment(const FString& PlatformId, const FString& NodeId)
{
    FSDLoadoutAssignment Assignment;
    Assignment.PlatformId = PlatformId;
    Assignment.SlotName = TEXT("TEST");
    Assignment.CandidateId = NodeId;
    return Assignment;
}
}
using namespace EquipmentEffectTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentEffectsLoadTable,
    "SilentDepth.Platform.Effects.LoadsProjectTable",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentEffectsLoadTable::RunTest(const FString& Parameters)
{
    FEffectStack Stack;
    FSDEquipmentEffectsTable Table;
    if (!Stack.Build(*this, Table))
    {
        return false;
    }

    TestEqual(TEXT("three tier bands"), Table.Bands.Num(), 3);
    TestTrue(TEXT("propulsion kinds are declared"), Table.PropulsionKinds.Num() >= 4);
    TestTrue(TEXT("defensive branches are declared"), Table.DefensiveBranches.Num() >= 4);
    TestTrue(TEXT("sensor branches are declared"), Table.SensorBranches.Num() >= 3);

    const FSDEquipmentEffectsTable::FKindEffect* Propeller =
        Table.PropulsionKinds.Find(TEXT("PROPELLER"));
    TestNotNull(TEXT("propellers are described"), Propeller);
    if (Propeller != nullptr)
    {
        TestEqual(TEXT("one noise offset per band"), Propeller->NoiseOffsetPerBand.Num(), 3);
    }

    // The table is explicitly "initial playable values": the loader must not
    // invent an effect for a branch it does not describe.
    TestNull(TEXT("an undeclared branch has no effect"),
        Table.DefensiveBranches.Find(TEXT("NO_SUCH_BRANCH")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentEffectsCompute,
    "SilentDepth.Platform.Effects.ComputedFromFittedEquipment",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentEffectsCompute::RunTest(const FString& Parameters)
{
    FEffectStack Stack;
    FSDEquipmentEffectsTable Table;
    if (!Stack.Build(*this, Table))
    {
        return false;
    }

    const FString Platform = TEXT("RU_SSN_Akula");

    // Nothing fitted: every effect is neutral, and nothing is claimed.
    {
        const FSDEffectiveCapabilities Empty = SDPlatform::ComputeEffectiveCapabilities(
            Stack.Equipment, TArray<FSDLoadoutAssignment>(), Platform, Table);
        TestEqual(TEXT("no nodes contributed"), Empty.SourceNodeIds.Num(), 0);
        TestTrue(TEXT("noise offset is neutral"),
            FMath::IsNearlyEqual(Empty.Propulsion.NoiseOffset, 0.0));
        TestTrue(TEXT("speed scale is neutral"),
            FMath::IsNearlyEqual(Empty.Propulsion.SpeedScale, 1.0));
        TestEqual(TEXT("no decoy bonus"), Empty.Defensive.DecoyCountBonus, 0);
        TestFalse(TEXT("no ESM claimed"), Empty.Defensive.bEsm);
    }

    // A fitted propulsor contributes its kind's effect for its own tier band.
    TArray<FSDLoadoutAssignment> Fitted;
    Fitted.Add(MakeAssignment(Platform, TEXT("RU_PROP_Akula")));
    const FSDEffectiveCapabilities Propulsion = SDPlatform::ComputeEffectiveCapabilities(
        Stack.Equipment, Fitted, Platform, Table);
    TestEqual(TEXT("one source node"), Propulsion.SourceNodeIds.Num(), 1);
    if (Propulsion.SourceNodeIds.Num() == 1)
    {
        TestEqual(TEXT("the fitted node is the source"),
            Propulsion.SourceNodeIds[0], FString(TEXT("RU_PROP_Akula")));
    }
    TestTrue(TEXT("Akula's propeller quiets the boat"),
        Propulsion.Propulsion.NoiseOffset < 0.0);

    // Determinism: the same loadout computes the same numbers.
    const FSDEffectiveCapabilities Again = SDPlatform::ComputeEffectiveCapabilities(
        Stack.Equipment, Fitted, Platform, Table);
    TestTrue(TEXT("the same noise offset"),
        FMath::IsNearlyEqual(Again.Propulsion.NoiseOffset, Propulsion.Propulsion.NoiseOffset));
    TestTrue(TEXT("the same accel scale"),
        FMath::IsNearlyEqual(Again.Propulsion.AccelScale, Propulsion.Propulsion.AccelScale));
    TestEqual(TEXT("the same decoy bonus"),
        Again.Defensive.DecoyCountBonus, Propulsion.Defensive.DecoyCountBonus);

    // Another platform's fit does not leak into this one.
    TArray<FSDLoadoutAssignment> OtherPlatform;
    OtherPlatform.Add(MakeAssignment(TEXT("US_SSN_Virginia"), TEXT("RU_PROP_Akula")));
    const FSDEffectiveCapabilities NotFitted = SDPlatform::ComputeEffectiveCapabilities(
        Stack.Equipment, OtherPlatform, Platform, Table);
    TestEqual(TEXT("another platform's fit contributes nothing"),
        NotFitted.SourceNodeIds.Num(), 0);
    TestTrue(TEXT("and leaves the noise neutral"),
        FMath::IsNearlyEqual(NotFitted.Propulsion.NoiseOffset, 0.0));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentEffectsStep,
    "SilentDepth.Platform.Effects.PropulsionEntersTheAuthoritativeStep",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentEffectsStep::RunTest(const FString& Parameters)
{
    FSDBalance Balance;
    if (!FSDBalance::LoadBalance(FPaths::ProjectConfigDir() / TEXT("balance.json"), Balance))
    {
        AddError(TEXT("balance.json failed to load"));
        return false;
    }

    FSDPlayerInputs Inputs;
    Inputs.Throttle = Balance.SpeedBands[static_cast<int>(ESDSpeedBand::Cruise)].SpeedMaxKt;
    Inputs.DepthLayerTarget = ESDDepthLayer::Shallow;

    const auto RunSteps = [&Balance, &Inputs](const FSDPropulsionEffects& Effects, const int32 Steps)
    {
        FSDSubmarineState State;
        State.Battery = Balance.BatteryCapacity;
        State.Hull = Balance.BatteryCapacity > 0.0 ? 100.0 : 100.0;
        State.DepthM = 0.0;
        for (int32 Index = 0; Index < Steps; ++Index)
        {
            SubmarineStep(State, Inputs, Balance, Effects, 0.05, ESDWeatherKind::Clear);
        }
        return State;
    };

    // The historical five-argument call is exactly the neutral-effects call.
    FSDSubmarineState Legacy;
    Legacy.Battery = Balance.BatteryCapacity;
    FSDSubmarineState Explicit;
    Explicit.Battery = Balance.BatteryCapacity;
    for (int32 Index = 0; Index < 200; ++Index)
    {
        SubmarineStep(Legacy, Inputs, Balance, 0.05, ESDWeatherKind::Clear);
        SubmarineStep(Explicit, Inputs, Balance, FSDPropulsionEffects(), 0.05, ESDWeatherKind::Clear);
    }
    TestTrue(TEXT("neutral effects reproduce the old behaviour"),
        FMath::IsNearlyEqual(Legacy.SpeedKt, Explicit.SpeedKt)
        && FMath::IsNearlyEqual(Legacy.Noise, Explicit.Noise));

    // A quiet propulsor lowers the radiated noise after the same run.
    FSDPropulsionEffects Quiet;
    Quiet.NoiseOffset = -8.0;
    const FSDSubmarineState QuietState = RunSteps(Quiet, 200);
    TestTrue(TEXT("a quiet propulsor lowers noise"),
        QuietState.Noise < Explicit.Noise);
    TestTrue(TEXT("noise stays non-negative"), QuietState.Noise >= 0.0);

    // Scaling top speed and acceleration changes the same run, and does so
    // deterministically: the same inputs produce the same state twice.
    FSDPropulsionEffects Slower;
    Slower.SpeedScale = 0.5;
    const FSDSubmarineState SlowerState = RunSteps(Slower, 200);
    TestTrue(TEXT("a lower speed scale sails slower"),
        SlowerState.SpeedKt < Explicit.SpeedKt);
    const FSDSubmarineState SlowerAgain = RunSteps(Slower, 200);
    TestTrue(TEXT("the same effects, the same state"),
        FMath::IsNearlyEqual(SlowerAgain.SpeedKt, SlowerState.SpeedKt)
        && FMath::IsNearlyEqual(SlowerAgain.Noise, SlowerState.Noise)
        && FMath::IsNearlyEqual(SlowerAgain.Battery, SlowerState.Battery));

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
