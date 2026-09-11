#include "Core/TechTree/TechTreeLoaderInternal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Dom/JsonValue.h"

namespace SDTechTree
{
namespace Internal
{
TMap<FString, int32> IndexNodesById(const FSDTechTree& Tree)
{
    TMap<FString, int32> Index;
    Index.Reserve(Tree.Nodes.Num());
    for (int32 NodeIndex = 0; NodeIndex < Tree.Nodes.Num(); ++NodeIndex)
    {
        Index.Add(Tree.Nodes[NodeIndex].Id, NodeIndex);
    }
    return Index;
}

void AppendTierLadder(FSDTechTree& Tree, ESDTechCategory Category)
{
    for (int32 TierIndex = 0; TierIndex < SDTechTree::TierCount; ++TierIndex)
    {
        FSDTierDefinition& Definition = Tree.Tiers.AddDefaulted_GetRef();
        Definition.Category = Category;
        Definition.Tier = static_cast<ESDTechTier>(TierIndex + SDTechTree::MinTier);
    }
}

namespace
{
FSDTierDefinition* FindTier(FSDTechTree& Tree, ESDTechCategory Category, ESDTechTier Tier)
{
    for (FSDTierDefinition& Definition : Tree.Tiers)
    {
        if (Definition.Category == Category && Definition.Tier == Tier)
        {
            return &Definition;
        }
    }
    return nullptr;
}
}

void SetTierLabel(
    FSDTechTree& Tree,
    ESDTechCategory Category,
    ESDTechTier Tier,
    const FString& LabelEn,
    const FString& LabelZh,
    const FString& Description)
{
    if (FSDTierDefinition* Definition = FindTier(Tree, Category, Tier))
    {
        if (!LabelEn.IsEmpty()) { Definition->LabelEn = LabelEn; }
        if (!LabelZh.IsEmpty()) { Definition->LabelZh = LabelZh; }
        if (!Description.IsEmpty()) { Definition->Description = Description; }
    }
}

void ApplyTierLabelMap(
    FSDTechTree& Tree,
    ESDTechCategory Category,
    const TSharedPtr<FJsonObject>& Map)
{
    for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : Map->Values)
    {
        ESDTechTier Tier = ESDTechTier::T1;
        if (ParseTier(Pair.Key, Tier) && Pair.Value.IsValid() && Pair.Value->Type == EJson::String)
        {
            SetTierLabel(Tree, Category, Tier, FString(), Pair.Value->AsString(), FString());
        }
    }
}

void ApplySubmarineTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree)
{
    if (TreeDoc == nullptr)
    {
        return;
    }
    const TMap<FString, int32> Index = IndexNodesById(Tree);
    for (const TPair<FString, TSharedPtr<FJsonValue>>& TierEntry : TreeDoc->Values)
    {
        if (!TierEntry.Value.IsValid() || TierEntry.Value->Type != EJson::Array)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& Entry : TierEntry.Value->AsArray())
        {
            const TSharedPtr<FJsonObject> Object = Entry->AsObject();
            if (!Object.IsValid())
            {
                continue;
            }
            FString AssetId;
            if (!Object->TryGetStringField(TEXT("asset_id"), AssetId))
            {
                continue;
            }
            const int32* NodeIndex = Index.Find(AssetId);
            if (NodeIndex == nullptr)
            {
                continue;
            }
            FString Reason;
            if (Object->TryGetStringField(TEXT("tier_reason"), Reason))
            {
                Tree.Nodes[*NodeIndex].RoleText = Reason;
            }
        }
    }
}

void ApplyWeaponTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree)
{
    if (TreeDoc == nullptr)
    {
        return;
    }
    if (const TSharedPtr<FJsonObject> Framework = FindObjectField(TreeDoc, TEXT("tier_framework")))
    {
        if (const TSharedPtr<FJsonObject> Tiers = FindObjectField(Framework, TEXT("tiers")))
        {
            ApplyTierLabelMap(Tree, ESDTechCategory::Weapon, Tiers);
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* UiNodes = FindArray(TreeDoc, TEXT("ui_nodes"));
    if (UiNodes == nullptr)
    {
        return;
    }
    const TMap<FString, int32> Index = IndexNodesById(Tree);
    for (const TSharedPtr<FJsonValue>& Value : *UiNodes)
    {
        const TSharedPtr<FJsonObject> Entry = Value->AsObject();
        if (!Entry.IsValid())
        {
            continue;
        }
        FString WeaponId;
        if (!Entry->TryGetStringField(TEXT("weapon_id"), WeaponId))
        {
            continue;
        }
        const int32* NodeIndex = Index.Find(WeaponId);
        if (NodeIndex == nullptr)
        {
            continue;
        }
        FSDTechNode& Node = Tree.Nodes[*NodeIndex];
        FString Parent;
        if (Entry->TryGetStringField(TEXT("parent"), Parent) && !Parent.IsEmpty())
        {
            Node.Unlock.PrerequisiteNodeIds.Add(Parent);
        }
        if (const TSharedPtr<FJsonObject> Requirements = FindObjectField(Entry, TEXT("unlock_requirements")))
        {
            Requirements->TryGetStringField(TEXT("previous_weapon"), Node.Unlock.PreviousNodeId);
            Requirements->TryGetStringField(TEXT("platform_requirement"), Node.Unlock.PlatformRequirementNote);
            Requirements->TryGetStringField(TEXT("game_tier_requirement"), Node.Unlock.GameTierRequirementNote);
        }
    }
}

void ApplySensorTree(
    const TSharedPtr<FJsonObject>& TreeDoc,
    FSDTechTree& Tree,
    FSDTechTreeLoadReport& Report)
{
    if (TreeDoc == nullptr)
    {
        return;
    }
    if (const TArray<TSharedPtr<FJsonValue>>* Ladder = FindArray(TreeDoc, TEXT("tier_ladder")))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Ladder)
        {
            const TSharedPtr<FJsonObject> Entry = Value->AsObject();
            if (!Entry.IsValid())
            {
                continue;
            }
            ESDTechTier Tier = ESDTechTier::T1;
            if (!ParseTier(FieldAsToken(Entry, TEXT("tier")), Tier))
            {
                continue;
            }
            FString LabelEn;
            FString LabelZh;
            Entry->TryGetStringField(TEXT("label_en"), LabelEn);
            Entry->TryGetStringField(TEXT("label_zh"), LabelZh);
            SetTierLabel(Tree, ESDTechCategory::Sensor, Tier, LabelEn, LabelZh, FString());
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* Branches = FindArray(TreeDoc, TEXT("branches"));
    if (Branches == nullptr)
    {
        return;
    }
    const TMap<FString, int32> Index = IndexNodesById(Tree);
    for (const TSharedPtr<FJsonValue>& BranchValue : *Branches)
    {
        const TSharedPtr<FJsonObject> Branch = BranchValue->AsObject();
        if (!Branch.IsValid())
        {
            continue;
        }
        FString BranchId;
        Branch->TryGetStringField(TEXT("branch_id"), BranchId);
        const TArray<TSharedPtr<FJsonValue>>* Rungs = FindArray(Branch, TEXT("tiers"));
        if (Rungs == nullptr)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& RungValue : *Rungs)
        {
            const TSharedPtr<FJsonObject> Rung = RungValue->AsObject();
            if (!Rung.IsValid())
            {
                continue;
            }
            FString SensorId;
            if (!Rung->TryGetStringField(TEXT("sensor_id"), SensorId))
            {
                continue;
            }
            const int32* NodeIndex = Index.Find(SensorId);
            if (NodeIndex == nullptr)
            {
                continue;
            }
            FSDSensorDetail& Detail = Tree.Nodes[*NodeIndex].Detail.Sensor;
            if (Detail.BranchId.IsEmpty())
            {
                Detail.BranchId = BranchId;
            }
            MapSourceKind(Rung, TEXT("source"), SensorId, Report, Detail.Source);
        }
    }
}

void ApplyDefensiveTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree)
{
    if (TreeDoc == nullptr)
    {
        return;
    }
    const TSharedPtr<FJsonObject> BranchTrees = FindObjectField(TreeDoc, TEXT("branch_trees"));
    if (!BranchTrees.IsValid())
    {
        return;
    }
    const TMap<FString, int32> Index = IndexNodesById(Tree);
    for (const TPair<FString, TSharedPtr<FJsonValue>>& BranchEntry : BranchTrees->Values)
    {
        const TSharedPtr<FJsonObject> Branch = BranchEntry.Value->AsObject();
        if (!Branch.IsValid())
        {
            continue;
        }
        const TArray<TSharedPtr<FJsonValue>>* Nodes = FindArray(Branch, TEXT("nodes"));
        if (Nodes == nullptr)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& NodeValue : *Nodes)
        {
            const TSharedPtr<FJsonObject> Entry = NodeValue->AsObject();
            if (!Entry.IsValid())
            {
                continue;
            }
            FString FamilyId;
            if (!Entry->TryGetStringField(TEXT("family_id"), FamilyId))
            {
                continue;
            }
            for (const TPair<FString, int32>& Pair : Index)
            {
                FSDTechNode& Node = Tree.Nodes[Pair.Value];
                if (!Node.FamilyId.Equals(FamilyId, ESearchCase::CaseSensitive))
                {
                    continue;
                }
                if (!Node.Detail.Defensive.BranchIds.Contains(BranchEntry.Key))
                {
                    Node.Detail.Defensive.BranchIds.Add(BranchEntry.Key);
                }
                ESDTechTier TierMin = ESDTechTier::T1;
                ESDTechTier TierMax = ESDTechTier::T1;
                if (ParseTier(FieldAsToken(Entry, TEXT("tier_min")), TierMin))
                {
                    Node.Detail.Defensive.TierMin = TierMin;
                    Node.Tier = TierMin;
                    Node.Unlock.RequiredTier = TierMin;
                }
                if (ParseTier(FieldAsToken(Entry, TEXT("tier_max")), TierMax))
                {
                    Node.Detail.Defensive.TierMax = TierMax;
                }
                FString Prerequisite;
                if (Entry->TryGetStringField(TEXT("prerequisite"), Prerequisite) && !Prerequisite.IsEmpty())
                {
                    Node.Detail.Defensive.PrerequisiteFamilyIds.Add(Prerequisite);
                }
            }
        }
    }
}

void ApplyPropulsionTree(const TSharedPtr<FJsonObject>& TreeDoc, FSDTechTree& Tree)
{
    if (TreeDoc == nullptr)
    {
        return;
    }
    const TArray<TSharedPtr<FJsonValue>>* Branches = FindArray(TreeDoc, TEXT("branches"));
    if (Branches == nullptr)
    {
        return;
    }
    const TMap<FString, int32> Index = IndexNodesById(Tree);
    for (const TSharedPtr<FJsonValue>& BranchValue : *Branches)
    {
        const TSharedPtr<FJsonObject> Branch = BranchValue->AsObject();
        if (!Branch.IsValid())
        {
            continue;
        }
        FString BranchId;
        Branch->TryGetStringField(TEXT("branch_id"), BranchId);
        const TArray<TSharedPtr<FJsonValue>>* Rungs = FindArray(Branch, TEXT("tiers"));
        if (Rungs == nullptr)
        {
            continue;
        }
        for (const TSharedPtr<FJsonValue>& RungValue : *Rungs)
        {
            const TSharedPtr<FJsonObject> Rung = RungValue->AsObject();
            if (!Rung.IsValid())
            {
                continue;
            }
            ESDTechTier Tier = ESDTechTier::T1;
            if (!ParseTier(FieldAsToken(Rung, TEXT("tier")), Tier))
            {
                continue;
            }
            if (BranchId.Equals(TEXT("BRANCH_PROPULSOR"), ESearchCase::CaseSensitive))
            {
                FString LabelEn;
                FString LabelZh;
                Rung->TryGetStringField(TEXT("public_label"), LabelEn);
                Rung->TryGetStringField(TEXT("display_name_cn"), LabelZh);
                SetTierLabel(Tree, ESDTechCategory::Propulsion, Tier, LabelEn, LabelZh,
                    FieldAsToken(Rung, TEXT("description")));
            }
            if (const TArray<TSharedPtr<FJsonValue>>* Linked = FindArray(Rung, TEXT("linked_assets")))
            {
                for (const TSharedPtr<FJsonValue>& AssetValue : *Linked)
                {
                    if (AssetValue->Type != EJson::String)
                    {
                        continue;
                    }
                    const int32* NodeIndex = Index.Find(AssetValue->AsString());
                    if (NodeIndex != nullptr)
                    {
                        Tree.Nodes[*NodeIndex].Detail.Propulsion.BranchId = BranchId;
                    }
                }
            }
        }
    }
}
}
}
