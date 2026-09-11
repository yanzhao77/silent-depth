#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeTypes.h"
#include "Dom/JsonObject.h"

/**
 * Tech-tree save document (SAVE-001) and its strict reader (SAVE-002).
 *
 * The document is a plain, versioned payload serialised to JSON, so it can be
 * read, diffed, migrated and tamper-checked without a live game world. It holds
 * the research account and the per-platform equipment assignments.
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
 * Still to come: the USaveGame slot wrapper and the settings/statistics/language
 * sections of the full save. This file is the tech-tree section only.
 */
namespace SDTechTree
{
    constexpr int32 SaveSchemaVersion = 1;
    constexpr const TCHAR* SaveSchemaId = TEXT("silent-depth-tech-tree-save-v1");

    /** One equipped item in one slot of one platform. */
    struct FSDLoadoutAssignment
    {
        /** Submarine node id. */
        FString PlatformId;
        /** Logical slot name, e.g. "TORPEDO" or "SOCKET_SONAR_BOW". */
        FString SlotName;
        /** Equipped node id. */
        FString CandidateId;
    };

    /** The whole tech-tree save section. */
    struct FSDTechTreeSaveData
    {
        int32 SchemaVersion = SaveSchemaVersion;
        FSDResearchAccount Account;
        /** Sorted by (PlatformId, SlotName) whenever it is committed. */
        TArray<FSDLoadoutAssignment> Loadouts;
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
