#pragma once

#include "CoreMinimal.h"

/**
 * Unified runtime schema for the five SILENT DEPTH technology trees (DATA-001).
 *
 * The source data lives in SilentDepth_Assets/ and is written by several
 * independent generators. They disagree on both names and encodings:
 *
 *  - Tier is spelled "T3" in the sensor tree, 3 in the propulsion tree, and
 *    "tier_index": 3 next to "tier": "T3" in the same sensor record.
 *  - The single field name `status` carries three unrelated meanings:
 *    the asset pipeline stage (COMPLETE / VALIDATING / DATABASE_ONLY), the
 *    real-world service state (ACTIVE / HISTORICAL / RETIRED), and the
 *    platform-to-candidate relation (CONFIRMED / PROBABLE / INCOMPATIBLE).
 *  - `asset_priority` in weapon_manifest.json takes HIGH/MEDIUM/LOW *and*
 *    DATABASE_ONLY, mixing an ordering axis with a coverage axis.
 *
 * This header names those axes apart so the loader (TECH-001) can reject
 * anything that does not fit instead of guessing. See
 * docs/UE4_TECH_TREE_SCHEMA.md for the source-field to typed-axis mapping.
 *
 * Rules that the rest of the tech-tree code depends on:
 *
 *  - Every field has a declared type. There is no generic attribute bag and no
 *    untyped JSON passthrough; an unrecognised token is a load error.
 *  - Identifier lists are sorted by ordinal comparison (SDLexLess) before use.
 *    Rule evaluation must never depend on TMap/TSet iteration order or on FName
 *    index order, both of which vary between runs.
 *  - Simulation attributes (mass, blade count, detection ranges) are
 *    deliberately absent. They belong to SUB-002 / WPN-001 / SNS-001 /
 *    PROP-001 and must arrive as their own typed structures.
 */

namespace SDTechTree
{
    /** Bump when a struct layout or an enum meaning changes incompatibly. */
    constexpr int32 SchemaVersion = 3;

    constexpr int32 CategoryCount = 5;
    constexpr int32 MinTier = 1;
    constexpr int32 MaxTier = 10;
    constexpr int32 TierCount = MaxTier - MinTier + 1;
}

/** The five trees. The order is the display order used by the tech-tree UI. */
enum class ESDTechCategory : uint8
{
    Submarine = 0,
    Weapon = 1,
    Sensor = 2,
    Defensive = 3,
    Propulsion = 4
};

/** Research tier. Only T1..T10 are representable; 0 or 11 cannot be stored. */
enum class ESDTechTier : uint8
{
    T1 = 1,
    T2 = 2,
    T3 = 3,
    T4 = 4,
    T5 = 5,
    T6 = 6,
    T7 = 7,
    T8 = 8,
    T9 = 9,
    T10 = 10
};

/**
 * Asset pipeline stage. Source field: `status` in the production-oriented
 * manifests, `asset_status` in the catalogue manifests, `status_by_weapon`
 * in weapon_production_queue.json, and `status` in propulsor_specs.json.
 */
enum class ESDProductionStatus : uint8
{
    Unknown,
    Planned,
    Research,
    Reference,
    Blockout,
    Modeling,
    Detailing,
    Texturing,
    Lod,
    Collision,
    Export,
    Implementing,
    Validating,
    Complete,
    Failed,
    Blocked,
    /** No engineering model is planned; see DEC-001. */
    DatabaseOnly,
    /** weapon_manifest.json only. DATA-003 must remove or redefine it. */
    Partial
};

/**
 * Real-world service state of the described hardware. Source field: `status`
 * in weapon_manifest.json and sensor_manifest.json entries.
 */
enum class ESDServiceStatus : uint8
{
    Unknown,
    Planned,
    /** Tech-tree concept with no real-world counterpart. */
    Gameplay,
    InService,
    Active,
    Historical,
    Retired
};

/** Platform-to-candidate relation. Source field: `compatibility`. */
enum class ESDCompatibility : uint8
{
    Unknown,
    Incompatible,
    Gameplay,
    Probable,
    Confirmed
};

/** Evidence quality behind a record. Source field: `confidence`. */
enum class ESDEvidenceLevel : uint8
{
    Unknown,
    Gameplay,
    Estimated,
    Reported,
    Public,
    Probable,
    Confirmed
};

/**
 * Upper bound of the evidence check for a record. Source field: `verification`
 * in sensor_manifest.json. Lower-case and hyphenated in the source data.
 */
enum class ESDVerificationLevel : uint8
{
    Unknown,
    Unverified,
    GameplayOnly,
    ResearchReviewed,
    ResearchVerified
};

/** Ordering axis. Source field: `asset_priority` / `priority`. */
enum class ESDPriority : uint8
{
    Unknown,
    Low,
    Medium,
    High
};

/**
 * Whether the asset library promises geometry for an entry.
 * Source field: `coverage` in propulsion_manifest.json.
 */
enum class ESDAssetCoverage : uint8
{
    Unknown,
    DatabaseOnly,
    ThreeDAsset
};

/**
 * Whether a tier rung is backed by the public task specification or invented
 * for the game. Source field: `source` in the sensor tree.
 */
enum class ESDSourceKind : uint8
{
    Unknown,
    Spec,
    Gameplay
};

/**
 * How much compatibility evidence an equipment query accepts.
 * DEC-005 is still open, so the policy is an explicit parameter and never a
 * silent default: `UNKNOWN` is never treated as compatible.
 */
enum class ESDEquipPolicy : uint8
{
    /** Only Confirmed and Probable count as equippable. */
    Strict,
    /** Additionally accepts Gameplay-tagged assignments. */
    AllowGameplay
};

/** A vector in engine space: +X east, +Y north, +Z up, metres. */
struct FSDVec3
{
    double X = 0.0;
    double Y = 0.0;
    double Z = 0.0;
};

/**
 * Where an asset's source and imported files live. Paths are repo-relative
 * for the SilentDepth_Assets/* entries and /Game/... for the imported ones.
 * Empty means "not applicable or not produced"; it is never a wildcard.
 */
struct FSDTechAssetRef
{
    /** Repo-relative folder the produced files live in, when the source has one. */
    FString AssetDir;
    FString MasterPath;
    FString Lod0;
    FString Lod1;
    FString Lod2;
    FString Lod3;
    FString CollisionPath;
    FString SpecPath;
    FString PreviewDir;
    FString IconPath;
    /** UE package path after import; empty until the asset really is imported. */
    FString UnrealMeshPath;
    /** Number of LOD levels the source produced. 0 when there is no geometry. */
    int32 LodCount = 0;
    int32 TrianglesLod0 = 0;

    bool HasAnySourcePath() const
    {
        return !MasterPath.IsEmpty() || !Lod0.IsEmpty() || !CollisionPath.IsEmpty();
    }
};

/**
 * Unlock rules. PrerequisiteNodeIds is the authoritative edge list; the two
 * note fields carry generator prose for the UI and must never be parsed into
 * rules. An empty PrerequisiteNodeIds means "root of its branch".
 */
struct FSDUnlockRequirement
{
    TArray<FString> PrerequisiteNodeIds;
    TArray<FString> MutuallyExclusiveNodeIds;
    FString PreviousNodeId;
    FString PlatformRequirementNote;
    FString GameTierRequirementNote;
    ESDTechTier RequiredTier = ESDTechTier::T1;
};

/** Submarine-only fields. HullType is "SSN" or "SSBN". */
struct FSDSubmarineDetail
{
    FString ClassName;
    FString HullType;
    FString ProjectCode;
    FString VariantOfId;
};

/** Weapon-only fields. */
struct FSDWeaponDetail
{
    FString WeaponCategory;
    FString SlotKind;
    TArray<FString> LaunchMethods;
    FString VariantOfId;
};

/** Sensor-only fields. Acoustic processing nodes have no physical mount. */
struct FSDSensorDetail
{
    FString BranchId;
    FString SubCategory;
    FString MountType;
    bool bHasPhysicalMount = false;
    ESDVerificationLevel Verification = ESDVerificationLevel::Unknown;
    ESDSourceKind Source = ESDSourceKind::Unknown;
};

/** Defensive-system-only fields. The tree indexes nodes by a tier range. */
struct FSDDefensiveDetail
{
    TArray<FString> BranchIds;
    TArray<FString> AnchoredCountries;
    ESDTechTier TierMin = ESDTechTier::T1;
    ESDTechTier TierMax = ESDTechTier::T1;
    /**
     * Prerequisite families from the defensive tree. These live in the family
     * id space, not the asset id space, so they are kept separate from
     * FSDUnlockRequirement::PrerequisiteNodeIds and never resolved as nodes.
     */
    TArray<FString> PrerequisiteFamilyIds;
};

/** Propulsion-only fields. */
struct FSDPropulsionDetail
{
    FString BranchId;
    FString Kind;
    FString TechnologyRoute;
    ESDAssetCoverage Coverage = ESDAssetCoverage::Unknown;
};

/**
 * Category-specific payloads, tagged by `Category`. Only the branch matching
 * the tag is meaningful; the loader leaves the others at their defaults.
 */
struct FSDTechNodeDetail
{
    ESDTechCategory Category = ESDTechCategory::Submarine;
    FSDSubmarineDetail Submarine;
    FSDWeaponDetail Weapon;
    FSDSensorDetail Sensor;
    FSDDefensiveDetail Defensive;
    FSDPropulsionDetail Propulsion;
};

/** One researchable node in any of the five trees. */
struct FSDTechNode
{
    FString Id;
    ESDTechCategory Category = ESDTechCategory::Submarine;
    ESDTechTier Tier = ESDTechTier::T1;
    FString DisplayName;
    FString DisplayNameZh;
    FString ShortName;
    FString Country;
    FString Era;
    FString FamilyId;
    FString RoleText;

    ESDProductionStatus Production = ESDProductionStatus::Unknown;
    ESDServiceStatus Service = ESDServiceStatus::Unknown;
    ESDEvidenceLevel Evidence = ESDEvidenceLevel::Unknown;
    ESDPriority Priority = ESDPriority::Unknown;

    /** True when DEC-001 applies: data only, no engineering model. */
    bool bDatabaseOnly = false;

    FSDUnlockRequirement Unlock;
    FSDTechAssetRef Asset;
    FSDTechNodeDetail Detail;

    /** Registry socket names this node can mount to; sorted. */
    TArray<FString> SocketNames;
    /** Free-form generator tags, sorted. Never used for rule decisions. */
    TArray<FString> Tags;
};

/**
 * One row of a platform-to-candidate compatibility matrix. SlotName is the
 * logical slot ("TORPEDO", "VLS", "SOCKET_SONAR_BOW"); it may be empty for
 * nodes with no physical installation, such as acoustic processing.
 */
struct FSDCompatibilityRecord
{
    FString PlatformId;
    FString CandidateId;
    FString FamilyId;
    FString SlotName;
    FString SlotKind;
    ESDCompatibility Compatibility = ESDCompatibility::Unknown;
    ESDEvidenceLevel Evidence = ESDEvidenceLevel::Unknown;
    FString ReasonText;
    /**
     * The claim is recorded but the candidate asset has not been produced yet.
     * The row still describes a real relation (so the UI can show "the boat
     * verifiably uses a pump-jet; the model is a known gap"), but nothing can be
     * fitted: there is no asset to fit.
     */
    bool bAssetPending = false;
};

/**
 * A platform's relation to a defensive family that has no produced asset
 * variant (DEC-009). The relation is real data - the platform may have the
 * capability - but there is no candidate to fit, so these entries form a
 * capability layer: the UI can show "this capability has no equipment", and
 * fitting stays closed because no candidate id is involved.
 */
struct FSDFamilyCapability
{
    FString PlatformId;
    FString Branch;
    FString FamilyId;
    FString FamilyLabel;
    FString SystemName;
    FString SocketName;
    ESDTechTier TierMin = ESDTechTier::T1;
    ESDCompatibility Compatibility = ESDCompatibility::Unknown;
};

/**
 * A mount point on a platform. Which candidates fit is derived from the
 * compatibility matrix and is never duplicated here; how many slots sharing a
 * socket may be filled at once is SocketCapacity (DEC-008).
 */
struct FSDEquipmentSlot
{
    FString PlatformId;
    FString SlotName;
    FString SocketName;
    FString SlotKind;
    ESDTechTier TierMin = ESDTechTier::T1;
    ESDTechTier TierMax = ESDTechTier::T1;
    bool bRequired = false;
    /**
     * How many of the slots bound to SocketName may be filled at once (DEC-008).
     * 1 means the slots sharing that socket are alternatives; 0 means the slot
     * has no external socket (internal equipment) and never competes.
     */
    int32 SocketCapacity = 0;
};

/**
 * How many weapons a platform can carry, and where (SUB-002 / WPN-001).
 *
 * The numbers come from the weapon loadout manifest's launch interface, which
 * is public-source data; a field the manifest leaves unknown stays 0 and is
 * never filled in with a plausible-looking value. Zero therefore means "not
 * declared", and the capacity rules treat it as "no limit stated" rather than
 * "cannot carry anything".
 */
struct FSDLaunchInterface
{
    FString PlatformId;
    int32 TorpedoTubes = 0;
    double TorpedoTubeDiameterMm = 0.0;
    int32 MissileTubes = 0;
    int32 VlsCells = 0;
    int32 SlbmTubes = 0;
    /** Payload modules (dry deck shelter class), as listed by the manifest. */
    int32 PayloadModules = 0;
    /** Documented weapon mount points, in manifest order. */
    TArray<FString> WeaponSocketNames;
    /** Socket kinds parallel to WeaponSocketNames (TORPEDO_TUBE / VLS / ...). */
    TArray<FString> WeaponSocketKinds;

    /** Sockets of one kind, e.g. how many VLS cells are really mounted. */
    int32 CountSocketsOfKind(const FString& Kind) const
    {
        int32 Count = 0;
        for (const FString& SocketKind : WeaponSocketKinds)
        {
            Count += SocketKind.Equals(Kind, ESearchCase::CaseSensitive) ? 1 : 0;
        }
        return Count;
    }
};

/**
 * A logical mount point exported from a Blender master. The three identifier
 * layers are kept separate on purpose; see DEC-002.
 */
struct FSDSocketBinding
{
    FString PlatformId;
    /** Cross-hull stable id, e.g. "torpedo_tube_01_muzzle". */
    FString LogicalId;
    /** Blender anchor, e.g. "SOCKET_SUB_RU_AKULA_TORPEDO_TUBE_01_MUZZLE". */
    FString BlenderAnchor;
    /** Registry category, e.g. "SOCKET_SONAR_BOW". */
    FString RegistryCategory;
    FString Purpose;
    FSDVec3 TranslationM;
    FSDVec3 RotationDeg;
    /** True when +X is the documented launch/mount direction. */
    bool bHasDirection = false;
    /** Set only after an editor check; never inferred from the presence of data. */
    bool bEditorVerified = false;
};

/**
 * One tier rung of one tree. Every category publishes its own T1..T10 ladder:
 * "T8" means "modern advanced weapon" in the weapon tree and "modern pump-jet"
 * in the propulsion tree, so the tier meaning travels with the category.
 */
struct FSDTierDefinition
{
    ESDTechCategory Category = ESDTechCategory::Submarine;
    ESDTechTier Tier = ESDTechTier::T1;
    FString LabelEn;
    FString LabelZh;
    FString Description;
};

/** Structured load failure. Never a silent default. */
struct FSDDataError
{
    FString Code;
    FString Subject;
    FString Detail;
};

/**
 * A data defect that must be visible without making the whole dataset
 * unusable: for example a compatibility row that points at an asset which was
 * never produced. Notices are counted, asserted and reported, and the affected
 * query fails closed (it finds no record), but they do not fail the load.
 */
struct FSDDataNotice
{
    FString Code;
    FString Subject;
    FString Detail;
};

/** Result of a load attempt: either a complete tree or the reasons it failed. */
struct FSDTechTreeLoadReport
{
    bool bSuccess = false;
    TArray<FSDDataError> Errors;
    TArray<FSDDataNotice> Notices;

    void AddError(const FString& Code, const FString& Subject, const FString& Detail)
    {
        bSuccess = false;
        FSDDataError& Error = Errors.AddDefaulted_GetRef();
        Error.Code = Code;
        Error.Subject = Subject;
        Error.Detail = Detail;
    }

    /** Records a non-fatal data defect. Does not change bSuccess. */
    void AddNotice(const FString& Code, const FString& Subject, const FString& Detail)
    {
        FSDDataNotice& Notice = Notices.AddDefaulted_GetRef();
        Notice.Code = Code;
        Notice.Subject = Subject;
        Notice.Detail = Detail;
    }
};

/**
 * The whole tech-tree dataset. Arrays are sorted by their identifier key
 * before the tree is used, which makes every lookup below a binary search and
 * every rule evaluation independent of container iteration order.
 */
struct FSDTechTree
{
    int32 SchemaVersion = 0;
    FString GeneratedAt;
    TArray<FSDTechNode> Nodes;
    TArray<FSDCompatibilityRecord> Compatibility;
    TArray<FSDFamilyCapability> FamilyCapabilities;
    TArray<FSDLaunchInterface> LaunchInterfaces;
    TArray<FSDEquipmentSlot> Slots;
    TArray<FSDSocketBinding> Sockets;
    TArray<FSDTierDefinition> Tiers;

    /**
     * Sorts every array into its canonical order. Call once after loading and
     * after any insertion. Duplicate keys are a load error (see DATA-001
     * invariants), so each comparator is a total order over distinct keys.
     */
    void SortDeterministically()
    {
        Nodes.Sort([](const FSDTechNode& A, const FSDTechNode& B)
        {
            return A.Id.Compare(B.Id, ESearchCase::CaseSensitive) < 0;
        });
        Compatibility.Sort([](const FSDCompatibilityRecord& A, const FSDCompatibilityRecord& B)
        {
            const int32 ByPlatform = A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive);
            if (ByPlatform != 0) { return ByPlatform < 0; }
            const int32 ByCandidate = A.CandidateId.Compare(B.CandidateId, ESearchCase::CaseSensitive);
            if (ByCandidate != 0) { return ByCandidate < 0; }
            return A.SlotName.Compare(B.SlotName, ESearchCase::CaseSensitive) < 0;
        });
        FamilyCapabilities.Sort([](const FSDFamilyCapability& A, const FSDFamilyCapability& B)
        {
            const int32 ByPlatform = A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive);
            if (ByPlatform != 0) { return ByPlatform < 0; }
            const int32 ByFamily = A.FamilyId.Compare(B.FamilyId, ESearchCase::CaseSensitive);
            if (ByFamily != 0) { return ByFamily < 0; }
            return A.Branch.Compare(B.Branch, ESearchCase::CaseSensitive) < 0;
        });
        Slots.Sort([](const FSDEquipmentSlot& A, const FSDEquipmentSlot& B)
        {
            const int32 ByPlatform = A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive);
            if (ByPlatform != 0) { return ByPlatform < 0; }
            return A.SlotName.Compare(B.SlotName, ESearchCase::CaseSensitive) < 0;
        });
        LaunchInterfaces.Sort([](const FSDLaunchInterface& A, const FSDLaunchInterface& B)
        {
            return A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive) < 0;
        });
        Sockets.Sort([](const FSDSocketBinding& A, const FSDSocketBinding& B)
        {
            const int32 ByPlatform = A.PlatformId.Compare(B.PlatformId, ESearchCase::CaseSensitive);
            if (ByPlatform != 0) { return ByPlatform < 0; }
            return A.LogicalId.Compare(B.LogicalId, ESearchCase::CaseSensitive) < 0;
        });
        Tiers.Sort([](const FSDTierDefinition& A, const FSDTierDefinition& B)
        {
            const uint8 ByCategory = static_cast<uint8>(A.Category);
            const uint8 OtherCategory = static_cast<uint8>(B.Category);
            if (ByCategory != OtherCategory) { return ByCategory < OtherCategory; }
            return static_cast<uint8>(A.Tier) < static_cast<uint8>(B.Tier);
        });
    }
};

/** Binary search over the sorted Nodes array. */
inline const FSDTechNode* SDFindNode(const FSDTechTree& Tree, const FString& Id)
{
    int32 Lo = 0;
    int32 Hi = Tree.Nodes.Num() - 1;
    while (Lo <= Hi)
    {
        const int32 Mid = Lo + (Hi - Lo) / 2;
        const int32 C = Tree.Nodes[Mid].Id.Compare(Id, ESearchCase::CaseSensitive);
        if (C == 0) { return &Tree.Nodes[Mid]; }
        if (C < 0) { Lo = Mid + 1; } else { Hi = Mid - 1; }
    }
    return nullptr;
}
