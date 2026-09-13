#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeEquipmentService.h"
#include "Core/TechTree/TechTreeLoader.h"
#include "Core/TechTree/TechTreeResearchAccount.h"
#include "Core/TechTree/TechTreeSave.h"
#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeUnlockService.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

namespace EquipmentServiceTests
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

int32 CountNotices(const FSDTechTreeLoadReport& Report, const TCHAR* Code)
{
    int32 Count = 0;
    for (const FSDDataNotice& Notice : Report.Notices)
    {
        if (Notice.Code.Equals(Code, ESearchCase::CaseSensitive))
        {
            ++Count;
        }
    }
    return Count;
}

/** Loads the full dataset and builds the equipment index over it. */
bool BuildEquipment(
    FAutomationTestBase& Test,
    FSDTechTree& OutTree,
    FSDEquipmentService& OutEquipment,
    FSDTechTreeLoadReport& OutLoadReport)
{
    if (!LoadTechTree(FSDTechTreePaths::ProjectDefault(), OutTree, OutLoadReport))
    {
        for (const FSDDataError& Error : OutLoadReport.Errors)
        {
            Test.AddError(FString::Printf(TEXT("[%s] %s :: %s"), *Error.Code, *Error.Subject, *Error.Detail));
        }
        return false;
    }
    FSDTechTreeLoadReport EquipmentReport;
    return OutEquipment.Initialize(OutTree, EquipmentReport);
}
}
using namespace EquipmentServiceTests;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentLoadsRealMatrices,
    "SilentDepth.TechTree.Equipment.LoadsRealMatrices",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentLoadsRealMatrices::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;
    FSDTechTreeLoadReport LoadReport;
    if (!BuildEquipment(*this, Tree, Equipment, LoadReport))
    {
        return false;
    }

    // weapon 250 + sensor 702 + defensive 2160 + propulsion 65
    TestEqual(TEXT("compatibility records"), Equipment.NumRecords(), 3177);
    // weapon 118 + defensive 486
    TestEqual(TEXT("slot definitions"), Equipment.NumSlots(), 604);

    // The propulsion matrix references a propulsor that was never produced and
    // says so itself. The claim is kept and marked as pending, so the UI can
    // show it while fitting fails closed.
    TestEqual(TEXT("one pending-asset notice"),
        CountNotices(LoadReport, TEXT("PENDING_COMPATIBILITY_ASSET")), 1);
    TestEqual(TEXT("no dangling platform notice"),
        CountNotices(LoadReport, TEXT("MISSING_COMPATIBILITY_PLATFORM")), 0);
    // DEC-009: rows whose family has no produced asset are capability data, so
    // they are recorded instead of being reported as a data defect.
    TestEqual(TEXT("family-only rows are no longer a data notice"),
        CountNotices(LoadReport, TEXT("FAMILY_ONLY_COMPATIBILITY_ROWS")), 0);
    TestEqual(TEXT("defensive capability rows"), Equipment.NumFamilyCapabilities(), 270);
    for (const FSDDataNotice& Notice : LoadReport.Notices)
    {
        if (Notice.Code.Equals(TEXT("PENDING_COMPATIBILITY_ASSET"), ESearchCase::CaseSensitive))
        {
            TestTrue(TEXT("the pending reference is the known Type 093B propulsor"),
                Notice.Subject.Contains(TEXT("CN_PJ_Type093B")));
        }
    }
    TestEqual(TEXT("the claim survives as a reported relation"),
        static_cast<int32>(Equipment.GetCompatibility(TEXT("CN_SSN_Type093B"), TEXT("CN_PJ_Type093B"))),
        static_cast<int32>(ESDCompatibility::Probable));
    TestTrue(TEXT("the relation is flagged as pending"),
        Equipment.IsAssetPending(TEXT("CN_SSN_Type093B"), TEXT("CN_PJ_Type093B")));
    TestFalse(TEXT("a pending relation cannot be fitted"),
        Equipment.IsEquippable(TEXT("CN_SSN_Type093B"), TEXT("CN_PJ_Type093B"), ESDEquipPolicy::AllowGameplay));
    TArray<FString> PendingPlatformCandidates;
    Equipment.CollectCandidates(
        TEXT("CN_SSN_Type093B"), TEXT(""), ESDEquipPolicy::AllowGameplay, PendingPlatformCandidates);
    TestFalse(TEXT("a pending candidate is never offered"),
        PendingPlatformCandidates.Contains(FString(TEXT("CN_PJ_Type093B"))));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentPolicyRules,
    "SilentDepth.TechTree.Equipment.PolicyRules",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentPolicyRules::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;
    FSDTechTreeLoadReport LoadReport;
    if (!BuildEquipment(*this, Tree, Equipment, LoadReport))
    {
        return false;
    }

    // Confirmed and Probable pass the strict policy.
    TestEqual(TEXT("Skipjack Mk14 is confirmed"),
        static_cast<int32>(Equipment.GetCompatibilityInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), TEXT("US_TORP_Mk14"))),
        static_cast<int32>(ESDCompatibility::Confirmed));
    TestTrue(TEXT("confirmed is equippable"),
        Equipment.IsEquippableInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), TEXT("US_TORP_Mk14"), ESDEquipPolicy::Strict));
    TestTrue(TEXT("probable is equippable under strict"),
        Equipment.IsEquippableInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), TEXT("US_TORP_Mk16"), ESDEquipPolicy::Strict));

    // A pair with no row is Unknown, and Unknown is never compatible.
    TestEqual(TEXT("pair without a row is unknown"),
        static_cast<int32>(Equipment.GetCompatibility(TEXT("US_SSN_Skipjack"), TEXT("RU_TORP_UGST"))),
        static_cast<int32>(ESDCompatibility::Unknown));
    TestFalse(TEXT("unknown is not equippable under strict"),
        Equipment.IsEquippable(TEXT("US_SSN_Skipjack"), TEXT("RU_TORP_UGST"), ESDEquipPolicy::Strict));
    TestFalse(TEXT("unknown is not equippable under the gameplay policy either"),
        Equipment.IsEquippable(TEXT("US_SSN_Skipjack"), TEXT("RU_TORP_UGST"), ESDEquipPolicy::AllowGameplay));

    // An explicit INCOMPATIBLE row blocks the pair under every policy.
    TestEqual(TEXT("defensive row is incompatible"),
        static_cast<int32>(Equipment.GetCompatibilityInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("SOCKET_EW_MAST"), TEXT("US_EW_ESM_GENERIC"))),
        static_cast<int32>(ESDCompatibility::Incompatible));
    TestFalse(TEXT("incompatible is never equippable"),
        Equipment.IsEquippableInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("SOCKET_EW_MAST"), TEXT("US_EW_ESM_GENERIC"),
            ESDEquipPolicy::AllowGameplay));

    // Gameplay assignments need an explicit opt-in and are labelled.
    TestEqual(TEXT("Virginia MOSS is a gameplay assignment"),
        static_cast<int32>(Equipment.GetCompatibilityInSlot(
            TEXT("US_SSN_Virginia"), TEXT("TORPEDO"), TEXT("US_DECOY_Mk70_MOSS"))),
        static_cast<int32>(ESDCompatibility::Gameplay));
    TestFalse(TEXT("gameplay is refused by the strict policy"),
        Equipment.IsEquippableInSlot(
            TEXT("US_SSN_Virginia"), TEXT("TORPEDO"), TEXT("US_DECOY_Mk70_MOSS"), ESDEquipPolicy::Strict));
    TestTrue(TEXT("gameplay is allowed when explicitly requested"),
        Equipment.IsEquippableInSlot(
            TEXT("US_SSN_Virginia"), TEXT("TORPEDO"), TEXT("US_DECOY_Mk70_MOSS"),
            ESDEquipPolicy::AllowGameplay));
    TestTrue(TEXT("gameplay assignment is flagged for the UI"),
        Equipment.IsGameplayAssignment(TEXT("US_SSN_Virginia"), TEXT("US_DECOY_Mk70_MOSS")));
    TestFalse(TEXT("confirmed assignment is not flagged as gameplay"),
        Equipment.IsGameplayAssignment(TEXT("US_SSN_Skipjack"), TEXT("US_TORP_Mk14")));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentSlotQueries,
    "SilentDepth.TechTree.Equipment.SlotQueries",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentSlotQueries::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;
    FSDTechTreeLoadReport LoadReport;
    if (!BuildEquipment(*this, Tree, Equipment, LoadReport))
    {
        return false;
    }

    // The same candidate in the wrong slot has no row and is refused.
    TestEqual(TEXT("Mk14 is confirmed in TORPEDO"),
        static_cast<int32>(Equipment.GetCompatibilityInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), TEXT("US_TORP_Mk14"))),
        static_cast<int32>(ESDCompatibility::Confirmed));
    TestEqual(TEXT("Mk14 is unknown in VLS"),
        static_cast<int32>(Equipment.GetCompatibilityInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("VLS"), TEXT("US_TORP_Mk14"))),
        static_cast<int32>(ESDCompatibility::Unknown));
    TestFalse(TEXT("Mk14 cannot be fitted in VLS"),
        Equipment.IsEquippableInSlot(
            TEXT("US_SSN_Skipjack"), TEXT("VLS"), TEXT("US_TORP_Mk14"), ESDEquipPolicy::Strict));

    // Candidate lists come from the matrix, in id order, policy-filtered.
    TArray<FString> StrictTorpedoes;
    Equipment.CollectCandidates(TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), ESDEquipPolicy::Strict, StrictTorpedoes);
    TestEqual(TEXT("Skipjack carries four strict torpedoes"), StrictTorpedoes.Num(), 4);
    if (StrictTorpedoes.Num() == 4)
    {
        TestEqual(TEXT("first candidate"), StrictTorpedoes[0], FString(TEXT("US_TORP_Mk14")));
        TestEqual(TEXT("last candidate"), StrictTorpedoes[3], FString(TEXT("US_TORP_Mk48")));
    }
    for (const FString& CandidateId : StrictTorpedoes)
    {
        TestTrue(*FString::Printf(TEXT("%s is in the matrix"), *CandidateId),
            Equipment.IsEquippableInSlot(
                TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), CandidateId, ESDEquipPolicy::Strict));
    }

    TArray<FString> VlsCandidates;
    Equipment.CollectCandidates(TEXT("US_SSN_Skipjack"), TEXT("VLS"), ESDEquipPolicy::Strict, VlsCandidates);
    TestEqual(TEXT("Skipjack has no VLS torpedoes"), VlsCandidates.Num(), 0);

    // Slot definitions are indexed per platform.
    TArray<const FSDEquipmentSlot*> Slots;
    Equipment.CollectSlots(TEXT("US_SSN_Skipjack"), Slots);
    TestTrue(TEXT("Skipjack has slot definitions"), Slots.Num() > 0);
    TArray<const FSDEquipmentSlot*> AkulaSlots;
    Equipment.CollectSlots(TEXT("RU_SSN_Akula"), AkulaSlots);
    TestTrue(TEXT("Akula has defensive slots with sockets"), AkulaSlots.Num() > 0);
    bool bSawSocket = false;
    for (const FSDEquipmentSlot* Slot : AkulaSlots)
    {
        if (!Slot->SocketName.IsEmpty())
        {
            bSawSocket = true;
            break;
        }
    }
    TestTrue(TEXT("defensive slots carry socket names"), bSawSocket);

    // DEC-008: only SOCKET_COUNTERMEASURE_02 is shared, so DECOY and
    // NOISE_MAKER are alternatives while the other slots stand alone.
    TestEqual(TEXT("the countermeasure socket fits one slot"),
        Equipment.GetSlotSocketCapacity(TEXT("RU_SSN_Akula"), TEXT("DECOY")), 1);
    TArray<FString> DecoyPeers;
    Equipment.CollectSocketPeers(TEXT("RU_SSN_Akula"), TEXT("DECOY"), DecoyPeers);
    TestEqual(TEXT("one slot competes with the decoy"), DecoyPeers.Num(), 1);
    if (DecoyPeers.Num() == 1)
    {
        TestEqual(TEXT("the competitor is the noise maker"), DecoyPeers[0],
            FString(TEXT("NOISE_MAKER")));
    }
    TestFalse(TEXT("decoy and noise maker cannot both be fitted"),
        Equipment.CanMountTogether(TEXT("RU_SSN_Akula"), TEXT("DECOY"), TEXT("NOISE_MAKER")));
    TestTrue(TEXT("decoy and torpedo defence do not compete"),
        Equipment.CanMountTogether(TEXT("RU_SSN_Akula"), TEXT("DECOY"), TEXT("TORPEDO_DEFENSE")));
    TestEqual(TEXT("internal equipment has no socket capacity"),
        Equipment.GetSlotSocketCapacity(TEXT("RU_SSN_Akula"), TEXT("DEFENSIVE_CONTROL")), 0);
    TestFalse(TEXT("an unknown slot fails closed"),
        Equipment.CanMountTogether(TEXT("RU_SSN_Akula"), TEXT("DECOY"), TEXT("NO_SUCH_SLOT")));
    TestNull(TEXT("an unknown slot has no definition"),
        Equipment.FindSlot(TEXT("RU_SSN_Akula"), TEXT("NO_SUCH_SLOT")));

    // An unknown platform has nothing, rather than everything.
    TArray<FString> NoCandidates;
    Equipment.CollectCandidates(TEXT("NO_SUCH_PLATFORM"), TEXT("TORPEDO"), ESDEquipPolicy::AllowGameplay, NoCandidates);
    TestEqual(TEXT("unknown platform has no candidates"), NoCandidates.Num(), 0);
    TArray<const FSDEquipmentSlot*> NoSlots;
    Equipment.CollectSlots(TEXT("NO_SUCH_PLATFORM"), NoSlots);
    TestEqual(TEXT("unknown platform has no slots"), NoSlots.Num(), 0);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentGuardsAndSaveIntegration,
    "SilentDepth.TechTree.Equipment.GuardsAndSaveIntegration",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentGuardsAndSaveIntegration::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;
    FSDTechTreeLoadReport LoadReport;
    if (!BuildEquipment(*this, Tree, Equipment, LoadReport))
    {
        return false;
    }

    // Uninitialised service fails closed.
    {
        FSDEquipmentService Cold;
        TestFalse(TEXT("not initialised"), Cold.IsInitialized());
        TestEqual(TEXT("records are zero"), Cold.NumRecords(), 0);
        TestEqual(TEXT("unknown relation"),
            static_cast<int32>(Cold.GetCompatibility(TEXT("US_SSN_Skipjack"), TEXT("US_TORP_Mk14"))),
            static_cast<int32>(ESDCompatibility::Unknown));
        TestFalse(TEXT("nothing is equippable"),
            Cold.IsEquippable(TEXT("US_SSN_Skipjack"), TEXT("US_TORP_Mk14"), ESDEquipPolicy::AllowGameplay));
        TArray<FString> Candidates;
        Cold.CollectCandidates(TEXT("US_SSN_Skipjack"), TEXT("TORPEDO"), ESDEquipPolicy::Strict, Candidates);
        TestEqual(TEXT("no candidates"), Candidates.Num(), 0);
    }

    // A save whose loadout the matrix allows passes.
    {
        FSDTechTreeSaveData Data;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("RU_SSN_Akula");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("RU_TORP_UGST");
        Data.Loadouts.Add(Assignment);

        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("probable loadout accepted"),
            ValidateSaveCompatibility(Data, Equipment, ESDEquipPolicy::Strict, Report));
    }

    // A candidate with no row for that platform is refused.
    {
        FSDTechTreeSaveData Data;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("RU_SSN_Akula");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("US_TORP_Mk14");
        Data.Loadouts.Add(Assignment);

        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("unlisted loadout refused"),
            ValidateSaveCompatibility(Data, Equipment, ESDEquipPolicy::Strict, Report));
        TestTrue(TEXT("incompatible loadout reported"), HasErrorCode(Report, TEXT("INCOMPATIBLE_LOADOUT")));
    }

    // A gameplay assignment passes only when the policy allows it.
    {
        FSDTechTreeSaveData Data;
        FSDLoadoutAssignment Assignment;
        Assignment.PlatformId = TEXT("US_SSN_Virginia");
        Assignment.SlotName = TEXT("TORPEDO");
        Assignment.CandidateId = TEXT("US_DECOY_Mk70_MOSS");
        Data.Loadouts.Add(Assignment);

        FSDTechTreeLoadReport StrictReport;
        TestFalse(TEXT("gameplay loadout refused by strict policy"),
            ValidateSaveCompatibility(Data, Equipment, ESDEquipPolicy::Strict, StrictReport));
        FSDTechTreeLoadReport GameplayReport;
        TestTrue(TEXT("gameplay loadout accepted when explicitly allowed"),
            ValidateSaveCompatibility(Data, Equipment, ESDEquipPolicy::AllowGameplay, GameplayReport));
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_EquipmentCapabilitiesAndOccupancy,
    "SilentDepth.TechTree.Equipment.CapabilitiesAndOccupancy",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_EquipmentCapabilitiesAndOccupancy::RunTest(const FString& Parameters)
{
    FSDTechTree Tree;
    FSDEquipmentService Equipment;
    FSDTechTreeLoadReport LoadReport;
    if (!BuildEquipment(*this, Tree, Equipment, LoadReport))
    {
        return false;
    }

    // DEC-009: the five families without a produced asset are recorded per
    // platform as capabilities, and they are never equipment candidates.
    TArray<const FSDFamilyCapability*> AkulaCapabilities;
    Equipment.CollectFamilyCapabilities(TEXT("RU_SSN_Akula"), AkulaCapabilities);
    TestEqual(TEXT("Akula has five capability rows"), AkulaCapabilities.Num(), 5);
    for (const FSDFamilyCapability* Capability : AkulaCapabilities)
    {
        TestTrue(TEXT("a capability names a family"), !Capability->FamilyId.IsEmpty());
        TestTrue(TEXT("a capability names a branch"), !Capability->Branch.IsEmpty());
        // The family id is not a candidate id, so nothing can be fitted from it.
        TestFalse(*FString::Printf(TEXT("%s is not fittable"), *Capability->FamilyId),
            Equipment.IsEquippable(TEXT("RU_SSN_Akula"), Capability->FamilyId, ESDEquipPolicy::AllowGameplay));
    }
    TArray<FString> AkulaCandidates;
    Equipment.CollectCandidates(
        TEXT("RU_SSN_Akula"), TEXT(""), ESDEquipPolicy::AllowGameplay, AkulaCandidates);
    for (const FSDFamilyCapability* Capability : AkulaCapabilities)
    {
        TestFalse(*FString::Printf(TEXT("%s is not offered as a candidate"), *Capability->FamilyId),
            AkulaCandidates.Contains(Capability->FamilyId));
    }

    // The capability index is empty for a platform that has none, and the
    // service fails closed before initialisation.
    TArray<const FSDFamilyCapability*> UnknownCapabilities;
    Equipment.CollectFamilyCapabilities(TEXT("NO_SUCH_PLATFORM"), UnknownCapabilities);
    TestEqual(TEXT("an unknown platform has no capabilities"), UnknownCapabilities.Num(), 0);
    {
        FSDEquipmentService Cold;
        TestEqual(TEXT("a cold service reports no capabilities"), Cold.NumFamilyCapabilities(), 0);
        TestEqual(TEXT("a cold service reports no socket capacity"),
            Cold.GetSlotSocketCapacity(TEXT("RU_SSN_Akula"), TEXT("DECOY")), 0);
        TestNull(TEXT("a cold service has no slots"),
            Cold.FindSlot(TEXT("RU_SSN_Akula"), TEXT("DECOY")));
    }

    // DEC-008 at loadout level: each alternative is legal alone, both together
    // are not, and the failure names the socket.
    TArray<FString> DecoyCandidates;
    Equipment.CollectCandidates(
        TEXT("RU_SSN_Akula"), TEXT("DECOY"), ESDEquipPolicy::AllowGameplay, DecoyCandidates);
    TArray<FString> NoiseMakerCandidates;
    Equipment.CollectCandidates(
        TEXT("RU_SSN_Akula"), TEXT("NOISE_MAKER"), ESDEquipPolicy::AllowGameplay, NoiseMakerCandidates);
    TestTrue(TEXT("the decoy slot has candidates"), DecoyCandidates.Num() > 0);
    TestTrue(TEXT("the noise maker slot has candidates"), NoiseMakerCandidates.Num() > 0);

    if (DecoyCandidates.Num() > 0 && NoiseMakerCandidates.Num() > 0)
    {
        FSDTechTreeSaveData DecoyOnly;
        FSDLoadoutAssignment Decoy;
        Decoy.PlatformId = TEXT("RU_SSN_Akula");
        Decoy.SlotName = TEXT("DECOY");
        Decoy.CandidateId = DecoyCandidates[0];
        DecoyOnly.Loadouts.Add(Decoy);
        FSDTechTreeLoadReport DecoyReport;
        TestTrue(TEXT("the decoy alone is accepted"),
            ValidateSaveCompatibility(DecoyOnly, Equipment, ESDEquipPolicy::AllowGameplay, DecoyReport));

        FSDTechTreeSaveData Both;
        FSDLoadoutAssignment NoiseMaker;
        NoiseMaker.PlatformId = TEXT("RU_SSN_Akula");
        NoiseMaker.SlotName = TEXT("NOISE_MAKER");
        NoiseMaker.CandidateId = NoiseMakerCandidates[0];
        Both.Loadouts.Add(Decoy);
        Both.Loadouts.Add(NoiseMaker);
        FSDTechTreeLoadReport BothReport;
        TestFalse(TEXT("both alternatives are refused"),
            ValidateSaveCompatibility(Both, Equipment, ESDEquipPolicy::AllowGameplay, BothReport));
        TestTrue(TEXT("the refusal is a socket capacity error"),
            HasErrorCode(BothReport, TEXT("SOCKET_CAPACITY_EXCEEDED")));
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
