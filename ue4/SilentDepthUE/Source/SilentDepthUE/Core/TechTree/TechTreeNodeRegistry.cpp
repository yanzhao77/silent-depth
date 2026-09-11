#include "Core/TechTree/TechTreeNodeRegistry.h"

namespace SDTechTree
{
namespace
{
/** Id-ordered insertion so the ready list stays deterministic. */
void InsertSorted(TArray<FString>& Array, const FString& Value)
{
    int32 Index = 0;
    while (Index < Array.Num() && Array[Index].Compare(Value, ESearchCase::CaseSensitive) < 0)
    {
        ++Index;
    }
    Array.Insert(Value, Index);
}

const TArray<FString>& EmptyStringArray()
{
    static const TArray<FString> Empty;
    return Empty;
}

void CollectDependents(
    const FSDTechTree& Tree,
    TMap<FString, TArray<FString>>& OutDependents)
{
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        for (const FString& Prerequisite : Node.Unlock.PrerequisiteNodeIds)
        {
            OutDependents.FindOrAdd(Prerequisite).Add(Node.Id);
        }
    }
    for (TPair<FString, TArray<FString>>& Pair : OutDependents)
    {
        Pair.Value.Sort([](const FString& A, const FString& B)
        {
            return A.Compare(B, ESearchCase::CaseSensitive) < 0;
        });
    }
}
}

bool BuildTopologicalOrder(
    const FSDTechTree& Tree,
    TArray<FString>& OutOrder,
    FSDTechTreeLoadReport& Report)
{
    const int32 ErrorsAtEntry = Report.Errors.Num();
    OutOrder.Reset();
    OutOrder.Reserve(Tree.Nodes.Num());

    TMap<FString, int32> Indegree;
    Indegree.Reserve(Tree.Nodes.Num());
    TMap<FString, TArray<FString>> Dependents;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        Indegree.Add(Node.Id, Node.Unlock.PrerequisiteNodeIds.Num());
    }
    CollectDependents(Tree, Dependents);

    TArray<FString> Ready;
    for (const FSDTechNode& Node : Tree.Nodes)
    {
        if (Node.Unlock.PrerequisiteNodeIds.Num() == 0)
        {
            Ready.Add(Node.Id);
        }
    }
    Ready.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });

    while (Ready.Num() > 0)
    {
        const FString Current = Ready[0];
        Ready.RemoveAt(0);
        OutOrder.Add(Current);

        if (const TArray<FString>* Children = Dependents.Find(Current))
        {
            for (const FString& Child : *Children)
            {
                int32* Remaining = Indegree.Find(Child);
                if (Remaining == nullptr)
                {
                    continue;
                }
                --(*Remaining);
                if (*Remaining == 0)
                {
                    InsertSorted(Ready, Child);
                }
            }
        }
    }

    if (OutOrder.Num() != Tree.Nodes.Num())
    {
        TArray<FString> Stuck;
        for (const TPair<FString, int32>& Pair : Indegree)
        {
            if (Pair.Value > 0)
            {
                Stuck.Add(Pair.Key);
            }
        }
        Stuck.Sort([](const FString& A, const FString& B)
        {
            return A.Compare(B, ESearchCase::CaseSensitive) < 0;
        });
        Report.AddError(
            TEXT("CYCLE"),
            FString::Join(Stuck, TEXT(",")),
            FString::Printf(TEXT("%d node(s) cannot be ordered, so the prerequisite graph has a cycle"), Stuck.Num()));
        OutOrder.Reset();
        return false;
    }

    return Report.Errors.Num() == ErrorsAtEntry;
}

bool FSDNodeRegistry::Initialize(
    const FSDTechTree& InTree,
    const FSDResearchCostRule& InCostRule,
    FSDTechTreeLoadReport& Report)
{
    // Never keep half a registry from a previous attempt.
    *this = FSDNodeRegistry();

    const int32 ErrorsAtEntry = Report.Errors.Num();
    Tree = &InTree;

    if (!ValidateTreeInvariants(InTree, Report))
    {
        Tree = nullptr;
        return false;
    }

    if (!InCostRule.IsValid())
    {
        Report.AddError(
            TEXT("INVALID_COST_RULE"),
            TEXT("research_cost"),
            TEXT("the DEC-004 research cost rule is missing or invalid; costs must come from configuration"));
        Tree = nullptr;
        return false;
    }
    CostRule = InCostRule;
    bHasCostRule = true;

    // First pass: the full id index, so exclusion targets are checked against
    // every node rather than only the ones seen so far.
    NodeIndexById.Reserve(InTree.Nodes.Num());
    NodesInIdOrder.Reserve(InTree.Nodes.Num());
    for (int32 NodeIndex = 0; NodeIndex < InTree.Nodes.Num(); ++NodeIndex)
    {
        NodeIndexById.Add(InTree.Nodes[NodeIndex].Id, NodeIndex);
        NodesInIdOrder.Add(&InTree.Nodes[NodeIndex]);
    }

    // Second pass: the derived views.
    for (const FSDTechNode& Node : InTree.Nodes)
    {
        if (Node.Unlock.PrerequisiteNodeIds.Num() > 0)
        {
            TArray<FString>& Edges = Prerequisites.Add(Node.Id);
            Edges = Node.Unlock.PrerequisiteNodeIds;
            Edges.Sort([](const FString& A, const FString& B)
            {
                return A.Compare(B, ESearchCase::CaseSensitive) < 0;
            });
        }

        if (Node.SocketNames.Num() > 0)
        {
            TArray<FString>& NodeSockets = Sockets.Add(Node.Id);
            NodeSockets = Node.SocketNames;
            NodeSockets.Sort([](const FString& A, const FString& B)
            {
                return A.Compare(B, ESearchCase::CaseSensitive) < 0;
            });
        }

    }

    // Declared exclusions. Exclusivity is symmetric, so a group is built once
    // and keyed by its smallest id; every member resolves to that same group.
    for (const FSDTechNode& Node : InTree.Nodes)
    {
        if (Node.Unlock.MutuallyExclusiveNodeIds.Num() == 0)
        {
            continue;
        }
        TArray<FString> Members;
        Members.Add(Node.Id);
        Members.Append(Node.Unlock.MutuallyExclusiveNodeIds);
        Members.Sort([](const FString& A, const FString& B)
        {
            return A.Compare(B, ESearchCase::CaseSensitive) < 0;
        });
        for (int32 Index = Members.Num() - 1; Index > 0; --Index)
        {
            if (Members[Index].Equals(Members[Index - 1], ESearchCase::CaseSensitive))
            {
                Members.RemoveAt(Index);
            }
        }

        bool bMembersExist = true;
        for (const FString& Member : Members)
        {
            if (!NodeIndexById.Contains(Member))
            {
                bMembersExist = false;
                Report.AddError(
                    TEXT("MISSING_EXCLUSION"),
                    Node.Id,
                    FString::Printf(TEXT("mutually exclusive node '%s' does not exist"), *Member));
            }
        }
        if (!bMembersExist)
        {
            continue;
        }

        const FString GroupKey = Members[0];
        if (!ExclusionGroupKeys.Contains(GroupKey))
        {
            ExclusionGroupKeys.Add(GroupKey);
        }
        for (const FString& Member : Members)
        {
            const TArray<FString>* Existing = ExclusionGroups.Find(Member);
            if (Existing != nullptr && !(*Existing == Members))
            {
                Report.AddError(
                    TEXT("CONFLICTING_EXCLUSION"),
                    Member,
                    TEXT("node belongs to more than one exclusion group"));
                continue;
            }
            ExclusionGroups.Add(Member, Members);
        }
    }
    ExclusionGroupKeys.Sort([](const FString& A, const FString& B)
    {
        return A.Compare(B, ESearchCase::CaseSensitive) < 0;
    });

    CollectDependents(InTree, Dependents);
    BuildTopologicalOrder(InTree, TopologicalOrder, Report);

    if (Report.Errors.Num() != ErrorsAtEntry)
    {
        *this = FSDNodeRegistry();
        return false;
    }

    bInitialized = true;
    return true;
}

const FSDTechNode* FSDNodeRegistry::Find(const FString& NodeId) const
{
    if (Tree == nullptr)
    {
        return nullptr;
    }
    const int32* NodeIndex = NodeIndexById.Find(NodeId);
    if (NodeIndex == nullptr)
    {
        return nullptr;
    }
    return &Tree->Nodes[*NodeIndex];
}

void FSDNodeRegistry::CollectByCategory(
    ESDTechCategory Category,
    TArray<const FSDTechNode*>& OutNodes) const
{
    OutNodes.Reset();
    for (const FSDTechNode* Node : NodesInIdOrder)
    {
        if (Node->Category == Category)
        {
            OutNodes.Add(Node);
        }
    }
}

void FSDNodeRegistry::CollectByTier(
    ESDTechCategory Category,
    ESDTechTier Tier,
    TArray<const FSDTechNode*>& OutNodes) const
{
    OutNodes.Reset();
    for (const FSDTechNode* Node : NodesInIdOrder)
    {
        if (Node->Category == Category && Node->Tier == Tier)
        {
            OutNodes.Add(Node);
        }
    }
}

const TArray<FString>& FSDNodeRegistry::GetPrerequisites(const FString& NodeId) const
{
    const TArray<FString>* Found = Prerequisites.Find(NodeId);
    return Found != nullptr ? *Found : EmptyStringArray();
}

const TArray<FString>& FSDNodeRegistry::GetDependents(const FString& NodeId) const
{
    const TArray<FString>* Found = Dependents.Find(NodeId);
    return Found != nullptr ? *Found : EmptyStringArray();
}

const TArray<FString>& FSDNodeRegistry::GetExclusionGroup(const FString& NodeId) const
{
    const TArray<FString>* Found = ExclusionGroups.Find(NodeId);
    return Found != nullptr ? *Found : EmptyStringArray();
}

const TArray<FString>& FSDNodeRegistry::GetSocketNames(const FString& NodeId) const
{
    const TArray<FString>* Found = Sockets.Find(NodeId);
    return Found != nullptr ? *Found : EmptyStringArray();
}

int32 FSDNodeRegistry::GetCost(const FString& NodeId) const
{
    const FSDTechNode* Node = Find(NodeId);
    return Node != nullptr ? GetCostForTier(Node->Tier) : 0;
}

int32 FSDNodeRegistry::GetCostForTier(ESDTechTier Tier) const
{
    return CostForTier(CostRule, Tier);
}
}
