#if WITH_DEV_AUTOMATION_TESTS

#include "Core/Save/SDGameSettings.h"
#include "UI/Settings/SDGameSettingsWidget.h"

#include "Misc/AutomationTest.h"

using namespace SDTechTree;

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FSD_WidgetSettingsRendersRanges,
    "SilentDepth.Save.Settings.WidgetRendersRanges",
    EAutomationTestFlags::ApplicationContextMask | EAutomationTestFlags::ProductFilter
)
bool FSD_WidgetSettingsRendersRanges::RunTest(const FString& Parameters)
{
    USDGameSettingsWidget* Widget = NewObject<USDGameSettingsWidget>();
    Widget->RebuildContent();
    TestTrue(TEXT("the shipped defaults are reported as valid"),
        Widget->HasRenderedLineContaining(TEXT("全部合法")));
    TestTrue(TEXT("the quality range is on screen"),
        Widget->HasRenderedLineContaining(TEXT("0–3")));
    TestTrue(TEXT("the resolution range is on screen"),
        Widget->HasRenderedLineContaining(TEXT("0.50–1.00")));
    TestTrue(TEXT("the language tokens are on screen"),
        Widget->HasRenderedLineContaining(TEXT("zh / en / fr / ru")));

    FSDSettings Broken;
    Broken.MasterVolume = 2.0f;
    Broken.Language = ESDLanguage::Ru;
    Widget->SetSettings(Broken);
    TestTrue(TEXT("an out-of-range value is reported, not repaired"),
        Widget->HasRenderedLineContaining(TEXT("不合法")));
    TestTrue(TEXT("the offending field is named"),
        Widget->HasRenderedLineContaining(TEXT("masterVolume")));
    TestTrue(TEXT("the language token is shown"),
        Widget->HasRenderedLineContaining(TEXT("语言 ru")));
    TestTrue(TEXT("the language label is shown"),
        Widget->HasRenderedLineContaining(TEXT("Русский")));

    return true;
}

#endif  // WITH_DEV_AUTOMATION_TESTS
