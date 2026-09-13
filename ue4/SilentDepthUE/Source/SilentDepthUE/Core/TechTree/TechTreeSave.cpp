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

/** A required numeric counter. Values are range-checked by ValidateSaveData. */
bool ReadStatistic(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    int32& OutValue)
{
    double Number = 0.0;
    if (!Object->TryGetNumberField(Field, Number))
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            Where,
            FString::Printf(TEXT("%s is required and must be a number"), Field));
        return false;
    }
    OutValue = static_cast<int32>(Number);
    return true;
}

/** A required settings number, read as a double and cast by the caller. */
bool ReadSettingsNumber(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    double& OutValue)
{
    if (!Object->TryGetNumberField(Field, OutValue))
    {
        Report.AddError(
            TEXT("MISSING_FIELD"),
            Where,
            FString::Printf(TEXT("%s is required and must be a number"), Field));
        return false;
    }
    return true;
}

/** Reads the settings object. Unknown language tokens are rejected outright. */
bool ReadSettings(
    const TSharedPtr<FJsonObject>& Settings,
    FSDSettings& OutSettings,
    FSDTechTreeLoadReport& Report)
{
    const TSharedPtr<FJsonObject>* Audio = nullptr;
    if (!Settings->TryGetObjectField(TEXT("audio"), Audio) || Audio == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("settings.audio"), TEXT("audio is required and must be an object"));
        return false;
    }
    double Number = 0.0;
    if (!ReadSettingsNumber(*Audio, TEXT("master"), TEXT("settings.audio"), Report, Number)) { return false; }
    OutSettings.MasterVolume = static_cast<float>(Number);
    if (!ReadSettingsNumber(*Audio, TEXT("music"), TEXT("settings.audio"), Report, Number)) { return false; }
    OutSettings.MusicVolume = static_cast<float>(Number);
    if (!ReadSettingsNumber(*Audio, TEXT("effects"), TEXT("settings.audio"), Report, Number)) { return false; }
    OutSettings.EffectsVolume = static_cast<float>(Number);

    const TSharedPtr<FJsonObject>* Video = nullptr;
    if (!Settings->TryGetObjectField(TEXT("video"), Video) || Video == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("settings.video"), TEXT("video is required and must be an object"));
        return false;
    }
    if (!ReadSettingsNumber(*Video, TEXT("qualityPreset"), TEXT("settings.video"), Report, Number)) { return false; }
    OutSettings.QualityPreset = static_cast<int32>(Number);
    if (!ReadSettingsNumber(*Video, TEXT("resolutionScale"), TEXT("settings.video"), Report, Number)) { return false; }
    OutSettings.ResolutionScale = static_cast<float>(Number);

    const TSharedPtr<FJsonObject>* Input = nullptr;
    if (!Settings->TryGetObjectField(TEXT("input"), Input) || Input == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("settings.input"), TEXT("input is required and must be an object"));
        return false;
    }
    if (!(*Input)->TryGetBoolField(TEXT("invertRudder"), OutSettings.bInvertRudder))
    {
        Report.AddError(
            TEXT("MISSING_FIELD"), TEXT("settings.input"),
            TEXT("invertRudder is required and must be a boolean"));
        return false;
    }

    const TSharedPtr<FJsonObject>* App = nullptr;
    if (!Settings->TryGetObjectField(TEXT("app"), App) || App == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("settings.app"), TEXT("app is required and must be an object"));
        return false;
    }
    FString Language;
    if (!(*App)->TryGetStringField(TEXT("language"), Language) || Language.IsEmpty())
    {
        Report.AddError(
            TEXT("MISSING_FIELD"), TEXT("settings.app"),
            TEXT("language is required and must be a non-empty string"));
        return false;
    }
    if (!ParseLanguage(Language, OutSettings.Language))
    {
        Report.AddError(
            TEXT("UNKNOWN_TOKEN"),
            TEXT("settings.app.language"),
            FString::Printf(TEXT("language='%s' is not a declared value"), *Language));
        return false;
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
    FSDMissionStatsService::NormalizeMissions(InOut.Missions);
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
        Hash = HashToken(Hash, FString::FromInt(Assignment.Count));
    }

    TArray<FSDMissionRecord> SortedMissions = Data.Missions;
    FSDMissionStatsService::NormalizeMissions(SortedMissions);
    for (const FSDMissionRecord& Record : SortedMissions)
    {
        Hash = HashToken(Hash, Record.MissionId);
        Hash = HashToken(Hash, FString::FromInt(Record.BestScore));
        Hash = HashToken(Hash, Record.bCleared ? TEXT("1") : TEXT("0"));
    }

    Hash = HashToken(Hash, FString::FromInt(Data.Statistics.MissionsPlayed));
    Hash = HashToken(Hash, FString::FromInt(Data.Statistics.MissionsCleared));
    Hash = HashToken(Hash, FString::FromInt(Data.Statistics.MissionsFailed));
    Hash = HashToken(Hash, FString::FromInt(Data.Statistics.TotalScore));
    Hash = HashToken(Hash, FString::FromInt(Data.Statistics.BestScore));
    Hash = HashToken(Hash, Data.Statistics.LastMissionId);

    // Volumes are rounded to a hundredth of a step so the hash does not depend
    // on float noise the JSON writer would not preserve anyway.
    const auto HashVolume = [&Hash](const float Value)
    {
        Hash = HashToken(Hash, FString::FromInt(FMath::RoundToInt(Value * 100.0f)));
    };
    HashVolume(Data.Settings.MasterVolume);
    HashVolume(Data.Settings.MusicVolume);
    HashVolume(Data.Settings.EffectsVolume);
    Hash = HashToken(Hash, FString::FromInt(Data.Settings.QualityPreset));
    HashVolume(Data.Settings.ResolutionScale);
    Hash = HashToken(Hash, Data.Settings.bInvertRudder ? TEXT("1") : TEXT("0"));
    Hash = HashToken(Hash, ToString(Data.Settings.Language));
    Hash = HashToken(Hash, Data.SelectedPlatformId);
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
        Entry->SetNumberField(TEXT("count"), Assignment.Count);
        Loadouts.Add(MakeShared<FJsonValueObject>(Entry));
    }
    OutJson->SetArrayField(TEXT("loadouts"), Loadouts);

    TArray<TSharedPtr<FJsonValue>> Missions;
    Missions.Reserve(Normalized.Missions.Num());
    for (const FSDMissionRecord& Record : Normalized.Missions)
    {
        const TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
        Entry->SetStringField(TEXT("mission"), Record.MissionId);
        Entry->SetNumberField(TEXT("bestScore"), Record.BestScore);
        Entry->SetBoolField(TEXT("cleared"), Record.bCleared);
        Missions.Add(MakeShared<FJsonValueObject>(Entry));
    }
    OutJson->SetArrayField(TEXT("missions"), Missions);

    const TSharedRef<FJsonObject> Statistics = MakeShared<FJsonObject>();
    Statistics->SetNumberField(TEXT("missionsPlayed"), Normalized.Statistics.MissionsPlayed);
    Statistics->SetNumberField(TEXT("missionsCleared"), Normalized.Statistics.MissionsCleared);
    Statistics->SetNumberField(TEXT("missionsFailed"), Normalized.Statistics.MissionsFailed);
    Statistics->SetNumberField(TEXT("totalScore"), Normalized.Statistics.TotalScore);
    Statistics->SetNumberField(TEXT("bestScore"), Normalized.Statistics.BestScore);
    Statistics->SetStringField(TEXT("lastMissionId"), Normalized.Statistics.LastMissionId);
    OutJson->SetObjectField(TEXT("statistics"), Statistics);

    const TSharedRef<FJsonObject> Settings = MakeShared<FJsonObject>();
    const TSharedRef<FJsonObject> Audio = MakeShared<FJsonObject>();
    Audio->SetNumberField(TEXT("master"), Normalized.Settings.MasterVolume);
    Audio->SetNumberField(TEXT("music"), Normalized.Settings.MusicVolume);
    Audio->SetNumberField(TEXT("effects"), Normalized.Settings.EffectsVolume);
    Settings->SetObjectField(TEXT("audio"), Audio);
    const TSharedRef<FJsonObject> Video = MakeShared<FJsonObject>();
    Video->SetNumberField(TEXT("qualityPreset"), Normalized.Settings.QualityPreset);
    Video->SetNumberField(TEXT("resolutionScale"), Normalized.Settings.ResolutionScale);
    Settings->SetObjectField(TEXT("video"), Video);
    const TSharedRef<FJsonObject> Input = MakeShared<FJsonObject>();
    Input->SetBoolField(TEXT("invertRudder"), Normalized.Settings.bInvertRudder);
    Settings->SetObjectField(TEXT("input"), Input);
    const TSharedRef<FJsonObject> App = MakeShared<FJsonObject>();
    App->SetStringField(TEXT("language"), ToString(Normalized.Settings.Language));
    Settings->SetObjectField(TEXT("app"), App);
    OutJson->SetObjectField(TEXT("settings"), Settings);

    OutJson->SetStringField(TEXT("selectedPlatform"), Normalized.SelectedPlatformId);
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
        if (Assignment.Count < 1)
        {
            Report.AddError(
                TEXT("INVALID_SAVE_VALUE"),
                Subject,
                TEXT("a loadout must carry at least one round"));
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

    // Progression records: one per mission, non-negative scores.
    TSet<FString> SeenMissions;
    SeenMissions.Reserve(Data.Missions.Num());
    for (const FSDMissionRecord& Record : Data.Missions)
    {
        if (Record.MissionId.IsEmpty())
        {
            Report.AddError(
                TEXT("EMPTY_MISSION_ID"),
                TEXT("missions"),
                TEXT("a mission record needs a non-empty mission id"));
            continue;
        }
        if (Record.BestScore < 0)
        {
            Report.AddError(
                TEXT("INVALID_SAVE_VALUE"),
                Record.MissionId,
                TEXT("bestScore must be >= 0"));
        }
        bool bAlreadyPresent = false;
        SeenMissions.Add(Record.MissionId, &bAlreadyPresent);
        if (bAlreadyPresent)
        {
            Report.AddError(
                TEXT("DUPLICATE_MISSION_RECORD"),
                Record.MissionId,
                TEXT("a mission may only be recorded once"));
        }
    }

    // The roll-up is a summary, so it has to agree with what it summarises.
    if (Data.Statistics.MissionsCleared != FSDMissionStatsService::CountCleared(Data.Missions))
    {
        Report.AddError(
            TEXT("STATISTICS_MISMATCH"),
            TEXT("statistics.missionsCleared"),
            FString::Printf(TEXT("%d does not match the %d cleared record(s)"),
                Data.Statistics.MissionsCleared,
                FSDMissionStatsService::CountCleared(Data.Missions)));
    }
    if (Data.Statistics.BestScore != FSDMissionStatsService::BestOfRecords(Data.Missions))
    {
        Report.AddError(
            TEXT("STATISTICS_MISMATCH"),
            TEXT("statistics.bestScore"),
            FString::Printf(TEXT("%d does not match the best recorded score %d"),
                Data.Statistics.BestScore,
                FSDMissionStatsService::BestOfRecords(Data.Missions)));
    }
    if (Data.Statistics.MissionsPlayed < 0
        || Data.Statistics.MissionsFailed < 0
        || Data.Statistics.TotalScore < 0)
    {
        Report.AddError(
            TEXT("INVALID_SAVE_VALUE"),
            TEXT("statistics"),
            TEXT("played, failed and total score must all be >= 0"));
    }
    if (Data.Statistics.MissionsFailed > Data.Statistics.MissionsPlayed)
    {
        Report.AddError(
            TEXT("STATISTICS_MISMATCH"),
            TEXT("statistics.missionsFailed"),
            TEXT("more failures than plays"));
    }

    // Settings carry their own range rules; the save never repairs a value.
    FSDSettingsService::Validate(Data.Settings, Report);

    // SUB-001: the chosen boat must exist and be researched, because the pawn
    // resolves its meshes from this id and must not show an unowned hull.
    if (!Data.SelectedPlatformId.IsEmpty())
    {
        const FSDTechNode* Platform = Registry->Find(Data.SelectedPlatformId);
        if (Platform == nullptr)
        {
            Report.AddError(
                TEXT("UNKNOWN_PLATFORM"),
                Data.SelectedPlatformId,
                TEXT("the selected platform is not a node in the tree"));
        }
        else if (Platform->Category != ESDTechCategory::Submarine)
        {
            Report.AddError(
                TEXT("PLATFORM_NOT_SUBMARINE"),
                Data.SelectedPlatformId,
                FString::Printf(TEXT("'%s' is not a submarine node"), *Data.SelectedPlatformId));
        }
        else if (!Data.Account.Progress.UnlockedNodeIds.Contains(Data.SelectedPlatformId))
        {
            Report.AddError(
                TEXT("PLATFORM_NOT_UNLOCKED"),
                Data.SelectedPlatformId,
                TEXT("the selected platform has not been researched"));
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

    // DEC-008: slots sharing a socket compete for its capacity. Each
    // assignment above may be legal on its own, so the set has to be counted.
    TMap<FString, int32> FilledPerSocket;
    for (const FSDLoadoutAssignment& Assignment : Data.Loadouts)
    {
        const FSDEquipmentSlot* Slot = Equipment.FindSlot(Assignment.PlatformId, Assignment.SlotName);
        if (Slot == nullptr || Slot->SocketName.IsEmpty() || Slot->SocketCapacity <= 0)
        {
            continue;
        }
        const FString Key = Assignment.PlatformId + TEXT("|") + Slot->SocketName;
        const int32 Filled = FilledPerSocket.FindOrAdd(Key, 0) + 1;
        FilledPerSocket.Add(Key, Filled);
        if (Filled > Slot->SocketCapacity)
        {
            Report.AddError(
                TEXT("SOCKET_CAPACITY_EXCEEDED"),
                FString::Printf(TEXT("%s / %s / %s"),
                    *Assignment.PlatformId, *Assignment.SlotName, *Assignment.CandidateId),
                FString::Printf(
                    TEXT("socket '%s' fits %d slot(s) at once, but %d are filled"),
                    *Slot->SocketName, Slot->SocketCapacity, Filled));
        }
    }

    // SUB-002 / WPN-001: a platform may only be loaded up to the weapon count
    // its launch interface declares. A capacity the data does not state (0) is
    // not enforced: a missing number must not become a prohibition.
    TMap<FString, int32> PayloadPerSlot;
    for (const FSDLoadoutAssignment& Assignment : Data.Loadouts)
    {
        const int32 Capacity = Equipment.GetPayloadCapacity(
            Assignment.PlatformId, Assignment.SlotName);
        if (Capacity <= 0)
        {
            continue;
        }
        const FString Key = Assignment.PlatformId + TEXT("|") + Assignment.SlotName;
        const int32 Loaded = PayloadPerSlot.FindOrAdd(Key, 0) + FMath::Max(Assignment.Count, 1);
        PayloadPerSlot.Add(Key, Loaded);
        if (Loaded > Capacity)
        {
            Report.AddError(
                TEXT("PAYLOAD_CAPACITY_EXCEEDED"),
                FString::Printf(TEXT("%s / %s / %s"),
                    *Assignment.PlatformId, *Assignment.SlotName, *Assignment.CandidateId),
                FString::Printf(
                    TEXT("the platform declares %d mount(s) for slot '%s' but %d round(s) are loaded"),
                    Capacity, *Assignment.SlotName, Loaded));
        }
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

    // A missing or pre-v1 version is rebuilt from scratch rather than guessed
    // at. Version 1 is migrated instead: it carries the account and the
    // loadouts but no progression, statistics or settings, so those sections
    // take their defaults rather than a plausible-looking invented value.
    if (Version < 1)
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
        // WPN-001: the loaded round count. Version 1 documents had no count and
        // carry exactly one round, which is what the default already says.
        if (Version >= 2)
        {
            double Count = 0.0;
            if (!Entry->TryGetNumberField(TEXT("count"), Count))
            {
                Report.AddError(
                    TEXT("MISSING_FIELD"),
                    FString::Printf(TEXT("%s / %s"), *Assignment.PlatformId, *Assignment.SlotName),
                    TEXT("count is required and must be a number"));
                return false;
            }
            Assignment.Count = static_cast<int32>(Count);
        }
        Data.Loadouts.Add(MoveTemp(Assignment));
    }

    // Version 2 sections. A version 1 document has none of them and keeps the
    // defaults the struct declares.
    if (Version >= 2)
    {
        const TArray<TSharedPtr<FJsonValue>>* Missions = nullptr;
        if (!Json->TryGetArrayField(TEXT("missions"), Missions) || Missions == nullptr)
        {
            Report.AddError(TEXT("MISSING_FIELD"), TEXT("save"), TEXT("missions is required and must be an array"));
            return false;
        }
        for (const TSharedPtr<FJsonValue>& Value : *Missions)
        {
            if (!Value.IsValid() || Value->Type != EJson::Object)
            {
                Report.AddError(TEXT("INVALID_FIELD_TYPE"), TEXT("save"), TEXT("missions must contain objects"));
                return false;
            }
            const TSharedPtr<FJsonObject> Entry = Value->AsObject();
            FSDMissionRecord Record;
            if (!Entry->TryGetStringField(TEXT("mission"), Record.MissionId) || Record.MissionId.IsEmpty())
            {
                Report.AddError(
                    TEXT("MISSING_FIELD"), TEXT("save"),
                    TEXT("each mission needs a non-empty mission id"));
                return false;
            }
            double BestScore = 0.0;
            if (!Entry->TryGetNumberField(TEXT("bestScore"), BestScore) || BestScore < 0.0)
            {
                Report.AddError(
                    TEXT("INVALID_FIELD_TYPE"), Record.MissionId,
                    TEXT("bestScore is required and must be a number >= 0"));
                return false;
            }
            Record.BestScore = static_cast<int32>(BestScore);
            if (!Entry->TryGetBoolField(TEXT("cleared"), Record.bCleared))
            {
                Report.AddError(
                    TEXT("MISSING_FIELD"), Record.MissionId,
                    TEXT("cleared is required and must be a boolean"));
                return false;
            }
            Data.Missions.Add(MoveTemp(Record));
        }

        const TSharedPtr<FJsonObject>* Statistics = nullptr;
        if (!Json->TryGetObjectField(TEXT("statistics"), Statistics) || Statistics == nullptr)
        {
            Report.AddError(TEXT("MISSING_FIELD"), TEXT("save"), TEXT("statistics is required and must be an object"));
            return false;
        }
        if (!ReadStatistic(*Statistics, TEXT("missionsPlayed"), TEXT("statistics"), Report, Data.Statistics.MissionsPlayed)
            || !ReadStatistic(*Statistics, TEXT("missionsCleared"), TEXT("statistics"), Report, Data.Statistics.MissionsCleared)
            || !ReadStatistic(*Statistics, TEXT("missionsFailed"), TEXT("statistics"), Report, Data.Statistics.MissionsFailed)
            || !ReadStatistic(*Statistics, TEXT("totalScore"), TEXT("statistics"), Report, Data.Statistics.TotalScore)
            || !ReadStatistic(*Statistics, TEXT("bestScore"), TEXT("statistics"), Report, Data.Statistics.BestScore))
        {
            return false;
        }
        if (!(*Statistics)->TryGetStringField(TEXT("lastMissionId"), Data.Statistics.LastMissionId))
        {
            Report.AddError(
                TEXT("MISSING_FIELD"), TEXT("statistics"),
                TEXT("lastMissionId is required (an empty string means no mission has been played)"));
            return false;
        }

        const TSharedPtr<FJsonObject>* Settings = nullptr;
        if (!Json->TryGetObjectField(TEXT("settings"), Settings) || Settings == nullptr)
        {
            Report.AddError(TEXT("MISSING_FIELD"), TEXT("save"), TEXT("settings is required and must be an object"));
            return false;
        }
        if (!ReadSettings(*Settings, Data.Settings, Report))
        {
            return false;
        }

        if (!Json->TryGetStringField(TEXT("selectedPlatform"), Data.SelectedPlatformId))
        {
            Report.AddError(
                TEXT("MISSING_FIELD"), TEXT("save"),
                TEXT("selectedPlatform is required (an empty string means no boat has been chosen yet)"));
            return false;
        }
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
