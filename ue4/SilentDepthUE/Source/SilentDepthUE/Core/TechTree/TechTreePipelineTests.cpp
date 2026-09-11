#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeNodeRegistry.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Misc/AutomationTest.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

using namespace SDTechTree;

namespace PipelineTests
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

bool HasNoticeCode(const FSDTechTreeLoadReport& Report, const TCHAR* Code)
{
    for (const FSDDataNotice& Notice : Report.Notices)
    {
        if (Notice.Code.Equals(Code, ESearchCase::CaseSensitive))
        {
            return true;
        }
    }
    return false;
}

/** The whole runtime stack, as the subsystem builds it. */
struct FPipelineStack
{
    FSDTechTree Tree;
    FSDNodeRegistry Registry;
    FSDUnlockService Unlock;
    FSDResearchAccountService Accounts;
    FSDEquipmentService Equipment;

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
        FSDTechTreeLoadReport EquipmentReport;
        if (!Equipment.Initialize(Tree, EquipmentReport))
        {
            Test.AddError(TEXT("equipment service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport UnlockReport;
        if (!Unlock.Initialize(Registry, UnlockReport))
        {
            Test.AddError(TEXT("unlock service failed to initialise"));
            return false;
        }
        FSDTechTreeLoadReport AccountReport;
        return Accounts.Initialize(Unlock, AccountReport);
    }
};

/**
 * The scripted progress used by the determinism tests: settle two missions and
 * research two torpedoes.
 */
void RunScriptedProgress(FPipelineStack& Stack, FSDResearchAccount& Account)
{
    FSDMissionSettlement Settlement;
    Stack.Accounts.AwardMissionResult(Account, TEXT("M02"), 700, Settlement);

    FSDPurchaseOutcome Purchase;
    Stack.Accounts.TryPurchase(Account, TEXT("US_TORP_Mk14"), Purchase);

    Stack.Accounts.AwardMissionResult(Account, TEXT("M03"), 1000, Settlement);
    Stack.Accounts.TryPurchase(Account, TEXT("US_TORP_Mk18"), Purchase);
}

FString MakePipelineSavePath(const TCHAR* Name)
{
    const FString Directory = FPaths::ProjectSavedDir() / TEXT("TechTreePipelineTest");
    IFileManager::Get().MakeDirectory(*Directory, true);
    return Directory / Name;
}
}
using namespace PipelineTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PipelineEndToEndDeterminism,
    "SilentDepth.TechTree.Pipeline.EndToEndDeterminism",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PipelineEndToEndDeterminism::RunTest(const FString& Parameters)
{
    FPipelineStack First;
    FPipelineStack Second;
    if (!First.Build(*this) || !Second.Build(*this))
    {
        return false;
    }

    // Two independently built stacks run the same script and must agree.
    FSDResearchAccount AccountA;
    FSDResearchAccount AccountB;
    RunScriptedProgress(First, AccountA);
    RunScriptedProgress(Second, AccountB);

    TestEqual(TEXT("balances agree"), AccountA.ResearchPoints, AccountB.ResearchPoints);
    TestEqual(TEXT("researched sets agree"),
        AccountA.Progress.UnlockedNodeIds.Num(), AccountB.Progress.UnlockedNodeIds.Num());
    TestEqual(TEXT("unlock signatures agree"),
        First.Unlock.ComputeSignature(AccountA.Progress, AccountA.ResearchPoints),
        Second.Unlock.ComputeSignature(AccountB.Progress, AccountB.ResearchPoints));
    TestEqual(TEXT("account signatures agree"),
        First.Accounts.ComputeAccountSignature(AccountA),
        Second.Accounts.ComputeAccountSignature(AccountB));

    // Points spent and earned land where the numbers say they should.
    TestEqual(TEXT("two first clears plus two tier-1 purchases"), AccountA.ResearchPoints, 70);
    TestTrue(TEXT("Mk14 researched"), First.Accounts.IsUnlocked(AccountA, TEXT("US_TORP_Mk14")));
    TestTrue(TEXT("Mk18 researched"), First.Accounts.IsUnlocked(AccountA, TEXT("US_TORP_Mk18")));

    // The same account written on both stacks produces identical bytes and
    // identical save signatures.
    FSDTechTreeSaveData SaveA;
    SaveA.Account = AccountA;
    FSDLoadoutAssignment Assignment;
    Assignment.PlatformId = TEXT("RU_SSN_Akula");
    Assignment.SlotName = TEXT("TORPEDO");
    Assignment.CandidateId = TEXT("RU_TORP_UGST");
    SaveA.Loadouts.Add(Assignment);
    FSDTechTreeSaveData SaveB = SaveA;

    FSDTechTreeLoadReport WriteReportA;
    FSDTechTreeLoadReport WriteReportB;
    const FString PathA = MakePipelineSavePath(TEXT("determinism_a.json"));
    const FString PathB = MakePipelineSavePath(TEXT("determinism_b.json"));
    TestTrue(TEXT("first save writes"), SaveTechTreeToFile(PathA, SaveA, First.Accounts, WriteReportA));
    TestTrue(TEXT("second save writes"), SaveTechTreeToFile(PathB, SaveB, Second.Accounts, WriteReportB));
    TestEqual(TEXT("save signatures agree"),
        ComputeSaveSignature(SaveA, First.Accounts), ComputeSaveSignature(SaveB, Second.Accounts));

    FString TextA;
    FString TextB;
    FFileHelper::LoadFileToString(TextA, *PathA);
    FFileHelper::LoadFileToString(TextB, *PathB);
    TestTrue(TEXT("save bytes agree"), TextA.Equals(TextB, ESearchCase::CaseSensitive));

    IFileManager::Get().Delete(*PathA);
    IFileManager::Get().Delete(*PathB);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PipelineSaveCapturesProgression,
    "SilentDepth.TechTree.Pipeline.SaveCapturesProgression",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PipelineSaveCapturesProgression::RunTest(const FString& Parameters)
{
    FPipelineStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // Session A: settle both missions and buy both nodes without stopping.
    FSDResearchAccount Continuous;
    RunScriptedProgress(Stack, Continuous);

    // Session B: stop after the first purchase, save, reload, then continue.
    FSDResearchAccount Split;
    FSDMissionSettlement Settlement;
    FSDPurchaseOutcome Purchase;
    Stack.Accounts.AwardMissionResult(Split, TEXT("M02"), 700, Settlement);
    Stack.Accounts.TryPurchase(Split, TEXT("US_TORP_Mk14"), Purchase);

    FSDTechTreeSaveData MidGame;
    MidGame.Account = Split;
    const FString Path = MakePipelineSavePath(TEXT("midgame.json"));
    FSDTechTreeLoadReport WriteReport;
    TestTrue(TEXT("mid-game save writes"), SaveTechTreeToFile(Path, MidGame, Stack.Accounts, WriteReport));

    FSDTechTreeSaveData Reloaded;
    FSDTechTreeLoadReport ReadReport;
    TestTrue(TEXT("mid-game save reads"), LoadTechTreeFromFile(Path, Stack.Accounts, Reloaded, ReadReport));
    TestEqual(TEXT("mid-game state survives"), Reloaded.Account.ResearchPoints, Split.ResearchPoints);

    FSDResearchAccount Resumed = Reloaded.Account;
    Stack.Accounts.AwardMissionResult(Resumed, TEXT("M03"), 1000, Settlement);
    Stack.Accounts.TryPurchase(Resumed, TEXT("US_TORP_Mk18"), Purchase);

    // The split run must land exactly where the continuous run did.
    TestEqual(TEXT("split progression matches continuous"),
        Stack.Accounts.ComputeAccountSignature(Resumed),
        Stack.Accounts.ComputeAccountSignature(Continuous));
    TestEqual(TEXT("balances match"), Resumed.ResearchPoints, Continuous.ResearchPoints);

    // Re-saving the reloaded state reproduces the same bytes, which is what
    // makes the format safe to write twice.
    FSDTechTreeSaveData Again;
    Again.Account = Resumed;
    const FString PathAgain = MakePipelineSavePath(TEXT("midgame_again.json"));
    FSDTechTreeLoadReport AgainReport;
    TestTrue(TEXT("resumed save writes"), SaveTechTreeToFile(PathAgain, Again, Stack.Accounts, AgainReport));

    FString FirstText;
    FString SecondText;
    FFileHelper::LoadFileToString(FirstText, *Path);
    FFileHelper::LoadFileToString(SecondText, *PathAgain);
    TestFalse(TEXT("progress actually changed the file"), FirstText.Equals(SecondText, ESearchCase::CaseSensitive));

    IFileManager::Get().Delete(*Path);
    IFileManager::Get().Delete(*PathAgain);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PipelineIndependentLoadsAgree,
    "SilentDepth.TechTree.Pipeline.IndependentLoadsAgree",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PipelineIndependentLoadsAgree::RunTest(const FString& Parameters)
{
    FPipelineStack First;
    FPipelineStack Second;
    if (!First.Build(*this) || !Second.Build(*this))
    {
        return false;
    }

    TestEqual(TEXT("same node count"), First.Registry.Num(), Second.Registry.Num());
    TestEqual(TEXT("same compatibility records"),
        First.Equipment.NumRecords(), Second.Equipment.NumRecords());
    TestEqual(TEXT("same slot definitions"), First.Equipment.NumSlots(), Second.Equipment.NumSlots());

    // Topological order is a data-derived sequence, so it must match too.
    const TArray<FString>& OrderA = First.Registry.GetTopologicalOrder();
    const TArray<FString>& OrderB = Second.Registry.GetTopologicalOrder();
    TestEqual(TEXT("same order length"), OrderA.Num(), OrderB.Num());
    bool bSameOrder = OrderA.Num() == OrderB.Num();
    for (int32 Index = 0; bSameOrder && Index < OrderA.Num(); ++Index)
    {
        bSameOrder = OrderA[Index].Equals(OrderB[Index], ESearchCase::CaseSensitive);
    }
    TestTrue(TEXT("same topological order"), bSameOrder);

    // Candidate lists are policy-filtered views over the same index.
    TArray<FString> CandidatesA;
    TArray<FString> CandidatesB;
    First.Equipment.CollectCandidates(
        TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), ESDEquipPolicy::Strict, CandidatesA);
    Second.Equipment.CollectCandidates(
        TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), ESDEquipPolicy::Strict, CandidatesB);
    TestEqual(TEXT("same candidate count"), CandidatesA.Num(), CandidatesB.Num());
    for (int32 Index = 0; Index < FMath::Min(CandidatesA.Num(), CandidatesB.Num()); ++Index)
    {
        TestTrue(*FString::Printf(TEXT("candidate %d matches"), Index),
            CandidatesA[Index].Equals(CandidatesB[Index], ESearchCase::CaseSensitive));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_PipelineFailureSurface,
    "SilentDepth.TechTree.Pipeline.FailureSurface",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_PipelineFailureSurface::RunTest(const FString& Parameters)
{
    FPipelineStack Stack;
    if (!Stack.Build(*this))
    {
        return false;
    }

    // A node that lands in two different exclusion groups is a data defect.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SchemaVersion;
        FSDTechNode A;
        A.Id = TEXT("A");
        A.Tier = ESDTechTier::T1;
        A.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("B"));
        FSDTechNode B;
        B.Id = TEXT("B");
        B.Tier = ESDTechTier::T1;
        B.Unlock.MutuallyExclusiveNodeIds.Add(TEXT("C"));
        FSDTechNode C;
        C.Id = TEXT("C");
        C.Tier = ESDTechTier::T1;
        Tree.Nodes.Add(A);
        Tree.Nodes.Add(B);
        Tree.Nodes.Add(C);
        Tree.SortDeterministically();

        FSDNodeRegistry Registry;
        FSDTechTreeLoadReport Report;
        FSDResearchCostRule Rule;
        Rule.PointsPerTier = 100;
        Rule.FirstClearBonus = 50;
        Rule.ScoreDivisor = 10;
        Rule.MinimumScoreForReward = 400;
        TestFalse(TEXT("overlapping exclusion groups rejected"), Registry.Initialize(Tree, Rule, Report));
        TestTrue(TEXT("conflict reported"), HasErrorCode(Report, TEXT("CONFLICTING_EXCLUSION")));
    }

    // The equipment service validates the schema version it is given.
    {
        FSDTechTree WrongVersion = Stack.Tree;
        WrongVersion.SchemaVersion = SchemaVersion + 1;
        FSDEquipmentService Equipment;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("wrong schema rejected"), Equipment.Initialize(WrongVersion, Report));
        TestTrue(TEXT("schema reported"), HasErrorCode(Report, TEXT("SCHEMA_VERSION")));
    }

    // Save validation refuses to run without an equipment service.
    {
        FSDTechTreeSaveData Data;
        FSDEquipmentService Cold;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("cold equipment service rejected"),
            ValidateSaveCompatibility(Data, Cold, ESDEquipPolicy::Strict, Report));
        TestTrue(TEXT("not-initialised reported"), HasErrorCode(Report, TEXT("NOT_INITIALIZED")));
    }

    // A save whose unlocked list holds a number instead of a string.
    {
        const TSharedRef<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetNumberField(TEXT("version"), SaveSchemaVersion);
        Json->SetNumberField(TEXT("researchPoints"), 0);
        TArray<TSharedPtr<FJsonValue>> BadIds;
        BadIds.Add(MakeShared<FJsonValueNumber>(7));
        Json->SetArrayField(TEXT("unlockedNodeIds"), BadIds);
        Json->SetArrayField(TEXT("firstClearMissionIds"), TArray<TSharedPtr<FJsonValue>>());
        Json->SetArrayField(TEXT("loadouts"), TArray<TSharedPtr<FJsonValue>>());
        Json->SetStringField(TEXT("signature"), TEXT("0"));

        FSDTechTreeSaveData Data;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("typed field rejected"), ReadSaveFromJson(Json, Stack.Accounts, Data, Report));
        TestTrue(TEXT("field type reported"), HasErrorCode(Report, TEXT("INVALID_FIELD_TYPE")));
    }

    // Writing where the filesystem cannot go reports rather than throws.
    {
        const FString Blocker = MakePipelineSavePath(TEXT("blocker.txt"));
        FFileHelper::SaveStringToFile(TEXT("blocker"), *Blocker);
        const FString Impossible = Blocker / TEXT("child.json");

        FSDTechTreeSaveData Data;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unwritable path rejected"),
            SaveTechTreeToFile(Impossible, Data, Stack.Accounts, Report));
        TestTrue(TEXT("write failure reported"), HasErrorCode(Report, TEXT("SAVE_WRITE_FAILED")));
        IFileManager::Get().Delete(*Blocker);
    }

    // A compatibility row for a platform that is not in the tree is recorded as
    // a notice, and the affected query finds nothing.
    {
        FSDTechTree Tree;
        FSDTechTreeLoadReport Report;
        const FString Catalogue = TEXT(R"JSON(
        { "weapons": [ { "weapon_id": "W1", "tier": 1, "asset_status": "COMPLETE" } ] }
        )JSON");
        TestTrue(TEXT("small catalogue loads"),
            ParseCategoryDocuments(ESDTechCategory::Weapon, TEXT("weapon"), Catalogue, FString(), Tree, Report));

        const FString Matrix = TEXT(R"JSON(
        { "submarines": [ { "submarine": "NO_SUCH_PLATFORM",
            "compatible_weapons": [ { "weapon_id": "W1", "slot": "TORPEDO", "compatibility": "CONFIRMED" } ] } ] }
        )JSON");
        FSDTechTreeLoadReport MatrixReport;
        TestTrue(TEXT("matrix with an unknown platform still loads"),
            LoadCategoryCompatibility(ESDTechCategory::Weapon, TEXT("weapon"), Matrix, FString(), Tree, MatrixReport));
        TestTrue(TEXT("unknown platform noticed"),
            HasNoticeCode(MatrixReport, TEXT("MISSING_COMPATIBILITY_PLATFORM")));
        TestEqual(TEXT("no record was created for it"), Tree.Compatibility.Num(), 0);
    }

    // UNKNOWN_CATEGORY is unreachable on purpose: the enum only has the five
    // category values, so no data can select the default branch.
    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
