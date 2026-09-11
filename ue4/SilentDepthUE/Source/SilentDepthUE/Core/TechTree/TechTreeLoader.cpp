#include "Core/TechTree/TechTreeLoader.h"

#include "Core/TechTree/TechTreeLoaderInternal.h"
#include "Core/TechTree/TechTreeSchema.h"

#include "Misc/Paths.h"

namespace SDTechTree
{
namespace Files
{
const TCHAR* SubmarineCatalogue = TEXT("submarine_catalogue.json");
const TCHAR* SubmarineTree = TEXT("submarine_tree.json");
const TCHAR* WeaponCatalogue = TEXT("weapon_catalogue.json");
const TCHAR* WeaponTree = TEXT("weapon_tree.json");
const TCHAR* SensorCatalogue = TEXT("sensor_catalogue.json");
const TCHAR* SensorTree = TEXT("sensor_tree.json");
const TCHAR* DefensiveCatalogue = TEXT("defensive_catalogue.json");
const TCHAR* DefensiveTree = TEXT("defensive_tree.json");
const TCHAR* PropulsionCatalogue = TEXT("propulsion_catalogue.json");
const TCHAR* PropulsionTree = TEXT("propulsion_tree.json");
const TCHAR* WeaponCompatibility = TEXT("weapon_compatibility.json");
const TCHAR* WeaponSlots = TEXT("weapon_slots.json");
const TCHAR* SensorCompatibility = TEXT("sensor_compatibility.json");
const TCHAR* DefensiveCompatibility = TEXT("defensive_compatibility.json");
const TCHAR* DefensiveSlots = TEXT("defensive_slots.json");
const TCHAR* PropulsionCompatibility = TEXT("propulsion_compatibility.json");
}

namespace
{
struct FCategoryFiles
{
    ESDTechCategory Category;
    const TCHAR* Label;
    const TCHAR* Catalogue;
    const TCHAR* Tree;
    /** Empty when the category has no compatibility matrix. */
    const TCHAR* Compatibility;
    /** Empty when the category has no slot definitions. */
    const TCHAR* Slots;
};

const FCategoryFiles CategoryFileTable[] = {
    { ESDTechCategory::Submarine,  TEXT("submarine"),  Files::SubmarineCatalogue,  Files::SubmarineTree,  TEXT(""), TEXT("") },
    { ESDTechCategory::Weapon,     TEXT("weapon"),     Files::WeaponCatalogue,     Files::WeaponTree,
      Files::WeaponCompatibility, Files::WeaponSlots },
    { ESDTechCategory::Sensor,     TEXT("sensor"),     Files::SensorCatalogue,     Files::SensorTree,
      Files::SensorCompatibility, TEXT("") },
    { ESDTechCategory::Defensive,  TEXT("defensive"),  Files::DefensiveCatalogue,  Files::DefensiveTree,
      Files::DefensiveCompatibility, Files::DefensiveSlots },
    { ESDTechCategory::Propulsion, TEXT("propulsion"), Files::PropulsionCatalogue, Files::PropulsionTree,
      Files::PropulsionCompatibility, TEXT("") },
};
}

FSDTechTreePaths FSDTechTreePaths::ProjectDefault()
{
    FSDTechTreePaths Paths;
    Paths.Directory = FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("TechTree");
    return Paths;
}

FString FSDTechTreePaths::ProjectDefaultCostFile()
{
    return FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("research_cost.json");
}

bool LoadResearchCostRule(
    const FString& Path,
    FSDResearchCostRule& OutRule,
    FSDTechTreeLoadReport& Report)
{
    FSDTierGateRule Unused;
    return LoadResearchRules(Path, OutRule, Unused, Report);
}

bool LoadResearchRules(
    const FString& Path,
    FSDResearchCostRule& OutCostRule,
    FSDTierGateRule& OutTierGate,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    FString Text;
    if (!Internal::ReadTextFile(Path, Text, Report))
    {
        return false;
    }

    TSharedPtr<FJsonObject> Document;
    if (!Internal::ParseDocument(Text, TEXT("research cost"), Document, Report))
    {
        return false;
    }

    static const TCHAR* const NumberFields[] = {
        TEXT("pointsPerTier"),
        TEXT("firstClearBonus"),
        TEXT("scoreDivisor"),
        TEXT("minimumScoreForReward")
    };
    double Values[UE_ARRAY_COUNT(NumberFields)] = { 0.0, 0.0, 0.0, 0.0 };
    for (int32 FieldIndex = 0; FieldIndex < static_cast<int32>(UE_ARRAY_COUNT(NumberFields)); ++FieldIndex)
    {
        if (!Document->TryGetNumberField(NumberFields[FieldIndex], Values[FieldIndex]))
        {
            Report.AddError(
                TEXT("MISSING_FIELD"),
                Path,
                FString::Printf(TEXT("%s is required and must be a number"), NumberFields[FieldIndex]));
        }
    }
    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        return false;
    }

    FSDResearchCostRule Rule;
    Rule.PointsPerTier = static_cast<int32>(Values[0]);
    Rule.FirstClearBonus = static_cast<int32>(Values[1]);
    Rule.ScoreDivisor = static_cast<int32>(Values[2]);
    Rule.MinimumScoreForReward = static_cast<int32>(Values[3]);
    if (!Rule.IsValid())
    {
        Report.AddError(
            TEXT("INVALID_COST_RULE"),
            Path,
            TEXT("pointsPerTier and scoreDivisor must be positive, firstClearBonus non-negative, minimumScoreForReward positive"));
        return false;
    }

    // The tier gate is optional: an absent field means "disabled", which keeps
    // the current balance. A present value must be a non-negative number.
    FSDTierGateRule Gate;
    if (Document->HasField(TEXT("tierGateRequiredUnlocked")))
    {
        double GateValue = 0.0;
        if (!Document->TryGetNumberField(TEXT("tierGateRequiredUnlocked"), GateValue) || GateValue < 0.0)
        {
            Report.AddError(
                TEXT("INVALID_TIER_GATE"),
                Path,
                TEXT("tierGateRequiredUnlocked must be a non-negative number; 0 disables the gate"));
            return false;
        }
        Gate.RequiredUnlockedInPreviousTier = static_cast<int32>(GateValue);
    }

    OutCostRule = Rule;
    OutTierGate = Gate;
    return true;
}

bool ParseCategoryDocuments(
    ESDTechCategory Category,
    const FString& CategoryLabel,
    const FString& CatalogueJson,
    const FString& TreeJson,
    FSDTechTree& OutTree,
    FSDTechTreeLoadReport& Report)
{
    TSharedPtr<FJsonObject> Catalogue;
    if (!Internal::ParseDocument(CatalogueJson,
        FString::Printf(TEXT("%s catalogue"), *CategoryLabel), Catalogue, Report))
    {
        return false;
    }

    TSharedPtr<FJsonObject> TreeDoc;
    if (!TreeJson.IsEmpty()
        && !Internal::ParseDocument(TreeJson,
            FString::Printf(TEXT("%s tree"), *CategoryLabel), TreeDoc, Report))
    {
        return false;
    }

    const int32 ErrorsAtEntry = Report.Errors.Num();
    OutTree.SchemaVersion = SchemaVersion;
    Internal::AppendTierLadder(OutTree, Category);

    switch (Category)
    {
    case ESDTechCategory::Submarine:
        if (!Internal::BuildSubmarineNodes(Catalogue, CategoryLabel, OutTree, Report)) { return false; }
        Internal::ApplySubmarineTree(TreeDoc, OutTree);
        break;
    case ESDTechCategory::Weapon:
        if (!Internal::BuildWeaponNodes(Catalogue, CategoryLabel, OutTree, Report)) { return false; }
        Internal::ApplyWeaponTree(TreeDoc, OutTree);
        break;
    case ESDTechCategory::Sensor:
        if (!Internal::BuildSensorNodes(Catalogue, CategoryLabel, OutTree, Report)) { return false; }
        Internal::ApplySensorTree(TreeDoc, OutTree, Report);
        break;
    case ESDTechCategory::Defensive:
        if (!Internal::BuildDefensiveNodes(Catalogue, CategoryLabel, OutTree, Report)) { return false; }
        Internal::ApplyDefensiveTree(TreeDoc, OutTree);
        break;
    case ESDTechCategory::Propulsion:
        if (!Internal::BuildPropulsionNodes(Catalogue, CategoryLabel, OutTree, Report)) { return false; }
        Internal::ApplyPropulsionTree(TreeDoc, OutTree);
        break;
    default:
        Report.AddError(TEXT("UNKNOWN_CATEGORY"), CategoryLabel, TEXT("category is not one of the five trees"));
        return false;
    }

    if (TreeDoc.IsValid())
    {
        if (const TSharedPtr<FJsonObject> Tiers = Internal::FindObjectField(TreeDoc, TEXT("tiers")))
        {
            Internal::ApplyTierLabelMap(OutTree, Category, Tiers);
        }
    }

    OutTree.SortDeterministically();
    ValidateTreeInvariants(OutTree, Report);
    return Report.Errors.Num() == ErrorsAtEntry;
}

bool LoadCategoryCompatibility(
    ESDTechCategory Category,
    const FString& CategoryLabel,
    const FString& CompatibilityJson,
    const FString& SlotsJson,
    FSDTechTree& OutTree,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    if (!CompatibilityJson.IsEmpty())
    {
        TSharedPtr<FJsonObject> Document;
        if (!Internal::ParseDocument(CompatibilityJson,
            FString::Printf(TEXT("%s compatibility"), *CategoryLabel), Document, Report))
        {
            return false;
        }
        switch (Category)
        {
        case ESDTechCategory::Weapon:
            if (!Internal::LoadWeaponCompatibility(Document, OutTree, Report)) { return false; }
            break;
        case ESDTechCategory::Sensor:
            if (!Internal::LoadSensorCompatibility(Document, OutTree, Report)) { return false; }
            break;
        case ESDTechCategory::Defensive:
            if (!Internal::LoadDefensiveCompatibility(Document, OutTree, Report)) { return false; }
            break;
        case ESDTechCategory::Propulsion:
            if (!Internal::LoadPropulsionCompatibility(Document, OutTree, Report)) { return false; }
            break;
        default:
            break;
        }
    }

    if (!SlotsJson.IsEmpty())
    {
        TSharedPtr<FJsonObject> Document;
        if (!Internal::ParseDocument(SlotsJson,
            FString::Printf(TEXT("%s slots"), *CategoryLabel), Document, Report))
        {
            return false;
        }
        switch (Category)
        {
        case ESDTechCategory::Weapon:
            if (!Internal::LoadWeaponSlots(Document, OutTree, Report)) { return false; }
            break;
        case ESDTechCategory::Defensive:
            if (!Internal::LoadDefensiveSlots(Document, OutTree, Report)) { return false; }
            break;
        default:
            break;
        }
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool LoadTechTree(
    const FSDTechTreePaths& Paths,
    FSDTechTree& OutTree,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    Report.bSuccess = false;

    FSDTechTree Tree;
    Tree.SchemaVersion = SchemaVersion;

    for (const FCategoryFiles& FilesForCategory : CategoryFileTable)
    {
        FString CatalogueJson;
        if (!Internal::ReadTextFile(
            FPaths::Combine(Paths.Directory, FilesForCategory.Catalogue), CatalogueJson, Report))
        {
            continue;
        }

        FString TreeJson;
        if (!Internal::ReadTextFile(
            FPaths::Combine(Paths.Directory, FilesForCategory.Tree), TreeJson, Report))
        {
            continue;
        }

        ParseCategoryDocuments(
            FilesForCategory.Category,
            FilesForCategory.Label,
            CatalogueJson,
            TreeJson,
            Tree,
            Report);

        FString CompatibilityJson;
        const bool bHasCompatibility = FilesForCategory.Compatibility[0] != TEXT('\0')
            && Internal::ReadTextFile(
                FPaths::Combine(Paths.Directory, FilesForCategory.Compatibility), CompatibilityJson, Report);
        FString SlotsJson;
        const bool bHasSlots = FilesForCategory.Slots[0] != TEXT('\0')
            && Internal::ReadTextFile(
                FPaths::Combine(Paths.Directory, FilesForCategory.Slots), SlotsJson, Report);
        if (bHasCompatibility || bHasSlots)
        {
            LoadCategoryCompatibility(
                FilesForCategory.Category,
                FilesForCategory.Label,
                CompatibilityJson,
                SlotsJson,
                Tree,
                Report);
        }
    }

    Tree.SortDeterministically();
    ValidateTreeInvariants(Tree, Report);

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        OutTree = FSDTechTree();
        return false;
    }

    Report.bSuccess = true;
    OutTree = MoveTemp(Tree);
    return true;
}
}
