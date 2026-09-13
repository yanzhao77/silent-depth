#include "Core/Platform/SDEquipmentEffects.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
constexpr int32 EquipmentEffectsVersion = 1;

double ReadNumber(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field, const double Fallback)
{
    double Value = 0.0;
    return Object->TryGetNumberField(Field, Value) ? Value : Fallback;
}

bool ReadBoolFlag(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field)
{
    bool Value = false;
    return Object->TryGetBoolField(Field, Value) && Value;
}

/**
 * Reads one "kind" or "branch" effect object. Every field is optional: the
 * table only states what it means to state, and anything absent leaves the
 * neutral value (0 or 1) rather than a guess.
 */
bool ReadEffectObject(const TSharedPtr<FJsonObject>& Object, FSDEquipmentEffectsTable::FBranchEffect& Out)
{
    Out.DecoyCountBonus = static_cast<int32>(ReadNumber(Object, TEXT("decoyCountBonus"), 0.0));
    Out.bEsm = ReadBoolFlag(Object, TEXT("esm"));
    Out.bThreatWarning = ReadBoolFlag(Object, TEXT("threatWarning"));
    Out.bTorpedoDefense = ReadBoolFlag(Object, TEXT("torpedoDefense"));
    Out.bAcousticCountermeasure = ReadBoolFlag(Object, TEXT("acousticCountermeasure"));
    Out.PassiveRangeKm = ReadNumber(Object, TEXT("passiveRangeKm"), 0.0);
    Out.PassiveAccuracy = ReadNumber(Object, TEXT("passiveAccuracy"), 0.0);
    Out.ActiveRangeKm = ReadNumber(Object, TEXT("activeRangeKm"), 0.0);
    Out.ActiveCooldownSeconds = ReadNumber(Object, TEXT("activeCooldownSeconds"), 0.0);
    Out.ClassificationScale = ReadNumber(Object, TEXT("classificationScale"), 1.0);
    return true;
}

bool ReadEffectMap(
    const TSharedPtr<FJsonObject>& Parent,
    const TCHAR* Field,
    TMap<FString, FSDEquipmentEffectsTable::FBranchEffect>& Out,
    const FString& Where,
    FSDTechTreeLoadReport& Report)
{
    const TSharedPtr<FJsonObject>* Map = nullptr;
    if (!Parent->TryGetObjectField(Field, Map) || Map == nullptr)
    {
        return true;  // an empty map is a valid table
    }
    for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : (*Map)->Values)
    {
        if (!Pair.Value.IsValid() || Pair.Value->Type != EJson::Object)
        {
            Report.AddError(
                TEXT("INVALID_FIELD_TYPE"),
                FString::Printf(TEXT("%s.%s.%s"), *Where, Field, *Pair.Key),
                TEXT("an effect entry must be an object"));
            return false;
        }
        FSDEquipmentEffectsTable::FBranchEffect Effect;
        ReadEffectObject(Pair.Value->AsObject(), Effect);
        Out.Add(Pair.Key, Effect);
    }
    return true;
}

/** Band index for a tier, or INDEX_NONE when no band covers it. */
int32 BandIndexForTier(const TArray<FSDEquipmentEffectsTable::FBand>& Bands, const int32 Tier)
{
    for (int32 Index = 0; Index < Bands.Num(); ++Index)
    {
        if (Tier <= Bands[Index].MaxTier)
        {
            return Index;
        }
    }
    return INDEX_NONE;
}
}

namespace SDPlatform
{
FString DefaultEquipmentEffectsPath()
{
    return FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("equipment_effects.json");
}

bool LoadEquipmentEffects(
    const FString& JsonPath,
    FSDEquipmentEffectsTable& OutTable,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    OutTable = FSDEquipmentEffectsTable();

    FString Text;
    if (!FFileHelper::LoadFileToString(Text, *JsonPath))
    {
        Report.AddError(TEXT("MISSING_FILE"), JsonPath, TEXT("the equipment effect table could not be read"));
        return false;
    }

    TSharedPtr<FJsonObject> Document;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, Document) || !Document.IsValid())
    {
        Report.AddError(TEXT("INVALID_JSON"), JsonPath, TEXT("the effect table is not a JSON object"));
        return false;
    }

    double Version = 0.0;
    if (!Document->TryGetNumberField(TEXT("version"), Version)
        || static_cast<int32>(Version) != EquipmentEffectsVersion)
    {
        Report.AddError(
            TEXT("SCHEMA_VERSION"),
            JsonPath,
            FString::Printf(TEXT("the table must declare version %d"), EquipmentEffectsVersion));
        return false;
    }

    FSDEquipmentEffectsTable Table;
    const TArray<TSharedPtr<FJsonValue>>* BandValues = nullptr;
    if (Document->TryGetArrayField(TEXT("tierBands"), BandValues) && BandValues != nullptr)
    {
        for (const TSharedPtr<FJsonValue>& Value : *BandValues)
        {
            if (!Value.IsValid() || Value->Type != EJson::Object)
            {
                continue;
            }
            const TSharedPtr<FJsonObject> Band = Value->AsObject();
            FSDEquipmentEffectsTable::FBand Parsed;
            double MaxTier = 0.0;
            Band->TryGetNumberField(TEXT("maxTier"), MaxTier);
            Parsed.MaxTier = static_cast<int32>(MaxTier);
            Band->TryGetStringField(TEXT("label"), Parsed.Label);
            Table.Bands.Add(MoveTemp(Parsed));
        }
    }

    const TSharedPtr<FJsonObject>* Propulsion = nullptr;
    if (Document->TryGetObjectField(TEXT("propulsion"), Propulsion) && Propulsion != nullptr)
    {
        const TSharedPtr<FJsonObject>* Kinds = nullptr;
        if ((*Propulsion)->TryGetObjectField(TEXT("kindEffects"), Kinds) && Kinds != nullptr)
        {
            for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : (*Kinds)->Values)
            {
                if (!Pair.Value.IsValid() || Pair.Value->Type != EJson::Object)
                {
                    Report.AddError(
                        TEXT("INVALID_FIELD_TYPE"),
                        FString::Printf(TEXT("propulsion.kindEffects.%s"), *Pair.Key),
                        TEXT("a kind effect must be an object"));
                    return false;
                }
                const TSharedPtr<FJsonObject> Effect = Pair.Value->AsObject();
                FSDEquipmentEffectsTable::FKindEffect Parsed;
                const TArray<TSharedPtr<FJsonValue>>* Offsets = nullptr;
                if (Effect->TryGetArrayField(TEXT("noiseOffsetPerBand"), Offsets) && Offsets != nullptr)
                {
                    for (const TSharedPtr<FJsonValue>& Offset : *Offsets)
                    {
                        if (Offset.IsValid() && Offset->Type == EJson::Number)
                        {
                            Parsed.NoiseOffsetPerBand.Add(Offset->AsNumber());
                        }
                    }
                }
                Parsed.AccelScale = ReadNumber(Effect, TEXT("accelScale"), 1.0);
                Parsed.SpeedScale = ReadNumber(Effect, TEXT("speedScale"), 1.0);
                Parsed.BatteryDrainScale = ReadNumber(Effect, TEXT("batteryDrainScale"), 1.0);
                Table.PropulsionKinds.Add(Pair.Key, MoveTemp(Parsed));
            }
        }
    }

    const TSharedPtr<FJsonObject>* Defensive = nullptr;
    if (Document->TryGetObjectField(TEXT("defensive"), Defensive) && Defensive != nullptr
        && !ReadEffectMap(*Defensive, TEXT("branchEffects"), Table.DefensiveBranches, TEXT("defensive"), Report))
    {
        return false;
    }
    const TSharedPtr<FJsonObject>* Sensors = nullptr;
    if (Document->TryGetObjectField(TEXT("sensors"), Sensors) && Sensors != nullptr
        && !ReadEffectMap(*Sensors, TEXT("branchEffects"), Table.SensorBranches, TEXT("sensors"), Report))
    {
        return false;
    }

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        return false;
    }
    OutTable = MoveTemp(Table);
    return true;
}

FSDEffectiveCapabilities ComputeEffectiveCapabilities(
    const SDTechTree::FSDEquipmentService& Equipment,
    const TArray<SDTechTree::FSDLoadoutAssignment>& Loadouts,
    const FString& PlatformId,
    const FSDEquipmentEffectsTable& Table)
{
    FSDEffectiveCapabilities Capabilities;
    Capabilities.PlatformId = PlatformId;
    if (!Equipment.IsInitialized() || PlatformId.IsEmpty())
    {
        return Capabilities;
    }
    const FSDTechTree& Tree = Equipment.GetTree();

    // The fitted set, in id order, so the result does not depend on save order.
    TArray<FString> FittedIds;
    for (const SDTechTree::FSDLoadoutAssignment& Assignment : Loadouts)
    {
        if (Assignment.PlatformId.Equals(PlatformId, ESearchCase::CaseSensitive))
        {
            FittedIds.AddUnique(Assignment.CandidateId);
        }
    }
    FittedIds.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });

    const FSDTechNode* BestPropulsion = nullptr;
    for (const FString& NodeId : FittedIds)
    {
        const FSDTechNode* Node = SDFindNode(Tree, NodeId);
        if (Node == nullptr)
        {
            continue;
        }
        Capabilities.SourceNodeIds.Add(NodeId);

        if (Node->Category == ESDTechCategory::Propulsion)
        {
            // One propulsor is installed; the highest tier wins, ties by id.
            if (BestPropulsion == nullptr || static_cast<uint8>(Node->Tier) > static_cast<uint8>(BestPropulsion->Tier))
            {
                BestPropulsion = Node;
            }
            continue;
        }

        if (Node->Category == ESDTechCategory::Defensive)
        {
            for (const FString& Branch : Node->Detail.Defensive.BranchIds)
            {
                if (const FSDEquipmentEffectsTable::FBranchEffect* Effect =
                    Table.DefensiveBranches.Find(Branch))
                {
                    Capabilities.Defensive.DecoyCountBonus += Effect->DecoyCountBonus;
                    Capabilities.Defensive.bEsm |= Effect->bEsm;
                    Capabilities.Defensive.bThreatWarning |= Effect->bThreatWarning;
                    Capabilities.Defensive.bTorpedoDefense |= Effect->bTorpedoDefense;
                    Capabilities.Defensive.bAcousticCountermeasure |= Effect->bAcousticCountermeasure;
                }
            }
            continue;
        }

        if (Node->Category == ESDTechCategory::Sensor)
        {
            if (const FSDEquipmentEffectsTable::FBranchEffect* Effect =
                Table.SensorBranches.Find(Node->Detail.Sensor.BranchId))
            {
                // Sensors complement each other: best range and accuracy, best
                // (shortest) cooldown, best processing.
                Capabilities.Sensors.PassiveRangeKm =
                    FMath::Max(Capabilities.Sensors.PassiveRangeKm, Effect->PassiveRangeKm);
                Capabilities.Sensors.PassiveAccuracy =
                    FMath::Max(Capabilities.Sensors.PassiveAccuracy, Effect->PassiveAccuracy);
                Capabilities.Sensors.ActiveRangeKm =
                    FMath::Max(Capabilities.Sensors.ActiveRangeKm, Effect->ActiveRangeKm);
                if (Effect->ActiveCooldownSeconds > 0.0)
                {
                    Capabilities.Sensors.ActiveCooldownSeconds =
                        Capabilities.Sensors.ActiveCooldownSeconds <= 0.0
                            ? Effect->ActiveCooldownSeconds
                            : FMath::Min(Capabilities.Sensors.ActiveCooldownSeconds, Effect->ActiveCooldownSeconds);
                }
                Capabilities.Sensors.ClassificationScale =
                    FMath::Max(Capabilities.Sensors.ClassificationScale, Effect->ClassificationScale);
            }
        }
    }

    if (BestPropulsion != nullptr)
    {
        const FString& Kind = BestPropulsion->Detail.Propulsion.Kind.IsEmpty()
            ? BestPropulsion->Detail.Propulsion.BranchId
            : BestPropulsion->Detail.Propulsion.Kind;
        // The table's own default kind covers a node whose catalogue entry does
        // not state one; without it the node would silently contribute nothing.
        if (const FSDEquipmentEffectsTable::FKindEffect* Effect = Table.PropulsionKinds.Find(Kind))
        {
            const int32 Band = BandIndexForTier(Table.Bands, static_cast<int32>(BestPropulsion->Tier));
            if (Band != INDEX_NONE && Effect->NoiseOffsetPerBand.IsValidIndex(Band))
            {
                Capabilities.Propulsion.NoiseOffset = Effect->NoiseOffsetPerBand[Band];
            }
            Capabilities.Propulsion.AccelScale = Effect->AccelScale;
            Capabilities.Propulsion.SpeedScale = Effect->SpeedScale;
            Capabilities.Propulsion.BatteryDrainScale = Effect->BatteryDrainScale;
        }
    }

    return Capabilities;
}
}
