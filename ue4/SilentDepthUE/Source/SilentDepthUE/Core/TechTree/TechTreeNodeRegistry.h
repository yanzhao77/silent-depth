#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeSchema.h"
#include "Core/TechTree/TechTreeTypes.h"

/**
 * Read-only node registry for the five technology trees (TECH-002).
 *
 * The registry borrows a validated FSDTechTree and adds the queries the
 * research, unlock and UI layers need: lookup by id, iteration by category and
 * tier, prerequisite and dependent edges, declared exclusion groups, mount
 * sockets, display metadata and DEC-004 research costs.
 *
 * Lifetime: the registry stores a pointer to the tree and pointers to its
 * nodes, so the tree must outlive the registry and must not be moved or
 * mutated afterwards. Nothing here writes to the tree.
 *
 * Determinism: every array is id-ordered, and the topological order is
 * produced by Kahn's algorithm with an id-ordered ready list, so the same tree
 * always yields the same order. Rule evaluation never depends on TMap
 * iteration order.
 *
 * Out of scope: platform-to-candidate compatibility, installation slots and
 * equipment assignment. Those come from the compatibility matrix and belong to
 * TECH-005; this registry only exposes the sockets a node can mount to.
 */
namespace SDTechTree
{
    /**
     * Kahn's algorithm over the prerequisite edges, choosing the
     * lexicographically smallest ready node each step. Reports `CYCLE` with the
     * remaining ids when the graph cannot be fully ordered.
     */
    bool BuildTopologicalOrder(
        const FSDTechTree& Tree,
        TArray<FString>& OutOrder,
        FSDTechTreeLoadReport& Report);

    class FSDNodeRegistry
    {
    public:
        /**
         * Builds the index. Fails closed: a missing tree, a tree that breaks
         * the schema invariants, an exclusion that points at a missing node or
         * an invalid cost rule leaves the registry uninitialised.
         */
        bool Initialize(
            const FSDTechTree& InTree,
            const FSDResearchCostRule& InCostRule,
            FSDTechTreeLoadReport& Report);

        bool IsInitialized() const { return bInitialized; }
        int32 Num() const { return NodesInIdOrder.Num(); }

        /** Borrowed tree. Only valid while IsInitialized() is true. */
        const FSDTechTree& GetTree() const { return *Tree; }

        /** Node by id, or nullptr. */
        const FSDTechNode* Find(const FString& NodeId) const;

        /** Every node in id order. */
        const TArray<const FSDTechNode*>& All() const { return NodesInIdOrder; }

        void CollectByCategory(ESDTechCategory Category, TArray<const FSDTechNode*>& OutNodes) const;
        void CollectByTier(
            ESDTechCategory Category,
            ESDTechTier Tier,
            TArray<const FSDTechNode*>& OutNodes) const;

        /** Research edges, in id order. Empty when the node has none. */
        const TArray<FString>& GetPrerequisites(const FString& NodeId) const;
        /** Reverse research edges, in id order. */
        const TArray<FString>& GetDependents(const FString& NodeId) const;
        /**
         * Nodes declared mutually exclusive with this one, including itself.
         * Empty when the node declares no exclusions.
         */
        const TArray<FString>& GetExclusionGroup(const FString& NodeId) const;
        int32 NumExclusionGroups() const { return ExclusionGroupKeys.Num(); }

        /** Registry socket names this node mounts to, in id order. */
        const TArray<FString>& GetSocketNames(const FString& NodeId) const;

        /** Ids in research order: every prerequisite precedes its dependents. */
        const TArray<FString>& GetTopologicalOrder() const { return TopologicalOrder; }

        /** DEC-004 cost for a node, derived from its tier. 0 for unknown ids. */
        int32 GetCost(const FString& NodeId) const;
        int32 GetCostForTier(ESDTechTier Tier) const;
        bool HasCostRule() const { return bHasCostRule; }
        const FSDResearchCostRule& GetCostRule() const { return CostRule; }

    private:
        const FSDTechTree* Tree = nullptr;
        FSDResearchCostRule CostRule;
        TMap<FString, int32> NodeIndexById;
        TArray<const FSDTechNode*> NodesInIdOrder;
        TMap<FString, TArray<FString>> Prerequisites;
        TMap<FString, TArray<FString>> Dependents;
        TMap<FString, TArray<FString>> ExclusionGroups;
        TArray<FString> ExclusionGroupKeys;
        TMap<FString, TArray<FString>> Sockets;
        TArray<FString> TopologicalOrder;
        bool bInitialized = false;
        bool bHasCostRule = false;
    };
}
