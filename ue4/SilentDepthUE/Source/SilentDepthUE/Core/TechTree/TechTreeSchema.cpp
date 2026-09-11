#include "Core/TechTree/TechTreeSchema.h"

#include "Misc/Char.h"

namespace SDTechTree
{
namespace
{
    template <typename TEnum>
    struct TTokenRow
    {
        TEnum Value;
        const TCHAR* Token;
    };

    template <typename TEnum, int32 TCount>
    bool ParseFromTable(
        const FString& Token,
        const TTokenRow<TEnum> (&Table)[TCount],
        TEnum& Out)
    {
        const FString Trimmed = Token.TrimStartAndEnd();
        if (Trimmed.IsEmpty())
        {
            return false;
        }
        for (const TTokenRow<TEnum>& Row : Table)
        {
            if (Trimmed.Equals(Row.Token, ESearchCase::IgnoreCase))
            {
                Out = Row.Value;
                return true;
            }
        }
        return false;
    }

    const TTokenRow<ESDTechCategory> CategoryTokens[] = {
        { ESDTechCategory::Submarine,  TEXT("SUBMARINE")  },
        { ESDTechCategory::Weapon,     TEXT("WEAPON")     },
        { ESDTechCategory::Sensor,     TEXT("SENSOR")     },
        { ESDTechCategory::Defensive,  TEXT("DEFENSIVE")  },
        { ESDTechCategory::Propulsion, TEXT("PROPULSION") },
    };

    const TTokenRow<ESDProductionStatus> ProductionTokens[] = {
        { ESDProductionStatus::Unknown,      TEXT("UNKNOWN")      },
        { ESDProductionStatus::Planned,      TEXT("PLANNED")      },
        { ESDProductionStatus::Research,     TEXT("RESEARCH")     },
        { ESDProductionStatus::Reference,    TEXT("REFERENCE")    },
        { ESDProductionStatus::Blockout,     TEXT("BLOCKOUT")     },
        { ESDProductionStatus::Modeling,     TEXT("MODELING")     },
        { ESDProductionStatus::Detailing,    TEXT("DETAILING")    },
        { ESDProductionStatus::Texturing,    TEXT("TEXTURING")    },
        { ESDProductionStatus::Lod,          TEXT("LOD")          },
        { ESDProductionStatus::Collision,    TEXT("COLLISION")    },
        { ESDProductionStatus::Export,       TEXT("EXPORT")       },
        { ESDProductionStatus::Implementing, TEXT("IMPLEMENTING") },
        { ESDProductionStatus::Validating,   TEXT("VALIDATING")   },
        { ESDProductionStatus::Complete,     TEXT("COMPLETE")     },
        { ESDProductionStatus::Failed,       TEXT("FAILED")       },
        { ESDProductionStatus::Blocked,      TEXT("BLOCKED")      },
        { ESDProductionStatus::DatabaseOnly, TEXT("DATABASE_ONLY") },
        { ESDProductionStatus::Partial,      TEXT("PARTIAL")      },
    };

    const TTokenRow<ESDServiceStatus> ServiceTokens[] = {
        { ESDServiceStatus::Unknown,    TEXT("UNKNOWN")    },
        { ESDServiceStatus::Planned,    TEXT("PLANNED")    },
        { ESDServiceStatus::Gameplay,   TEXT("GAMEPLAY")   },
        { ESDServiceStatus::InService,  TEXT("IN_SERVICE") },
        { ESDServiceStatus::Active,     TEXT("ACTIVE")     },
        { ESDServiceStatus::Historical, TEXT("HISTORICAL") },
        { ESDServiceStatus::Retired,    TEXT("RETIRED")    },
    };

    const TTokenRow<ESDCompatibility> CompatibilityTokens[] = {
        { ESDCompatibility::Unknown,      TEXT("UNKNOWN")      },
        { ESDCompatibility::Incompatible, TEXT("INCOMPATIBLE") },
        { ESDCompatibility::Gameplay,     TEXT("GAMEPLAY")     },
        { ESDCompatibility::Probable,     TEXT("PROBABLE")     },
        { ESDCompatibility::Confirmed,    TEXT("CONFIRMED")    },
    };

    const TTokenRow<ESDEvidenceLevel> EvidenceTokens[] = {
        { ESDEvidenceLevel::Unknown,   TEXT("UNKNOWN")   },
        { ESDEvidenceLevel::Gameplay,  TEXT("GAMEPLAY")  },
        { ESDEvidenceLevel::Estimated, TEXT("ESTIMATED") },
        { ESDEvidenceLevel::Reported,  TEXT("REPORTED")  },
        { ESDEvidenceLevel::Public,    TEXT("PUBLIC")    },
        { ESDEvidenceLevel::Probable,  TEXT("PROBABLE")  },
        { ESDEvidenceLevel::Confirmed, TEXT("CONFIRMED") },
    };

    // The sensor catalogue writes these lower-case and hyphenated.
    const TTokenRow<ESDVerificationLevel> VerificationTokens[] = {
        { ESDVerificationLevel::Unknown,          TEXT("unknown")           },
        { ESDVerificationLevel::Unverified,       TEXT("unverified")        },
        { ESDVerificationLevel::GameplayOnly,     TEXT("gameplay-only")     },
        { ESDVerificationLevel::ResearchReviewed, TEXT("research-reviewed") },
        { ESDVerificationLevel::ResearchVerified, TEXT("research-verified") },
    };

    const TTokenRow<ESDPriority> PriorityTokens[] = {
        { ESDPriority::Unknown, TEXT("UNKNOWN") },
        { ESDPriority::Low,     TEXT("LOW")     },
        { ESDPriority::Medium,  TEXT("MEDIUM")  },
        { ESDPriority::High,    TEXT("HIGH")    },
    };

    const TTokenRow<ESDAssetCoverage> CoverageTokens[] = {
        { ESDAssetCoverage::Unknown,      TEXT("UNKNOWN")      },
        { ESDAssetCoverage::DatabaseOnly, TEXT("DATABASE_ONLY") },
        { ESDAssetCoverage::ThreeDAsset,  TEXT("3D_ASSET")     },
    };

    const TTokenRow<ESDSourceKind> SourceKindTokens[] = {
        { ESDSourceKind::Unknown,  TEXT("UNKNOWN")  },
        { ESDSourceKind::Spec,     TEXT("spec")     },
        { ESDSourceKind::Gameplay, TEXT("gameplay") },
    };
}

const TCHAR* ToString(ESDTechCategory Value)
{
    switch (Value)
    {
    case ESDTechCategory::Submarine:  return TEXT("SUBMARINE");
    case ESDTechCategory::Weapon:     return TEXT("WEAPON");
    case ESDTechCategory::Sensor:     return TEXT("SENSOR");
    case ESDTechCategory::Defensive:  return TEXT("DEFENSIVE");
    case ESDTechCategory::Propulsion: return TEXT("PROPULSION");
    default:                          return TEXT("UNKNOWN");
    }
}

const TCHAR* ToString(ESDTechTier Value)
{
    switch (Value)
    {
    case ESDTechTier::T1:  return TEXT("T1");
    case ESDTechTier::T2:  return TEXT("T2");
    case ESDTechTier::T3:  return TEXT("T3");
    case ESDTechTier::T4:  return TEXT("T4");
    case ESDTechTier::T5:  return TEXT("T5");
    case ESDTechTier::T6:  return TEXT("T6");
    case ESDTechTier::T7:  return TEXT("T7");
    case ESDTechTier::T8:  return TEXT("T8");
    case ESDTechTier::T9:  return TEXT("T9");
    case ESDTechTier::T10: return TEXT("T10");
    default:               return TEXT("UNKNOWN");
    }
}

const TCHAR* ToString(ESDProductionStatus Value)
{
    for (const TTokenRow<ESDProductionStatus>& Row : ProductionTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("UNKNOWN");
}

const TCHAR* ToString(ESDServiceStatus Value)
{
    for (const TTokenRow<ESDServiceStatus>& Row : ServiceTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("UNKNOWN");
}

const TCHAR* ToString(ESDCompatibility Value)
{
    for (const TTokenRow<ESDCompatibility>& Row : CompatibilityTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("UNKNOWN");
}

const TCHAR* ToString(ESDEvidenceLevel Value)
{
    for (const TTokenRow<ESDEvidenceLevel>& Row : EvidenceTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("UNKNOWN");
}

const TCHAR* ToString(ESDVerificationLevel Value)
{
    for (const TTokenRow<ESDVerificationLevel>& Row : VerificationTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("unknown");
}

const TCHAR* ToString(ESDPriority Value)
{
    for (const TTokenRow<ESDPriority>& Row : PriorityTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("UNKNOWN");
}

const TCHAR* ToString(ESDAssetCoverage Value)
{
    for (const TTokenRow<ESDAssetCoverage>& Row : CoverageTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("UNKNOWN");
}

const TCHAR* ToString(ESDSourceKind Value)
{
    for (const TTokenRow<ESDSourceKind>& Row : SourceKindTokens)
    {
        if (Row.Value == Value) { return Row.Token; }
    }
    return TEXT("unknown");
}

bool ParseCategory(const FString& Token, ESDTechCategory& Out)
{
    return ParseFromTable(Token, CategoryTokens, Out);
}

bool ParseProductionStatus(const FString& Token, ESDProductionStatus& Out)
{
    return ParseFromTable(Token, ProductionTokens, Out);
}

bool ParseServiceStatus(const FString& Token, ESDServiceStatus& Out)
{
    return ParseFromTable(Token, ServiceTokens, Out);
}

bool ParseCompatibility(const FString& Token, ESDCompatibility& Out)
{
    return ParseFromTable(Token, CompatibilityTokens, Out);
}

bool ParseEvidenceLevel(const FString& Token, ESDEvidenceLevel& Out)
{
    return ParseFromTable(Token, EvidenceTokens, Out);
}

bool ParseVerificationLevel(const FString& Token, ESDVerificationLevel& Out)
{
    return ParseFromTable(Token, VerificationTokens, Out);
}

bool ParsePriority(const FString& Token, ESDPriority& Out)
{
    return ParseFromTable(Token, PriorityTokens, Out);
}

bool ParseAssetCoverage(const FString& Token, ESDAssetCoverage& Out)
{
    return ParseFromTable(Token, CoverageTokens, Out);
}

bool ParseSourceKind(const FString& Token, ESDSourceKind& Out)
{
    return ParseFromTable(Token, SourceKindTokens, Out);
}

bool TierFromOneBasedInt(int32 OneBasedTier, ESDTechTier& Out)
{
    if (OneBasedTier < MinTier || OneBasedTier > MaxTier)
    {
        return false;
    }
    Out = static_cast<ESDTechTier>(OneBasedTier);
    return true;
}

bool ParseTier(const FString& Token, ESDTechTier& Out)
{
    FString Digits = Token.TrimStartAndEnd();
    if (Digits.Len() > 1 && (Digits[0] == TEXT('T') || Digits[0] == TEXT('t')))
    {
        Digits = Digits.Mid(1);
    }
    if (Digits.IsEmpty())
    {
        return false;
    }
    for (int32 Index = 0; Index < Digits.Len(); ++Index)
    {
        if (!FChar::IsDigit(Digits[Index]))
        {
            return false;
        }
    }
    return TierFromOneBasedInt(FCString::Atoi(*Digits), Out);
}

int32 TierToIndex(ESDTechTier Tier)
{
    return static_cast<int32>(Tier) - MinTier;
}

bool IsEquippable(ESDCompatibility Relation, ESDEquipPolicy Policy)
{
    switch (Relation)
    {
    case ESDCompatibility::Confirmed:
    case ESDCompatibility::Probable:
        return true;
    case ESDCompatibility::Gameplay:
        return Policy == ESDEquipPolicy::AllowGameplay;
    case ESDCompatibility::Unknown:
    case ESDCompatibility::Incompatible:
    default:
        return false;
    }
}

bool IsEvidenceAllowedFor(ESDTechCategory Category, ESDEvidenceLevel Value)
{
    if (Value == ESDEvidenceLevel::Unknown)
    {
        return true;
    }
    switch (Category)
    {
    case ESDTechCategory::Weapon:
        return Value == ESDEvidenceLevel::Estimated || Value == ESDEvidenceLevel::Public;
    case ESDTechCategory::Sensor:
        return Value == ESDEvidenceLevel::Gameplay
            || Value == ESDEvidenceLevel::Probable
            || Value == ESDEvidenceLevel::Confirmed;
    case ESDTechCategory::Propulsion:
        return Value == ESDEvidenceLevel::Reported || Value == ESDEvidenceLevel::Confirmed;
    case ESDTechCategory::Submarine:
    case ESDTechCategory::Defensive:
    default:
        return false;
    }
}

bool IsProductionStatusAllowedFor(ESDTechCategory Category, ESDProductionStatus Value)
{
    switch (Value)
    {
    case ESDProductionStatus::Unknown:
    case ESDProductionStatus::Failed:
    case ESDProductionStatus::Blocked:
    case ESDProductionStatus::Validating:
    case ESDProductionStatus::Complete:
        return true;
    default:
        break;
    }

    switch (Category)
    {
    case ESDTechCategory::Submarine:
        return Value == ESDProductionStatus::Planned || Value == ESDProductionStatus::Research;
    case ESDTechCategory::Weapon:
        // The weapon factory keeps the full pipeline vocabulary, plus the two
        // drift values that DATA-003 must resolve.
        return Value == ESDProductionStatus::Planned
            || Value == ESDProductionStatus::Research
            || Value == ESDProductionStatus::Reference
            || Value == ESDProductionStatus::Blockout
            || Value == ESDProductionStatus::Modeling
            || Value == ESDProductionStatus::Detailing
            || Value == ESDProductionStatus::Texturing
            || Value == ESDProductionStatus::Lod
            || Value == ESDProductionStatus::Collision
            || Value == ESDProductionStatus::Export
            || Value == ESDProductionStatus::Implementing
            || Value == ESDProductionStatus::DatabaseOnly
            || Value == ESDProductionStatus::Partial;
    case ESDTechCategory::Sensor:
    case ESDTechCategory::Defensive:
    case ESDTechCategory::Propulsion:
        return Value == ESDProductionStatus::Planned
            || Value == ESDProductionStatus::Implementing
            || Value == ESDProductionStatus::DatabaseOnly;
    default:
        return false;
    }
}

bool IsAssetBacked(ESDProductionStatus Value)
{
    return Value != ESDProductionStatus::Unknown
        && Value != ESDProductionStatus::DatabaseOnly;
}

bool IsDatabaseOnlyStatus(ESDProductionStatus Value)
{
    return Value == ESDProductionStatus::DatabaseOnly;
}

uint64 HashToken(uint64 Seed, const FString& Token)
{
    constexpr uint64 Prime = 1099511628211ull;
    uint64 Value = Seed;
    for (int32 Index = 0; Index < Token.Len(); ++Index)
    {
        Value ^= static_cast<uint64>(static_cast<uint16>(Token[Index]));
        Value *= Prime;
    }
    return Value;
}

bool IsTierGateBlocking(
    const FSDTierGateRule& Rule,
    int32 UnlockedInLowerTier,
    int32 NodesInLowerTier,
    bool bHasLowerTier)
{
    if (!Rule.IsEnabled() || !bHasLowerTier || NodesInLowerTier <= 0)
    {
        return false;
    }
    const int32 Required = FMath::Min(Rule.RequiredUnlockedInPreviousTier, NodesInLowerTier);
    return UnlockedInLowerTier < Required;
}

int32 CostForTier(const FSDResearchCostRule& Rule, ESDTechTier Tier)
{
    if (!Rule.IsValid())
    {
        return 0;
    }
    return Rule.PointsPerTier * static_cast<int32>(Tier);
}

int32 PointsForMissionResult(const FSDResearchCostRule& Rule, int32 Score, bool bFirstClear)
{
    if (!Rule.IsValid() || Score < Rule.MinimumScoreForReward)
    {
        return 0;
    }
    int32 Points = Score / Rule.ScoreDivisor;
    if (bFirstClear)
    {
        Points += Rule.FirstClearBonus;
    }
    return Points;
}

bool ValidateTreeInvariants(const FSDTechTree& Tree, FSDTechTreeLoadReport& Report)
{
    // The report may already carry loader errors; add to it rather than
    // clearing it, and report only whether this call found anything new.
    const int32 ErrorsAtEntry = Report.Errors.Num();

    if (Tree.SchemaVersion != SchemaVersion)
    {
        Report.AddError(
            TEXT("SCHEMA_VERSION"),
            FString::FromInt(Tree.SchemaVersion),
            FString::Printf(TEXT("expected schema version %d"), SchemaVersion));
    }

    // Lookup only: the set never drives iteration order or rule evaluation.
    TSet<FString> KnownIds;
    KnownIds.Reserve(Tree.Nodes.Num());
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        if (Node.Id.IsEmpty())
        {
            Report.AddError(TEXT("EMPTY_ID"), FString(), TEXT("node has an empty id"));
            continue;
        }
        bool bAlreadyPresent = false;
        KnownIds.Add(Node.Id, &bAlreadyPresent);
        if (bAlreadyPresent)
        {
            Report.AddError(TEXT("DUPLICATE_ID"), Node.Id, TEXT("node id appears more than once"));
        }
    }

    for (const FSDTechNode& Node : Tree.Nodes)
    {
        for (const FString& Prerequisite : Node.Unlock.PrerequisiteNodeIds)
        {
            if (!KnownIds.Contains(Prerequisite))
            {
                Report.AddError(
                    TEXT("MISSING_PREREQUISITE"),
                    Node.Id,
                    FString::Printf(TEXT("prerequisite '%s' does not exist"), *Prerequisite));
            }
        }
        if (!Node.Unlock.PreviousNodeId.IsEmpty() && !KnownIds.Contains(Node.Unlock.PreviousNodeId))
        {
            Report.AddError(
                TEXT("MISSING_PREVIOUS_NODE"),
                Node.Id,
                FString::Printf(TEXT("previous node '%s' does not exist"), *Node.Unlock.PreviousNodeId));
        }
    }

    Report.bSuccess = Report.Errors.Num() == 0;
    return Report.Errors.Num() == ErrorsAtEntry;
}
}
