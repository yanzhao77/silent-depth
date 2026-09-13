#include "Core/Platform/SDPlatformAssets.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
constexpr int32 PlatformAssetsVersion = 1;

/** Reads an optional asset path and rejects anything that is not /Game/. */
bool ReadAssetPath(
    const TSharedPtr<FJsonObject>& Entry,
    const TCHAR* Field,
    const FString& PlatformId,
    FSDTechTreeLoadReport& Report,
    FString& OutPath)
{
    FString Value;
    if (!Entry->TryGetStringField(Field, Value))
    {
        return true;  // absent means "not imported for this platform"
    }
    if (Value.IsEmpty())
    {
        return true;
    }
    if (!Value.StartsWith(TEXT("/Game/"), ESearchCase::CaseSensitive))
    {
        Report.AddError(
            TEXT("INVALID_ASSET_PATH"),
            FString::Printf(TEXT("%s / %s"), *PlatformId, Field),
            FString::Printf(TEXT("'%s' is not a /Game/ asset path"), *Value));
        return false;
    }
    OutPath = Value;
    return true;
}
}

void FSDPlatformAssetsTable::SortedIds(TArray<FString>& OutIds) const
{
    OutIds.Reset();
    ByPlatform.GetKeys(OutIds);
    OutIds.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });
}

namespace SDPlatform
{
FString DefaultPlatformAssetsPath()
{
    return FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("platform_assets.json");
}

bool LoadPlatformAssets(
    const FString& JsonPath,
    FSDPlatformAssetsTable& OutTable,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    OutTable = FSDPlatformAssetsTable();

    // Built separately and committed only on success: a rejected table must
    // leave the caller with nothing rather than half a platform list.
    FSDPlatformAssetsTable Table;
    FString Text;
    if (!FFileHelper::LoadFileToString(Text, *JsonPath))
    {
        Report.AddError(
            TEXT("MISSING_FILE"),
            JsonPath,
            TEXT("the platform asset table could not be read"));
        return false;
    }

    TSharedPtr<FJsonObject> Document;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, Document) || !Document.IsValid())
    {
        Report.AddError(TEXT("INVALID_JSON"), JsonPath, TEXT("the platform asset table is not a JSON object"));
        return false;
    }

    double Version = 0.0;
    if (!Document->TryGetNumberField(TEXT("version"), Version)
        || static_cast<int32>(Version) != PlatformAssetsVersion)
    {
        Report.AddError(
            TEXT("SCHEMA_VERSION"),
            JsonPath,
            FString::Printf(TEXT("the table must declare version %d"), PlatformAssetsVersion));
        return false;
    }

    if (!Document->TryGetStringField(TEXT("fallbackPlatform"), Table.FallbackPlatformId)
        || Table.FallbackPlatformId.IsEmpty())
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            JsonPath,
            TEXT("fallbackPlatform is required: an unlisted platform must not be guessed at"));
        return false;
    }

    const TSharedPtr<FJsonObject>* Platforms = nullptr;
    if (!Document->TryGetObjectField(TEXT("platforms"), Platforms) || Platforms == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), JsonPath, TEXT("platforms is required and must be an object"));
        return false;
    }

    for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : (*Platforms)->Values)
    {
        if (Pair.Key.IsEmpty())
        {
            Report.AddError(TEXT("EMPTY_PLATFORM_ID"), JsonPath, TEXT("a platform key must not be empty"));
            return false;
        }
        // Check the JSON type before AsObject(): a mismatched type yields an
        // empty object, which would look like a platform with no assets.
        if (!Pair.Value.IsValid() || Pair.Value->Type != EJson::Object)
        {
            Report.AddError(
                TEXT("INVALID_FIELD_TYPE"),
                Pair.Key,
                TEXT("a platform entry must be an object"));
            return false;
        }
        const TSharedPtr<FJsonObject> Entry = Pair.Value->AsObject();

        FSDPlatformAssetSet AssetSet;
        AssetSet.PlatformId = Pair.Key;
        if (!ReadAssetPath(Entry, TEXT("hull"), Pair.Key, Report, AssetSet.Hull)
            || !ReadAssetPath(Entry, TEXT("propulsor"), Pair.Key, Report, AssetSet.Propulsor)
            || !ReadAssetPath(Entry, TEXT("rudder"), Pair.Key, Report, AssetSet.Rudder)
            || !ReadAssetPath(Entry, TEXT("sternPlanes"), Pair.Key, Report, AssetSet.SternPlanes)
            || !ReadAssetPath(Entry, TEXT("bowPlanes"), Pair.Key, Report, AssetSet.BowPlanes)
            || !ReadAssetPath(Entry, TEXT("periscope"), Pair.Key, Report, AssetSet.Periscope))
        {
            return false;
        }
        Table.ByPlatform.Add(Pair.Key, MoveTemp(AssetSet));
    }

    // The fallback has to be usable, otherwise "explicit fallback" would still
    // end in a boat with no hull.
    const FSDPlatformAssetSet* Fallback = Table.ByPlatform.Find(Table.FallbackPlatformId);
    if (Fallback == nullptr || !Fallback->HasHull())
    {
        Report.AddError(
            TEXT("UNKNOWN_FALLBACK_PLATFORM"),
            Table.FallbackPlatformId,
            TEXT("fallbackPlatform must be a listed platform with a hull"));
        return false;
    }

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        return false;
    }

    OutTable = MoveTemp(Table);
    return true;
}

FSDResolvedPlatformAssets ResolvePlatformAssets(
    const FSDPlatformAssetsTable& Table,
    const FString& PlatformId)
{
    FSDResolvedPlatformAssets Resolved;
    Resolved.RequestedPlatformId = PlatformId;

    if (!PlatformId.IsEmpty())
    {
        if (const FSDPlatformAssetSet* Exact = Table.ByPlatform.Find(PlatformId))
        {
            if (Exact->HasHull())
            {
                Resolved.Assets = *Exact;
                Resolved.bExactMatch = true;
                return Resolved;
            }
        }
    }

    if (const FSDPlatformAssetSet* Fallback = Table.ByPlatform.Find(Table.FallbackPlatformId))
    {
        if (Fallback->HasHull())
        {
            Resolved.Assets = *Fallback;
            Resolved.bUsedFallback = true;
        }
    }
    return Resolved;
}
}
