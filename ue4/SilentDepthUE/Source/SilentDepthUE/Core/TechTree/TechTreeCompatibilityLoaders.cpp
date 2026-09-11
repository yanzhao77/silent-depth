#include "Core/TechTree/TechTreeLoaderInternal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Dom/JsonValue.h"

namespace SDTechTree
{
namespace Internal
{
namespace
{
/** Membership test for known node ids; built once per document. */
TSet<FString> CollectKnownIds(const FSDTechTree& Tree)
{
    TSet<FString> Known;
    Known.Reserve(Tree.Nodes.Num());
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        Known.Add(Node.Id);
    }
    return Known;
}

void AddRecord(
    FSDTechTree& Tree,
    const FString& PlatformId,
    const FString& CandidateId,
    const FString& FamilyId,
    const FString& SlotName,
    const FString& SlotKind,
    ESDCompatibility Compatibility,
    const FString& ReasonText)
{
    FSDCompatibilityRecord& Record = Tree.Compatibility.AddDefaulted_GetRef();
    Record.PlatformId = PlatformId;
    Record.CandidateId = CandidateId;
    Record.FamilyId = FamilyId;
    Record.SlotName = SlotName;
    Record.SlotKind = SlotKind;
    Record.Compatibility = Compatibility;
    Record.ReasonText = ReasonText;
}

void AddSlot(
    FSDTechTree& Tree,
    const FString& PlatformId,
    const FString& SlotName,
    const FString& SocketName,
    const FString& SlotKind,
    ESDTechTier TierMin,
    ESDTechTier TierMax,
    bool bRequired)
{
    FSDEquipmentSlot& Slot = Tree.Slots.AddDefaulted_GetRef();
    Slot.PlatformId = PlatformId;
    Slot.SlotName = SlotName;
    Slot.SocketName = SocketName;
    Slot.SlotKind = SlotKind;
    Slot.TierMin = TierMin;
    Slot.TierMax = TierMax;
    Slot.bRequired = bRequired;
}

/**
 * A matrix row whose platform or candidate is not in the catalogue is a data
 * defect, not a load failure: the query simply finds no record and fails
 * closed. It is recorded so DATA-005 can fix it and so the count is asserted.
 */
bool AcceptReference(
    const TSet<FString>& KnownIds,
    const FString& PlatformId,
    const FString& CandidateId,
    const FString& Where,
    FSDTechTreeLoadReport& Report)
{
    bool bAccepted = true;
    if (!KnownIds.Contains(PlatformId))
    {
        Report.AddNotice(
            TEXT("MISSING_COMPATIBILITY_PLATFORM"),
            Where,
            FString::Printf(TEXT("platform '%s' is not in the tree"), *PlatformId));
        bAccepted = false;
    }
    if (!KnownIds.Contains(CandidateId))
    {
        Report.AddNotice(
            TEXT("MISSING_COMPATIBILITY_CANDIDATE"),
            Where,
            FString::Printf(TEXT("candidate '%s' is not in the tree"), *CandidateId));
        bAccepted = false;
    }
    return bAccepted;
}

bool ReadCompatibility(
    const TSharedPtr<FJsonObject>& Object,
    const FString& Where,
    FSDTechTreeLoadReport& Report,
    ESDCompatibility& OutValue)
{
    FString Token;
    if (!Object->TryGetStringField(TEXT("compatibility"), Token) || Token.IsEmpty())
    {
        Report.AddError(TEXT("MISSING_FIELD"), Where, TEXT("compatibility is required"));
        return false;
    }
    if (!ParseCompatibility(Token, OutValue))
    {
        Report.AddError(
            TEXT("UNKNOWN_TOKEN"),
            Where,
            FString::Printf(TEXT("compatibility='%s' is not a declared value"), *Token));
        return false;
    }
    return true;
}

/** A scalar JSON value as a token; arrays and objects yield an empty string. */
FString ValueAsToken(const TSharedPtr<FJsonValue>& Value)
{
    if (!Value.IsValid())
    {
        return FString();
    }
    if (Value->Type == EJson::String)
    {
        return Value->AsString();
    }
    if (Value->Type == EJson::Number)
    {
        return FString::Printf(TEXT("%g"), Value->AsNumber());
    }
    return FString();
}

void ReadTierRange(
    const TSharedPtr<FJsonObject>& Object,
    ESDTechTier& OutMin,
    ESDTechTier& OutMax)
{
    const TArray<TSharedPtr<FJsonValue>>* Range = FindArray(Object, TEXT("tier_range"));
    if (Range == nullptr || Range->Num() != 2)
    {
        return;
    }
    ESDTechTier Min = ESDTechTier::T1;
    ESDTechTier Max = ESDTechTier::T1;
    if (ParseTier(ValueAsToken((*Range)[0]), Min))
    {
        OutMin = Min;
    }
    if (ParseTier(ValueAsToken((*Range)[1]), Max))
    {
        OutMax = Max;
    }
}
}

/**
 * Records a candidate that has no produced asset. The relation is a real data
 * claim (the asset library deliberately keeps the reference and calls it a
 * gap), so it stays in the tree marked as pending: the UI can show the claim,
 * and fitting fails closed because there is nothing to fit.
 */
void AddPendingRecord(
    FSDTechTree& Tree,
    const FString& PlatformId,
    const FString& CandidateId,
    const FString& SlotKind,
    ESDCompatibility Compatibility,
    const FString& ReasonText,
    FSDTechTreeLoadReport& Report)
{
    AddRecord(Tree, PlatformId, CandidateId, FString(), FString(), SlotKind, Compatibility, ReasonText);
    Tree.Compatibility.Last().bAssetPending = true;
    Report.AddNotice(
        TEXT("PENDING_COMPATIBILITY_ASSET"),
        PlatformId + TEXT(" / ") + CandidateId,
        TEXT("the relation is recorded but the candidate asset has not been produced"));
}

bool LoadWeaponCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Submarines = FindArray(Doc, TEXT("submarines"));
    if (Submarines == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("weapon compatibility"), TEXT("submarines[] is required"));
        return false;
    }
    const TSet<FString> KnownIds = CollectKnownIds(Tree);
    for (const TSharedPtr<FJsonValue>& SubmarineValue : *Submarines)
    {
        const TSharedPtr<FJsonObject> Submarine = SubmarineValue->AsObject();
        if (!Submarine.IsValid())
        {
            continue;
        }
        FString PlatformId;
        if (!Submarine->TryGetStringField(TEXT("submarine"), PlatformId))
        {
            continue;
        }
        const TArray<TSharedPtr<FJsonValue>>* Rows = FindArray(Submarine, TEXT("compatible_weapons"));
        if (Rows == nullptr)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& RowValue : *Rows)
        {
            const TSharedPtr<FJsonObject> Row = RowValue->AsObject();
            if (!Row.IsValid())
            {
                continue;
            }
            FString CandidateId;
            FString Family;
            FString Slot;
            FString Category;
            FString Reason;
            if (!Row->TryGetStringField(TEXT("weapon_id"), CandidateId))
            {
                continue;
            }
            Row->TryGetStringField(TEXT("family"), Family);
            Row->TryGetStringField(TEXT("slot"), Slot);
            Row->TryGetStringField(TEXT("category"), Category);
            Row->TryGetStringField(TEXT("reason"), Reason);

            ESDCompatibility Compatibility = ESDCompatibility::Unknown;
            const FString Where = PlatformId + TEXT(" / ") + CandidateId;
            if (!ReadCompatibility(Row, Where, Report, Compatibility))
            {
                continue;
            }
            if (!AcceptReference(KnownIds, PlatformId, CandidateId, Where, Report))
            {
                continue;
            }
            AddRecord(Tree, PlatformId, CandidateId, Family, Slot, Category, Compatibility, Reason);
        }
    }
    return true;
}

bool LoadWeaponSlots(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Submarines = FindArray(Doc, TEXT("submarines"));
    if (Submarines == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("weapon slots"), TEXT("submarines[] is required"));
        return false;
    }
    const TSet<FString> KnownIds = CollectKnownIds(Tree);
    for (const TSharedPtr<FJsonValue>& SubmarineValue : *Submarines)
    {
        const TSharedPtr<FJsonObject> Submarine = SubmarineValue->AsObject();
        if (!Submarine.IsValid())
        {
            continue;
        }
        FString PlatformId;
        if (!Submarine->TryGetStringField(TEXT("submarine"), PlatformId))
        {
            continue;
        }
        const TArray<TSharedPtr<FJsonValue>>* Slots = FindArray(Submarine, TEXT("weapon_slots"));
        if (Slots == nullptr)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& SlotValue : *Slots)
        {
            const TSharedPtr<FJsonObject> Slot = SlotValue->AsObject();
            if (!Slot.IsValid())
            {
                continue;
            }
            FString SlotName;
            if (!Slot->TryGetStringField(TEXT("slot"), SlotName) || SlotName.IsEmpty())
            {
                continue;
            }
            ESDTechTier TierMin = ESDTechTier::T1;
            ESDTechTier TierMax = ESDTechTier::T1;
            ReadTierRange(Slot, TierMin, TierMax);
            AddSlot(Tree, PlatformId, SlotName, FString(),
                TEXT("WEAPON"), TierMin, TierMax, /*bRequired*/ false);
        }
    }
    return true;
}

bool LoadSensorCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Records = FindArray(Doc, TEXT("records"));
    if (Records == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("sensor compatibility"), TEXT("records[] is required"));
        return false;
    }
    const TSet<FString> KnownIds = CollectKnownIds(Tree);
    for (const TSharedPtr<FJsonValue>& RowValue : *Records)
    {
        const TSharedPtr<FJsonObject> Row = RowValue->AsObject();
        if (!Row.IsValid())
        {
            continue;
        }
        FString PlatformId;
        FString CandidateId;
        if (!Row->TryGetStringField(TEXT("submarine_id"), PlatformId)
            || !Row->TryGetStringField(TEXT("sensor_id"), CandidateId))
        {
            continue;
        }
        FString Socket;
        FString Branch;
        Row->TryGetStringField(TEXT("socket"), Socket);
        Row->TryGetStringField(TEXT("branch"), Branch);

        FString Token;
        ESDCompatibility Compatibility = ESDCompatibility::Unknown;
        const FString Where = PlatformId + TEXT(" / ") + CandidateId;
        if (Row->TryGetStringField(TEXT("status"), Token) && !Token.IsEmpty())
        {
            if (!ParseCompatibility(Token, Compatibility))
            {
                Report.AddError(TEXT("UNKNOWN_TOKEN"), Where,
                    FString::Printf(TEXT("status='%s' is not a declared value"), *Token));
                continue;
            }
        }
        if (!AcceptReference(KnownIds, PlatformId, CandidateId, Where, Report))
        {
            continue;
        }
        AddRecord(Tree, PlatformId, CandidateId, FString(), Socket, Branch, Compatibility, FString());
    }
    return true;
}

bool LoadDefensiveCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Entries = FindArray(Doc, TEXT("entries"));
    if (Entries == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("defensive compatibility"), TEXT("entries[] is required"));
        return false;
    }
    const TSet<FString> KnownIds = CollectKnownIds(Tree);
    int32 FamilyOnlyRows = 0;
    for (const TSharedPtr<FJsonValue>& RowValue : *Entries)
    {
        const TSharedPtr<FJsonObject> Row = RowValue->AsObject();
        if (!Row.IsValid())
        {
            continue;
        }
        FString PlatformId;
        FString CandidateId;
        if (!Row->TryGetStringField(TEXT("submarine"), PlatformId) || PlatformId.IsEmpty())
        {
            continue;
        }
        // asset_id is either a string or JSON null, so a failed read means
        // "no concrete asset" rather than a malformed row.
        Row->TryGetStringField(TEXT("asset_id"), CandidateId);
        if (CandidateId.IsEmpty())
        {
            // These rows only name a family; mapping them to a node would be a
            // guess, so they are counted and skipped.
            ++FamilyOnlyRows;
            continue;
        }
        FString Family;
        FString Socket;
        FString Branch;
        FString Reason;
        Row->TryGetStringField(TEXT("family"), Family);
        Row->TryGetStringField(TEXT("socket"), Socket);
        Row->TryGetStringField(TEXT("branch"), Branch);
        Row->TryGetStringField(TEXT("note_zh"), Reason);

        ESDCompatibility Compatibility = ESDCompatibility::Unknown;
        const FString Where = PlatformId + TEXT(" / ") + CandidateId;
        if (!ReadCompatibility(Row, Where, Report, Compatibility))
        {
            continue;
        }
        if (!AcceptReference(KnownIds, PlatformId, CandidateId, Where, Report))
        {
            continue;
        }
        AddRecord(Tree, PlatformId, CandidateId, Family, Socket, Branch, Compatibility, Reason);
    }
    if (FamilyOnlyRows > 0)
    {
        Report.AddNotice(
            TEXT("FAMILY_ONLY_COMPATIBILITY_ROWS"),
            TEXT("defensive compatibility"),
            FString::Printf(TEXT("%d row(s) name a family without a concrete asset and were skipped"), FamilyOnlyRows));
    }
    return true;
}

bool LoadDefensiveSlots(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Loadouts = FindArray(Doc, TEXT("loadouts"));
    if (Loadouts == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("defensive slots"), TEXT("loadouts[] is required"));
        return false;
    }
    for (const TSharedPtr<FJsonValue>& LoadoutValue : *Loadouts)
    {
        const TSharedPtr<FJsonObject> Loadout = LoadoutValue->AsObject();
        if (!Loadout.IsValid())
        {
            continue;
        }
        FString PlatformId;
        if (!Loadout->TryGetStringField(TEXT("submarine"), PlatformId))
        {
            continue;
        }
        const TArray<TSharedPtr<FJsonValue>>* Slots = FindArray(Loadout, TEXT("slots"));
        if (Slots == nullptr)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& SlotValue : *Slots)
        {
            const TSharedPtr<FJsonObject> Slot = SlotValue->AsObject();
            if (!Slot.IsValid())
            {
                continue;
            }
            FString SlotName;
            FString Socket;
            FString Branch;
            bool bRequired = false;
            if (!Slot->TryGetStringField(TEXT("slot"), SlotName) || SlotName.IsEmpty())
            {
                continue;
            }
            Slot->TryGetStringField(TEXT("socket"), Socket);
            Slot->TryGetStringField(TEXT("branch"), Branch);
            Slot->TryGetBoolField(TEXT("required"), bRequired);
            AddSlot(Tree, PlatformId, SlotName, Socket, Branch,
                ESDTechTier::T1, ESDTechTier::T1, bRequired);
        }
    }
    return true;
}

bool LoadPropulsionCompatibility(
    const TSharedPtr<FJsonObject>& Doc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    const TArray<TSharedPtr<FJsonValue>>* Entries = FindArray(Doc, TEXT("entries"));
    if (Entries == nullptr)
    {
        Report.AddError(TEXT("MISSING_FIELD"), TEXT("propulsion compatibility"), TEXT("entries[] is required"));
        return false;
    }
    const TSet<FString> KnownIds = CollectKnownIds(Tree);
    for (const TSharedPtr<FJsonValue>& RowValue : *Entries)
    {
        const TSharedPtr<FJsonObject> Row = RowValue->AsObject();
        if (!Row.IsValid())
        {
            continue;
        }
        FString PlatformId;
        if (!Row->TryGetStringField(TEXT("platform_asset_id"), PlatformId))
        {
            continue;
        }

        // Propulsion has no compatibility field: it carries a verified
        // propulsor and a separate game-plan assignment. The verification
        // status decides which relation a candidate gets.
        FString VerificationStatus;
        Row->TryGetStringField(TEXT("verification_status"), VerificationStatus);
        FString VerifiedId;
        Row->TryGetStringField(TEXT("verified_propulsor_id"), VerifiedId);
        if (!VerifiedId.IsEmpty() && !VerificationStatus.Equals(TEXT("UNKNOWN"), ESearchCase::IgnoreCase))
        {
            ESDCompatibility Verified = ESDCompatibility::Probable;
            if (VerificationStatus.Equals(TEXT("CONFIRMED"), ESearchCase::IgnoreCase))
            {
                Verified = ESDCompatibility::Confirmed;
            }
            FString Rationale;
            Row->TryGetStringField(TEXT("verification_rationale"), Rationale);
            FString Kind;
            Row->TryGetStringField(TEXT("verified_kind"), Kind);
            // The verified field describes what the real boat has; that claim
            // may legitimately point at an asset the library has not produced
            // yet. Keep the claim and mark it, rather than dropping it.
            const FString Where = PlatformId + TEXT(" / ") + VerifiedId;
            if (!KnownIds.Contains(PlatformId))
            {
                Report.AddNotice(
                    TEXT("MISSING_COMPATIBILITY_PLATFORM"),
                    Where,
                    FString::Printf(TEXT("platform '%s' is not in the tree"), *PlatformId));
            }
            else if (KnownIds.Contains(VerifiedId))
            {
                AddRecord(Tree, PlatformId, VerifiedId, FString(), FString(),
                    Kind, Verified, Rationale);
            }
            else
            {
                AddPendingRecord(Tree, PlatformId, VerifiedId, Kind, Verified, Rationale, Report);
            }
        }

        FString GamePlanId;
        Row->TryGetStringField(TEXT("game_plan_propulsor_id"), GamePlanId);
        if (!GamePlanId.IsEmpty())
        {
            FString Note;
            Row->TryGetStringField(TEXT("game_plan_note"), Note);
            const FString Where = PlatformId + TEXT(" / ") + GamePlanId;
            if (AcceptReference(KnownIds, PlatformId, GamePlanId, Where, Report))
            {
                AddRecord(Tree, PlatformId, GamePlanId, FString(), FString(),
                    TEXT("PROPULSOR"), ESDCompatibility::Gameplay, Note);
            }
        }
    }
    return true;
}
}
}
