#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeViewModel.h"
#include "UI/SDCodeWidgetBase.h"

#include "SDTechTreeWidgetBase.generated.h"

/**
 * Shared presentation helpers for the technology-tree screens (UI-001..UI-003).
 *
 * The widgets read SDTechTree::FSDTechTreeViewModel and never touch simulation
 * state: every string they show is either a model field or a label derived from
 * one, including the caveat badges and the "no equipment" capability rows.
 *
 * The tree itself is built in C++ (see USDCodeWidgetBase for why). A designer
 * can still re-skin later by overriding BuildContent.
 */
UCLASS(Abstract)
class SILENTDEPTHUE_API USDTechTreeWidgetBase : public USDCodeWidgetBase
{
    GENERATED_BODY()

public:
    /** Binds the read-only model layer. Null clears the screen. */
    void SetViewModel(const SDTechTree::FSDTechTreeViewModel* InViewModel);

    /** Rebuilds every child widget from the bound model. Idempotent. */
    void RebuildFromModel();

protected:
    /** Display label for a row state. */
    static FString DescribeState(SDTechTree::ESDNodeRowState State);

    /** The orthogonal caveat badges of a row, or an empty string. */
    static FString DescribeBadges(const SDTechTree::FSDNodeRow& Row);

    /** Display name with the documented fallbacks; never empty for a real id. */
    static FString DisplayNameOf(const SDTechTree::FSDNodeRow& Row);

    /** Chinese label for a category. Presentation text, never an identifier. */
    static FString DescribeCategory(ESDTechCategory Category);

    /** Chinese label for a matrix relation, keeping UNKNOWN explicit. */
    static FString DescribeCompatibility(ESDCompatibility Compatibility);

    const SDTechTree::FSDTechTreeViewModel* ViewModel = nullptr;
};
