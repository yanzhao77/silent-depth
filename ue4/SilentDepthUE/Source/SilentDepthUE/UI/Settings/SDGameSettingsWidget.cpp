#include "UI/Settings/SDGameSettingsWidget.h"

#include "Components/VerticalBox.h"

using namespace SDTechTree;

namespace
{
/** Presentation label for a quality preset; the number stays authoritative. */
FString PresetLabel(const int32 Preset)
{
    switch (Preset)
    {
    case 0:  return TEXT("低");
    case 1:  return TEXT("中");
    case 2:  return TEXT("高");
    case 3:  return TEXT("极高");
    default: return TEXT("超出范围");
    }
}

/** Presentation label for a language; the token stays authoritative. */
FString LanguageLabel(const ESDLanguage Language)
{
    switch (Language)
    {
    case ESDLanguage::Zh: return TEXT("简体中文");
    case ESDLanguage::En: return TEXT("English");
    case ESDLanguage::Fr: return TEXT("Français");
    case ESDLanguage::Ru: return TEXT("Русский");
    default:              return TEXT("未声明");
    }
}
}

void USDGameSettingsWidget::SetSettings(const FSDSettings& InSettings)
{
    Settings = InSettings;
    RebuildContent();
}

void USDGameSettingsWidget::BuildContent(UVerticalBox& Content)
{
    FSDTechTreeLoadReport Report;
    const bool bValid = FSDSettingsService::Validate(Settings, Report);

    AddLine(Content, TEXT("设置"));
    AddLine(Content, bValid
        ? TEXT("当前取值全部合法。")
        : TEXT("当前取值不合法：校验器会拒绝这份设置，界面不做自动修复。"));

    AddLine(Content, FString::Printf(
        TEXT("音频 · 主音量 %.2f（0.00–1.00）"), Settings.MasterVolume));
    AddLine(Content, FString::Printf(
        TEXT("      音乐 %.2f · 音效 %.2f（0.00–1.00）"),
        Settings.MusicVolume, Settings.EffectsVolume));
    AddLine(Content, FString::Printf(
        TEXT("画质预设 %d（%d–%d，%s）"),
        Settings.QualityPreset,
        FSDSettingsService::MinQualityPreset,
        FSDSettingsService::MaxQualityPreset,
        *PresetLabel(Settings.QualityPreset)));
    AddLine(Content, FString::Printf(
        TEXT("渲染缩放 %.2f（%.2f–%.2f）"),
        Settings.ResolutionScale,
        FSDSettingsService::MinResolutionScale,
        FSDSettingsService::MaxResolutionScale));
    AddLine(Content, FString::Printf(
        TEXT("反舵 %s"), Settings.bInvertRudder ? TEXT("开启") : TEXT("关闭")));
    AddLine(Content, FString::Printf(
        TEXT("语言 %s（%s）· 可选项 zh / en / fr / ru"),
        // The token is the save's value; the label is presentation text.
        ToString(Settings.Language), *LanguageLabel(Settings.Language)));

    for (const FSDDataError& Error : Report.Errors)
    {
        AddLine(Content, FString::Printf(
            TEXT("非法取值 [%s] %s：%s"), *Error.Code, *Error.Subject, *Error.Detail));
    }
}
