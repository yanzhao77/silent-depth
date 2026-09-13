#include "Core/SubmarineCore.h"

#include <cmath>

static constexpr double SD_KNOTS_TO_KM_PER_SEC = 1.852 / 3600.0;

static double ClampD(double Value, double Lo, double Hi)
{
    return Value < Lo ? Lo : (Value > Hi ? Hi : Value);
}

static double NormDeg(double Deg)
{
    const double M = std::fmod(Deg, 360.0);
    return M < 0 ? M + 360.0 : M;
}

ESDSpeedBand BandForTargetSpeed(double SpeedKt, const FSDBalance& B)
{
    if (SpeedKt <= 0)
    {
        return ESDSpeedBand::Stopped;
    }
    if (SpeedKt <= B.SpeedBands[static_cast<int>(ESDSpeedBand::Silent)].SpeedMaxKt)
    {
        return ESDSpeedBand::Silent;
    }
    if (SpeedKt <= B.SpeedBands[static_cast<int>(ESDSpeedBand::Cruise)].SpeedMaxKt)
    {
        return ESDSpeedBand::Cruise;
    }
    return ESDSpeedBand::Full;
}

double ClampSpeedToBand(ESDSpeedBand Band, double SpeedKt, const FSDBalance& B)
{
    const int32 I = static_cast<int>(Band);
    const double Lo = Band == ESDSpeedBand::Stopped ? 0.0 : B.SpeedBands[I].SpeedMinKt;
    const double Hi = B.SpeedBands[I].SpeedMaxKt;
    return ClampD(SpeedKt, Lo, Hi);
}

double RawBandNoise(ESDSpeedBand Band, double SpeedKt, const FSDBalance& B)
{
    const int32 I = static_cast<int>(Band);
    if (Band == ESDSpeedBand::Stopped)
    {
        return B.NoiseBandBase[I];
    }
    return B.NoiseBandBase[I] + B.NoiseSlopePerKt[I] * (SpeedKt - B.SpeedBands[I].SpeedMinKt);
}

static double PreviousBandMaxNoise(ESDSpeedBand Band, const FSDBalance& B)
{
    const int32 I = static_cast<int>(Band) - 1;
    if (I < 0)
    {
        return 0.0;
    }
    return BandNoise(static_cast<ESDSpeedBand>(I), B.SpeedBands[I].SpeedMaxKt, B);
}

double BandNoise(ESDSpeedBand Band, double SpeedKt, const FSDBalance& B)
{
    const double Raw = RawBandNoise(Band, SpeedKt, B);
    if (Band == ESDSpeedBand::Stopped)
    {
        return Raw;
    }
    return FMath::Max(Raw, PreviousBandMaxNoise(Band, B));
}

double LayerDistance(ESDDepthLayer A, ESDDepthLayer B)
{
    return FMath::Abs(static_cast<int>(A) - static_cast<int>(B));
}

double LayerMidM(ESDDepthLayer L, const FSDBalance& B)
{
    const FSDDepthLayer& Cfg = B.DepthLayers[static_cast<int>(L)];
    return (Cfg.MinM + Cfg.MaxM) / 2.0;
}

double ComputeNoise(
    ESDSpeedBand Band,
    double SpeedKt,
    ESDDepthLayer DepthLayer,
    bool bInTransition,
    ESDDepthLayer TargetLayer,
    double Hull,
    ESDWeatherKind Weather,
    const FSDBalance& B
)
{
    const double Base = BandNoise(Band, SpeedKt, B);
    const double ModCurrent = B.DepthLayers[static_cast<int>(DepthLayer)].NoiseMod;
    const double ModOther = bInTransition ? B.DepthLayers[static_cast<int>(TargetLayer)].NoiseMod : ModCurrent;
    const double LayerNoise = (ModCurrent + ModOther) / 2.0;
    double Noise = Base + LayerNoise;
    if (Hull <= B.DamagedThreshold)
    {
        Noise += B.DamagedNoiseBonus;
    }
    if (Weather == ESDWeatherKind::Storm && DepthLayer == ESDDepthLayer::Surface)
    {
        Noise += B.StormSurfaceNoiseBonus;
    }
    return ClampD(Noise, 0.0, 100.0);
}

void SubmarineStep(
    FSDSubmarineState& S,
    const FSDPlayerInputs& In,
    const FSDBalance& B,
    double Dt,
    ESDWeatherKind Weather
)
{
    // Neutral effects: the historical behaviour, unchanged.
    SubmarineStep(S, In, B, FSDPropulsionEffects(), Dt, Weather);
}

void SubmarineStep(
    FSDSubmarineState& S,
    const FSDPlayerInputs& In,
    const FSDBalance& B,
    const FSDPropulsionEffects& Propulsion,
    double Dt,
    ESDWeatherKind Weather
)
{
    // PROP-001: the fitted propulsor scales the ordered speed, the acceleration
    // cap and the battery drain, and shifts the radiated noise. A neutral
    // effect (1.0 / 0.0) reproduces the balance exactly.
    const double OrderedThrottle = In.Throttle * FMath::Max(Propulsion.SpeedScale, 0.0);

    // 1. speed intent: band + in-band target; LOW BATTERY caps at SILENT.
    ESDSpeedBand Band = BandForTargetSpeed(OrderedThrottle, B);
    double Target = ClampSpeedToBand(Band, OrderedThrottle, B);
    if (S.bLowBattery && Target > B.SpeedBands[static_cast<int>(ESDSpeedBand::Silent)].SpeedMaxKt)
    {
        Band = ESDSpeedBand::Silent;
        Target = B.SpeedBands[static_cast<int>(ESDSpeedBand::Silent)].SpeedMaxKt;
    }
    S.SpeedBand = Band;
    S.TargetSpeedKt = Target;

    // 2. integrate speed toward target (continuous in-band acceleration).
    const double MaxStep = B.SubmarineAccelKtPerS * FMath::Max(Propulsion.AccelScale, 0.0) * Dt;
    const double Delta = Target - S.SpeedKt;
    const double Step = Delta > 0 ? FMath::Min(Delta, MaxStep) : FMath::Max(Delta, -MaxStep);
    S.SpeedKt = ClampD(S.SpeedKt + Step, 0.0, B.SpeedBands[static_cast<int>(ESDSpeedBand::Full)].SpeedMaxKt);
    if (FMath::Abs(S.SpeedKt) < 1e-9)
    {
        S.SpeedKt = 0.0;
    }

    // 2b. silent running toggle.
    S.bSilentRunning = In.bSilentRunning;

    // 3. turn: FULL band turns slower; LOW BATTERY halves the rate.
    const double BaseTurn = Band == ESDSpeedBand::Full
        ? B.RudderTurnRateDegPerSecFullSpeed
        : B.RudderTurnRateDegPerSec;
    const double TurnRate = S.bLowBattery ? BaseTurn * B.LowBatteryTurnRateFactor : BaseTurn;
    S.HeadingDeg = NormDeg(S.HeadingDeg + In.Rudder * TurnRate * Dt);

    // 4. movement: position integrates speed x heading (north-up).
    const double Rad = S.HeadingDeg * PI / 180.0;
    const double V = S.SpeedKt * SD_KNOTS_TO_KM_PER_SEC;
    S.PosXKm += FMath::Sin(Rad) * V * Dt;
    S.PosYKm += FMath::Cos(Rad) * V * Dt;

    // 5. depth layer transitions (F2: N s per layer).
    ESDDepthLayer DepthTarget = In.DepthLayerTarget;
    if (DepthTarget == S.DepthLayer)
    {
        if (S.DepthTransitionT != 0.0)
        {
            S.DepthTransitionT = 0.0;
            S.TargetDepthLayer = S.DepthLayer;
        }
        S.DepthM = LayerMidM(S.DepthLayer, B);
    }
    else
    {
        if (DepthTarget != S.TargetDepthLayer)
        {
            S.TargetDepthLayer = DepthTarget;
            S.DepthTransitionT = LayerDistance(S.DepthLayer, DepthTarget) * B.DepthTransitionSecondsPerLayer;
        }
        else if (S.DepthTransitionT == 0.0)
        {
            S.DepthTransitionT = LayerDistance(S.DepthLayer, DepthTarget) * B.DepthTransitionSecondsPerLayer;
        }
        if (S.DepthTransitionT != 0.0)
        {
            S.DepthTransitionT -= Dt;
            if (S.DepthTransitionT <= 1e-9)
            {
                S.DepthLayer = S.TargetDepthLayer;
                S.DepthTransitionT = 0.0;
            }
        }
        const double From = LayerMidM(S.DepthLayer, B);
        const double To = LayerMidM(S.TargetDepthLayer, B);
        if (S.DepthTransitionT != 0.0)
        {
            const double Total = FMath::Max(
                LayerDistance(S.DepthLayer, S.TargetDepthLayer) * B.DepthTransitionSecondsPerLayer,
                1e-9
            );
            const double Progress = 1.0 - S.DepthTransitionT / Total;
            S.DepthM = From + (To - From) * ClampD(Progress, 0.0, 1.0);
        }
        else
        {
            S.DepthM = From;
        }
    }

    // 6. battery: band drain + silent extra + surface/deep charge.
    const FSDSpeedBand& BandCfg = B.SpeedBands[static_cast<int>(S.SpeedBand)];
    double BatteryDelta = -BandCfg.BatteryDrainPerSec * FMath::Max(Propulsion.BatteryDrainScale, 0.0) * Dt;
    if (S.bSilentRunning)
    {
        BatteryDelta -= B.SilentRunningExtraPerSec * Dt;
    }
    const FSDDepthLayer& LayerCfg = B.DepthLayers[static_cast<int>(S.DepthLayer)];
    double Charge = LayerCfg.ChargePerSec;
    if (S.DepthLayer == ESDDepthLayer::Surface &&
        static_cast<int>(S.SpeedBand) <= static_cast<int>(B.SurfaceFastChargeMaxBand))
    {
        Charge = B.SurfaceFastChargePerSec;
    }
    BatteryDelta += Charge * Dt;                          // surface recharge (fast)
    BatteryDelta += LayerCfg.ExtraBatteryPerSec * Dt;     // deep ballast recharge
    S.Battery = ClampD(S.Battery + BatteryDelta, 0.0, B.BatteryCapacity);
    S.bLowBattery = S.Battery < B.LowBatteryThreshold;

    // battery == 0 -> forced surface (punitive path).
    if (S.Battery <= 0.0)
    {
        S.DepthLayer = ESDDepthLayer::Surface;
        S.TargetDepthLayer = ESDDepthLayer::Surface;
        S.DepthTransitionT = 0.0;
        S.bSilentRunning = false;
        S.Detection = B.ForcedSurfaceDetection;
    }

    // 7. noise (F1 + depth mod + hull bonus + storm bonus; mean in transit).
    S.Noise = ComputeNoise(
        S.SpeedBand,
        S.SpeedKt,
        S.DepthLayer,
        S.DepthTransitionT != 0.0,
        S.TargetDepthLayer,
        S.Hull,
        Weather,
        B
    );
    // A quiet propulsor lowers the radiated figure; noise never goes negative.
    S.Noise = FMath::Max(S.Noise + Propulsion.NoiseOffset, 0.0);

    // 8. out-of-bounds timer (defeat decided elsewhere, 60 s data only).
    const bool Inside = S.PosXKm >= 0.0 && S.PosXKm <= B.MapSizeKm &&
                        S.PosYKm >= 0.0 && S.PosYKm <= B.MapSizeKm;
    if (Inside)
    {
        S.OutOfBoundsTimer = 0.0;
    }
    else
    {
        S.OutOfBoundsTimer = FMath::Min(S.OutOfBoundsTimer + Dt, B.OutOfBoundsFailSeconds);
    }
}
