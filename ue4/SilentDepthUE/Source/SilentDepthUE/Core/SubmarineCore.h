#pragma once

#include "CoreMinimal.h"
#include "Core/Balance.h"

enum class ESDWeatherKind : uint8 { Clear, Cloudy, Storm, Night };

/** ADR-005 PlayerInputs subset (no DOM / no RNG). */
struct SILENTDEPTHUE_API FSDPlayerInputs
{
    double Throttle = 0.0;                                   // target speed kt [0, FULL max]
    double Rudder = 0.0;                                     // [-1, 1]
    ESDDepthLayer DepthLayerTarget = ESDDepthLayer::Surface;
    bool bSilentRunning = false;
    bool bDiveEdge = false;
};

/** Player submarine state (GAME_DESIGN §4; mirrors SubmarineState). */
struct SILENTDEPTHUE_API FSDSubmarineState
{
    ESDSpeedBand SpeedBand = ESDSpeedBand::Stopped;
    double SpeedKt = 0.0;
    double TargetSpeedKt = 0.0;
    double HeadingDeg = 0.0;
    double PosXKm = 0.0;
    double PosYKm = 0.0;
    ESDDepthLayer DepthLayer = ESDDepthLayer::Surface;
    ESDDepthLayer TargetDepthLayer = ESDDepthLayer::Surface;
    double DepthTransitionT = 0.0;   // seconds remaining (0 = not transitioning)
    double DepthM = 0.0;
    double Battery = 100.0;
    bool bLowBattery = false;
    bool bSilentRunning = false;
    double Hull = 100.0;
    double Noise = 0.0;
    double Detection = 0.0;
    double OutOfBoundsTimer = 0.0;
    int32 DecoyCount = 2;
};

// Pure rules (deterministic, no RNG) — port of src/gameplay/submarine.ts.
SILENTDEPTHUE_API ESDSpeedBand BandForTargetSpeed(double SpeedKt, const FSDBalance& B);
SILENTDEPTHUE_API double ClampSpeedToBand(ESDSpeedBand Band, double SpeedKt, const FSDBalance& B);
SILENTDEPTHUE_API double RawBandNoise(ESDSpeedBand Band, double SpeedKt, const FSDBalance& B);
SILENTDEPTHUE_API double BandNoise(ESDSpeedBand Band, double SpeedKt, const FSDBalance& B);
SILENTDEPTHUE_API double LayerDistance(ESDDepthLayer A, ESDDepthLayer B);
SILENTDEPTHUE_API double LayerMidM(ESDDepthLayer L, const FSDBalance& B);
SILENTDEPTHUE_API double ComputeNoise(
    ESDSpeedBand Band,
    double SpeedKt,
    ESDDepthLayer DepthLayer,
    bool bInTransition,
    ESDDepthLayer TargetLayer,
    double Hull,
    ESDWeatherKind Weather,
    const FSDBalance& B
);

/**
 * Advance the submarine by one fixed step (dt = 0.05 s). Updates the state
 * in place. Consumes no RNG; only reads balance + inputs.
 */
SILENTDEPTHUE_API void SubmarineStep(
    FSDSubmarineState& S,
    const FSDPlayerInputs& In,
    const FSDBalance& B,
    double Dt,
    ESDWeatherKind Weather
);
