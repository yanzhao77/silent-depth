#if WITH_DEV_AUTOMATION_TESTS

#include "Core/Balance.h"
#include "Core/FixedStep.h"
#include "Core/GameState.h"
#include "Core/GameStateMachine.h"
#include "Core/Rng.h"
#include "Core/SubmarineCore.h"

#include "Misc/AutomationTest.h"
#include "Misc/Paths.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_RngMatchesReference,
    "SilentDepth.Core.Rng.Mulberry32MatchesReference",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_RngMatchesReference::RunTest(const FString& Parameters)
{
    // Reference sequence computed from TS mulberry32(seed=42) (src/core/rng.ts).
    const double Expected[] = {
        0.601103751920164, 0.448290558997542, 0.852465793490410,
        0.669734041439369, 0.174813898745924
    };
    FSDRng Rng(42);
    for (int32 i = 0; i < 5; ++i)
    {
        TestTrue(
            *FString::Printf(TEXT("mulberry32(42)[%d]"), i),
            FMath::Abs(Rng.Next() - Expected[i]) < 1e-6
        );
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_RngDeterminismAndFork,
    "SilentDepth.Core.Rng.DeterminismAndFork",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_RngDeterminismAndFork::RunTest(const FString& Parameters)
{
    FSDRng A(123), B(123), C(456);
    bool SameSequence = true;
    for (int32 i = 0; i < 50; ++i)
    {
        if (A.Next() != B.Next())
        {
            SameSequence = false;
            break;
        }
    }
    TestTrue(TEXT("same seed -> same sequence"), SameSequence);

    bool AnyDifferent = false;
    for (int32 i = 0; i < 20; ++i)
    {
        if (C.Next() != A.Next())
        {
            AnyDifferent = true;
            break;
        }
    }
    TestTrue(TEXT("different seed -> different sequence"), AnyDifferent);

    // fork determinism: same fork point -> same stream.
    FSDRng F1(999), F2(999);
    for (int32 i = 0; i < 10; ++i)
    {
        F1.Next();
        F2.Next();
    }
    FSDRng F1a = F1.Fork(TEXT("sonar"));
    FSDRng F2a = F2.Fork(TEXT("sonar"));
    TestEqual(TEXT("fork stream equal"), F1a.Next(), F2a.Next());

    // int/range/chance stay in-bounds.
    FSDRng R(7);
    for (int32 i = 0; i < 1000; ++i)
    {
        const double X = R.Range(-2.0, 3.0);
        TestTrue(TEXT("range bounds"), X >= -2.0 && X < 3.0);
        const int32 K = R.Int(0, 5);
        TestTrue(TEXT("int bounds"), K >= 0 && K <= 5);
        const int32 S = R.Sign();
        TestTrue(TEXT("sign"), S == -1 || S == 1);
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_StateMachineTransitions,
    "SilentDepth.Core.StateMachine.Transitions",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_StateMachineTransitions::RunTest(const FString& Parameters)
{
    FSDGameStateMachine M(ESDGameState::Boot);
    TestTrue(TEXT("BOOT->MENU"), M.Transition(ESDGameState::Menu));
    TestTrue(TEXT("MENU->LOADING"), M.Transition(ESDGameState::MissionLoading));
    TestTrue(TEXT("LOADING->RUNNING"), M.Transition(ESDGameState::MissionRunning));
    TestTrue(TEXT("RUNNING->PAUSED"), M.Transition(ESDGameState::Paused));
    TestTrue(TEXT("PAUSED->RUNNING"), M.Transition(ESDGameState::MissionRunning));
    TestTrue(TEXT("RUNNING->VICTORY"), M.Transition(ESDGameState::Victory));
    TestTrue(TEXT("VICTORY->RESULT"), M.Transition(ESDGameState::MissionResult));
    TestTrue(TEXT("RESULT->MENU"), M.Transition(ESDGameState::Menu));

    FSDGameStateMachine N(ESDGameState::Boot);
    TestFalse(TEXT("BOOT->RUNNING illegal"), N.Transition(ESDGameState::MissionRunning));
    TestEqual(TEXT("state unchanged"), static_cast<uint8>(N.GetState()), static_cast<uint8>(ESDGameState::Boot));
    N.Transition(ESDGameState::Menu);
    TestFalse(TEXT("MENU->PAUSED illegal"), N.Transition(ESDGameState::Paused));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_FixedStepAccumulator,
    "SilentDepth.Core.FixedStep.Accumulator",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_FixedStepAccumulator::RunTest(const FString& Parameters)
{
    // 0.05 s tick; 0.12 s frame -> 2 steps, 0.02 carry, sim +0.10.
    FSDFixedStepResult R = ComputeFixedSteps(0.0, 0.12);
    TestEqual(TEXT("steps"), R.Steps, 2);
    TestTrue(TEXT("accumulator"), FMath::Abs(R.NextAccumulator - 0.02) < 1e-9);
    TestTrue(TEXT("simTime"), FMath::Abs(R.NextSimTime - 0.10) < 1e-9);

    // Capt to 0.25 s: a 2 s frame becomes 5 steps (0.25 / 0.05).
    FSDFixedStepResult R2 = ComputeFixedSteps(0.0, 2.0);
    TestEqual(TEXT("capped steps"), R2.Steps, 5);
    TestTrue(TEXT("capped accumulator"), FMath::Abs(R2.NextAccumulator - 0.0) < 1e-9);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_BalanceLoad,
    "SilentDepth.Core.Balance.Load",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_BalanceLoad::RunTest(const FString& Parameters)
{
    FSDBalance B;
    const FString Path = FPaths::ProjectConfigDir() + TEXT("balance.json");
    const bool Loaded = FSDBalance::LoadBalance(Path, B);
    AddInfo(*FString::Printf(TEXT("LoadBalance=%d accel=%.2f fullMax=%.2f deepMax=%.2f transS=%.2f cap=%.2f lowTh=%.2f hull=%.2f rudder=%.2f"),
        Loaded ? 1 : 0, B.SubmarineAccelKtPerS, B.SpeedBands[3].SpeedMaxKt, B.DepthLayers[4].MaxM,
        B.DepthTransitionSecondsPerLayer, B.BatteryCapacity, B.LowBatteryThreshold,
        B.HullPlayerMax, B.RudderTurnRateDegPerSec));
    TestTrue(TEXT("balance loads from Config/balance.json"), Loaded);
    TestEqual(TEXT("battery capacity"), B.BatteryCapacity, 100.0);
    TestEqual(TEXT("low battery threshold"), B.LowBatteryThreshold, 10.0);
    TestEqual(TEXT("hull player max"), B.HullPlayerMax, 100.0);
    TestEqual(TEXT("rudder turn rate"), B.RudderTurnRateDegPerSec, 3.0);
    TestEqual(TEXT("accel kt per s"), B.SubmarineAccelKtPerS, 2.0);
    TestEqual(TEXT("full band max kt"), B.SpeedBands[3].SpeedMaxKt, 22.0);
    TestEqual(TEXT("deep layer max m"), B.DepthLayers[4].MaxM, 120.0);
    TestEqual(TEXT("depth transition seconds"), B.DepthTransitionSecondsPerLayer, 3.0);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_SubmarineStepDeterministic,
    "SilentDepth.Core.Submarine.StepDeterministic",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_SubmarineStepDeterministic::RunTest(const FString& Parameters)
{
    FSDBalance B;
    const FString Path = FPaths::ProjectConfigDir() + TEXT("balance.json");
    TestTrue(TEXT("balance loads"), FSDBalance::LoadBalance(Path, B));
    if (!B.bLoaded)
    {
        return false;
    }

    // Determinism: identical inputs -> identical state after the same 120 steps.
    FSDSubmarineState A, A2;
    FSDPlayerInputs In;
    In.Throttle = 10.0;                            // CRUISE band (8-12 kt)
    In.DepthLayerTarget = ESDDepthLayer::Periscope;
    for (int32 i = 0; i < 120; ++i)
    {
        SubmarineStep(A, In, B, 0.05, ESDWeatherKind::Clear);
        SubmarineStep(A2, In, B, 0.05, ESDWeatherKind::Clear);
    }
    TestEqual(TEXT("deterministic speed"), A.SpeedKt, A2.SpeedKt);
    TestEqual(TEXT("deterministic heading"), A.HeadingDeg, A2.HeadingDeg);
    TestEqual(TEXT("deterministic pos"), A.PosXKm, A2.PosXKm);
    TestEqual(TEXT("deterministic depthM"), A.DepthM, A2.DepthM);
    TestEqual(TEXT("deterministic battery"), A.Battery, A2.Battery);
    TestEqual(TEXT("deterministic noise"), A.Noise, A2.Noise);

    // Scenario checks after 6 s: CRUISE band, reached Periscope layer, legal noise/depth/battery.
    TestTrue(TEXT("speed approaches target"), FMath::Abs(A.SpeedKt - 10.0) < 0.5);
    TestEqual(TEXT("band CRUISE"), static_cast<int>(A.SpeedBand), static_cast<int>(ESDSpeedBand::Cruise));
    TestEqual(TEXT("depth layer Periscope"), static_cast<int>(A.DepthLayer), static_cast<int>(ESDDepthLayer::Periscope));
    TestTrue(TEXT("depthM near 7"), FMath::Abs(A.DepthM - 7.0) < 0.5);
    TestTrue(TEXT("noise in [0,100]"), A.Noise >= 0.0 && A.Noise <= 100.0);
    TestTrue(TEXT("noise > 0"), A.Noise > 0.0);
    TestTrue(TEXT("battery in [0,100]"), A.Battery >= 0.0 && A.Battery <= 100.0);

    // Direction change: rudder right (+1) turns heading positively and deterministically.
    FSDSubmarineState C;
    FSDPlayerInputs TurnIn;
    TurnIn.Throttle = 5.0;
    TurnIn.Rudder = 1.0;
    for (int32 i = 0; i < 60; ++i)
    {
        SubmarineStep(C, TurnIn, B, 0.05, ESDWeatherKind::Clear);
    }
    TestTrue(TEXT("heading changed by rudder"), C.HeadingDeg > 0.0);
    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
