#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeTypes.h"
#include "Dom/JsonObject.h"

/**
 * Shared plumbing for the tech-tree loader. Split out of TechTreeLoader.cpp so
 * each translation unit stays reviewable: this header declares the JSON helpers,
 * the per-category node builders and the tree-document appliers.
 *
 * Nothing here is part of the public loader contract; callers use
 * TechTreeLoader.h.
 */
namespace SDTechTree
{
namespace Internal
{
/** Reads a document, reporting MISSING_FILE when it is absent or unreadable. */
bool ReadTextFile(const FString& Path, FString& OutText, FSDTechTreeLoadReport& Report);

/** Parses a document, reporting INVALID_JSON when it is not a JSON object. */
bool ParseDocument(
    const FString& Text,
    const FString& Where,
    TSharedPtr<FJsonObject>& OutObject,
    FSDTechTreeLoadReport& Report);

const TArray<TSharedPtr<FJsonValue>>* FindArray(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field);
const TSharedPtr<FJsonObject> FindObjectField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field);

/**
 * Reads one Blender assembly document into the tree's socket bindings. Errors
 * on a missing assetId, an unknown purpose token, a duplicate logical id, a
 * malformed transform or a required socket the document never defines.
 */
bool LoadSocketBindingsFromDocument(
    const TSharedPtr<FJsonObject>& Document,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

/** Reads every *.json assembly document in a directory, in name order. */
void LoadSocketDirectory(
    const FString& Directory,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

/** Reads a field as a token, accepting JSON strings and numbers alike. */
FString FieldAsToken(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field);

/** Requires a non-empty string id, reporting MISSING_FIELD otherwise. */
bool RequireId(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    FString& OutId);

/**
 * Maps the status-like fields. An absent or empty field is not an error; a
 * present but undeclared token is UNKNOWN_TOKEN, and a token that is legal in
 * another category is CATEGORY_TOKEN_MISMATCH.
 */
bool MapProduction(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    ESDTechCategory Category,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDProductionStatus& OutValue);

bool MapEvidence(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    ESDTechCategory Category,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDEvidenceLevel& OutValue);

bool MapServiceStatus(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDServiceStatus& OutValue);

bool MapVerification(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDVerificationLevel& OutValue);

bool MapPriorityField(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDPriority& OutValue);

bool MapCoverage(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDAssetCoverage& OutValue);

bool MapSourceKind(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDSourceKind& OutValue);

/** Maps a tier field written either as "T3" or as the number 3. */
bool MapTier(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDTechTier& OutTier);

/** Reads the flat master/lod0..lod3 keys used by the submarine and weapon files. */
void ApplyFlatAssetPaths(const TSharedPtr<FJsonObject>& Object, FSDTechAssetRef& OutAsset);

/** Lookup map by node id. Used for matching only, never to drive ordering. */
TMap<FString, int32> IndexNodesById(const FSDTechTree& Tree);

/** Every category publishes its own complete T1..T10 ladder. */
void AppendTierLadder(FSDTechTree& Tree, ESDTechCategory Category);

void SetTierLabel(
    FSDTechTree& Tree,
    ESDTechCategory Category,
    ESDTechTier Tier,
    const FString& LabelEn,
    const FString& LabelZh,
    const FString& Description);

/** Reads a {"T1": "label", ...} map into the tier rows. */
void ApplyTierLabelMap(
    FSDTechTree& Tree,
    ESDTechCategory Category,
    const TSharedPtr<FJsonObject>& Map);

bool BuildSubmarineNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool BuildWeaponNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool BuildSensorNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool BuildDefensiveNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool BuildPropulsionNodes(
    const TSharedPtr<FJsonObject>& Catalogue,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

void ApplySubmarineTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree);
void ApplyWeaponTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree);
void ApplySensorTree(
    const TSharedPtr<FJsonObject>& TreeDoc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);
void ApplyDefensiveTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree);
void ApplyPropulsionTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree);

// Compatibility matrices and slot definitions (TECH-005). Each one appends to
// Tree.Compatibility / Tree.Slots. A row whose platform or candidate is not in
// the catalogue is recorded as a notice, not an error: the affected query fails
// closed, and the defect stays visible for DATA-005.
bool LoadWeaponCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool LoadWeaponSlots(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool LoadSensorCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool LoadDefensiveCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool LoadDefensiveSlots(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);

bool LoadPropulsionCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report);
}
}
