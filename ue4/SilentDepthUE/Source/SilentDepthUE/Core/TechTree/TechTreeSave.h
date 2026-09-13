#pragma once

#include "CoreMinimal.h"

#include "Core/Save/SDGameSettings.h"
#include "Core/Save/SDMissionStats.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Dom/JsonObject.h"

/**
 * Tech-tree save document (SAVE-001) and its strict reader (SAVE-002).
 *
 * The document is a plain, versioned payload serialised to JSON, so it can be
 * read, diffed, migrated and tamper-checked without a live game world. It is the
 * whole session save: the research account, the per-platform equipment
 * assignments, the mission records with their statistics roll-up, and the
 * player settings including the language. The type keeps its original name
 * because the slot subsystem and every migration path already carry it.
 *
 * Hard rules:
 *  - Reading never partially applies. A payload that fails validation leaves
 *    the caller's data untouched.
 *  - An older or missing version is rebuilt from scratch rather than guessed
 *    at; a newer version is rejected outright, because this build cannot know
 *    what future fields mean.
 *  - Unknown ids, illegal slots and a mismatched signature are rejected before
 *    anything reaches the runtime.
 *
 * The signature is a tamper check, not a security boundary: it catches hand
 * edits and corrupted files, and anyone who can edit the file can also
 * recompute it.
 *
 * Version 2 added the progression, statistics and settings sections. A version 1
 * document still loads: its account and loadouts are kept and the new sections
 * take their defaults, because inventing a score the old build never recorded
 * would be worse than showing none.
 */
namespace SDTechTree
{
    constexpr int32 SaveSchemaVersion = 2;
    constexpr const TCHAR* SaveSchemaId = TEXT("silent-depth-save-v2");

    /** One equipped item in one slot of one platform. */
    struct FSDLoadoutAssignment
    {
        /** Submarine node id. */
        FString PlatformId;
        /** Logical slot name, e.g. "TORPEDO" or "SOCKET_SONAR_BOW". */
        FString SlotName;
        /** Equipped node id. */
        FString CandidateId;
        /**
         * How many rounds of this candidate are loaded (WPN-001). One slot is
         * filled once, so the count is what the payload capacity constrains:
         * four tubes filled with four Mk 48 is one assignment with count 4.
         */
        int32 Count = 1;
    };

    /** The whole tech-tree save section. */
    struct FSDTechTreeSaveData
    {
        int32 SchemaVersion = SaveSchemaVersion;
        FSDResearchAccount Account;
        /** Sorted by (PlatformId, SlotName) whenever it is committed. */
        TArray<FSDLoadoutAssignment> Loadouts;
        /** Sorted by mission id whenever it is committed. */
        TArray<FSDMissionRecord> Missions;
        /** Roll-up that must agree with Missions (checked on read and write). */
        FSDStatistics Statistics;
        FSDSettings Settings;
        /**
         * Submarine the player sails (SUB-001). Empty means "not chosen yet";
         * a non-empty id must be an unlocked submarine node, because the pawn
         * resolves its assets from this and must never invent a hull.
         */
        FString SelectedPlatformId;
    };

    /** Sorts the loadout list into its canonical order. */
    void NormalizeSaveData(FSDTechTreeSaveData& InOut);

    /**
     * Tamper-check fingerprint over the account and the loadout list. It
     * catches hand edits and corrupted files; it is not a security boundary.
     */
    uint64 ComputeSaveSignature(
        const FSDTechTreeSaveData& Data,
        const FSDResearchAccountService& Accounts);

    /** Writes the document. Array order is canonical, so bytes are stable. */
    void WriteSaveToJson(const FSDTechTreeSaveData& Data, const TSharedRef<FJsonObject>& OutJson);

    /**
     * Reads and validates a document. Migrates a missing or older version by
     * rebuilding an empty account, rejects a newer one, and validates every id.
     */
    bool ReadSaveFromJson(
        const TSharedPtr<FJsonObject>& Json,
        const FSDResearchAccountService& Accounts,
        FSDTechTreeSaveData& OutData,
        FSDTechTreeLoadReport& Report);

    /**
     * Full validation: account rules plus loadout rules. Platform ids must name
     * submarine nodes, candidates must exist, and a slot may not appear twice
     * on the same platform.
     */
    bool ValidateSaveData(
        const FSDTechTreeSaveData& Data,
        const FSDResearchAccountService& Accounts,
        FSDTechTreeLoadReport& Report);

    /**
     * Checks every saved loadout against the compatibility matrix: structure
     * validation is ValidateSaveData's job, this adds the "may this candidate
     * go in this slot on this platform" question that TECH-005 answers. A row
     * that the matrix does not allow fails with INCOMPATIBLE_LOADOUT.
     */
    bool ValidateSaveCompatibility(
        const FSDTechTreeSaveData& Data,
        const FSDEquipmentService& Equipment,
        ESDEquipPolicy Policy,
        FSDTechTreeLoadReport& Report);

    /** Writes the JSON document to a file. */
    bool SaveTechTreeToFile(
        const FString& Path,
        const FSDTechTreeSaveData& Data,
        const FSDResearchAccountService& Accounts,
        FSDTechTreeLoadReport& Report);

    /**
     * Serialises the document to a string, signature included, exactly as the
     * file writer does. This is the interchange form: a browser export, a slot
     * payload and a file all carry the same bytes.
     */
    bool WriteDocumentToString(
        const FSDTechTreeSaveData& Data,
        const FSDResearchAccountService& Accounts,
        FString& OutJson,
        FSDTechTreeLoadReport& Report);

    /** Reads and validates a document from a string. Never partially applies. */
    bool ReadDocumentFromString(
        const FString& Json,
        const FSDResearchAccountService& Accounts,
        FSDTechTreeSaveData& OutData,
        FSDTechTreeLoadReport& Report);

    /** Reads the JSON document from a file. */
    bool LoadTechTreeFromFile(
        const FString& Path,
        const FSDResearchAccountService& Accounts,
        FSDTechTreeSaveData& OutData,
        FSDTechTreeLoadReport& Report);
}
