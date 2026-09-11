#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

/**
 * Loads the five technology trees from the runtime data directory (TECH-001).
 *
 * Runtime data is staged under Config/SilentDepth/TechTree/ by
 * tools/ue4/sync-tech-tree-data.mjs. The loader never reads the asset library:
 * a packaged build has no repo, and a second authority is exactly what the
 * migration forbids (ADR-002 / DATA-002).
 *
 * Every failure is explicit and the load is all-or-nothing. A missing file, an
 * unreadable or malformed document, a missing required field, an undeclared
 * token, a duplicate id or a dangling prerequisite produces a named error in
 * the report and leaves OutTree empty. Nothing is defaulted, inferred or
 * partially applied.
 */
namespace SDTechTree
{
    /** Where the runtime tech-tree documents live. */
    struct FSDTechTreePaths
    {
        FString Directory;

        /** Config/SilentDepth/TechTree next to the project's Config folder. */
        static FSDTechTreePaths ProjectDefault();

        /** Config/SilentDepth/research_cost.json, the DEC-004 cost rule. */
        static FString ProjectDefaultCostFile();
    };

    /**
     * Reads the DEC-004 research cost rule. Fails closed on a missing file or
     * invalid numbers so a forgotten load can never price the whole tree at
     * zero.
     */
    bool LoadResearchCostRule(
        const FString& Path,
        FSDResearchCostRule& OutRule,
        FSDTechTreeLoadReport& Report);

    /**
     * Reads the research rules: the DEC-004 cost rule plus the optional tier
     * gate. Both live in the same hand-written configuration file.
     */
    bool LoadResearchRules(
        const FString& Path,
        FSDResearchCostRule& OutCostRule,
        FSDTierGateRule& OutTierGate,
        FSDTechTreeLoadReport& Report);

    /** File names inside FSDTechTreePaths::Directory, one pair per category. */
    namespace Files
    {
        extern const TCHAR* SubmarineCatalogue;
        extern const TCHAR* SubmarineTree;
        extern const TCHAR* WeaponCatalogue;
        extern const TCHAR* WeaponTree;
        extern const TCHAR* SensorCatalogue;
        extern const TCHAR* SensorTree;
        extern const TCHAR* DefensiveCatalogue;
        extern const TCHAR* DefensiveTree;
        extern const TCHAR* PropulsionCatalogue;
        extern const TCHAR* PropulsionTree;
        extern const TCHAR* WeaponCompatibility;
        extern const TCHAR* WeaponSlots;
        extern const TCHAR* SensorCompatibility;
        extern const TCHAR* DefensiveCompatibility;
        extern const TCHAR* DefensiveSlots;
        extern const TCHAR* PropulsionCompatibility;
    }

    /**
     * Loads all five categories. On success OutTree is sorted, carries the
     * schema version, 50 tier rows and the parsed nodes; on failure OutTree is
     * reset and Report lists every defect found.
     */
    bool LoadTechTree(
        const FSDTechTreePaths& Paths,
        FSDTechTree& OutTree,
        FSDTechTreeLoadReport& Report);

    /**
     * Parses one category from in-memory documents. CategoryLabel only names
     * the category in error messages. An empty TreeJson is allowed: the
     * category then keeps its unlabelled T1..T10 ladder and no prerequisite
     * edges. Exposed so tests can drive a single category with synthetic JSON.
     *
     * The category is sorted and validated on its own, so its prerequisites
     * must resolve inside that category. LoadTechTree() validates again over
     * all five categories once they are merged.
     */
    bool ParseCategoryDocuments(
        ESDTechCategory Category,
        const FString& CategoryLabel,
        const FString& CatalogueJson,
        const FString& TreeJson,
        FSDTechTree& OutTree,
        FSDTechTreeLoadReport& Report);

    /**
     * Appends a category's compatibility matrix and slot definitions. Either
     * document may be empty, in which case that half is skipped. Exposed so a
     * caller can compose the dataset and so tests can drive one matrix.
     */
    bool LoadCategoryCompatibility(
        ESDTechCategory Category,
        const FString& CategoryLabel,
        const FString& CompatibilityJson,
        const FString& SlotsJson,
        FSDTechTree& OutTree,
        FSDTechTreeLoadReport& Report);
}
