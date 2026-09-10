#include "Core/Balance.h"

#include "Misc/FileHelper.h"
#include "Serialization/JsonSerializer.h"

namespace
{
int32 SpeedBandIndex(const FString& Name)
{
    if (Name == TEXT("STOPPED")) return 0;
    if (Name == TEXT("SILENT")) return 1;
    if (Name == TEXT("CRUISE")) return 2;
    if (Name == TEXT("FULL")) return 3;
    return 0;
}

int32 DepthLayerIndex(const FString& Name)
{
    if (Name == TEXT("Surface")) return 0;
    if (Name == TEXT("Periscope")) return 1;
    if (Name == TEXT("Shallow")) return 2;
    if (Name == TEXT("Medium")) return 3;
    if (Name == TEXT("Deep")) return 4;
    return 0;
}

double GetNum(const TSharedPtr<FJsonObject>& Obj, const TCHAR* Key, double Fallback = 0)
{
    if (!Obj.IsValid()) return Fallback;
    const TSharedPtr<FJsonValue>* Val = Obj->Values.Find(Key);
    if (!Val || !(*Val).IsValid()) return Fallback;
    return (*Val)->AsNumber();
}
}  // namespace

bool FSDBalance::LoadBalance(const FString& JsonPath, FSDBalance& Out)
{
    FString JsonStr;
    if (!FFileHelper::LoadFileToString(JsonStr, *JsonPath))
    {
        return false;
    }

    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonStr);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        return false;
    }

    const TSharedPtr<FJsonObject> Sub = Root->GetObjectField(TEXT("submarine"));
    const TSharedPtr<FJsonObject> Battery = Root->GetObjectField(TEXT("battery"));
    const TSharedPtr<FJsonObject> Hull = Root->GetObjectField(TEXT("hull"));
    const TSharedPtr<FJsonObject> Rudder = Root->GetObjectField(TEXT("rudder"));
    const TSharedPtr<FJsonObject> World = Root->GetObjectField(TEXT("world"));
    const TSharedPtr<FJsonObject> DepthLayers = Root->GetObjectField(TEXT("depthLayers"));
    const TSharedPtr<FJsonObject> SpeedBands = Root->GetObjectField(TEXT("speedBands"));
    const TSharedPtr<FJsonObject> NoiseInterp = Root->GetObjectField(TEXT("noiseInterp"));
    const TSharedPtr<FJsonObject> Weather = Root->GetObjectField(TEXT("weather"));
    const TSharedPtr<FJsonObject> Decoy = Root->GetObjectField(TEXT("decoy"));

    if (!Sub.IsValid() || !Battery.IsValid() || !Hull.IsValid() || !Rudder.IsValid() ||
        !World.IsValid() || !DepthLayers.IsValid() || !SpeedBands.IsValid() ||
        !NoiseInterp.IsValid() || !Weather.IsValid() || !Decoy.IsValid())
    {
        return false;
    }

    Out.SubmarineAccelKtPerS = GetNum(Sub, TEXT("accelKtPerS"));

    static const TCHAR* BandNames[] = {TEXT("STOPPED"), TEXT("SILENT"), TEXT("CRUISE"), TEXT("FULL")};
    static const TCHAR* LayerNames[] = {TEXT("Surface"), TEXT("Periscope"), TEXT("Shallow"), TEXT("Medium"), TEXT("Deep")};

    for (int32 i = 0; i < 4; ++i)
    {
        const TSharedPtr<FJsonObject> Band = SpeedBands->GetObjectField(BandNames[i]);
        if (Band.IsValid())
        {
            Out.SpeedBands[i].SpeedMinKt = GetNum(Band, TEXT("speedMinKt"));
            Out.SpeedBands[i].SpeedMaxKt = GetNum(Band, TEXT("speedMaxKt"));
            Out.SpeedBands[i].BatteryDrainPerSec = GetNum(Band, TEXT("batteryDrainPerSec"));
        }
        const TSharedPtr<FJsonValue>* NIVal = NoiseInterp->Values.Find(BandNames[i]);
        if (NIVal && (*NIVal).IsValid() && (*NIVal)->Type == EJson::Object)
        {
            const TSharedPtr<FJsonObject> NI = (*NIVal)->AsObject();
            Out.NoiseBandBase[i] = GetNum(NI, TEXT("bandBase"));
            Out.NoiseSlopePerKt[i] = GetNum(NI, TEXT("slopePerKt"));
        }
        else if (NIVal && (*NIVal).IsValid())
        {
            Out.NoiseBandBase[i] = (*NIVal)->AsNumber();   // STOPPED is a bare number
        }
    }

    Out.RudderTurnRateDegPerSec = GetNum(Rudder, TEXT("turnRateDegPerSec"));
    Out.RudderTurnRateDegPerSecFullSpeed = GetNum(Rudder, TEXT("turnRateDegPerSecFullSpeed"));
    Out.LowBatteryTurnRateFactor = GetNum(Rudder, TEXT("lowBatteryTurnRateFactor"));

    for (int32 i = 0; i < 5; ++i)
    {
        const TSharedPtr<FJsonObject> Layer = DepthLayers->GetObjectField(LayerNames[i]);
        if (Layer.IsValid())
        {
            Out.DepthLayers[i].MinM = GetNum(Layer, TEXT("minM"));
            Out.DepthLayers[i].MaxM = GetNum(Layer, TEXT("maxM"));
            Out.DepthLayers[i].NoiseMod = GetNum(Layer, TEXT("noiseMod"));
            Out.DepthLayers[i].ChargePerSec = GetNum(Layer, TEXT("chargePerSec"));
            Out.DepthLayers[i].ExtraBatteryPerSec = GetNum(Layer, TEXT("extraBatteryPerSec"));
        }
    }
    Out.DepthTransitionSecondsPerLayer = GetNum(Root, TEXT("depthTransitionSecondsPerLayer"));

    Out.BatteryCapacity = GetNum(Battery, TEXT("capacity"));
    Out.LowBatteryThreshold = GetNum(Battery, TEXT("lowBatteryThreshold"));
    Out.SilentRunningExtraPerSec = GetNum(Battery, TEXT("silentRunningExtraPerSec"));
    Out.ForcedSurfaceDetection = GetNum(Battery, TEXT("forcedSurfaceDetection"));
    Out.SurfaceFastChargePerSec = GetNum(Battery, TEXT("surfaceFastChargePerSec"));
    Out.SurfaceFastChargeMaxBand = static_cast<ESDSpeedBand>(
        SpeedBandIndex(Battery->GetStringField(TEXT("surfaceFastChargeMaxBand")))
    );

    Out.HullPlayerMax = GetNum(Hull, TEXT("playerMax"));
    Out.DamagedThreshold = GetNum(Hull, TEXT("damagedThreshold"));
    Out.DamagedNoiseBonus = GetNum(Hull, TEXT("damagedNoiseBonus"));

    Out.MapSizeKm = GetNum(World, TEXT("mapSizeKm"));
    Out.OutOfBoundsFailSeconds = GetNum(World, TEXT("outOfBoundsFailSeconds"));

    const TSharedPtr<FJsonObject> Storm = Weather->GetObjectField(TEXT("Storm"));
    if (Storm.IsValid())
    {
        Out.StormSurfaceNoiseBonus = GetNum(Storm, TEXT("surfaceNoiseBonus"));
    }

    Out.DecoyPerMission = FMath::RoundToInt(GetNum(Decoy, TEXT("perMission")));
    Out.DecoyBatteryCostPercent = GetNum(Decoy, TEXT("batteryCostPercent"));

    Out.bLoaded = true;
    return true;
}
