#include "SilentDepthSaveSubsystem.h"

#include "SilentDepthSaveGame.h"
#include "TechTreeSubsystem.h"

#include "Containers/Ticker.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"

DEFINE_LOG_CATEGORY_STATIC(LogSilentDepthSave, Log, All);

namespace
{
constexpr int32 SD_SAVE_USER_INDEX = 0;

/** Wraps the document in a slot payload and writes it. */
bool WriteSlotJson(
    const FString& SlotName,
    const FString& Json,
    FSDTechTreeLoadReport& Report)
{
    USilentDepthSaveGame* Payload = NewObject<USilentDepthSaveGame>();
    Payload->DocumentJson = Json;
    Payload->DocumentSchema = SDTechTree::SaveSchemaId;
    Payload->DocumentVersion = SDTechTree::SaveSchemaVersion;

    if (!UGameplayStatics::SaveGameToSlot(Payload, SlotName, SD_SAVE_USER_INDEX))
    {
        Report.AddError(
            TEXT("SLOT_WRITE_FAILED"),
            SlotName,
            TEXT("the save slot could not be written"));
        return false;
    }
    return true;
}

/** Reads the raw document text out of a slot. */
bool ReadSlotJson(
    const FString& SlotName,
    FString& OutJson,
    FSDTechTreeLoadReport& Report)
{
    USaveGame* Loaded = UGameplayStatics::LoadGameFromSlot(SlotName, SD_SAVE_USER_INDEX);
    USilentDepthSaveGame* Payload = Cast<USilentDepthSaveGame>(Loaded);
    if (Payload == nullptr)
    {
        Report.AddError(
            TEXT("SLOT_READ_FAILED"),
            SlotName,
            TEXT("the slot is missing or was not written by this game"));
        return false;
    }
    if (Payload->DocumentVersion > SDTechTree::SaveSchemaVersion)
    {
        Report.AddError(
            TEXT("SAVE_VERSION_UNSUPPORTED"),
            SlotName,
            FString::Printf(TEXT("the slot holds document version %d; this build reads %d"),
                Payload->DocumentVersion, SDTechTree::SaveSchemaVersion));
        return false;
    }
    OutJson = Payload->DocumentJson;
    return true;
}
}

const FString& USilentDepthSaveSubsystem::DefaultSlotName()
{
    static const FString Name = TEXT("SilentDepth");
    return Name;
}

void USilentDepthSaveSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    if (FParse::Param(FCommandLine::Get(), TEXT("sd-save-selftest")))
    {
        // The tech-tree subsystem must be up first, so the round trip waits for
        // the next tick instead of racing subsystem initialisation order.
        FTicker::GetCoreTicker().AddTicker(
            FTickerDelegate::CreateLambda([this](float) -> bool
            {
                RunStartupSelfTest();
                return false;
            }),
            0.0f);
    }
}

const SDTechTree::FSDResearchAccountService* USilentDepthSaveSubsystem::GetAccounts() const
{
    const UGameInstance* GameInstance = GetGameInstance();
    if (GameInstance == nullptr)
    {
        return nullptr;
    }
    const USilentDepthTechTreeSubsystem* TechTree =
        GameInstance->GetSubsystem<USilentDepthTechTreeSubsystem>();
    if (TechTree == nullptr || !TechTree->IsLoaded())
    {
        return nullptr;
    }
    return &TechTree->GetResearchAccountService();
}

bool USilentDepthSaveSubsystem::DoesSlotExist(const FString& SlotName) const
{
    return UGameplayStatics::DoesSaveGameExist(SlotName, SD_SAVE_USER_INDEX);
}

bool USilentDepthSaveSubsystem::SaveToSlot(
    const FString& SlotName,
    const SDTechTree::FSDTechTreeSaveData& Data,
    FSDTechTreeLoadReport& Report)
{
    const SDTechTree::FSDResearchAccountService* Accounts = GetAccounts();
    if (Accounts == nullptr)
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("save subsystem"),
            TEXT("the technology trees are not loaded, so nothing can be validated or written"));
        return false;
    }

    FString Json;
    if (!SDTechTree::WriteDocumentToString(Data, *Accounts, Json, Report))
    {
        return false;
    }

    const FString TempSlot = SlotName + TEXT("__tmp");
    const uint64 ExpectedSignature = SDTechTree::ComputeSaveSignature(Data, *Accounts);

    auto AbortTemp = [&TempSlot, &Report]()
    {
        UGameplayStatics::DeleteGameInSlot(TempSlot, SD_SAVE_USER_INDEX);
        return false;
    };

    // 1. Write the scratch slot.
    if (!WriteSlotJson(TempSlot, Json, Report))
    {
        return AbortTemp();
    }

    // 2. Read it back and verify before touching the real slot.
    {
        FString ReadBackJson;
        SDTechTree::FSDTechTreeSaveData ReadBack;
        if (!ReadSlotJson(TempSlot, ReadBackJson, Report)
            || !SDTechTree::ReadDocumentFromString(ReadBackJson, *Accounts, ReadBack, Report))
        {
            return AbortTemp();
        }
        if (SDTechTree::ComputeSaveSignature(ReadBack, *Accounts) != ExpectedSignature)
        {
            Report.AddError(
                TEXT("SLOT_VERIFY_FAILED"),
                TempSlot,
                TEXT("the scratch slot does not read back as the document that was written"));
            return AbortTemp();
        }
    }

    // 3. Promote to the real slot, then verify that too.
    if (!WriteSlotJson(SlotName, Json, Report))
    {
        return AbortTemp();
    }
    {
        FString ReadBackJson;
        SDTechTree::FSDTechTreeSaveData ReadBack;
        const bool bVerified = ReadSlotJson(SlotName, ReadBackJson, Report)
            && SDTechTree::ReadDocumentFromString(ReadBackJson, *Accounts, ReadBack, Report)
            && SDTechTree::ComputeSaveSignature(ReadBack, *Accounts) == ExpectedSignature;
        UGameplayStatics::DeleteGameInSlot(TempSlot, SD_SAVE_USER_INDEX);
        if (!bVerified)
        {
            Report.AddError(
                TEXT("SLOT_VERIFY_FAILED"),
                SlotName,
                TEXT("the written slot does not read back as the document that was saved"));
            return false;
        }
    }

    return true;
}

bool USilentDepthSaveSubsystem::LoadFromSlot(
    const FString& SlotName,
    SDTechTree::FSDTechTreeSaveData& OutData,
    FSDTechTreeLoadReport& Report)
{
    const SDTechTree::FSDResearchAccountService* Accounts = GetAccounts();
    if (Accounts == nullptr)
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("save subsystem"),
            TEXT("the technology trees are not loaded, so a slot cannot be validated"));
        return false;
    }

    FString Json;
    if (!ReadSlotJson(SlotName, Json, Report))
    {
        return false;
    }
    return SDTechTree::ReadDocumentFromString(Json, *Accounts, OutData, Report);
}

bool USilentDepthSaveSubsystem::ImportFromJson(
    const FString& Json,
    SDTechTree::FSDTechTreeSaveData& OutData,
    FSDTechTreeLoadReport& Report)
{
    const SDTechTree::FSDResearchAccountService* Accounts = GetAccounts();
    if (Accounts == nullptr)
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("save subsystem"),
            TEXT("the technology trees are not loaded, so an import cannot be validated"));
        return false;
    }
    return SDTechTree::ReadDocumentFromString(Json, *Accounts, OutData, Report);
}

bool USilentDepthSaveSubsystem::ExportToJson(
    const SDTechTree::FSDTechTreeSaveData& Data,
    FString& OutJson,
    FSDTechTreeLoadReport& Report)
{
    const SDTechTree::FSDResearchAccountService* Accounts = GetAccounts();
    if (Accounts == nullptr)
    {
        Report.AddError(
            TEXT("NOT_INITIALIZED"),
            TEXT("save subsystem"),
            TEXT("the technology trees are not loaded, so an export cannot be validated"));
        return false;
    }
    return SDTechTree::WriteDocumentToString(Data, *Accounts, OutJson, Report);
}

void USilentDepthSaveSubsystem::RunStartupSelfTest()
{
    if (GetAccounts() == nullptr)
    {
        UE_LOG(LogSilentDepthSave, Error,
            TEXT("save self-test skipped: the technology trees are not loaded"));
        return;
    }

    const FString SlotName = TEXT("SilentDepthSelfTest");
    SDTechTree::FSDTechTreeSaveData Data;
    Data.Account.ResearchPoints = 150;
    Data.Account.Progress.UnlockedNodeIds.Add(TEXT("US_TORP_Mk14"));
    Data.Account.FirstClearMissionIds.Add(TEXT("M02"));
    SDTechTree::FSDLoadoutAssignment Assignment;
    Assignment.PlatformId = TEXT("RU_SSN_Akula");
    Assignment.SlotName = TEXT("TORPEDO");
    Assignment.CandidateId = TEXT("RU_TORP_UGST");
    Data.Loadouts.Add(Assignment);

    FSDTechTreeLoadReport WriteReport;
    if (!SaveToSlot(SlotName, Data, WriteReport))
    {
        for (const FSDDataError& Error : WriteReport.Errors)
        {
            UE_LOG(LogSilentDepthSave, Error, TEXT("[%s] %s :: %s"),
                *Error.Code, *Error.Subject, *Error.Detail);
        }
        UE_LOG(LogSilentDepthSave, Error, TEXT("save self-test FAILED at write"));
        return;
    }

    SDTechTree::FSDTechTreeSaveData Reloaded;
    FSDTechTreeLoadReport ReadReport;
    const bool bLoaded = LoadFromSlot(SlotName, Reloaded, ReadReport);
    const SDTechTree::FSDResearchAccountService* Accounts = GetAccounts();
    const bool bMatches = bLoaded && Accounts != nullptr
        && SDTechTree::ComputeSaveSignature(Reloaded, *Accounts)
            == SDTechTree::ComputeSaveSignature(Data, *Accounts);

    UGameplayStatics::DeleteGameInSlot(SlotName, SD_SAVE_USER_INDEX);

    if (!bMatches)
    {
        for (const FSDDataError& Error : ReadReport.Errors)
        {
            UE_LOG(LogSilentDepthSave, Error, TEXT("[%s] %s :: %s"),
                *Error.Code, *Error.Subject, *Error.Detail);
        }
        UE_LOG(LogSilentDepthSave, Error, TEXT("save self-test FAILED at read-back"));
        return;
    }

    UE_LOG(LogSilentDepthSave, Log,
        TEXT("save self-test PASSED: slot round trip kept %d point(s), %d node(s), %d loadout(s)"),
        Reloaded.Account.ResearchPoints,
        Reloaded.Account.Progress.UnlockedNodeIds.Num(),
        Reloaded.Loadouts.Num());
}
