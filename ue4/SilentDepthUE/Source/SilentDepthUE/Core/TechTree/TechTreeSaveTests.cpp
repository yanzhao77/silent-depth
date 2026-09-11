#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Dom/JsonObject.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

using namespace SDTechTree;

namespace SaveTests
{
bool HasErrorCode(const FSDTechTreeLoadReport& Report, const TCHAR* Code)
{
    for (const FSDDataError& Error : Report.Errors)
    {
        if (Error.Code.Equals(Code, ESearchCase::CaseSensitive))
        {
            return true;
        }
    }
    return false;
}

bool BuildSaveStack(
    FAutomationTestBase& Test,
    FSDTechTree& OutTree,
    FSDNodeRegistry& OutRegistry,
    FSDUnlockService& OutUnlock,
    FSDResearchAccountService& OutAccounts)
{
    FSDTechTreeLoadReport LoadReport;
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), OutTree, LoadReport))
    {
        Test.AddError(TEXT("tech tree failed to load"));
        return false;
    }
    FSDResearchCostRule CostRule;
    FSDTierGateRule TierGate;
    FSDTechTreeLoadReport CostReport;
    if (!LoadResearchRules(FSDTechTreePaths::ProjectDefaultCostFile(), CostRule, TierGate, CostReport))
    {
        Test.AddError(TEXT("research cost rule failed to load"));
        return false;
    }
    FSDTechTreeLoadReport RegistryReport;
    if (!OutRegistry.Initialize(OutTree, CostRule, RegistryReport))
    {
        Test.AddError(TEXT("registry failed to initialise"));
        return false;
    }
    FSDTechTreeLoadReport UnlockReport;
    if (!OutUnlock.Initialize(OutRegistry, TierGate, UnlockReport))
    {
        Test.AddError(TEXT("unlock service failed to initialise"));
        return false;
    }
    FSDTechTreeLoadReport AccountReport;
    return OutAccounts.Initialize(OutUnlock, AccountReport);
}

TSharedPtr<FJsonObject> ParseJsonObject(const FString& Text)
{
    TSharedPtr<FJsonValue> Value;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
    if (!FJsonSerializer::Deserialize(Reader, Value) || !Value.IsValid() || Value->Type != EJson::Object)
    {
        return nullptr;
    }
    return Value->AsObject();
}

FString SerializeJsonObject(const TSharedPtr<FJsonObject>& Json)
{
    FString Text;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Text);
    FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);
    return Text;
}

/** Builds a saved account: 150 points earned, Mk14 researched, M02 cleared. */
FSDTechTreeSaveData MakeSampleSave()
{
    FSDTechTreeSaveData Data;
    Data.Account.ResearchPoints = 150;
    Data.Account.Progress.UnlockedNodeIds.Add(TEXT("US_TORP_Mk14"));
    Data.Account.FirstClearMissionIds.Add(TEXT("M02"));
    return Data;
}

FString MakeTempSavePath()
{
    const FString Directory = FPaths::ProjectSavedDir() / TEXT("TechTreeSaveTest");
    IFileManager::Get().MakeDirectory(*Directory, true);
    return Directory / TEXT("slot.json");
}
}
using namespace SaveTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSaveRoundTrip,
    "SilentDepth.TechTree.Save.RoundTrip",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSaveRoundTrip::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildSaveStack(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDTechTreeSaveData Data = MakeSampleSave();
    FSDLoadoutAssignment Assignment;
    Assignment.PlatformId = TEXT("RU_SSN_Akula");
    Assignment.SlotName = TEXT("TORPEDO");
    Assignment.CandidateId = TEXT("RU_TORP_UGST");
    Data.Loadouts.Add(Assignment);

    // In-memory round trip.
    {
        const TSharedRef<FJsonObject> Json = MakeShared<FJsonObject>();
        WriteSaveToJson(Data, Json);
        Json->SetStringField(TEXT("signature"), FString::Printf(TEXT("%llu"), ComputeSaveSignature(Data, Accounts)));

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("document reads back"), ReadSaveFromJson(Json, Accounts, Reloaded, Report));
        TestEqual(TEXT("points survive"), Reloaded.Account.ResearchPoints, 150);
        TestEqual(TEXT("research survives"), Reloaded.Account.Progress.UnlockedNodeIds.Num(), 1);
        TestEqual(TEXT("first clear survives"), Reloaded.Account.FirstClearMissionIds.Num(), 1);
        TestEqual(TEXT("loadout survives"), Reloaded.Loadouts.Num(), 1);
        if (Reloaded.Loadouts.Num() == 1)
        {
            TestEqual(TEXT("platform survives"), Reloaded.Loadouts[0].PlatformId, FString(TEXT("RU_SSN_Akula")));
            TestEqual(TEXT("slot survives"), Reloaded.Loadouts[0].SlotName, FString(TEXT("TORPEDO")));
            TestEqual(TEXT("candidate survives"), Reloaded.Loadouts[0].CandidateId, FString(TEXT("RU_TORP_UGST")));
        }
        TestEqual(TEXT("signature is stable"), ComputeSaveSignature(Reloaded, Accounts), ComputeSaveSignature(Data, Accounts));
    }

    // File round trip.
    {
        const FString Path = MakeTempSavePath();
        FSDTechTreeLoadReport WriteReport;
        TestTrue(TEXT("save writes"), SaveTechTreeToFile(Path, Data, Accounts, WriteReport));

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport ReadReport;
        TestTrue(TEXT("save reads"), LoadTechTreeFromFile(Path, Accounts, Reloaded, ReadReport));
        TestEqual(TEXT("file round trip keeps points"), Reloaded.Account.ResearchPoints, 150);
        TestEqual(TEXT("file round trip keeps loadout"), Reloaded.Loadouts.Num(), 1);
        TestEqual(TEXT("file round trip keeps the signature"),
            ComputeSaveSignature(Reloaded, Accounts), ComputeSaveSignature(Data, Accounts));
        IFileManager::Get().Delete(*Path);
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSaveRejectsTampering,
    "SilentDepth.TechTree.Save.RejectsTamperedContent",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSaveRejectsTampering::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildSaveStack(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDTechTreeSaveData Data = MakeSampleSave();
    const TSharedRef<FJsonObject> Json = MakeShared<FJsonObject>();
    WriteSaveToJson(Data, Json);
    Json->SetStringField(TEXT("signature"), FString::Printf(TEXT("%llu"), ComputeSaveSignature(Data, Accounts)));

    // Editing the balance without recomputing the signature is caught.
    {
        TSharedPtr<FJsonObject> Tampered = ParseJsonObject(SerializeJsonObject(Json));
        Tampered->SetNumberField(TEXT("researchPoints"), 99999);

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("tampered balance rejected"), ReadSaveFromJson(Tampered, Accounts, Reloaded, Report));
        TestTrue(TEXT("tamper reported"), HasErrorCode(Report, TEXT("SAVE_SIGNATURE_MISMATCH")));
        TestEqual(TEXT("nothing applied"), Reloaded.Account.ResearchPoints, 0);
    }

    // Editing the loadout is caught by the same signature.
    {
        FSDTechTreeSaveData WithLoadout = MakeSampleSave();
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("RU_SSN_Akula");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("RU_TORP_UGST");
        WithLoadout.Loadouts.Add(Assignment);

        const TSharedRef<FJsonObject> Signed = MakeShared<FJsonObject>();
        WriteSaveToJson(WithLoadout, Signed);
        Signed->SetStringField(TEXT("signature"),
            FString::Printf(TEXT("%llu"), ComputeSaveSignature(WithLoadout, Accounts)));

        TSharedPtr<FJsonObject> Tampered = ParseJsonObject(SerializeJsonObject(Signed));
        const TArray<TSharedPtr<FJsonValue>>* Loadouts = nullptr;
        Tampered->TryGetArrayField(TEXT("loadouts"), Loadouts);
        TestNotNull(TEXT("loadouts present"), Loadouts);
        if (Loadouts != nullptr && Loadouts->Num() == 1)
        {
            const TSharedPtr<FJsonObject> Entry = (*Loadouts)[0]->AsObject();
            Entry->SetStringField(TEXT("candidate"), TEXT("US_TORP_Mk48"));
        }

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("tampered loadout rejected"), ReadSaveFromJson(Tampered, Accounts, Reloaded, Report));
        TestTrue(TEXT("loadout tamper reported"), HasErrorCode(Report, TEXT("SAVE_SIGNATURE_MISMATCH")));
    }

    // A missing signature is a defect, not something to skip.
    {
        TSharedPtr<FJsonObject> Unsigned = ParseJsonObject(SerializeJsonObject(Json));
        Unsigned->RemoveField(TEXT("signature"));

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unsigned save rejected"), ReadSaveFromJson(Unsigned, Accounts, Reloaded, Report));
        TestTrue(TEXT("missing signature reported"), HasErrorCode(Report, TEXT("MISSING_FIELD")));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSaveRejectsBadContent,
    "SilentDepth.TechTree.Save.RejectsInvalidContent",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSaveRejectsBadContent::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildSaveStack(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    FSDTechTreeSaveData Base = MakeSampleSave();

    // Unknown researched node.
    {
        FSDTechTreeSaveData Data = Base;
        Data.Account.Progress.UnlockedNodeIds.Add(TEXT("NO_SUCH_NODE"));
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unknown researched node rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("unknown node reported"), HasErrorCode(Report, TEXT("UNKNOWN_NODE_IN_PROGRESS")));
    }

    // Negative balance.
    {
        FSDTechTreeSaveData Data = Base;
        Data.Account.ResearchPoints = -5;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("negative balance rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("negative balance reported"), HasErrorCode(Report, TEXT("NEGATIVE_BALANCE")));
    }

    // A platform that is not a submarine node.
    {
        FSDTechTreeSaveData Data = Base;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("US_TORP_Mk14");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("RU_TORP_UGST");
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("non-submarine platform rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("platform kind reported"), HasErrorCode(Report, TEXT("PLATFORM_NOT_SUBMARINE")));
    }

    // Unknown platform and unknown candidate.
    {
        FSDTechTreeSaveData Data = Base;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("NO_SUCH_HULL");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("NO_SUCH_TORPEDO");
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unknown platform rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("unknown platform reported"), HasErrorCode(Report, TEXT("UNKNOWN_PLATFORM")));
    }
    {
        FSDTechTreeSaveData Data = Base;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("RU_SSN_Akula");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("NO_SUCH_TORPEDO");
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unknown candidate rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("unknown candidate reported"), HasErrorCode(Report, TEXT("UNKNOWN_CANDIDATE")));
    }

    // The same slot filled twice.
    {
        FSDTechTreeSaveData Data = Base;
        for (int32 Index = 0; Index < 2; ++Index)
        {
            FSDLoadoutAssignment Assignment;
            Assignment.PlatformId = TEXT("RU_SSN_Akula");
            Assignment.SlotName = TEXT("TORPEDO");
            Assignment.CandidateId = Index == 0 ? TEXT("RU_TORP_UGST") : TEXT("RU_TORP_USET80");
            Data.Loadouts.Add(Assignment);
        }
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("duplicate slot rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("duplicate slot reported"), HasErrorCode(Report, TEXT("DUPLICATE_LOADOUT_SLOT")));
    }

    // Empty loadout fields.
    {
        FSDTechTreeSaveData Data = Base;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("RU_SSN_Akula");
        Assignment.CandidateId = TEXT("RU_TORP_UGST");
        Data.Loadouts.Add(Assignment);
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("empty slot rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("empty field reported"), HasErrorCode(Report, TEXT("EMPTY_LOADOUT_FIELD")));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSaveVersioning,
    "SilentDepth.TechTree.Save.Versioning",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSaveVersioning::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildSaveStack(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    // A save from a newer build is refused outright: this build cannot know
    // what its extra fields mean.
    {
        const TSharedRef<FJsonObject> Newer = MakeShared<FJsonObject>();
        Newer->SetNumberField(TEXT("version"), SaveSchemaVersion + 1);
        FSDTechTreeSaveData Data;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("newer version rejected"), ReadSaveFromJson(Newer, Accounts, Data, Report));
        TestTrue(TEXT("version reported"), HasErrorCode(Report, TEXT("SAVE_VERSION_UNSUPPORTED")));
    }

    // Version 99 via direct validation is refused too.
    {
        FSDTechTreeSaveData Data = MakeSampleSave();
        Data.SchemaVersion = SaveSchemaVersion + 98;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unsupported version rejected"), ValidateSaveData(Data, Accounts, Report));
        TestTrue(TEXT("version reported"), HasErrorCode(Report, TEXT("SAVE_VERSION_UNSUPPORTED")));
    }

    // A payload without a version predates the schema: it is rebuilt from
    // scratch rather than guessed at, and the result is valid and empty.
    {
        const TArray<TSharedPtr<FJsonValue>> EmptyArray;
        const TSharedRef<FJsonObject> Legacy = MakeShared<FJsonObject>();
        Legacy->SetNumberField(TEXT("researchPoints"), 4321);
        Legacy->SetArrayField(TEXT("unlockedNodeIds"), EmptyArray);
        Legacy->SetArrayField(TEXT("loadouts"), EmptyArray);

        FSDTechTreeSaveData Data;
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("legacy payload accepted"), ReadSaveFromJson(Legacy, Accounts, Data, Report));
        TestEqual(TEXT("rebuilt at the current version"), Data.SchemaVersion, SaveSchemaVersion);
        TestEqual(TEXT("legacy points are not trusted"), Data.Account.ResearchPoints, 0);
        TestEqual(TEXT("no nodes carried over"), Data.Account.Progress.UnlockedNodeIds.Num(), 0);
        TestEqual(TEXT("no loadouts carried over"), Data.Loadouts.Num(), 0);
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSaveFileGuards,
    "SilentDepth.TechTree.Save.FileGuards",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSaveFileGuards::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    if (!BuildSaveStack(*this, Tree, Registry, Unlock, Accounts))
    {
        return false;
    }

    // A missing file reports itself instead of producing an empty save.
    {
        const FString MissingPath = FPaths::ProjectSavedDir() / TEXT("TechTreeSaveTest") / TEXT("absent.json");
        IFileManager::Get().Delete(*MissingPath);
        FSDTechTreeSaveData Data;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("missing file rejected"), LoadTechTreeFromFile(MissingPath, Accounts, Data, Report));
        TestTrue(TEXT("missing file reported"), HasErrorCode(Report, TEXT("MISSING_FILE")));
    }

    // Garbage on disk is rejected rather than half-parsed.
    {
        const FString Path = MakeTempSavePath();
        FFileHelper::SaveStringToFile(TEXT("{ this is not json"), *Path);
        FSDTechTreeSaveData Data;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("corrupt file rejected"), LoadTechTreeFromFile(Path, Accounts, Data, Report));
        TestTrue(TEXT("corrupt file reported"), HasErrorCode(Report, TEXT("INVALID_JSON")));
        IFileManager::Get().Delete(*Path);
    }

    // Writing an invalid account must not produce a file.
    {
        const FString Path = FPaths::ProjectSavedDir() / TEXT("TechTreeSaveTest") / TEXT("invalid_write.json");
        IFileManager::Get().Delete(*Path);
        FSDTechTreeSaveData Data = MakeSampleSave();
        Data.Account.ResearchPoints = -10;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("invalid save refused"), SaveTechTreeToFile(Path, Data, Accounts, Report));
        TestFalse(TEXT("no file written"), FPaths::FileExists(Path));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
