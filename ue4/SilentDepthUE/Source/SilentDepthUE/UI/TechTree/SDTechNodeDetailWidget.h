#pragma once

#include "CoreMinimal.h"

#include "UI/TechTree/SDTechTreeWidgetBase.h"

#include "SDTechNodeDetailWidget.generated.h"

/**
 * UI-002: the node detail panel.
 *
 * Takes the row the overview already resolved and explains it: state, cost, the
 * blocking node, the three orthogonal caveat badges, the dependency lists and
 * the sockets the node mounts on. A row the model never produced is refused
 * rather than described from thin air.
 */
UCLASS()
class SILENTDEPTHUE_API USDTechNodeDetailWidget : public USDTechTreeWidgetBase
{
    GENERATED_BODY()

public:
    /** Shows one node row. The overview passes the row it rendered. */
    void SetRow(const SDTechTree::FSDNodeRow& InRow);

    /** Clears the panel. */
    void ClearRow();

    bool HasRow() const { return bHasRow; }

protected:
    virtual void BuildContent(UVerticalBox& Content) override;

private:
    SDTechTree::FSDNodeRow Row;
    bool bHasRow = false;
};
