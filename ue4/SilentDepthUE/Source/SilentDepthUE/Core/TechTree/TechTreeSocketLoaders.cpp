#include "Core/TechTree/TechTreeLoader.h"

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
/** Config/SilentDepth/socket_map.json, next to the project's Config folder. */
FString DefaultSocketMapPath()
{
    return FPaths::ProjectConfigDir() / TEXT("SilentDepth") / TEXT("socket_map.json");
}

/**
 * The purpose-to-registry table (DEC-002 §3.3.1). A missing file is not an
 * error: it means no logical id can be classified yet, and every binding then
 * says so through a notice instead of carrying an invented token.
 */
struct FSocketMap
{
    TMap<FString, FString> ByPurpose;
    TMap<FString, FString> ByLogicalId;

    FString Resolve(const FString& LogicalId, const FString& Purpose) const
    {
        if (const FString* ById = ByLogicalId.Find(LogicalId))
        {
            return *ById;
        }
        if (const FString* ByPurposeToken = ByPurpose.Find(Purpose))
        {
            return *ByPurposeToken;
        }
        return FString();
    }
};

void LoadSocketMap(FSocketMap& OutMap)
{
    FString Text;
    if (!FFileHelper::LoadFileToString(Text, *DefaultSocketMapPath()))
    {
        return;
    }
    TSharedPtr<FJsonObject> Document;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, Document) || !Document.IsValid())
    {
        return;
    }
    const auto ReadMap = [&Document](const TCHAR* Field, TMap<FString, FString>& Out)
    {
        const TSharedPtr<FJsonObject>* Object = nullptr;
        if (!Document->TryGetObjectField(Field, Object) || Object == nullptr)
        {
            return;
        }
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : (*Object)->Values)
        {
            if (Pair.Value.IsValid() && Pair.Value->Type == EJson::String && !Pair.Value->AsString().IsEmpty())
            {
                Out.Add(Pair.Key, Pair.Value->AsString());
            }
        }
    };
    ReadMap(TEXT("byPurpose"), OutMap.ByPurpose);
    ReadMap(TEXT("byLogicalId"), OutMap.ByLogicalId);
}

/**
 * The purposes the Blender assembly schema declares (submarine_assembly.schema.json).
 * A launch purpose means the socket's +X axis is the launch direction, which is
 * the rule DEC-002 fixes for muzzles and launchers; the other purposes only
 * carry a transform.
 */
struct FPurposeRule
{
    const TCHAR* Token;
    bool bLaunchAxis;
};

const FPurposeRule PurposeRules[] =
{
    { TEXT("torpedo_muzzle"),   true },
    { TEXT("vls_muzzle"),       true },
    { TEXT("decoy_launcher"),   true },
    { TEXT("sensor_mount"),     false },
    { TEXT("defense_mount"),    false },
    { TEXT("propulsion_mount"), false },
    { TEXT("vfx_anchor"),       false },
    { TEXT("audio_anchor"),     false },
    { TEXT("camera_anchor"),    false },
};

const FPurposeRule* FindPurpose(const FString& Token)
{
    for (const FPurposeRule& Rule : PurposeRules)
    {
        if (Token.Equals(Rule.Token, ESearchCase::CaseSensitive))
        {
            return &Rule;
        }
    }
    return nullptr;
}

/** Reads a three-number vector field. Any other shape is a data error. */
bool ReadVec3(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    FSDVec3& OutValue)
{
    const TArray<TSharedPtr<FJsonValue>>* Array = FindArray(Object, Field);
    if (Array == nullptr || Array->Num() != 3)
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            Where,
            FString::Printf(TEXT("%s is required and must be three numbers"), Field));
        return false;
    }
    double Components[3] = { 0.0, 0.0, 0.0 };
    for (int32 Index = 0; Index < 3; ++Index)
    {
        const TSharedPtr<FJsonValue>& Value = (*Array)[Index];
        if (!Value.IsValid() || Value->Type != EJson::Number)
        {
            Report.AddError(
                TEXT("INVALID_FIELD_TYPE"),
                Where,
                FString::Printf(TEXT("%s must contain numbers only"), Field));
            return false;
        }
        Components[Index] = Value->AsNumber();
    }
    OutValue.X = Components[0];
    OutValue.Y = Components[1];
    OutValue.Z = Components[2];
    return true;
}

/** True when a document in the directory should be read as an assembly. */
bool bIsAssemblyDocument(const FString& FileName)
{
    return FPaths::GetExtension(FileName).Equals(TEXT("json"), ESearchCase::IgnoreCase);
}
}

bool LoadSocketBindingsFromDocument(
    const TSharedPtr<FJsonObject>& Document,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report,
    const FSocketMap* SocketMap = nullptr)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    double DocumentVersion = 0.0;
    if (!Document->TryGetNumberField(TEXT("schemaVersion"), DocumentVersion)
        || static_cast<int32>(DocumentVersion) != 1)
    {
        Report.AddError(
            TEXT("SCHEMA_VERSION"),
            Where,
            TEXT("an assembly document must declare schemaVersion 1"));
        return false;
    }

    FString PlatformId;
    if (!Document->TryGetStringField(TEXT("assetId"), PlatformId) || PlatformId.IsEmpty())
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("assetId is required"));
        return false;
    }
    if (SDFindNode(Tree, PlatformId) == nullptr)
    {
        Report.AddError(
            TEXT("UNKNOWN_SOCKET_PLATFORM"),
            Where,
            FString::Printf(TEXT("assetId '%s' is not a node in the tree"), *PlatformId));
        return false;
    }

    const TArray<TSharedPtr<FJsonValue>>* Sockets = FindArray(Document, TEXT("sockets"));
    if (Sockets == nullptr)
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            Where,
            TEXT("sockets is required and must be an array (an empty array is allowed)"));
        return false;
    }

    TSet<FString> SeenLogicalIds;
    // Collected first and appended only when the whole document validates: a
    // rejected document must leave the tree exactly as it found it.
    TArray<FSDSocketBinding> LoadedBindings;
    for (const TSharedPtr<FJsonValue>& Value : *Sockets)
    {
        if (!Value.IsValid() || Value->Type != EJson::Object)
        {
            Report.AddError(TEXT("INVALID_FIELD_TYPE"), Where, TEXT("sockets must contain objects"));
            return false;
        }
        const TSharedPtr<FJsonObject> Socket = Value->AsObject();

        FString LogicalId;
        FString SourceAnchor;
        FString PurposeToken;
        if (!Socket->TryGetStringField(TEXT("id"), LogicalId) || LogicalId.IsEmpty()
            || !Socket->TryGetStringField(TEXT("sourceAnchor"), SourceAnchor) || SourceAnchor.IsEmpty()
            || !Socket->TryGetStringField(TEXT("purpose"), PurposeToken) || PurposeToken.IsEmpty())
        {
            Report.AddError(
                TEXT("MISSING_FIELD"),
                Where,
                TEXT("each socket needs a non-empty id, sourceAnchor and purpose"));
            return false;
        }

        const FString Subject = PlatformId + TEXT(" / ") + LogicalId;
        if (SeenLogicalIds.Contains(LogicalId))
        {
            Report.AddError(
                TEXT("DUPLICATE_SOCKET_ID"),
                Subject,
                TEXT("two sockets share this logical id"));
            return false;
        }
        SeenLogicalIds.Add(LogicalId);

        const FPurposeRule* Purpose = FindPurpose(PurposeToken);
        if (Purpose == nullptr)
        {
            Report.AddError(
                TEXT("UNKNOWN_TOKEN"),
                Subject,
                FString::Printf(TEXT("purpose='%s' is not a declared value"), *PurposeToken));
            return false;
        }

        const TSharedPtr<FJsonObject>* Transform = nullptr;
        if (!Socket->TryGetObjectField(TEXT("transform"), Transform) || Transform == nullptr)
        {
            Report.AddError(TEXT("MISSING_FIELD"), Subject, TEXT("transform is required"));
            return false;
        }

        FSDSocketBinding Binding;
        Binding.PlatformId = PlatformId;
        Binding.LogicalId = LogicalId;
        Binding.BlenderAnchor = SourceAnchor;
        Binding.Purpose = PurposeToken;
        Binding.bHasDirection = Purpose->bLaunchAxis;
        // DEF-002 / SNS-002: the registry token comes from the mapping table,
        // never from the anchor name. An unmapped socket keeps an empty token
        // and reports itself, because guessing would break compatibility rules.
        if (SocketMap != nullptr)
        {
            Binding.RegistryCategory = SocketMap->Resolve(LogicalId, PurposeToken);
        }
        if (Binding.RegistryCategory.IsEmpty())
        {
            Report.AddNotice(
                TEXT("MISSING_SOCKET_REGISTRY_CATEGORY"),
                Subject,
                TEXT("no registry token is mapped for this logical id or purpose"));
        }
        // Only an editor check may set this; the document cannot claim it.
        Binding.bEditorVerified = false;
        if (!ReadVec3(*Transform, TEXT("translation"), Subject, Report, Binding.TranslationM)
            || !ReadVec3(*Transform, TEXT("rotationDegrees"), Subject, Report, Binding.RotationDeg))
        {
            return false;
        }

        LoadedBindings.Add(MoveTemp(Binding));
    }

    // A hull may declare which sockets must exist; a missing one is a defect,
    // because the assembly was signed off with it present.
    const TSharedPtr<FJsonObject>* Validation = nullptr;
    if (Document->TryGetObjectField(TEXT("validation"), Validation) && Validation != nullptr)
    {
        const TArray<TSharedPtr<FJsonValue>>* Required = FindArray(*Validation, TEXT("requiredSockets"));
        if (Required != nullptr)
        {
            for (const TSharedPtr<FJsonValue>& Value : *Required)
            {
                if (!Value.IsValid() || Value->Type != EJson::String)
                {
                    Report.AddError(
                        TEXT("INVALID_FIELD_TYPE"),
                        Where,
                        TEXT("requiredSockets must contain strings only"));
                    return false;
                }
                const FString RequiredId = Value->AsString();
                if (!SeenLogicalIds.Contains(RequiredId))
                {
                    Report.AddError(
                        TEXT("MISSING_REQUIRED_SOCKET"),
                        PlatformId + TEXT(" / ") + RequiredId,
                        TEXT("the assembly declares this socket as required but does not define it"));
                    return false;
                }
            }
        }
    }

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        return false;
    }

    Tree.Sockets.Append(LoadedBindings);
    return true;
}

/** Loads a document with the project's purpose-to-registry map applied. */
bool LoadBindingsWithProjectMap(
    const TSharedPtr<FJsonObject>& Document,
    const FString& Where,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    FSocketMap SocketMap;
    LoadSocketMap(SocketMap);
    return LoadSocketBindingsFromDocument(Document, Where, Tree, Report, &SocketMap);
}

void LoadSocketDirectory(
    const FString& Directory,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    FSocketMap SocketMap;
    LoadSocketMap(SocketMap);
    if (SocketMap.ByLogicalId.Num() == 0 && SocketMap.ByPurpose.Num() == 0)
    {
        Report.AddNotice(
            TEXT("MISSING_SOCKET_MAP"),
            DefaultSocketMapPath(),
            TEXT("no purpose-to-registry mapping is available; bindings carry no registry token"));
    }

    TArray<FString> FileNames;
    IFileManager::Get().FindFiles(FileNames, *(Directory / TEXT("*.json")), /*Files*/ true, /*Directories*/ false);
    FileNames.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });

    for (const FString& FileName : FileNames)
    {
        if (!bIsAssemblyDocument(FileName))
        {
            continue;
        }
        const FString Path = Directory / FileName;
        FString Text;
        if (!ReadTextFile(Path, Text, Report))
        {
            continue;
        }
        TSharedPtr<FJsonObject> Document;
        if (!ParseDocument(Text, FileName, Document, Report))
        {
            continue;
        }
        LoadSocketBindingsFromDocument(Document, FileName, Tree, Report, &SocketMap);
    }
}
}

bool LoadSocketBindings(
    const FString& Path,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    FString Text;
    if (!Internal::ReadTextFile(Path, Text, Report))
    {
        return false;
    }
    TSharedPtr<FJsonObject> Document;
    if (!Internal::ParseDocument(Text, FPaths::GetCleanFilename(Path), Document, Report))
    {
        return false;
    }
    // A caller-supplied document (a test fixture) is classified through the
    // same project map, so its bindings resolve exactly like the real ones.
    if (!Internal::LoadBindingsWithProjectMap(
        Document, FPaths::GetCleanFilename(Path), Tree, Report))
    {
        return false;
    }
    return Report.Errors.Num() == ErrorsAtEntry;
}
}
