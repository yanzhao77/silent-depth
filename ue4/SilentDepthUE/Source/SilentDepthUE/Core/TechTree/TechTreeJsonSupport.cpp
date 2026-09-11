#include "Core/TechTree/TechTreeLoaderInternal.h"

#include "Core/TechTree/TechTreeSchema.h"

#include "Dom/JsonValue.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace SDTechTree
{
namespace Internal
{
namespace
{
/**
 * Maps one status-like field onto its typed axis. An absent or empty field is
 * not an error (the axis keeps its Unknown default); a present but undeclared
 * token is.
 */
template <typename TEnum, typename TParseFn, typename TAllowedFn>
bool MapTokenField(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    ESDTechCategory Category,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    TParseFn Parse,
    TAllowedFn IsAllowed,
    TEnum& OutValue)
{
    FString Token;
    if (!Object->TryGetStringField(Field, Token) || Token.IsEmpty())
    {
        return true;
    }
    TEnum Parsed = TEnum();
    if (!Parse(Token, Parsed))
    {
        Report.AddError(
            TEXT("UNKNOWN_TOKEN"),
            Where,
            FString::Printf(TEXT("%s='%s' is not a declared value"), Field, *Token));
        return false;
    }
    if (!IsAllowed(Category, Parsed))
    {
        Report.AddError(
            TEXT("CATEGORY_TOKEN_MISMATCH"),
            Where,
            FString::Printf(TEXT("%s='%s' is not a valid value for this category"), Field, *Token));
        return false;
    }
    OutValue = Parsed;
    return true;
}

template <typename TEnum>
bool MapPlainField(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    bool (*Parse)(const FString&, TEnum&),
    TEnum& OutValue)
{
    FString Token;
    if (!Object->TryGetStringField(Field, Token) || Token.IsEmpty())
    {
        return true;
    }
    TEnum Parsed = TEnum();
    if (!Parse(Token, Parsed))
    {
        Report.AddError(
            TEXT("UNKNOWN_TOKEN"),
            Where,
            FString::Printf(TEXT("%s='%s' is not a declared value"), Field, *Token));
        return false;
    }
    OutValue = Parsed;
    return true;
}
}

bool ReadTextFile(const FString& Path, FString& OutText, FSDTechTreeLoadReport& Report)
{
    if (!FPaths::FileExists(Path) || !FFileHelper::LoadFileToString(OutText, *Path))
    {
        Report.AddError(TEXT("MISSING_FILE"), Path, TEXT("runtime tech-tree document cannot be read"));
        return false;
    }
    return true;
}

bool ParseDocument(
    const FString& Text,
    const FString& Where,
    TSharedPtr<FJsonObject>& OutObject,
    FSDTechTreeLoadReport& Report)
{
    TSharedPtr<FJsonValue> Value;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, Value) || !Value.IsValid() || Value->Type != EJson::Object)
    {
        Report.AddError(TEXT("INVALID_JSON"), Where, TEXT("document is not a JSON object"));
        return false;
    }
    OutObject = Value->AsObject();
    return true;
}

const TArray<TSharedPtr<FJsonValue>>* FindArray(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field)
{
    const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
    Object->TryGetArrayField(Field, Array);
    return Array;
}

const TSharedPtr<FJsonObject> FindObjectField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field)
{
    const TSharedPtr<FJsonObject>* Found = nullptr;
    if (Object->TryGetObjectField(Field, Found) && Found != nullptr)
    {
        return *Found;
    }
    return nullptr;
}

FString FieldAsToken(const TSharedPtr<FJsonObject>& Object, const TCHAR* Field)
{
    const TSharedPtr<FJsonValue>* Found = Object->Values.Find(Field);
    if (Found == nullptr || !Found->IsValid())
    {
        return FString();
    }
    if ((*Found)->Type == EJson::String)
    {
        return (*Found)->AsString();
    }
    if ((*Found)->Type == EJson::Number)
    {
        return FString::Printf(TEXT("%g"), (*Found)->AsNumber());
    }
    return FString();
}

bool RequireId(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    FString& OutId)
{
    if (!Object->TryGetStringField(Field, OutId) || OutId.IsEmpty())
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            Where,
            FString::Printf(TEXT("%s is required and must be a non-empty string"), Field));
        return false;
    }
    return true;
}

bool MapProduction(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    ESDTechCategory Category,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDProductionStatus& OutValue)
{
    return MapTokenField(Object, Field, Category, Where, Report,
        &ParseProductionStatus,
        [](ESDTechCategory InCategory, ESDProductionStatus Value)
        {
            return IsProductionStatusAllowedFor(InCategory, Value);
        },
        OutValue);
}

bool MapEvidence(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    ESDTechCategory Category,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDEvidenceLevel& OutValue)
{
    return MapTokenField(Object, Field, Category, Where, Report,
        &ParseEvidenceLevel,
        [](ESDTechCategory InCategory, ESDEvidenceLevel Value)
        {
            return IsEvidenceAllowedFor(InCategory, Value);
        },
        OutValue);
}

bool MapServiceStatus(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDServiceStatus& OutValue)
{
    return MapPlainField(Object, Field, Where, Report, &ParseServiceStatus, OutValue);
}

bool MapVerification(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDVerificationLevel& OutValue)
{
    return MapPlainField(Object, Field, Where, Report, &ParseVerificationLevel, OutValue);
}

bool MapPriorityField(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDPriority& OutValue)
{
    return MapPlainField(Object, Field, Where, Report, &ParsePriority, OutValue);
}

bool MapCoverage(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDAssetCoverage& OutValue)
{
    return MapPlainField(Object, Field, Where, Report, &ParseAssetCoverage, OutValue);
}

bool MapSourceKind(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDSourceKind& OutValue)
{
    return MapPlainField(Object, Field, Where, Report, &ParseSourceKind, OutValue);
}

bool MapTier(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDTechTier& OutTier)
{
    if (!Object->HasField(Field))
    {
        return true;
    }
    const FString Token = FieldAsToken(Object, Field);
    if (!ParseTier(Token, OutTier))
    {
        Report.AddError(
            TEXT("UNKNOWN_TOKEN"),
            Where,
            FString::Printf(TEXT("%s='%s' is not a tier between T1 and T10"), Field, *Token));
        return false;
    }
    return true;
}

void ApplyFlatAssetPaths(const TSharedPtr<FJsonObject>& Object, FSDTechAssetRef& OutAsset)
{
    Object->TryGetStringField(TEXT("master"), OutAsset.MasterPath);
    Object->TryGetStringField(TEXT("lod0"), OutAsset.Lod0);
    Object->TryGetStringField(TEXT("lod1"), OutAsset.Lod1);
    Object->TryGetStringField(TEXT("lod2"), OutAsset.Lod2);
    Object->TryGetStringField(TEXT("lod3"), OutAsset.Lod3);
}
}
}
