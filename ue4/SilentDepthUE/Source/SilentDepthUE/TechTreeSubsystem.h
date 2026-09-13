#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Core/TechTree/TechTreeUnlockService.h"
#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeViewModel.h"
#include "Subsystems/GameInstanceSubsystem.h"

#include "TechTreeSubsystem.generated.h"

/**
 * Owns the loaded technology trees for a game session.
 *
 * The five trees are loaded once when the game instance starts. A load failure
 * leaves the session with no tech tree at all (fail closed) and logs every
 * defect; later systems must check IsLoaded() rather than assume data exists.
 */
UCLASS()
class SILENTDEPTHUE_API USilentDepthTechTreeSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Loads from an explicit directory. Returns false and clears the tree. */
    bool LoadFrom(const SDTechTree::FSDTechTreePaths& Paths);

    bool IsLoaded() const { return bLoaded; }

    /** Only valid while IsLoaded() is true. */
    const FSDTechTree& GetTree() const { return Tree; }

    /** Read-only query layer over the loaded tree. */
    const SDTechTree::FSDNodeRegistry& GetRegistry() const { return Registry; }

    /** Deterministic unlock rules bound to the registry. */
    const SDTechTree::FSDUnlockService& GetUnlockService() const { return UnlockService; }

    /** Wallet and purchase transactions bound to the unlock service. */
    const SDTechTree::FSDResearchAccountService& GetResearchAccountService() const { return ResearchAccounts; }

    /** Compatibility matrix queries for fitting and save validation. */
    const SDTechTree::FSDEquipmentService& GetEquipmentService() const { return Equipment; }

    /** Screen rows for the UMG widgets; built on the services above. */
    const SDTechTree::FSDTechTreeViewModel& GetViewModel() const { return ViewModel; }

    const FSDTechTreeLoadReport& GetLastReport() const { return LastReport; }

private:
    bool FailLoad(const FSDTechTreeLoadReport& Report);

    int32 CountPrerequisiteEdges() const;

    /** Logs the DEC-007 progression probe; only called with -sd-techtree-probe. */
    void RunStartupProbe();

    FSDTechTree Tree;
    SDTechTree::FSDNodeRegistry Registry;
    SDTechTree::FSDUnlockService UnlockService;
    SDTechTree::FSDResearchAccountService ResearchAccounts;
    SDTechTree::FSDEquipmentService Equipment;
    SDTechTree::FSDTechTreeViewModel ViewModel;
    FSDTechTreeLoadReport LastReport;
    bool bLoaded = false;
};
