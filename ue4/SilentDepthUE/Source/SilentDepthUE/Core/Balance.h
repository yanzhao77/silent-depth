#pragma once

#include "CoreMinimal.h"

/** Order matches config/balance.json speedBands / depthLayers keys. */
enum class ESDSpeedBand : uint8 { Stopped, Silent, Cruise, Full };
enum class ESDDepthLayer : uint8 { Surface, Periscope, Shallow, Medium, Deep };

struct SILENTDEPTHUE_API FSDSpeedBand
{
    double SpeedMinKt = 0;
    double SpeedMaxKt = 0;
    double BatteryDrainPerSec = 0;
};

struct SILENTDEPTHUE_API FSDDepthLayer
{
    double MinM = 0;
    double MaxM = 0;
    double NoiseMod = 0;
    double ChargePerSec = 0;
    double ExtraBatteryPerSec = 0;
};

/**
 * Typed read of config/balance.json (ADR-002 / NFR-5). Mirrors the gameplay
 * values used by the simulation core; every number lives in the config.
 */
struct SILENTDEPTHUE_API FSDBalance
{
    // submarine
    double SubmarineAccelKtPerS = 0;
    // speed bands + noise interpolation (indexed by ESDSpeedBand)
    FSDSpeedBand SpeedBands[4];
    double NoiseBandBase[4] = {0, 0, 0, 0};
    double NoiseSlopePerKt[4] = {0, 0, 0, 0};
    // rudder
    double RudderTurnRateDegPerSec = 0;
    double RudderTurnRateDegPerSecFullSpeed = 0;
    double LowBatteryTurnRateFactor = 0;
    // depth layers + transition
    FSDDepthLayer DepthLayers[5];
    double DepthTransitionSecondsPerLayer = 0;
    // battery
    double BatteryCapacity = 0;
    double LowBatteryThreshold = 0;
    double SilentRunningExtraPerSec = 0;
    double ForcedSurfaceDetection = 0;
    double SurfaceFastChargePerSec = 0;
    ESDSpeedBand SurfaceFastChargeMaxBand = ESDSpeedBand::Cruise;
    // hull
    double HullPlayerMax = 0;
    double DamagedThreshold = 0;
    double DamagedNoiseBonus = 0;
    // world
    double MapSizeKm = 0;
    double OutOfBoundsFailSeconds = 0;
    // weather
    double StormSurfaceNoiseBonus = 0;
    // decoy
    int32 DecoyPerMission = 0;
    double DecoyBatteryCostPercent = 0;

    bool bLoaded = false;

    static bool LoadBalance(const FString& JsonPath, FSDBalance& Out);
};
