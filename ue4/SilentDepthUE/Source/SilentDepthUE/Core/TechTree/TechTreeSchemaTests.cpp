#if WITH_DEV_AUTOMATION_TESTS

#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

#include "Misc/AutomationTest.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSchemaRoundTrip,
    "SilentDepth.TechTree.Schema.EnumRoundTrip",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSchemaRoundTrip::RunTest(const FString& Parameters)
{
    const ESDTechCategory Categories[] = {
        ESDTechCategory::Submarine, ESDTechCategory::Weapon, ESDTechCategory::Sensor,
        ESDTechCategory::Defensive, ESDTechCategory::Propulsion
    };
    for (const ESDTechCategory Value : Categories)
    {
        ESDTechCategory Parsed = ESDTechCategory::Submarine;
        TestTrue(TEXT("category round trip"),
            SDTechTree::ParseCategory(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDTechTier Tiers[] = {
        ESDTechTier::T1, ESDTechTier::T2, ESDTechTier::T3, ESDTechTier::T4, ESDTechTier::T5,
        ESDTechTier::T6, ESDTechTier::T7, ESDTechTier::T8, ESDTechTier::T9, ESDTechTier::T10
    };
    for (const ESDTechTier Value : Tiers)
    {
        ESDTechTier Parsed = ESDTechTier::T1;
        TestTrue(*FString::Printf(TEXT("tier round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseTier(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDProductionStatus Production[] = {
        ESDProductionStatus::Unknown, ESDProductionStatus::Planned, ESDProductionStatus::Research,
        ESDProductionStatus::Reference, ESDProductionStatus::Blockout, ESDProductionStatus::Modeling,
        ESDProductionStatus::Detailing, ESDProductionStatus::Texturing, ESDProductionStatus::Lod,
        ESDProductionStatus::Collision, ESDProductionStatus::Export, ESDProductionStatus::Implementing,
        ESDProductionStatus::Validating, ESDProductionStatus::Complete, ESDProductionStatus::Failed,
        ESDProductionStatus::Blocked, ESDProductionStatus::DatabaseOnly, ESDProductionStatus::Partial
    };
    for (const ESDProductionStatus Value : Production)
    {
        ESDProductionStatus Parsed = ESDProductionStatus::Unknown;
        TestTrue(*FString::Printf(TEXT("production round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseProductionStatus(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDServiceStatus Service[] = {
        ESDServiceStatus::Unknown, ESDServiceStatus::Planned, ESDServiceStatus::Gameplay,
        ESDServiceStatus::InService, ESDServiceStatus::Active, ESDServiceStatus::Historical,
        ESDServiceStatus::Retired
    };
    for (const ESDServiceStatus Value : Service)
    {
        ESDServiceStatus Parsed = ESDServiceStatus::Unknown;
        TestTrue(*FString::Printf(TEXT("service round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseServiceStatus(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDCompatibility Relations[] = {
        ESDCompatibility::Unknown, ESDCompatibility::Incompatible, ESDCompatibility::Gameplay,
        ESDCompatibility::Probable, ESDCompatibility::Confirmed
    };
    for (const ESDCompatibility Value : Relations)
    {
        ESDCompatibility Parsed = ESDCompatibility::Unknown;
        TestTrue(*FString::Printf(TEXT("compatibility round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseCompatibility(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDEvidenceLevel Evidence[] = {
        ESDEvidenceLevel::Unknown, ESDEvidenceLevel::Gameplay, ESDEvidenceLevel::Estimated,
        ESDEvidenceLevel::Reported, ESDEvidenceLevel::Public, ESDEvidenceLevel::Probable,
        ESDEvidenceLevel::Confirmed
    };
    for (const ESDEvidenceLevel Value : Evidence)
    {
        ESDEvidenceLevel Parsed = ESDEvidenceLevel::Unknown;
        TestTrue(*FString::Printf(TEXT("evidence round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseEvidenceLevel(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDVerificationLevel Verification[] = {
        ESDVerificationLevel::Unknown, ESDVerificationLevel::Unverified,
        ESDVerificationLevel::GameplayOnly, ESDVerificationLevel::ResearchReviewed,
        ESDVerificationLevel::ResearchVerified
    };
    for (const ESDVerificationLevel Value : Verification)
    {
        ESDVerificationLevel Parsed = ESDVerificationLevel::Unknown;
        TestTrue(*FString::Printf(TEXT("verification round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseVerificationLevel(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDPriority Priorities[] = {
        ESDPriority::Unknown, ESDPriority::Low, ESDPriority::Medium, ESDPriority::High
    };
    for (const ESDPriority Value : Priorities)
    {
        ESDPriority Parsed = ESDPriority::Unknown;
        TestTrue(*FString::Printf(TEXT("priority round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParsePriority(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDAssetCoverage Coverages[] = {
        ESDAssetCoverage::Unknown, ESDAssetCoverage::DatabaseOnly, ESDAssetCoverage::ThreeDAsset
    };
    for (const ESDAssetCoverage Value : Coverages)
    {
        ESDAssetCoverage Parsed = ESDAssetCoverage::Unknown;
        TestTrue(*FString::Printf(TEXT("coverage round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseAssetCoverage(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    const ESDSourceKind Sources[] = {
        ESDSourceKind::Unknown, ESDSourceKind::Spec, ESDSourceKind::Gameplay
    };
    for (const ESDSourceKind Value : Sources)
    {
        ESDSourceKind Parsed = ESDSourceKind::Unknown;
        TestTrue(*FString::Printf(TEXT("source kind round trip %s"), SDTechTree::ToString(Value)),
            SDTechTree::ParseSourceKind(SDTechTree::ToString(Value), Parsed) && Parsed == Value);
    }

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSchemaTokens,
    "SilentDepth.TechTree.Schema.TokenParsing",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSchemaTokens::RunTest(const FString& Parameters)
{
    // The two tier encodings the source data actually uses.
    ESDTechTier Tier = ESDTechTier::T1;
    TestTrue(TEXT("T3 parses"), SDTechTree::ParseTier(TEXT("T3"), Tier) && Tier == ESDTechTier::T3);
    TestTrue(TEXT("t10 parses"), SDTechTree::ParseTier(TEXT("t10"), Tier) && Tier == ESDTechTier::T10);
    TestTrue(TEXT("bare 3 parses"), SDTechTree::ParseTier(TEXT("3"), Tier) && Tier == ESDTechTier::T3);
    TestTrue(TEXT("padded parses"), SDTechTree::ParseTier(TEXT("  T4 "), Tier) && Tier == ESDTechTier::T4);
    TestFalse(TEXT("T0 rejected"), SDTechTree::ParseTier(TEXT("T0"), Tier));
    TestFalse(TEXT("T11 rejected"), SDTechTree::ParseTier(TEXT("T11"), Tier));
    TestFalse(TEXT("empty rejected"), SDTechTree::ParseTier(TEXT(""), Tier));
    TestFalse(TEXT("T1x rejected"), SDTechTree::ParseTier(TEXT("T1x"), Tier));
    TestFalse(TEXT("negative rejected"), SDTechTree::ParseTier(TEXT("-1"), Tier));
    TestFalse(TEXT("signed rejected"), SDTechTree::ParseTier(TEXT("+3"), Tier));
    TestFalse(TEXT("fraction rejected"), SDTechTree::ParseTier(TEXT("3.5"), Tier));
    TestTrue(TEXT("leading zero maps to T3"),
        SDTechTree::ParseTier(TEXT("03"), Tier) && Tier == ESDTechTier::T3);

    // Case-insensitive membership, but only for declared tokens.
    ESDCompatibility Relation = ESDCompatibility::Unknown;
    TestTrue(TEXT("confirmed parses"), SDTechTree::ParseCompatibility(TEXT("confirmed"), Relation));
    TestFalse(TEXT("legend string rejected"),
        SDTechTree::ParseCompatibility(TEXT("CONFIRMED / PROBABLE / GAMEPLAY"), Relation));
    TestFalse(TEXT("blank rejected"), SDTechTree::ParseCompatibility(TEXT("   "), Relation));

    // A failed parse must not disturb the caller's output value.
    Relation = ESDCompatibility::Probable;
    TestFalse(TEXT("bogus rejected"), SDTechTree::ParseCompatibility(TEXT("BOGUS"), Relation));
    TestTrue(TEXT("output untouched on failure"), Relation == ESDCompatibility::Probable);

    // UNKNOWN is never equippable, and GAMEPLAY needs the explicit policy.
    TestFalse(TEXT("unknown not equippable"),
        SDTechTree::IsEquippable(ESDCompatibility::Unknown, ESDEquipPolicy::AllowGameplay));
    TestFalse(TEXT("incompatible not equippable"),
        SDTechTree::IsEquippable(ESDCompatibility::Incompatible, ESDEquipPolicy::AllowGameplay));
    TestFalse(TEXT("gameplay blocked under strict"),
        SDTechTree::IsEquippable(ESDCompatibility::Gameplay, ESDEquipPolicy::Strict));
    TestTrue(TEXT("gameplay allowed under allow policy"),
        SDTechTree::IsEquippable(ESDCompatibility::Gameplay, ESDEquipPolicy::AllowGameplay));
    TestTrue(TEXT("probable equippable"),
        SDTechTree::IsEquippable(ESDCompatibility::Probable, ESDEquipPolicy::Strict));

    // Per-category evidence vocabulary.
    TestTrue(TEXT("weapon public evidence"),
        SDTechTree::IsEvidenceAllowedFor(ESDTechCategory::Weapon, ESDEvidenceLevel::Public));
    TestFalse(TEXT("weapon rejects probable evidence"),
        SDTechTree::IsEvidenceAllowedFor(ESDTechCategory::Weapon, ESDEvidenceLevel::Probable));
    TestTrue(TEXT("sensor probable evidence"),
        SDTechTree::IsEvidenceAllowedFor(ESDTechCategory::Sensor, ESDEvidenceLevel::Probable));
    TestTrue(TEXT("propulsion reported evidence"),
        SDTechTree::IsEvidenceAllowedFor(ESDTechCategory::Propulsion, ESDEvidenceLevel::Reported));
    TestFalse(TEXT("propulsion rejects estimated evidence"),
        SDTechTree::IsEvidenceAllowedFor(ESDTechCategory::Propulsion, ESDEvidenceLevel::Estimated));

    // Coverage helper: DATABASE_ONLY is the only out-of-scope production state.
    TestFalse(TEXT("database-only is not asset backed"),
        SDTechTree::IsAssetBacked(ESDProductionStatus::DatabaseOnly));
    TestTrue(TEXT("planned is asset backed"),
        SDTechTree::IsAssetBacked(ESDProductionStatus::Planned));
    TestFalse(TEXT("unknown is not asset backed"),
        SDTechTree::IsAssetBacked(ESDProductionStatus::Unknown));

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSchemaResearchEconomy,
    "SilentDepth.TechTree.Schema.ResearchEconomy",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSchemaResearchEconomy::RunTest(const FString& Parameters)
{
    // DEC-004 initial values: 100 points per tier, 50 for a first clear, and
    // one point per ten score points above the failure cut-off.
    SDTechTree::FSDResearchCostRule Rule;
    TestFalse(TEXT("default rule is invalid"), Rule.IsValid());
    TestEqual(TEXT("invalid rule cannot price a tier"),
        SDTechTree::CostForTier(Rule, ESDTechTier::T7), 0);
    TestEqual(TEXT("invalid rule cannot reward a mission"),
        SDTechTree::PointsForMissionResult(Rule, 1000, true), 0);

    Rule.PointsPerTier = 100;
    Rule.FirstClearBonus = 50;
    Rule.ScoreDivisor = 10;
    Rule.MinimumScoreForReward = 400;
    TestTrue(TEXT("rule valid after loading"), Rule.IsValid());

    TestEqual(TEXT("T1 cost"), SDTechTree::CostForTier(Rule, ESDTechTier::T1), 100);
    TestEqual(TEXT("T10 cost"), SDTechTree::CostForTier(Rule, ESDTechTier::T10), 1000);

    TestEqual(TEXT("failed mission pays nothing"),
        SDTechTree::PointsForMissionResult(Rule, 399, false), 0);
    TestEqual(TEXT("failed mission pays nothing even on first clear"),
        SDTechTree::PointsForMissionResult(Rule, 399, true), 0);
    TestEqual(TEXT("good run"), SDTechTree::PointsForMissionResult(Rule, 700, false), 70);
    TestEqual(TEXT("perfect first clear"), SDTechTree::PointsForMissionResult(Rule, 1000, true), 150);
    TestEqual(TEXT("boundary score"), SDTechTree::PointsForMissionResult(Rule, 400, false), 40);

    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_TechTreeSchemaInvariants,
    "SilentDepth.TechTree.Schema.TreeInvariants",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_TechTreeSchemaInvariants::RunTest(const FString& Parameters)
{
    auto MakeNode = [](const TCHAR* Id) -> FSDTechNode
    {
        FSDTechNode Node;
        Node.Id = Id;
        Node.Category = ESDTechCategory::Weapon;
        return Node;
    };

    // A well-formed tree passes and leaves no errors behind.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        FSDTechNode Child = MakeNode(TEXT("US_TORP_Mk18"));
        Child.Unlock.PrerequisiteNodeIds.Add(TEXT("US_TORP_Mk14"));
        Tree.Nodes.Add(MakeNode(TEXT("US_TORP_Mk14")));
        Tree.Nodes.Add(Child);

        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("valid tree accepted"), SDTechTree::ValidateTreeInvariants(Tree, Report));
        TestEqual(TEXT("no errors on a valid tree"), Report.Errors.Num(), 0);
    }

    // Duplicate ids, empty ids and dangling prerequisites are all reported.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        Tree.Nodes.Add(MakeNode(TEXT("US_TORP_Mk14")));
        Tree.Nodes.Add(MakeNode(TEXT("US_TORP_Mk14")));
        Tree.Nodes.Add(MakeNode(TEXT("")));
        FSDTechNode Orphan = MakeNode(TEXT("US_TORP_Mk37"));
        Orphan.Unlock.PrerequisiteNodeIds.Add(TEXT("NOT_A_NODE"));
        Orphan.Unlock.PreviousNodeId = TEXT("ALSO_NOT_A_NODE");
        Tree.Nodes.Add(Orphan);

        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("broken tree rejected"), SDTechTree::ValidateTreeInvariants(Tree, Report));
        TestEqual(TEXT("four defects reported"), Report.Errors.Num(), 4);
        TestEqual(TEXT("first defect is the duplicate id"),
            Report.Errors[0].Code, FString(TEXT("DUPLICATE_ID")));
        TestEqual(TEXT("second defect is the empty id"),
            Report.Errors[1].Code, FString(TEXT("EMPTY_ID")));
        TestEqual(TEXT("third defect is the dangling prerequisite"),
            Report.Errors[2].Code, FString(TEXT("MISSING_PREREQUISITE")));
        TestEqual(TEXT("fourth defect is the dangling previous node"),
            Report.Errors[3].Code, FString(TEXT("MISSING_PREVIOUS_NODE")));
    }

    // A stale schema version fails closed instead of being migrated silently.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion + 1;
        FSDTechTreeLoadReport Report;
        TestFalse(TEXT("wrong schema version rejected"), SDTechTree::ValidateTreeInvariants(Tree, Report));
        TestEqual(TEXT("version defect reported"),
            Report.Errors[0].Code, FString(TEXT("SCHEMA_VERSION")));
    }

    // Re-running validation must not accumulate stale errors.
    {
        FSDTechTree Tree;
        Tree.SchemaVersion = SDTechTree::SchemaVersion;
        Tree.Nodes.Add(MakeNode(TEXT("A")));
        FSDTechTreeLoadReport Report;
        TestTrue(TEXT("first pass clean"), SDTechTree::ValidateTreeInvariants(Tree, Report));
        TestTrue(TEXT("second pass clean"), SDTechTree::ValidateTreeInvariants(Tree, Report));
        TestEqual(TEXT("no residual errors"), Report.Errors.Num(), 0);
    }

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
