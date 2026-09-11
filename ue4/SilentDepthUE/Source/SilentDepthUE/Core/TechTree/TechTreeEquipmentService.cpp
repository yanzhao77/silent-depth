#include "Core/TechTree/TechTreeEquipmentService.h"

namespace SDTechTree
{
namespace
{
/** Strength order for the pair-level query: better evidence wins. */
int32 RankCompatibility(ESDCompatibility Value)
{
    switch (Value)
    {
    case ESDCompatibility::Confirmed:    return 5;
    case ESDCompatibility::Probable:     return 4;
    case ESDCompatibility::Gameplay:     return 3;
    case ESDCompatibility::Incompatible: return 2;
    case ESDCompatibility::Unknown:
    default:                             return 1;
    }
}
}

int32 FSDEquipmentService::NumRecords() const
{
    return Tree != nullptr ? Tree->Compatibility.Num() : 0;
}

int32 FSDEquipmentService::NumSlots() const
{
    return Tree != nullptr ? Tree->Slots.Num() : 0;
}

bool FSDEquipmentService::Initialize(const FSDTechTree& InTree, FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    Tree = nullptr;
    RecordsByPlatform.Reset();
    SlotsByPlatform.Reset();
    bInitialized = false;

    if (InTree.SchemaVersion != SchemaVersion)
    {
        Report.AddError(
            TEXT("SCHEMA_VERSION"),
            FString::FromInt(InTree.SchemaVersion),
            FString::Printf(TEXT("the equipment service needs schema version %d"), SchemaVersion));
        return false;
    }

    Tree = &InTree;
    for (int32 Index = 0; Index < InTree.Compatibility.Num(); ++Index)
    {
        RecordsByPlatform.FindOrAdd(InTree.Compatibility[Index].PlatformId).Add(Index);
    }
    for (int32 Index = 0; Index < InTree.Slots.Num(); ++Index)
    {
        SlotsByPlatform.FindOrAdd(InTree.Slots[Index].PlatformId).Add(Index);
    }

    // Deterministic iteration: candidate then slot for records, slot for slots.
    for (TPair<FString, TArray<int32>>& Pair : RecordsByPlatform)
    {
        const TArray<FSDCompatibilityRecord>& All = InTree.Compatibility;
        Pair.Value.Sort([&All](const int32 A, const int32 B)
        {
            const int32 ByCandidate = All[A].CandidateId.Compare(All[B].CandidateId, ESearchCase::CaseSensitive);
            if (ByCandidate != 0) { return ByCandidate < 0; }
            return All[A].SlotName.Compare(All[B].SlotName, ESearchCase::CaseSensitive) < 0;
        });
    }
    for (TPair<FString, TArray<int32>>& Pair : SlotsByPlatform)
    {
        const TArray<FSDEquipmentSlot>& All = InTree.Slots;
        Pair.Value.Sort([&All](const int32 A, const int32 B)
        {
            return All[A].SlotName.Compare(All[B].SlotName, ESearchCase::CaseSensitive) < 0;
        });
    }

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        Tree = nullptr;
        RecordsByPlatform.Reset();
        SlotsByPlatform.Reset();
        return false;
    }

    bInitialized = true;
    return true;
}

const FSDCompatibilityRecord* FSDEquipmentService::FindRecord(
    const FString& PlatformId,
    const FString& SlotName,
    const FString& CandidateId) const
{
    if (Tree == nullptr)
    {
        return nullptr;
    }
    const TArray<int32>* Indices = RecordsByPlatform.Find(PlatformId);
    if (Indices == nullptr)
    {
        return nullptr;
    }

    const FSDCompatibilityRecord* Wildcard = nullptr;
    for (const int32 Index : *Indices)
    {
        const FSDCompatibilityRecord& Record = Tree->Compatibility[Index];
        // A pending relation cannot be fitted, so it is not a usable record.
        if (Record.bAssetPending)
        {
            continue;
        }
        if (!Record.CandidateId.Equals(CandidateId, ESearchCase::CaseSensitive))
        {
            continue;
        }
        if (SlotName.IsEmpty())
        {
            return &Record;
        }
        if (Record.SlotName.Equals(SlotName, ESearchCase::CaseSensitive))
        {
            return &Record;
        }
        if (Record.SlotName.IsEmpty() && Wildcard == nullptr)
        {
            Wildcard = &Record;
        }
    }
    return Wildcard;
}

ESDCompatibility FSDEquipmentService::GetCompatibilityInSlot(
    const FString& PlatformId,
    const FString& SlotName,
    const FString& CandidateId) const
{
    const FSDCompatibilityRecord* Record = FindRecord(PlatformId, SlotName, CandidateId);
    return Record != nullptr ? Record->Compatibility : ESDCompatibility::Unknown;
}

ESDCompatibility FSDEquipmentService::GetCompatibility(
    const FString& PlatformId,
    const FString& CandidateId) const
{
    if (Tree == nullptr)
    {
        return ESDCompatibility::Unknown;
    }
    const TArray<int32>* Indices = RecordsByPlatform.Find(PlatformId);
    if (Indices == nullptr)
    {
        return ESDCompatibility::Unknown;
    }

    // A pair may appear in several slots with different relations. The best
    // evidence wins, so the answer does not depend on row order.
    ESDCompatibility Best = ESDCompatibility::Unknown;
    bool bFound = false;
    for (const int32 Index : *Indices)
    {
        const FSDCompatibilityRecord& Record = Tree->Compatibility[Index];
        if (!Record.CandidateId.Equals(CandidateId, ESearchCase::CaseSensitive))
        {
            continue;
        }
        if (!bFound || RankCompatibility(Record.Compatibility) > RankCompatibility(Best))
        {
            Best = Record.Compatibility;
            bFound = true;
        }
    }
    return bFound ? Best : ESDCompatibility::Unknown;
}

bool FSDEquipmentService::IsEquippable(
    const FString& PlatformId,
    const FString& CandidateId,
    ESDEquipPolicy Policy) const
{
    // A recorded claim whose asset was never produced is not fittable, even
    // though the relation itself is real enough to display.
    if (IsAssetPending(PlatformId, CandidateId))
    {
        return false;
    }
    return SDTechTree::IsEquippable(GetCompatibility(PlatformId, CandidateId), Policy);
}

bool FSDEquipmentService::IsEquippableInSlot(
    const FString& PlatformId,
    const FString& SlotName,
    const FString& CandidateId,
    ESDEquipPolicy Policy) const
{
    return SDTechTree::IsEquippable(
        GetCompatibilityInSlot(PlatformId, SlotName, CandidateId), Policy);
}

bool FSDEquipmentService::IsGameplayAssignment(
    const FString& PlatformId,
    const FString& CandidateId) const
{
    return GetCompatibility(PlatformId, CandidateId) == ESDCompatibility::Gameplay;
}

bool FSDEquipmentService::IsAssetPending(
    const FString& PlatformId,
    const FString& CandidateId) const
{
    if (Tree == nullptr)
    {
        return false;
    }
    const TArray<int32>* Indices = RecordsByPlatform.Find(PlatformId);
    if (Indices == nullptr)
    {
        return false;
    }
    for (const int32 Index : *Indices)
    {
        const FSDCompatibilityRecord& Record = Tree->Compatibility[Index];
        if (Record.bAssetPending && Record.CandidateId.Equals(CandidateId, ESearchCase::CaseSensitive))
        {
            return true;
        }
    }
    return false;
}

void FSDEquipmentService::CollectSlots(
    const FString& PlatformId,
    TArray<const FSDEquipmentSlot*>& OutSlots) const
{
    OutSlots.Reset();
    const TArray<int32>* Indices = SlotsByPlatform.Find(PlatformId);
    if (Tree == nullptr || Indices == nullptr)
    {
        return;
    }
    OutSlots.Reserve(Indices->Num());
    for (const int32 Index : *Indices)
    {
        OutSlots.Add(&Tree->Slots[Index]);
    }
}

void FSDEquipmentService::CollectCandidates(
    const FString& PlatformId,
    const FString& SlotName,
    ESDEquipPolicy Policy,
    TArray<FString>& OutCandidateIds) const
{
    OutCandidateIds.Reset();
    const TArray<int32>* Indices = RecordsByPlatform.Find(PlatformId);
    if (Tree == nullptr || Indices == nullptr)
    {
        return;
    }

    // Records are already sorted by candidate id, so first-seen wins and the
    // result is id-ordered without a second sort.
    for (const int32 Index : *Indices)
    {
        const FSDCompatibilityRecord& Record = Tree->Compatibility[Index];
        // A pending relation has no asset to fit, so it never appears as a
        // candidate even though the claim itself is recorded.
        if (Record.bAssetPending)
        {
            continue;
        }
        if (!SlotName.IsEmpty() && !Record.SlotName.Equals(SlotName, ESearchCase::CaseSensitive))
        {
            continue;
        }
        if (!SDTechTree::IsEquippable(Record.Compatibility, Policy))
        {
            continue;
        }
        if (OutCandidateIds.Num() > 0
            && OutCandidateIds.Last().Equals(Record.CandidateId, ESearchCase::CaseSensitive))
        {
            continue;
        }
        OutCandidateIds.Add(Record.CandidateId);
    }
}
}
