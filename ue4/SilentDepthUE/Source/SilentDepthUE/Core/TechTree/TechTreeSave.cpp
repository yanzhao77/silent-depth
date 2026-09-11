#include "Core/TechTree/TechTreeSave.h"

#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeSchema.h"

#include "Dom/JsonValue.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace SDTechTree
{
namespace
{
FString SignatureToString(uint64 Value)
{
    return FString::Printf(TEXT("%llu"), Value);
}

bool ReadStringArray(
    const TSharedPtr<FJsonObject>& Json,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    TArray<FString>& OutValues)
{
    const TArray<TSharedPtr<FJsonValue>>* Array = nullptr;
    if (!Json->TryGetArrayField(Field, Array) || Array == nullptr)
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            Where,
            FString::Printf(TEXT("%s is required and must be an array"), Field));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Array)
    {
        if (!Value.IsValid() || Value->Type != EJson::String)
        {
            Report.AddError(
                TEXT("INVALID_FIELD_TYPE"),
                Where,
                FString::Printf(TEXT("%s must contain strings only"), Field));
            return false;
        }
        OutValues.Add(Value->AsString());
    }
    return true;
}

void SortStrings(TArray<FString>& Values)
{
    Values.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });
}
}

void NormalizeSaveData(FSDTechTreeSaveData& InOut)
{
    FSDUnlockService::NormalizeProgress(InOut.Account.Progress);
    SortStrings(InOut.Account.FirstClearMissionIds);
    for (int32 Index = InOut.Account.FirstClearMissionIds.Num() - 1; Index > 0; --Index)
    {
        if (InOut.Account.FirstClearMissionIds[Index].Equals(
            InOut.Account.FirstClearMissionIds[Index - 1], ESearchCase::CaseSensitive))
        {
            InOut.Account.FirstClearMissionIds.RemoveAt(Index);
        }
    }
    InOut.Loadouts.Sort([](const FSDLoadoutAssignment& A, const FSDLoadoutAssignment& B)
    {
        const int32 ByPlatform = A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive);
        if (ByPlatform != 0)
        {
            return ByPlatform < 0;
        }
        return A.SlotName.Compare(B.SlotName, ESearchCase::CaseSensitive) < 0;
    });
}

uint64 ComputeSaveSignature(
    const FSDTechTreeSaveData& Data,
    const FSDResearchAccountService& Accounts)
{
    uint64 Hash = Accounts.ComputeAccountSignature(Data.Account);

    TArray<FSDLoadoutAssignment> Sorted = Data.Loadouts;
    Sorted.Sort([](const FSDLoadoutAssignment& A, const FSDLoadoutAssignment& B)
    {
        const int32 ByPlatform = A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive);
        if (ByPlatform != 0)
        {
            return ByPlatform < 0;
        }
        const int32 BySlot = A.SlotName.Compare(B.SlotName, ESearchCase::CaseSensitive);
        if (BySlot != 0)
        {
            return BySlot < 0;
        }
        return A.CandidateId.Compare(B.CandidateId, ESearchCase::CaseSensitive) < 0;
    });
    for (const FSDLoadoutAssignment& Assignment : Sorted)
    {
        Hash = HashToken(Hash, Assignment.PlatformId);
        Hash = HashToken(Hash, Assignment.SlotName);
        Hash = HashToken(Hash, Assignment.CandidateId);
    }
    return Hash;
}

void WriteSaveToJson(const FSDTechTreeSaveData& Data, const TSharedRef<FJsonObject>& OutJson)
{
    FSDTechTreeSaveData Normalized = Data;
    NormalizeSaveData(Normalized);
    Normalized.SchemaVersion = SaveSchemaVersion;

    OutJson->SetStringField(TEXT("schema"), SaveSchemaId);
    OutJson->SetNumberField(TEXT("version"), SaveSchemaVersion);
    OutJson->SetNumberField(TEXT("researchPoints"), Normalized.Account.ResearchPoints);

    TArray<TSharedPtr<FJsonValue>> Unlocked;
    Unlocked.Reserve(Normalized.Account.Progress.UnlockedNodeIds.Num());
    for (const FString& NodeId : Normalized.Account.Progress.UnlockedNodeIds)
    {
        Unlocked.Add(MakeShared<FJsonValueString>(NodeId));
    }
    OutJson->SetArrayField(TEXT("unlockedNodeIds"), Unlocked);

    TArray<TSharedPtr<FJsonValue>> FirstClears;
    FirstClears.Reserve(Normalized.Account.FirstClearMissionIds.Num());
    for (const FString& MissionId : Normalized.Account.FirstClearMissionIds)
    {
        FirstClears.Add(MakeShared<FJsonValueString>(MissionId));
    }
    OutJson->SetArrayField(TEXT("firstClearMissionIds"), FirstClears);

    TArray<TSharedPtr<FJsonValue>> Loadouts;
    Loadouts.Reserve(Normalized.Loadouts.Num());
    for (const FSDLoadoutAssignment& Assignment : Normalized.Loadouts)
    {
        const TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
        Entry->SetStringField(TEXT("platform"), Assignment.PlatformId);
        Entry->SetStringField(TEXT("slot"), Assignment.SlotName);
        Entry->SetStringField(TEXT("candidate"), Assignment.CandidateId);
        Loadouts.Add(MakeShared<FJsonValueObject>(Entry));
    }
    OutJson->SetArrayField(TEXT("loadouts"), Loadouts);
}

bool ValidateSaveData(
    const FSDTechTreeSaveData& Data,
    const FSDResearchAccountService& Accounts,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    if (!Accounts.IsInitialized() || Accounts.GetRegistry() == nullptr)
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("save validation"),
            TEXT("the research account service must be initialised before a save can be validated"));
        return false;
    }

    if (Data.SchemaVersion != SaveSchemaVersion)
    {
        Report.AddError(
            TEXT("SAVE_VERSION_UNSUPPORTED"),
            FString::FromInt(Data.SchemaVersion),
            FString::Printf(TEXT("this build reads tech-tree save version %d"), SaveSchemaVersion));
        return false;
    }

    Accounts.ValidateAccount(Data.Account, Report);

    const FSDNodeRegistry* Registry = Accounts.GetRegistry();
    TSet<FString> SeenSlots;
    SeenSlots.Reserve(Data.Loadouts.Num());
    for (const FSDLoadoutAssignment& Assignment : Data.Loadouts)
    {
        const FString Subject = FString::Printf(TEXT("%s / %s"), *Assignment.PlatformId, *Assignment.SlotName);
        if (Assignment.PlatformId.IsEmpty() || Assignment.SlotName.IsEmpty() || Assignment.CandidateId.IsEmpty())
        {
            Report.AddError(
                TEXT("EMPTY_LOADOUT_FIELD"),
                Subject,
                TEXT("platform, slot and candidate must all be non-empty"));
            continue;
        }

        const FSDTechNode* Platform = Registry->Find(Assignment.PlatformId);
        if (Platform == nullptr)
        {
            Report.AddError(
                TEXT("UNKNOWN_PLATFORM"),
                Subject,
                FString::Printf(TEXT("platform '%s' is not in the tree"), *Assignment.PlatformId));
            continue;
        }
        if (Platform->Category != ESDTechCategory::Submarine)
        {
            Report.AddError(
                TEXT("PLATFORM_NOT_SUBMARINE"),
                Subject,
                FString::Printf(TEXT("'%s' is not a submarine node"), *Assignment.PlatformId));
            continue;
        }

        if (Registry->Find(Assignment.CandidateId) == nullptr)
        {
            Report.AddError(
                TEXT("UNKNOWN_CANDIDATE"),
                Subject,
                FString::Printf(TEXT("candidate '%s' is not in the tree"), *Assignment.CandidateId));
            continue;
        }

        const FString SlotKey = Assignment.PlatformId + TEXT("|") + Assignment.SlotName;
        bool bAlreadyPresent = false;
        SeenSlots.Add(SlotKey, &bAlreadyPresent);
        if (bAlreadyPresent)
        {
            Report.AddError(
                TEXT("DUPLICATE_LOADOUT_SLOT"),
                Subject,
                TEXT("the same slot is filled twice on this platform"));
        }
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool ValidateSaveCompatibility(
    const FSDTechTreeSaveData& Data,
    const FSDEquipmentService& Equipment,
    ESDEquipPolicy Policy,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    if (!Equipment.IsInitialized())
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("save compatibility"),
            TEXT("the equipment service must be initialised before loadouts can be checked"));
        return false;
    }

    for (const FSDLoadoutAssignment& Assignment : Data.Loadouts)
    {
        if (Equipment.IsEquippableInSlot(
            Assignment.PlatformId, Assignment.SlotName, Assignment.CandidateId, Policy))
        {
            continue;
        }
        const ESDCompatibility Relation = Equipment.GetCompatibilityInSlot(
            Assignment.PlatformId, Assignment.SlotName, Assignment.CandidateId);
        Report.AddError(
            TEXT("INCOMPATIBLE_LOADOUT"),
            FString::Printf(TEXT("%s / %s / %s"), *Assignment.PlatformId, *Assignment.SlotName, *Assignment.CandidateId),
            FString::Printf(TEXT("the matrix relation is %s"), ToString(Relation)));
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool ReadSaveFromJson(
    const TSharedPtr<FJsonObject>& Json,
    const FSDResearchAccountService& Accounts,
    FSDTechTreeSaveData& OutData,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    OutData = FSDTechTreeSaveData();

    if (!Json.IsValid())
    {
        Report.AddError(TEXT("INVALID_JSON"), TEXT("save"), TEXT("document is not a JSON object"));
        return false;
    }

    double VersionNumber = 0.0;
    Json->TryGetNumberField(TEXT("version"), VersionNumber);
    const int32 Version = static_cast<int32>(VersionNumber);

    if (Version > SaveSchemaVersion)
    {
        Report.AddError(
            TEXT("SAVE_VERSION_UNSUPPORTED"),
            FString::FromInt(Version),
            TEXT("the save was written by a newer build; this build cannot interpret its fields"));
        return false;
    }

    // A missing or older version is rebuilt from scratch rather than guessed at.
    if (Version < SaveSchemaVersion)
    {
        FSDTechTreeSaveData Rebuilt;
        Rebuilt.SchemaVersion = SaveSchemaVersion;
        OutData = MoveTemp(Rebuilt);
        return true;
    }

    FSDTechTreeSaveData Data;
    Data.SchemaVersion = SaveSchemaVersion;

    double Points = 0.0;
    if (!Json->TryGetNumberField(TEXT("researchPoints"), Points))
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            TEXT("save"),
            TEXT("researchPoints is required and must be a number"));
        return false;
    }
    Data.Account.ResearchPoints = static_cast<int32>(Points);

    if (!ReadStringArray(Json, TEXT("unlockedNodeIds"), TEXT("save"), Report, Data.Account.Progress.UnlockedNodeIds)
        || !ReadStringArray(Json, TEXT("firstClearMissionIds"), TEXT("save"), Report, Data.Account.FirstClearMissionIds))
    {
        return false;
    }

    const TArray<TSharedPtr<FJsonValue>>* Loadouts = nullptr;
    if (!Json->TryGetArrayField(TEXT("loadouts"), Loadouts) || Loadouts == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("save"), TEXT("loadouts is required and must be an array"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& Value : *Loadouts)
    {
        if (!Value.IsValid() || Value->Type != EJson::Object)
        {
            Report.AddError(TEXT("INVALID_FIELD_TYPE"), TEXT("save"), TEXT("loadouts must contain objects"));
            return false;
        }
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        FSDLoadoutAssignment Assignment;
        if (!Entry->TryGetStringField(TEXT("platform"), Assignment.PlatformId)
            || !Entry->TryGetStringField(TEXT("slot"), Assignment.SlotName)
            || !Entry->TryGetStringField(TEXT("candidate"), Assignment.CandidateId))
        {
            Report.AddError(
                TEXT("MISSING_FIELD"),
                TEXT("save"),
                TEXT("each loadout needs platform, slot and candidate strings"));
            return false;
        }
        Data.Loadouts.Add(MoveTemp(Assignment));
    }

    NormalizeSaveData(Data);

    if (!ValidateSaveData(Data, Accounts, Report))
    {
        return false;
    }

    // Tamper check last, over the normalised data.
    FString DeclaredSignature;
    if (!Json->TryGetStringField(TEXT("signature"), DeclaredSignature))
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("save"), TEXT("signature is required"));
        return false;
    }
    if (!DeclaredSignature.Equals(SignatureToString(ComputeSaveSignature(Data, Accounts)), ESearchCase::CaseSensitive))
    {
        Report.AddError(
            TEXT("SAVE_SIGNATURE_MISMATCH"),
            TEXT("save"),
            TEXT("the file contents do not match the recorded signature"));
        return false;
    }

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        return false;
    }

    OutData = MoveTemp(Data);
    return true;
}

bool WriteDocumentToString(
    const FSDTechTreeSaveData& Data,
    const FSDResearchAccountService& Accounts,
    FString& OutJson,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    FSDTechTreeSaveData Normalized = Data;
    NormalizeSaveData(Normalized);
    Normalized.SchemaVersion = SaveSchemaVersion;
    if (!ValidateSaveData(Normalized, Accounts, Report))
    {
        return false;
    }

    const TSharedRef<FJsonObject> Json = MakeShared<FJsonObject>();
    WriteSaveToJson(Normalized, Json);
    Json->SetStringField(TEXT("signature"), SignatureToString(ComputeSaveSignature(Normalized, Accounts)));

    OutJson.Reset();
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
    if (!FJsonSerializer::Serialize(Json, Writer))
    {
        Report.AddError(TEXT("SAVE_WRITE_FAILED"), TEXT("save"), TEXT("the document could not be serialised"));
        return false;
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool ReadDocumentFromString(
    const FString& Json,
    const FSDResearchAccountService& Accounts,
    FSDTechTreeSaveData& OutData,
    FSDTechTreeLoadReport& Report)
{
    TSharedPtr<FJsonValue> Value;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
    if (!FJsonSerializer::Deserialize(Reader, Value) || !Value.IsValid() || Value->Type != EJson::Object)
    {
        Report.AddError(TEXT("INVALID_JSON"), TEXT("save"), TEXT("the document is not a JSON object"));
        return false;
    }
    return ReadSaveFromJson(Value->AsObject(), Accounts, OutData, Report);
}

bool SaveTechTreeToFile(
    const FString& Path,
    const FSDTechTreeSaveData& Data,
    const FSDResearchAccountService& Accounts,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();

    FString Text;
    if (!WriteDocumentToString(Data, Accounts, Text, Report))
    {
        return false;
    }

    if (!FFileHelper::SaveStringToFile(Text, *Path))
    {
        Report.AddError(TEXT("SAVE_WRITE_FAILED"), Path, TEXT("the save file could not be written"));
        return false;
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool LoadTechTreeFromFile(
    const FString& Path,
    const FSDResearchAccountService& Accounts,
    FSDTechTreeSaveData& OutData,
    FSDTechTreeLoadReport& Report)
{
    FString Text;
    if (!FPaths::FileExists(Path) || !FFileHelper::LoadFileToString(Text, *Path))
    {
        Report.AddError(TEXT("MISSING_FILE"), Path, TEXT("the save file could not be read"));
        return false;
    }

    TSharedPtr<FJsonValue> Value;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, Value) || !Value.IsValid() || Value->Type != EJson::Object)
    {
        Report.AddError(TEXT("INVALID_JSON"), Path, TEXT("the save file is not a JSON object"));
        return false;
    }

    return ReadSaveFromJson(Value->AsObject(), Accounts, OutData, Report);
}
}
