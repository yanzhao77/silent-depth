#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace DataConformanceTests
{
enum class ETokenAxis : uint8
{
    Tier,
    Production,
    Service,
    Compatibility,
    Evidence,
    Verification,
    Priority,
    Coverage,
    SourceKind
};

/**
 * One source field that carries a schema token. RootPath narrows the search to
 * a data container so generator legend blocks (defensive `fields_zh`, sensor
 * `policy`) are never mistaken for records. An empty RootPath means the whole
 * document; an empty Field with bSubtree collects every scalar below the root.
 */
struct FTokenScanRow
{
    ESDTechCategory Category;
    const TCHAR* RelativePath;
    const TCHAR* RootPath;
    const TCHAR* Field;
    ETokenAxis Axis;
    bool bSubtree;
};

void CollectScalars(const TSharedPtr<FJsonValue>& Value, TArray<FString>& Out)
{
    if (!Value.IsValid())
    {
        return;
    }
    switch (Value->Type)
    {
    case EJson::String:
        Out.Add(Value->AsString());
        break;
    case EJson::Number:
        Out.Add(FString::Printf(TEXT("%g"), Value->AsNumber()));
        break;
    case EJson::Array:
        for (const TSharedPtr<FJsonValue>& Element : Value->AsArray())
        {
            CollectScalars(Element, Out);
        }
        break;
    case EJson::Object:
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : Value->AsObject()->Values)
        {
            CollectScalars(Pair.Value, Out);
        }
        break;
    default:
        break;
    }
}

void CollectFieldValues(const TSharedPtr<FJsonValue>& Value, const FString& Field, TArray<FString>& Out)
{
    if (!Value.IsValid())
    {
        return;
    }
    if (Value->Type == EJson::Array)
    {
        for (const TSharedPtr<FJsonValue>& Element : Value->AsArray())
        {
            CollectFieldValues(Element, Field, Out);
        }
        return;
    }
    if (Value->Type != EJson::Object)
    {
        return;
    }
    for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : Value->AsObject()->Values)
    {
        if (Pair.Key.Equals(Field, ESearchCase::IgnoreCase))
        {
            CollectScalars(Pair.Value, Out);
        }
        else
        {
            CollectFieldValues(Pair.Value, Field, Out);
        }
    }
}

/** Resolves "a.b" through objects, fanning out over arrays at any level. */
void ResolvePath(
    const TSharedPtr<FJsonValue>& Value,
    const TArray<FString>& Segments,
    int32 Index,
    TArray<TSharedPtr<FJsonValue>>& Out)
{
    if (!Value.IsValid())
    {
        return;
    }
    if (Index >= Segments.Num())
    {
        Out.Add(Value);
        return;
    }
    if (Value->Type == EJson::Array)
    {
        for (const TSharedPtr<FJsonValue>& Element : Value->AsArray())
        {
            ResolvePath(Element, Segments, Index, Out);
        }
        return;
    }
    if (Value->Type != EJson::Object)
    {
        return;
    }
    const TSharedPtr<FJsonValue>* Found = Value->AsObject()->Values.Find(Segments[Index]);
    if (Found != nullptr)
    {
        ResolvePath(*Found, Segments, Index + 1, Out);
    }
}

FString AssetLibraryRoot()
{
    return FPaths::ConvertRelativePathToFull(
        FPaths::Combine(FPaths::ProjectDir(), TEXT("../../SilentDepth_Assets")));
}

bool LoadJsonDocument(const FString& Path, FAutomationTestBase& Test, TSharedPtr<FJsonValue>& OutDocument)
{
    FString Text;
    if (!FFileHelper::LoadFileToString(Text, *Path))
    {
        Test.AddError(FString::Printf(TEXT("cannot read %s"), *Path));
        return false;
    }
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, OutDocument) || !OutDocument.IsValid())
    {
        Test.AddError(FString::Printf(TEXT("cannot parse %s"), *Path));
        return false;
    }
    return true;
}

/** Parses one token for its axis; reports an error when it is not declared. */
bool ParseTokenForAxis(
    ETokenAxis Axis,
    const FString& Token,
    ESDTechCategory Category,
    FAutomationTestBase& Test,
    const FString& Where)
{
    bool bOk = false;
    switch (Axis)
    {
    case ETokenAxis::Tier:
    {
        ESDTechTier Value = ESDTechTier::T1;
        bOk = SDTechTree::ParseTier(Token, Value);
        break;
    }
    case ETokenAxis::Production:
    {
        ESDProductionStatus Value = ESDProductionStatus::Unknown;
        bOk = SDTechTree::ParseProductionStatus(Token, Value)
            && SDTechTree::IsProductionStatusAllowedFor(Category, Value);
        break;
    }
    case ETokenAxis::Service:
    {
        ESDServiceStatus Value = ESDServiceStatus::Unknown;
        bOk = SDTechTree::ParseServiceStatus(Token, Value);
        break;
    }
    case ETokenAxis::Compatibility:
    {
        ESDCompatibility Value = ESDCompatibility::Unknown;
        bOk = SDTechTree::ParseCompatibility(Token, Value);
        break;
    }
    case ETokenAxis::Evidence:
    {
        ESDEvidenceLevel Value = ESDEvidenceLevel::Unknown;
        bOk = SDTechTree::ParseEvidenceLevel(Token, Value)
            && SDTechTree::IsEvidenceAllowedFor(Category, Value);
        break;
    }
    case ETokenAxis::Verification:
    {
        ESDVerificationLevel Value = ESDVerificationLevel::Unknown;
        bOk = SDTechTree::ParseVerificationLevel(Token, Value);
        break;
    }
    case ETokenAxis::Priority:
    {
        ESDPriority Value = ESDPriority::Unknown;
        bOk = SDTechTree::ParsePriority(Token, Value);
        break;
    }
    case ETokenAxis::Coverage:
    {
        ESDAssetCoverage Value = ESDAssetCoverage::Unknown;
        bOk = SDTechTree::ParseAssetCoverage(Token, Value);
        break;
    }
    case ETokenAxis::SourceKind:
    {
        ESDSourceKind Value = ESDSourceKind::Unknown;
        bOk = SDTechTree::ParseSourceKind(Token, Value);
        break;
    }
    }
    if (!bOk)
    {
        Test.AddError(FString::Printf(TEXT("%s carries undeclared token '%s'"), *Where, *Token));
    }
    return bOk;
}

/** Scans a priority field: DATABASE_ONLY there is a regression (DATA-003). */
void ScanPriorityWithKnownDrift(
    FAutomationTestBase& Test,
    const FString& Root,
    const FString& RelativePath,
    const FString& RootPath,
    int32& RunningDriftCount)
{
    const FString Path = FPaths::Combine(Root, RelativePath);
    TSharedPtr<FJsonValue> Document;
    if (!LoadJsonDocument(Path, Test, Document))
    {
        return;
    }

    TArray<TSharedPtr<FJsonValue>> Roots;
    if (RootPath.IsEmpty())
    {
        Roots.Add(Document);
    }
    else
    {
        TArray<FString> Segments;
        RootPath.ParseIntoArray(Segments, TEXT("."), true);
        ResolvePath(Document, Segments, 0, Roots);
    }

    TArray<FString> Priorities;
    for (const TSharedPtr<FJsonValue>& RootValue : Roots)
    {
        CollectFieldValues(RootValue, TEXT("asset_priority"), Priorities);
    }

    for (const FString& Token : Priorities)
    {
        if (Token.Equals(TEXT("DATABASE_ONLY"), ESearchCase::IgnoreCase))
        {
            ++RunningDriftCount;
        }
        else
        {
            ParseTokenForAxis(ETokenAxis::Priority, Token, ESDTechCategory::Weapon, Test,
                FString::Printf(TEXT("%s :: asset_priority"), *RelativePath));
        }
    }
}
}
using namespace DataConformanceTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSourceConformance,
    "SilentDepth.TechTree.Schema.SourceDataConformance",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSourceConformance::RunTest(const FString& Parameters)
{
    static const FTokenScanRow Rows[] = {
        { ESDTechCategory::Submarine, TEXT("Manifest/submarine_manifest.json"), TEXT("assets"), TEXT("status"), ETokenAxis::Production, false },
        { ESDTechCategory::Submarine, TEXT("TechnologyTree/tier_manifest.json"), TEXT(""), TEXT("asset_status"), ETokenAxis::Production, false },
        { ESDTechCategory::Submarine, TEXT("TechnologyTree/tier_manifest.json"), TEXT(""), TEXT("tier"), ETokenAxis::Tier, false },

        { ESDTechCategory::Weapon, TEXT("Weapons/Manifest/weapon_manifest.json"), TEXT("weapons"), TEXT("asset_status"), ETokenAxis::Production, false },
        { ESDTechCategory::Weapon, TEXT("Weapons/Manifest/weapon_manifest.json"), TEXT("weapons"), TEXT("status"), ETokenAxis::Service, false },
        { ESDTechCategory::Weapon, TEXT("Weapons/Manifest/weapon_manifest.json"), TEXT("weapons"), TEXT("confidence"), ETokenAxis::Evidence, false },
        { ESDTechCategory::Weapon, TEXT("Weapons/Manifest/weapon_manifest.json"), TEXT("weapons"), TEXT("tier"), ETokenAxis::Tier, false },
        { ESDTechCategory::Weapon, TEXT("Weapons/Manifest/weapon_production_queue.json"), TEXT("status_by_weapon"), TEXT(""), ETokenAxis::Production, true },
        { ESDTechCategory::Weapon, TEXT("Weapons/Manifest/weapon_submarine_compatibility.json"), TEXT("submarines"), TEXT("compatibility"), ETokenAxis::Compatibility, false },
        { ESDTechCategory::Weapon, TEXT("Weapons/TechnologyTree/weapon_technology_tree.json"), TEXT("ui_nodes"), TEXT("tier"), ETokenAxis::Tier, false },

        { ESDTechCategory::Sensor, TEXT("Sensors/Manifest/sensor_manifest.json"), TEXT("entries"), TEXT("asset_status"), ETokenAxis::Production, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/Manifest/sensor_manifest.json"), TEXT("entries"), TEXT("status"), ETokenAxis::Service, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/Manifest/sensor_manifest.json"), TEXT("entries"), TEXT("tier"), ETokenAxis::Tier, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/Manifest/sensor_manifest.json"), TEXT("entries"), TEXT("verification"), ETokenAxis::Verification, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/Manifest/submarine_sensor_compatibility.json"), TEXT("records"), TEXT("status"), ETokenAxis::Compatibility, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/Manifest/submarine_sensor_compatibility.json"), TEXT("records"), TEXT("confidence"), ETokenAxis::Evidence, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/TechnologyTree/sensor_technology_tree.json"), TEXT("branches"), TEXT("source"), ETokenAxis::SourceKind, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/TechnologyTree/sensor_technology_tree.json"), TEXT("branches"), TEXT("tier_index"), ETokenAxis::Tier, false },
        { ESDTechCategory::Sensor, TEXT("Sensors/TechnologyTree/sensor_technology_tree.json"), TEXT("branches"), TEXT("tier"), ETokenAxis::Tier, false },

        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/Manifest/defensive_system_manifest.json"), TEXT("assets"), TEXT("status"), ETokenAxis::Production, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/Manifest/submarine_defensive_compatibility.json"), TEXT("entries"), TEXT("compatibility"), ETokenAxis::Compatibility, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/Manifest/submarine_defensive_compatibility.json"), TEXT("entries"), TEXT("status"), ETokenAxis::Compatibility, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/TechnologyTree/defensive_technology_tree.json"), TEXT("tiers"), TEXT("tier_min"), ETokenAxis::Tier, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/TechnologyTree/defensive_technology_tree.json"), TEXT("tiers"), TEXT("tier_max"), ETokenAxis::Tier, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/TechnologyTree/defensive_technology_tree.json"), TEXT("tiers"), TEXT("game_tier_entered"), ETokenAxis::Tier, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/TechnologyTree/defensive_technology_tree.json"), TEXT("branch_trees"), TEXT("tier_min"), ETokenAxis::Tier, false },
        { ESDTechCategory::Defensive, TEXT("DefensiveSystems/TechnologyTree/defensive_technology_tree.json"), TEXT("branch_trees"), TEXT("tier_max"), ETokenAxis::Tier, false },

        { ESDTechCategory::Propulsion, TEXT("Propulsion/Manifest/propulsion_manifest.json"), TEXT("assets"), TEXT("status"), ETokenAxis::Production, false },
        { ESDTechCategory::Propulsion, TEXT("Propulsion/Manifest/propulsion_manifest.json"), TEXT("assets"), TEXT("tier"), ETokenAxis::Tier, false },
        { ESDTechCategory::Propulsion, TEXT("Propulsion/Manifest/propulsion_manifest.json"), TEXT("assets"), TEXT("coverage"), ETokenAxis::Coverage, false },
        { ESDTechCategory::Propulsion, TEXT("Propulsion/Manifest/propulsor_specs.json"), TEXT("specs"), TEXT("status"), ETokenAxis::Production, false },
        { ESDTechCategory::Propulsion, TEXT("Propulsion/Manifest/submarine_propulsion_compatibility.json"), TEXT("entries"), TEXT("verification_status"), ETokenAxis::Evidence, false },
        { ESDTechCategory::Propulsion, TEXT("Propulsion/TechnologyTree/propulsion_technology_tree.json"), TEXT("branches"), TEXT("asset_policy"), ETokenAxis::Production, false },
        { ESDTechCategory::Propulsion, TEXT("Propulsion/TechnologyTree/propulsion_technology_tree.json"), TEXT("branches"), TEXT("tier"), ETokenAxis::Tier, false },
    };

    const FString Root = AssetLibraryRoot();
    int32 ScannedRows = 0;
    int32 TotalTokens = 0;

    for (const FTokenScanRow& Row : Rows)
    {
        const FString Path = FPaths::Combine(Root, Row.RelativePath);
        TSharedPtr<FJsonValue> Document;
        if (!LoadJsonDocument(Path, *this, Document))
        {
            continue;
        }

        TArray<TSharedPtr<FJsonValue>> Roots;
        if (Row.RootPath[0] == TEXT('\0'))
        {
            Roots.Add(Document);
        }
        else
        {
            TArray<FString> Segments;
            FString(Row.RootPath).ParseIntoArray(Segments, TEXT("."), true);
            ResolvePath(Document, Segments, 0, Roots);
        }

        TArray<FString> Tokens;
        for (const TSharedPtr<FJsonValue>& RootValue : Roots)
        {
            if (Row.bSubtree)
            {
                CollectScalars(RootValue, Tokens);
            }
            else
            {
                CollectFieldValues(RootValue, Row.Field, Tokens);
            }
        }

        const FString Where = FString::Printf(TEXT("%s :: %s"), Row.RelativePath, Row.Field);
        if (Tokens.Num() == 0)
        {
            AddError(FString::Printf(TEXT("%s resolved to no tokens (stale scan row)"), *Where));
            continue;
        }

        ++ScannedRows;
        for (const FString& Token : Tokens)
        {
            ++TotalTokens;
            ParseTokenForAxis(Row.Axis, Token, Row.Category, *this, Where);
        }
    }

    AddInfo(FString::Printf(TEXT("scanned %d scan rows / %d tokens from %s"), ScannedRows, TotalTokens, *Root));
    TestEqual(TEXT("every scan row produced tokens"), ScannedRows, static_cast<int32>(UE_ARRAY_COUNT(Rows)));
    TestTrue(TEXT("token count is non-trivial"), TotalTokens > 2000);

    // asset_priority is an ordering axis and must only carry a real priority.
    // DATABASE_ONLY used to leak into it (DATA-003); the generators now publish
    // null for database-only entries, so the count must stay at zero.
    int32 PriorityDrift = 0;
    ScanPriorityWithKnownDrift(*this, Root,
        TEXT("Weapons/Manifest/weapon_manifest.json"), TEXT("weapons"), PriorityDrift);
    ScanPriorityWithKnownDrift(*this, Root,
        TEXT("Weapons/TechnologyTree/weapon_technology_tree.json"), TEXT("ui_nodes"), PriorityDrift);
    AddInfo(FString::Printf(TEXT("asset_priority DATABASE_ONLY drift count = %d"), PriorityDrift));
    TestEqual(TEXT("asset_priority carries only real priorities"), PriorityDrift, 0);

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
