#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeTypes.h"

/**
 * PROP-001 / DEF-001 / SNS-001: what the equipped technology actually changes.
 *
 * The effects live in Config/SilentDepth/equipment_effects.json and are
 * explicitly initial playable values, not measurements: the propulsion and
 * sensor catalogues carry geometry and tiers, but no noise, speed or detection
 * figures, so nothing here may be presented as real data. This layer only
 * turns "what is equipped" into typed numbers the simulation can read.
 */
struct SILENTDEPTHUE_API FSDPropulsionEffects
{
    /** Added to the computed noise; negative is quieter. */
    double NoiseOffset = 0.0;
    double AccelScale = 1.0;
    /** Scales the platform's maximum speed. */
    double SpeedScale = 1.0;
    double BatteryDrainScale = 1.0;
};

struct SILENTDEPTHUE_API FSDSensorEffects
{
    double PassiveRangeKm = 0.0;
    double PassiveAccuracy = 0.0;
    double ActiveRangeKm = 0.0;
    double ActiveCooldownSeconds = 0.0;
    double ClassificationScale = 1.0;
};

struct SILENTDEPTHUE_API FSDDefensiveEffects
{
    int32 DecoyCountBonus = 0;
    bool bEsm = false;
    bool bThreatWarning = false;
    bool bTorpedoDefense = false;
    bool bAcousticCountermeasure = false;
};

/** Everything the equipped set contributes, in one read-only struct. */
struct SILENTDEPTHUE_API FSDEffectiveCapabilities
{
    FString PlatformId;
    FSDPropulsionEffects Propulsion;
    FSDSensorEffects Sensors;
    FSDDefensiveEffects Defensive;
    /** Node ids the numbers were derived from, in id order. */
    TArray<FString> SourceNodeIds;
};

/** The hand-written effect tables, parsed once and then read-only. */
struct SILENTDEPTHUE_API FSDEquipmentEffectsTable
{
    struct FBand
    {
        int32 MaxTier = 0;
        FString Label;
    };
    struct FKindEffect
    {
        /** One entry per band; a missing band contributes nothing. */
        TArray<double> NoiseOffsetPerBand;
        double AccelScale = 1.0;
        double SpeedScale = 1.0;
        double BatteryDrainScale = 1.0;
    };
    struct FBranchEffect
    {
        int32 DecoyCountBonus = 0;
        bool bEsm = false;
        bool bThreatWarning = false;
        bool bTorpedoDefense = false;
        bool bAcousticCountermeasure = false;
        double PassiveRangeKm = 0.0;
        double PassiveAccuracy = 0.0;
        double ActiveRangeKm = 0.0;
        double ActiveCooldownSeconds = 0.0;
        double ClassificationScale = 1.0;
    };

    TArray<FBand> Bands;
    TMap<FString, FKindEffect> PropulsionKinds;
    TMap<FString, FBranchEffect> DefensiveBranches;
    TMap<FString, FBranchEffect> SensorBranches;
};

namespace SDPlatform
{
    /** Config/SilentDepth/equipment_effects.json next to the project's Config. */
    FString DefaultEquipmentEffectsPath();

    /** Reads the tables. Fails closed on a missing file or a wrong version. */
    bool LoadEquipmentEffects(
        const FString& JsonPath,
        FSDEquipmentEffectsTable& OutTable,
        FSDTechTreeLoadReport& Report);

    /**
     * Turns the fitted equipment into typed effects.
     *
     * Only nodes the save lists for this platform are read, and a node the
     * effect table does not describe contributes nothing rather than a guess.
     * The result is deterministic: it depends on the loadout alone.
     */
    FSDEffectiveCapabilities ComputeEffectiveCapabilities(
        const SDTechTree::FSDEquipmentService& Equipment,
        const TArray<SDTechTree::FSDLoadoutAssignment>& Loadouts,
        const FString& PlatformId,
        const FSDEquipmentEffectsTable& Table);
}
