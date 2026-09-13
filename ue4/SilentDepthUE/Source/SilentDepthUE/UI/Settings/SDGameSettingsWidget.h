#pragma once

#include "CoreMinimal.h"

#include "Core/Save/SDGameSettings.h"
#include "UI/SDCodeWidgetBase.h"

#include "SDGameSettingsWidget.generated.h"

/**
 * The settings screen.
 *
 * It shows every setting with its value, its legal range and the language
 * tokens the save accepts, taken from the one place those rules are defined
 * (SDTechTree::FSDSettingsService). A value outside the range is shown as
 * invalid rather than clamped, because repairing it here would hide a bad file
 * from the validator.
 *
 * Editing (sliders, dropdowns) is not wired yet: the model and the validator
 * are, the controls are a designer pass on top of this screen.
 */
UCLASS()
class SILENTDEPTHUE_API USDGameSettingsWidget : public USDCodeWidgetBase
{
    GENERATED_BODY()

public:
    void SetSettings(const SDTechTree::FSDSettings& InSettings);

    const SDTechTree::FSDSettings& GetSettings() const { return Settings; }

protected:
    virtual void BuildContent(UVerticalBox& Content) override;

private:
    SDTechTree::FSDSettings Settings;
};
