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

int32 FSDEquipmentService::NumFamilyCapabilities() const
{
    return Tree != nullptr ? Tree->FamilyCapabilities.Num() : 0;
}

bool FSDEquipmentService::Initialize(const FSDTechTree& InTree, FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    Tree = nullptr;
    RecordsByPlatform.Reset();
    CapabilitiesByPlatform.Reset();
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
    for (int32 Index = 0; Index < InTree.FamilyCapabilities.Num(); ++Index)
    {
        CapabilitiesByPlatform.FindOrAdd(InTree.FamilyCapabilities[Index].PlatformId).Add(Index);
    }

    // Deterministic iteration: candidate then slot for records, slot for slots,
    // family then branch for capabilities.
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
    for (TPair<FString, TArray<int32>>& Pair : CapabilitiesByPlatform)
    {
        const TArray<FSDFamilyCapability>& All = InTree.FamilyCapabilities;
        Pair.Value.Sort([&All](const int32 A, const int32 B)
        {
            const int32 ByFamily = All[A].FamilyId.Compare(All[B].FamilyId, ESearchCase::CaseSensitive);
            if (ByFamily != 0) { return ByFamily < 0; }
            return All[A].Branch.Compare(All[B].Branch, ESearchCase::CaseSensitive) < 0;
        });
    }

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        Tree = nullptr;
        RecordsByPlatform.Reset();
        CapabilitiesByPlatform.Reset();
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

    // A slot either names its mount point directly (weapons) or declares the
    // socket that the matrix rows are keyed by (sensors, defensive systems).
    FString SocketName;
    if (!SlotName.IsEmpty())
    {
        if (const FSDEquipmentSlot* Slot = FindSlot(PlatformId, SlotName))
        {
            SocketName = Slot->SocketName;
        }
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
        if (!SocketName.IsEmpty() && Record.SlotName.Equals(SocketName, ESearchCase::CaseSensitive))
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

    // Same slot-to-matrix key resolution as FindRecord: weapons name the slot,
    // sensors and defensive systems name the socket the rows are keyed by.
    FString SocketName;
    if (!SlotName.IsEmpty())
    {
        if (const FSDEquipmentSlot* Slot = FindSlot(PlatformId, SlotName))
        {
            SocketName = Slot->SocketName;
        }
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
        if (!SlotName.IsEmpty()
            && !Record.SlotName.Equals(SlotName, ESearchCase::CaseSensitive)
            && (SocketName.IsEmpty() || !Record.SlotName.Equals(SocketName, ESearchCase::CaseSensitive)))
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

void FSDEquipmentService::CollectFamilyCapabilities(
    const FString& PlatformId,
    TArray<const FSDFamilyCapability*>& OutCapabilities) const
{
    OutCapabilities.Reset();
    const TArray<int32>* Indices = CapabilitiesByPlatform.Find(PlatformId);
    if (Tree == nullptr || Indices == nullptr)
    {
        return;
    }
    OutCapabilities.Reserve(Indices->Num());
    for (const int32 Index : *Indices)
    {
        OutCapabilities.Add(&Tree->FamilyCapabilities[Index]);
    }
}

void FSDEquipmentService::CollectPendingCandidates(
    const FString& PlatformId,
    TArray<FString>& OutCandidateIds) const
{
    OutCandidateIds.Reset();
    const TArray<int32>* Indices = RecordsByPlatform.Find(PlatformId);
    if (Tree == nullptr || Indices == nullptr)
    {
        return;
    }
    // Records are sorted by candidate id, so the result is id-ordered.
    for (const int32 Index : *Indices)
    {
        const FSDCompatibilityRecord& Record = Tree->Compatibility[Index];
        if (!Record.bAssetPending)
        {
            continue;
        }
        if (OutCandidateIds.Num() == 0
            || !OutCandidateIds.Last().Equals(Record.CandidateId, ESearchCase::CaseSensitive))
        {
            OutCandidateIds.Add(Record.CandidateId);
        }
    }
}

const TArray<int32>* FSDEquipmentService::FindPlatformSlots(const FString& PlatformId) const
{
    return Tree != nullptr ? SlotsByPlatform.Find(PlatformId) : nullptr;
}

int32 FSDEquipmentService::FindSlotIndex(const FString& PlatformId, const FString& SlotName) const
{
    const TArray<int32>* Indices = FindPlatformSlots(PlatformId);
    if (Indices == nullptr)
    {
        return INDEX_NONE;
    }
    // SlotsByPlatform is sorted by slot name, so this is a binary search.
    int32 Lo = 0;
    int32 Hi = Indices->Num() - 1;
    while (Lo <= Hi)
    {
        const int32 Mid = Lo + (Hi - Lo) / 2;
        const int32 Index = (*Indices)[Mid];
        const int32 Compare = Tree->Slots[Index].SlotName.Compare(SlotName, ESearchCase::CaseSensitive);
        if (Compare == 0)
        {
            return Index;
        }
        if (Compare < 0) { Lo = Mid + 1; } else { Hi = Mid - 1; }
    }
    return INDEX_NONE;
}

int32 FSDEquipmentService::GetSlotSocketCapacity(
    const FString& PlatformId,
    const FString& SlotName) const
{
    const FSDEquipmentSlot* Slot = FindSlot(PlatformId, SlotName);
    if (Slot == nullptr)
    {
        return 0;
    }
    // Internal equipment has no socket, so nothing competes for space.
    return Slot->SocketName.IsEmpty() ? 0 : Slot->SocketCapacity;
}

const FSDEquipmentSlot* FSDEquipmentService::FindSlot(
    const FString& PlatformId,
    const FString& SlotName) const
{
    const int32 Index = FindSlotIndex(PlatformId, SlotName);
    return Index == INDEX_NONE ? nullptr : &Tree->Slots[Index];
}

const FSDLaunchInterface* FSDEquipmentService::FindLaunchInterface(const FString& PlatformId) const
{
    if (Tree == nullptr)
    {
        return nullptr;
    }
    // LaunchInterfaces is sorted by platform id (SortDeterministically).
    int32 Lo = 0;
    int32 Hi = Tree->LaunchInterfaces.Num() - 1;
    while (Lo <= Hi)
    {
        const int32 Mid = Lo + (Hi - Lo) / 2;
        const int32 Compare = Tree->LaunchInterfaces[Mid].PlatformId.Compare(PlatformId, ESearchCase::CaseSensitive);
        if (Compare == 0)
        {
            return &Tree->LaunchInterfaces[Mid];
        }
        if (Compare < 0) { Lo = Mid + 1; } else { Hi = Mid - 1; }
    }
    return nullptr;
}

int32 FSDEquipmentService::GetPayloadCapacity(
    const FString& PlatformId,
    const FString& SlotName) const
{
    const FSDLaunchInterface* Launch = FindLaunchInterface(PlatformId);
    if (Launch == nullptr)
    {
        return 0;
    }

    // Slot names are the loadout template's; the socket kinds are the
    // manifest's. Either source may be the one that is filled in.
    if (SlotName.Equals(TEXT("TORPEDO"), ESearchCase::CaseSensitive))
    {
        return Launch->TorpedoTubes > 0
            ? Launch->TorpedoTubes
            : Launch->CountSocketsOfKind(TEXT("TORPEDO_TUBE"));
    }
    if (SlotName.Equals(TEXT("MISSILE"), ESearchCase::CaseSensitive))
    {
        // A missile fired from a tube uses a tube; a VLS missile uses a cell.
        if (Launch->MissileTubes > 0)
        {
            return Launch->MissileTubes;
        }
        return Launch->CountSocketsOfKind(TEXT("TORPEDO_TUBE"));
    }
    if (SlotName.Equals(TEXT("VLS"), ESearchCase::CaseSensitive))
    {
        return Launch->VlsCells > 0
            ? Launch->VlsCells
            : Launch->CountSocketsOfKind(TEXT("VLS"));
    }
    if (SlotName.Equals(TEXT("SLBM"), ESearchCase::CaseSensitive))
    {
        return Launch->SlbmTubes > 0
            ? Launch->SlbmTubes
            : Launch->CountSocketsOfKind(TEXT("SLBM_TUBE"));
    }
    if (SlotName.Equals(TEXT("SPECIAL"), ESearchCase::CaseSensitive))
    {
        return Launch->PayloadModules;
    }
    return 0;
}

void FSDEquipmentService::CollectSocketPeers(
    const FString& PlatformId,
    const FString& SlotName,
    TArray<FString>& OutSlotNames) const
{
    OutSlotNames.Reset();
    const int32 SelfIndex = FindSlotIndex(PlatformId, SlotName);
    if (SelfIndex == INDEX_NONE)
    {
        return;
    }
    const FString& Socket = Tree->Slots[SelfIndex].SocketName;
    if (Socket.IsEmpty())
    {
        return;
    }
    const TArray<int32>* Indices = FindPlatformSlots(PlatformId);
    for (const int32 Index : *Indices)
    {
        const FSDEquipmentSlot& Slot = Tree->Slots[Index];
        if (Slot.SocketName.Equals(Socket, ESearchCase::CaseSensitive)
            && !Slot.SlotName.Equals(SlotName, ESearchCase::CaseSensitive))
        {
            OutSlotNames.Add(Slot.SlotName);
        }
    }
}

bool FSDEquipmentService::CanMountTogether(
    const FString& PlatformId,
    const FString& SlotA,
    const FString& SlotB) const
{
    const int32 IndexA = FindSlotIndex(PlatformId, SlotA);
    const int32 IndexB = FindSlotIndex(PlatformId, SlotB);
    if (IndexA == INDEX_NONE || IndexB == INDEX_NONE)
    {
        // Fail closed: an unknown slot is not something to fit into.
        return false;
    }
    const FSDEquipmentSlot& A = Tree->Slots[IndexA];
    const FSDEquipmentSlot& B = Tree->Slots[IndexB];
    if (A.SocketName.IsEmpty() || !A.SocketName.Equals(B.SocketName, ESearchCase::CaseSensitive))
    {
        return true;
    }
    // Same socket: they only fit together when the socket has room for two.
    return A.SocketCapacity >= 2;
}
}
