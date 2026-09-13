#pragma once

#include "CoreMinimal.h"

#include "Core/TechTree/TechTreeResearchAccount.h"
#include "UI/TechTree/SDTechTreeWidgetBase.h"

#include "SDTechTreeLoadoutWidget.generated.h"

/**
 * UI-003: the submarine loadout screen.
 *
 * Lists every slot of a platform with its socket and capacity, the candidates
 * the matrix allows under the current policy, the gameplay-derived marker, and
 * the concrete reason a slot cannot be filled: a missing relation, a pending
 * asset, or a socket that only fits one of several slots (DEC-008).
 *
 * Capability rows (DEC-009) are listed separately: they say "this platform has
 * the capability, no equipment exists for it", and they are never offered as
 * something to fit.
 */
UCLASS()
class SILENTDEPTHUE_API USDTechTreeLoadoutWidget : public USDTechTreeWidgetBase
{
    GENERATED_BODY()

public:
    void SetPlatform(const FString& InPlatformId);

    /** Policy the candidate lists are filtered by. */
    void SetPolicy(ESDEquipPolicy InPolicy);

    /** Wallet snapshot used for cost and unlock markers. */
    void SetAccount(const SDTechTree::FSDResearchAccount& InAccount);

    /** Slots the player has filled, as slot name -> candidate id. */
    void SetFittedSlots(const TMap<FString, FString>& InFitted);

    const FString& GetPlatform() const { return PlatformId; }

protected:
    virtual void BuildContent(UVerticalBox& Content) override;

private:
    /** SlotDefinition is named apart from UWidget::Slot, which it would hide. */
    void BuildSlot(UVerticalBox& Content, const FSDEquipmentSlot& SlotDefinition);
    void BuildCapabilities(UVerticalBox& Content);

    FString PlatformId;
    ESDEquipPolicy Policy = ESDEquipPolicy::Strict;
    SDTechTree::FSDResearchAccount Account;
    TMap<FString, FString> Fitted;
};
