#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeResearchAccount.h"
#include "UI/TechTree/SDTechTreeWidgetBase.h"

#include "SDTechTreeOverviewWidget.generated.h"

/**
 * UI-001: the technology-tree overview.
 *
 * Always renders all five category tabs (with their roll-up counters), then the
 * tier sections and node rows of the selected category. Rows carry tier, cost,
 * state, the blocking node and the caveat badges; nothing is filled in for a
 * node the model does not describe.
 */
UCLASS()
class SILENTDEPTHUE_API USDTechTreeOverviewWidget : public USDTechTreeWidgetBase
{
    GENERATED_BODY()

public:
    /** Category shown. The tabs always list all five. */
    void SetCategory(ESDTechCategory InCategory);

    /** Wallet snapshot the rows are evaluated against. */
    void SetAccount(const SDTechTree::FSDResearchAccount& InAccount);

    /** The screen the last rebuild rendered, for tests and for callers. */
    const SDTechTree::FSDTechTreeScreen& GetRenderedScreen() const { return RenderedScreen; }

protected:
    virtual void BuildContent(UVerticalBox& Content) override;

private:
    void BuildNodeRow(UVerticalBox& Content, const SDTechTree::FSDNodeRow& Row);

    ESDTechCategory Category = ESDTechCategory::Submarine;
    SDTechTree::FSDResearchAccount Account;
    SDTechTree::FSDTechTreeScreen RenderedScreen;
};
