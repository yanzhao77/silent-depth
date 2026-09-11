#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Subsystems/GameInstanceSubsystem.h"

#include "SilentDepthSaveSubsystem.generated.h"

/**
 * Save-slot I/O on top of the versioned save document.
 *
 * The document format, its validation, its migration and its tamper check all
 * live in the tech-tree save module; this subsystem only moves bytes into and
 * out of UE save slots, and it does so the way the migration plan requires:
 *
 *   write a temporary slot -> read it back and validate it -> write the real
 *   slot -> read that back and validate it -> drop the temporary slot
 *
 * A failure anywhere leaves the previous real slot untouched. Nothing is
 * promoted before it has been read back and verified.
 */
UCLASS()
class SILENTDEPTHUE_API USilentDepthSaveSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    /** Slot the game uses unless a caller names another one. */
    static const FString& DefaultSlotName();

    /** True when a readable slot exists. */
    bool DoesSlotExist(const FString& SlotName) const;

    /**
     * Saves through a temporary slot and read-back verification. Returns false
     * with the previous slot still in place when anything fails.
     */
    bool SaveToSlot(
        const FString& SlotName,
        const SDTechTree::FSDTechTreeSaveData& Data,
        FSDTechTreeLoadReport& Report);

    /** Loads and validates a slot. Leaves OutData default on any failure. */
    bool LoadFromSlot(
        const FString& SlotName,
        SDTechTree::FSDTechTreeSaveData& OutData,
        FSDTechTreeLoadReport& Report);

    /** Strict reader for an exported document (browser JSON, test fixture). */
    bool ImportFromJson(
        const FString& Json,
        SDTechTree::FSDTechTreeSaveData& OutData,
        FSDTechTreeLoadReport& Report);

    /** Strict writer for the same document, for export or upload. */
    bool ExportToJson(
        const SDTechTree::FSDTechTreeSaveData& Data,
        FString& OutJson,
        FSDTechTreeLoadReport& Report);

private:
    /** The research-account service that validates documents, or nullptr. */
    const SDTechTree::FSDResearchAccountService* GetAccounts() const;

    /** Runs a save/load round trip in a scratch slot and logs the outcome. */
    void RunStartupSelfTest();
};
