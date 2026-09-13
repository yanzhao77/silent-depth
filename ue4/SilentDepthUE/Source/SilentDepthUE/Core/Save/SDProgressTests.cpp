#if WITH_DEV_AUTOMATION_TESTS

#include "Core/Save/SDGameSettings.h"
#include "Core/Save/SDMissionStats.h"
#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace ProgressTests
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

/** The save validator needs an initialised account service over real data. */
struct FSaveStack
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;

    bool Build(FAutomationTestBase& Test)
    {
        FSDTechTreeLoadReport LoadReport;
        if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), Tree, LoadReport))
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
        if (!Registry.Initialize(Tree, CostRule, RegistryReport))
        {
            Test.AddError(TEXT("registry failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport UnlockReport;
        if (!Unlock.Initialize(Registry, TierGate, UnlockReport))
        {
            Test.AddError(TEXT("unlock service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport AccountReport;
        if (!Accounts.Initialize(Unlock, AccountReport))
        {
            Test.AddError(TEXT("account service failed to initialise"));
            return false;
        }
        return true;
    }
};

FSDTechTreeSaveData MakeSaveWithProgression()
{
    FSDTechTreeSaveData Data;
    Data.Account.ResearchPoints = 250;
    Data.Account.Progress.UnlockedNodeIds.Add(TEXT("US_TORP_Mk14"));
    FSDMissionStatsService::ApplyResult(
        FSDMissionResult{ TEXT("M01"), 900, true }, Data.Missions, Data.Statistics);
    FSDMissionStatsService::ApplyResult(
        FSDMissionResult{ TEXT("M02"), 400, false }, Data.Missions, Data.Statistics);
    Data.Settings.MasterVolume = 0.6f;
    Data.Settings.QualityPreset = 1;
    Data.Settings.ResolutionScale = 0.75f;
    Data.Settings.bInvertRudder = true;
    Data.Settings.Language = ESDLanguage::Fr;
    return Data;
}
}
using namespace ProgressTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_ProgressStatsSettlement,
    "SilentDepth.Save.Stats.SettlementIsDeterministic",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_ProgressStatsSettlement::RunTest(const FString& Parameters)
{
    TArray<FSDMissionRecord> Missions;
    FSDStatistics Statistics;

    TestFalse(TEXT("an empty mission id changes nothing"),
        FSDMissionStatsService::ApplyResult(FSDMissionResult{ TEXT(""), 100, true }, Missions, Statistics));
    TestFalse(TEXT("a negative score changes nothing"),
        FSDMissionStatsService::ApplyResult(FSDMissionResult{ TEXT("M01"), -1, true }, Missions, Statistics));
    TestEqual(TEXT("nothing was recorded"), Missions.Num(), 0);
    TestEqual(TEXT("no play was counted"), Statistics.MissionsPlayed, 0);

    TestTrue(TEXT("first clear applied"),
        FSDMissionStatsService::ApplyResult(FSDMissionResult{ TEXT("M01"), 900, true }, Missions, Statistics));
    TestEqual(TEXT("one record"), Missions.Num(), 1);
    TestEqual(TEXT("one play"), Statistics.MissionsPlayed, 1);
    TestEqual(TEXT("one cleared"), Statistics.MissionsCleared, 1);
    TestEqual(TEXT("no failures"), Statistics.MissionsFailed, 0);
    TestEqual(TEXT("total score"), Statistics.TotalScore, 900);
    TestEqual(TEXT("best score"), Statistics.BestScore, 900);
    TestEqual(TEXT("last mission"), Statistics.LastMissionId, FString(TEXT("M01")));

    // A replay with a worse score never lowers the record.
    TestTrue(TEXT("replay applied"),
        FSDMissionStatsService::ApplyResult(FSDMissionResult{ TEXT("M01"), 700, true }, Missions, Statistics));
    TestEqual(TEXT("best score kept"), Statistics.BestScore, 900);
    TestEqual(TEXT("record kept"), Missions[0].BestScore, 900);
    TestEqual(TEXT("cleared is not double counted"), Statistics.MissionsCleared, 1);
    TestEqual(TEXT("total accumulates"), Statistics.TotalScore, 1600);

    // A failed attempt counts as a play and a failure, and a second mission
    // sorts before the first without disturbing the counters.
    TestTrue(TEXT("failure applied"),
        FSDMissionStatsService::ApplyResult(FSDMissionResult{ TEXT("M00"), 100, false }, Missions, Statistics));
    TestEqual(TEXT("plays"), Statistics.MissionsPlayed, 3);
    TestEqual(TEXT("failures"), Statistics.MissionsFailed, 1);
    TestEqual(TEXT("cleared unchanged"), Statistics.MissionsCleared, 1);
    TestEqual(TEXT("records are sorted by id"), Missions[0].MissionId, FString(TEXT("M00")));
    TestTrue(TEXT("the failed mission is not cleared"), !Missions[0].bCleared);

    // The roll-up still agrees with the records.
    TestEqual(TEXT("roll-up matches the records"),
        Statistics.MissionsCleared, FSDMissionStatsService::CountCleared(Missions));
    TestEqual(TEXT("best matches the records"),
        Statistics.BestScore, FSDMissionStatsService::BestOfRecords(Missions));

    // The same sequence from scratch produces the same state.
    TArray<FSDMissionRecord> OtherMissions;
    FSDStatistics OtherStatistics;
    FSDMissionStatsService::ApplyResult(
        FSDMissionResult{ TEXT("M01"), 900, true }, OtherMissions, OtherStatistics);
    FSDMissionStatsService::ApplyResult(
        FSDMissionResult{ TEXT("M01"), 700, true }, OtherMissions, OtherStatistics);
    FSDMissionStatsService::ApplyResult(
        FSDMissionResult{ TEXT("M00"), 100, false }, OtherMissions, OtherStatistics);
    TestEqual(TEXT("same sequence, same play count"),
        OtherStatistics.MissionsPlayed, Statistics.MissionsPlayed);
    TestEqual(TEXT("same sequence, same total"),
        OtherStatistics.TotalScore, Statistics.TotalScore);
    TestEqual(TEXT("same sequence, same record count"), OtherMissions.Num(), Missions.Num());
    TestEqual(TEXT("same sequence, same first record"),
        OtherMissions[0].MissionId, Missions[0].MissionId);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_SettingsRanges,
    "SilentDepth.Save.Settings.RangesAndLanguage",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_SettingsRanges::RunTest(const FString& Parameters)
{
    FSDTechTreeLoadReport Defaults;
    TestTrue(TEXT("the shipped defaults are valid"), FSDSettingsService::Validate(FSDSettings(), Defaults));

    const auto Rejects = [this](const TCHAR* What, const FSDSettings& Settings)
    {
        FSDTechTreeLoadReport Report;
        TestFalse(*FString::Printf(TEXT("%s is refused"), What),
            FSDSettingsService::Validate(Settings, Report));
        TestTrue(*FString::Printf(TEXT("%s is reported"), What),
            HasErrorCode(Report, TEXT("INVALID_SETTINGS_VALUE")));
    };

    FSDSettings TooLoud;
    TooLoud.MasterVolume = 1.5f;
    Rejects(TEXT("a master volume above one"), TooLoud);

    FSDSettings BadQuality;
    BadQuality.QualityPreset = 4;
    Rejects(TEXT("a quality preset above the maximum"), BadQuality);

    FSDSettings BadScale;
    BadScale.ResolutionScale = 0.2f;
    Rejects(TEXT("a resolution scale below the minimum"), BadScale);

    // Language tokens are the web save's tokens, and nothing else is accepted.
    const ESDLanguage All[] = { ESDLanguage::Zh, ESDLanguage::En, ESDLanguage::Fr, ESDLanguage::Ru };
    for (const ESDLanguage Language : All)
    {
        ESDLanguage Parsed = ESDLanguage::Zh;
        TestTrue(*FString::Printf(TEXT("%s parses"), ToString(Language)),
            ParseLanguage(ToString(Language), Parsed));
        TestEqual(*FString::Printf(TEXT("%s round trips"), ToString(Language)),
            static_cast<int32>(Parsed), static_cast<int32>(Language));
    }
    ESDLanguage Unused = ESDLanguage::Zh;
    TestFalse(TEXT("an undeclared language is refused"), ParseLanguage(TEXT("de"), Unused));
    TestFalse(TEXT("an empty language is refused"), ParseLanguage(TEXT(""), Unused));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_SaveDocumentSections,
    "SilentDepth.Save.Document.ProgressionSettingsAndMigration",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_SaveDocumentSections::RunTest(const FString& Parameters)
{
    FSaveStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // Every section survives a document round trip.
    {
        const FSDTechTreeSaveData Data = MakeSaveWithProgression();
        FString Json;
        FSDTechTreeLoadReport WriteReport;
        if (!WriteDocumentToString(Data, Stack.Accounts, Json, WriteReport))
        {
            AddError(TEXT("the save document could not be written"));
            return false;
        }

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport ReadReport;
        if (!ReadDocumentFromString(Json, Stack.Accounts, Reloaded, ReadReport))
        {
            for (const FSDDataError& Error : ReadReport.Errors)
            {
                AddError(FString::Printf(TEXT("[%s] %s :: %s"), *Error.Code, *Error.Subject, *Error.Detail));
            }
            return false;
        }

        TestEqual(TEXT("missions survive"), Reloaded.Missions.Num(), Data.Missions.Num());
        TestEqual(TEXT("statistics survive"), Reloaded.Statistics.MissionsPlayed, Data.Statistics.MissionsPlayed);
        TestEqual(TEXT("best score survives"), Reloaded.Statistics.BestScore, Data.Statistics.BestScore);
        TestEqual(TEXT("the language survives"),
            static_cast<int32>(Reloaded.Settings.Language), static_cast<int32>(ESDLanguage::Fr));
        TestTrue(TEXT("invert rudder survives"), Reloaded.Settings.bInvertRudder);
        TestEqual(TEXT("the signature is stable"),
            ComputeSaveSignature(Reloaded, Stack.Accounts),
            ComputeSaveSignature(Data, Stack.Accounts));
    }

    // A hand-edited settings value is caught by the signature.
    {
        const FSDTechTreeSaveData Data = MakeSaveWithProgression();
        const TSharedRef<FJsonObject> Json = MakeShared<FJsonObject>();
        WriteSaveToJson(Data, Json);
        Json->SetStringField(TEXT("signature"),
            FString::Printf(TEXT("%llu"), ComputeSaveSignature(Data, Stack.Accounts)));

        const TSharedPtr<FJsonObject>* Settings = nullptr;
        TestTrue(TEXT("settings present"), Json->TryGetObjectField(TEXT("settings"), Settings));
        if (Settings != nullptr)
        {
            const TSharedPtr<FJsonObject>* Audio = nullptr;
            TestTrue(TEXT("the audio section is present"),
                (*Settings)->TryGetObjectField(TEXT("audio"), Audio));
            if (Audio != nullptr)
            {
                // Editing a value the document really carries must break the
                // signature, otherwise the tamper check is decorative.
                (*Audio)->SetNumberField(TEXT("master"), 0.1);
            }
        }

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("a tampered settings section is refused"),
            ReadSaveFromJson(Json, Stack.Accounts, Reloaded, Report));
        TestTrue(TEXT("the mismatch is reported"),
            HasErrorCode(Report, TEXT("SAVE_SIGNATURE_MISMATCH")));
    }

    // A statistics section that disagrees with its own records is refused even
    // when the signature is recomputed: it is a rule violation, not a stale file.
    {
        FSDTechTreeSaveData Data = MakeSaveWithProgression();
        Data.Statistics.MissionsCleared = 5;
        const TSharedRef<FJsonObject> Json = MakeShared<FJsonObject>();
        WriteSaveToJson(Data, Json);
        Json->SetStringField(TEXT("signature"),
            FString::Printf(TEXT("%llu"), ComputeSaveSignature(Data, Stack.Accounts)));

        FSDTechTreeSaveData Reloaded;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("an inconsistent roll-up is refused"),
            ReadSaveFromJson(Json, Stack.Accounts, Reloaded, Report));
        TestTrue(TEXT("the mismatch is reported"),
            HasErrorCode(Report, TEXT("STATISTICS_MISMATCH")));
    }

    // Version 1 migrates: the account and loadouts are kept, the new sections
    // take their defaults rather than an invented value.
    {
        const TArray<TSharedPtr<FJsonValue>> EmptyArray;
        const TSharedRef<FJsonObject> Legacy = MakeShared<FJsonObject>();
        Legacy->SetStringField(TEXT("schema"), TEXT("silent-depth-tech-tree-save-v1"));
        Legacy->SetNumberField(TEXT("version"), 1);
        Legacy->SetNumberField(TEXT("researchPoints"), 250);
        Legacy->SetArrayField(TEXT("unlockedNodeIds"), EmptyArray);
        Legacy->SetArrayField(TEXT("firstClearMissionIds"), EmptyArray);
        Legacy->SetArrayField(TEXT("loadouts"), EmptyArray);

        // The v1 signature covered the v1 fields, which here are empty except
        // for the points, so the document is signed over that account.
        FSDTechTreeSaveData LegacyShape;
        LegacyShape.Account.ResearchPoints = 250;
        Legacy->SetStringField(TEXT("signature"),
            FString::Printf(TEXT("%llu"), ComputeSaveSignature(LegacyShape, Stack.Accounts)));

        FSDTechTreeSaveData Migrated;
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("a version 1 document still loads"),
            ReadSaveFromJson(Legacy, Stack.Accounts, Migrated, Report));
        TestEqual(TEXT("migrated to the current version"), Migrated.SchemaVersion, SaveSchemaVersion);
        TestEqual(TEXT("the points are kept"), Migrated.Account.ResearchPoints, 250);
        TestEqual(TEXT("no missions are invented"), Migrated.Missions.Num(), 0);
        TestEqual(TEXT("no plays are invented"), Migrated.Statistics.MissionsPlayed, 0);
        TestEqual(TEXT("the language defaults"),
            static_cast<int32>(Migrated.Settings.Language), static_cast<int32>(ESDLanguage::Zh));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
